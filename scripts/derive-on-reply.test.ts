/* ============================================================
   ON REPLY: SERVE THE TOWN'S MARKET AUDIT, OR PAY FOR A NEW ONE?

   ⛔ THE HOLE. The existing-audit check in _shared/whatsapp-inbound.ts is `.eq("lead_id", leadId)`,
   and a MARKET audit has lead_id NULL — measured 2026-08-11: 40 market audits, ALL 40 unattached. So
   a lead added from Market View by the per-row "Add to CRM" button (addOne creates the lead and runs
   no audit) always read as un-audited and always bought a fresh audit, while a lead added by the
   batch button ("Add N to CRM and run") had one attached and was served. Same reply, same town, two
   different outcomes decided by which button was pressed — "works sometimes, not others".

   ⛔ WIRED, NOT REBUILT. The gate is canDeriveReport in _shared/derivable.ts and the copier is the
   derive-audit function; both already existed and are unchanged. This suite covers the DECISION the
   inbound handler now makes around them, and the one thing that decision has to get right:

   ⛔ A DERIVED AUDIT NEVER ENTERS THE AUDIT QUEUE (its rows are inserted status 'done'), so the
   completion hook in process-ai-audit-queue that normally rescues an `awaiting_audit` pitch will
   NEVER fire for it. The upgrade to `pending` has to happen at derive time or the pitch is parked
   forever: audit real, cost zero, message never sent.
   ============================================================ */
import { canDeriveReport, MIN_ANSWERED_DATAPOINTS } from "../supabase/functions/_shared/derivable.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

/* The handler's ladder, restated exactly as it now runs. */
type Outcome = "queue_pitch_free" | "queue_pitch_after_paid_audit" | "flag_no_inputs" | "flag_error";
interface DeriveResult { httpOk: boolean; ok?: boolean; error?: string; threw?: boolean }
const decide = (args: {
  hasCompletedAudit: boolean;
  hasInputs: boolean;
  derive: DeriveResult;
  upgradeFailed?: boolean;
}): Outcome => {
  if (args.hasCompletedAudit) return "queue_pitch_free";        // top of the ladder, unchanged
  if (!args.hasInputs) return "flag_no_inputs";                  // unchanged
  if (args.derive.threw) return "queue_pitch_after_paid_audit";   // unreachable derive-audit falls through
  if (args.derive.httpOk && args.derive.ok === true) {
    return args.upgradeFailed ? "flag_error" : "queue_pitch_free";
  }
  return "queue_pitch_after_paid_audit";
};

console.log("── THE MARKET-VIEW LEAD: THE CASE THAT WAS PAYING TWICE ──");
ok(decide({ hasCompletedAudit: false, hasInputs: true, derive: { httpOk: true, ok: true } }) === "queue_pitch_free",
  "no attached audit + the town IS measured -> served free from the market audit");
ok(decide({ hasCompletedAudit: false, hasInputs: true, derive: { httpOk: false, error: "no_market_audit" } }) === "queue_pitch_after_paid_audit",
  "no attached audit + the town is NOT measured -> paid audit, as before");

console.log("\n── ⛔ EVERY REFUSAL derive-audit CAN RETURN FALLS THROUGH TO THE PAID AUDIT ──");
/* Enumerated from derive-audit's own responses. A refusal must never be mistaken for "nothing to do"
   — that would leave the lead with no audit AND no pitch, which is worse than spending 8p. */
for (const error of [
  "no_market_audit", "market_audit_unfinished", "no_trade_or_town",
  "name_not_distinctive", "too_few_answers", "no_business_name",
  "lead_not_found", "internal", "some_future_code_nobody_here_knows_about",
]) {
  ok(decide({ hasCompletedAudit: false, hasInputs: true, derive: { httpOk: false, error } }) === "queue_pitch_after_paid_audit",
    `  ${error} -> paid audit`);
}
ok(decide({ hasCompletedAudit: false, hasInputs: true, derive: { httpOk: true, ok: false, error: "name_not_distinctive" } }) === "queue_pitch_after_paid_audit",
  "an HTTP 200 carrying ok:false is still a refusal — the body decides, not the status code");
ok(decide({ hasCompletedAudit: false, hasInputs: true, derive: { httpOk: true } }) === "queue_pitch_after_paid_audit",
  "⛔ ok ABSENT (not false) -> paid audit; a missing flag is not a success");
ok(decide({ hasCompletedAudit: false, hasInputs: true, derive: { httpOk: false, threw: true } }) === "queue_pitch_after_paid_audit",
  "derive-audit unreachable -> paid audit; never a reason to skip the pitch");

console.log("\n── ⛔ THE UPGRADE THAT NOTHING ELSE WILL DO ──");
ok(decide({ hasCompletedAudit: false, hasInputs: true, derive: { httpOk: true, ok: true }, upgradeFailed: true }) === "flag_error",
  "derived but the pitch could not be queued -> flagged for a human, NOT left as awaiting_audit");
/* Why it cannot be left: no completion will ever arrive for a derived audit. */
ok(decide({ hasCompletedAudit: false, hasInputs: true, derive: { httpOk: true, ok: true }, upgradeFailed: false }) !== "queue_pitch_after_paid_audit",
  "a successful derive never also runs the paid audit — that would be paying for what we just got free");

console.log("\n── THE UNCHANGED RUNGS STILL BEHAVE ──");
ok(decide({ hasCompletedAudit: true, hasInputs: true, derive: { httpOk: false, error: "unused" } }) === "queue_pitch_free",
  "a lead with its OWN completed audit never calls derive-audit at all");
ok(decide({ hasCompletedAudit: false, hasInputs: false, derive: { httpOk: true, ok: true } }) === "flag_no_inputs",
  "⛔ missing trade/town is still flagged BEFORE any derive — no market can be identified without them");

console.log("\n── THE GATE ITSELF, THROUGH THE REAL canDeriveReport (not restated) ──");
{
  const enough = MIN_ANSWERED_DATAPOINTS;
  const distinctive = canDeriveReport({ businessName: "Titanium Locksmiths", trade: "locksmiths", town: "Hastings", answeredDatapoints: enough });
  ok(distinctive.ok, "\"Titanium Locksmiths\" in locksmiths/Hastings is derivable (\"titanium\" is the needle)");

  /* ⚠️ AN INITIALS-ONLY NAME REFUSES, AND THAT SURPRISED ME — worth stating rather than discovering
     it as a cost figure later. "J&J Locksmiths" minus its trade leaves "jj": two characters, under
     MIN_DISTINCTIVE_CHARS, so the gate says unmeasurable. It is the right call (a two-letter needle
     prefix-matches half a town) but it means every A1/J&J/PSM-style name still buys a paid audit. */
  const initials = canDeriveReport({ businessName: "J&J Locksmiths", trade: "locksmiths", town: "Eastbourne", answeredDatapoints: enough });
  ok(!initials.ok && initials.reason === "name_not_distinctive",
    "⛔ \"J&J Locksmiths\" refuses — initials alone are not a needle, so it still pays for its own audit");

  const generic = canDeriveReport({ businessName: "Chichester Accountants Ltd", trade: "accountants", town: "Chichester", answeredDatapoints: enough });
  ok(!generic.ok && generic.reason === "name_not_distinctive",
    "⛔ \"Chichester Accountants Ltd\" REFUSES — a blank there means \"we could not tell\", not \"you are invisible\"");
  ok(decide({ hasCompletedAudit: false, hasInputs: true, derive: { httpOk: true, ok: false, error: generic.reason } }) === "queue_pitch_after_paid_audit",
    "  and that refusal buys the 8p audit rather than publishing an unfounded zero");

  const thin = canDeriveReport({ businessName: "Titanium Locksmiths", trade: "locksmiths", town: "Hastings", answeredDatapoints: enough - 1 });
  ok(!thin.ok && thin.reason === "too_few_answers", `${enough - 1} answers is below the bar, so absence means nothing yet`);
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
