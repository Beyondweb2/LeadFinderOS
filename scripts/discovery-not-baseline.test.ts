/* ════════════════════════════════════════════════════════════════════════════════════════════════
   A DISCOVERY SCAN IS NOT THE PAID CLIENT'S BASELINE — ON THE SCREEN OR ANYWHERE ELSE.

   🔴 THE INCIDENT (2026-09-21, MCLocksmiths centre, lead 6d0585ac…). The Baseline screen showed
   "Client baseline · 80 questions · 3 runs · measured 21/09/2026" and the lead cockpit offered the
   same audit as "Baseline report". The audit was the client's 80-question DISCOVERY scan.

   ⛔ NOTHING HAD BEEN WRITTEN, AND THAT IS THE POINT. `outreach_leads.baseline_audit_id` was NULL
   throughout, and the `claim_baseline_pointer` trigger only fires on `audit_purpose = 'baseline'`,
   so a discovery audit is structurally incapable of being adopted. The fault was entirely in what
   two screens SAID — and a screen that calls a discovery set "the baseline" is how an 80-question
   breadth scan ends up replayed at day 28 as the refund's measuring stick.

   ⛔ THE SHAPE: BOTH SCREENS ASKED THE NEGATIVE QUESTION. "Is this an internal measurement? No?
   Then it is the client baseline" — so the `else` carried discovery, the free check and every
   ordinary outreach audit. CLAUDE.md §6: enumerate the case you want; never let the remainder
   stand in for it. The rule is positive now and lives once, in src/lib/auditKind.ts.

   ⛔ AND THE COUNT IS ENFORCED WHERE IT FREEZES. Approval is what the day-28 replay repeats
   verbatim, so approval is where "exactly BASELINE_QUESTIONS" has to be true.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  auditKind, isClientBaseline, auditRoleLabel, isInternalMeasurement,
  findPaidBaseline, findAmbiguousMultiRun,
  CLIENT_BASELINE_LABEL, DISCOVERY_LABEL, INTERNAL_MEASUREMENT_LABEL,
  BASELINE_AUDIT_PURPOSE, DISCOVERY_AUDIT_PURPOSE, MEASUREMENT_AUDIT_PURPOSE,
  REMEASURE_AUDIT_PURPOSE, FREE_CHECK_AUDIT_PURPOSE, ORDINARY_AUDIT_PURPOSE,
  type AuditKindRow,
} from "../src/lib/auditKind.ts";
import { BASELINE_QUESTIONS, BASELINE_RUNS } from "../src/lib/auditQuestionCounts.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

/* MCLocksmiths' actual row, as create-ai-audit wrote it: 80 questions, 3 runs, and advanceBaseline
   later stamped baseline_completed_at + the baseline fold on it — because that freeze is gated on
   `baseline_target_runs > 1` and nothing else. So a discovery audit LOOKS finalised. It is not a
   baseline, and no reader may infer one from those columns. */
const discovery: AuditKindRow = {
  id: "50986aa3-57c6-401c-9fd7-5626bd705bef",
  audit_purpose: DISCOVERY_AUDIT_PURPOSE,
  baseline_target_runs: 3,
  is_measurement: null,
};
const realBaseline: AuditKindRow = {
  audit_purpose: BASELINE_AUDIT_PURPOSE, baseline_target_runs: BASELINE_RUNS, baseline_contract: { version: 2 },
};
/* RG and Ronnie: written before audit_purpose existed. They ARE client baselines and must stay so. */
const legacyBaseline: AuditKindRow = { audit_purpose: null, baseline_target_runs: 3, is_measurement: null, baseline_contract: { version: 1 } };
const fullMeasure: AuditKindRow = { audit_purpose: MEASUREMENT_AUDIT_PURPOSE, baseline_target_runs: 3, is_measurement: true };
const replay: AuditKindRow = { audit_purpose: REMEASURE_AUDIT_PURPOSE, baseline_target_runs: 3, is_measurement: true };
const freeCheck: AuditKindRow = { audit_purpose: FREE_CHECK_AUDIT_PURPOSE, baseline_target_runs: 3 };
const hook: AuditKindRow = { audit_purpose: ORDINARY_AUDIT_PURPOSE, baseline_target_runs: null };

/* ── 1. Discovery 80 x 3 does not become the baseline ─────────────────────────────────────────── */
ok(auditKind(discovery) === "discovery", "an 80 x 3 discovery scan grades 'discovery', not 'ordinary' and not a baseline");
ok(isClientBaseline(discovery) === false, "⛔ discovery is NOT the client baseline");
ok(auditRoleLabel(discovery) === DISCOVERY_LABEL, "and the screen names it a discovery scan");
ok(auditRoleLabel(discovery) !== CLIENT_BASELINE_LABEL, "⛔ the words 'Client baseline' never appear for a discovery audit");
ok(findPaidBaseline([discovery]) === null, "startPaidBaseline cannot adopt it as an existing baseline");
ok(findAmbiguousMultiRun([discovery]) === null, "and it does not HOLD a real baseline as ambiguous either");
/* The exact regression: the old screens computed `!isInternalMeasurement(audit)`. */
ok(isInternalMeasurement(discovery) === false && isClientBaseline(discovery) === false,
  "⛔ 'not an internal measurement' is NOT 'is the client baseline' — the old expression admitted it");

/* ── 7. Existing genuine baselines are unaffected ─────────────────────────────────────────────── */
ok(isClientBaseline(realBaseline) === true, "a purpose='baseline' audit is still the client baseline");
ok(auditRoleLabel(realBaseline) === CLIENT_BASELINE_LABEL, "and is still labelled so");
ok(isClientBaseline(legacyBaseline) === true, "RG/Ronnie legacy multi-run baselines are still the client baseline");
ok(isClientBaseline({ audit_purpose: BASELINE_AUDIT_PURPOSE, baseline_target_runs: 3 }) === true,
  "a baseline whose contract write failed still counts as the client baseline (it is not discovery)");
ok(findPaidBaseline([discovery, realBaseline])?.audit_purpose === BASELINE_AUDIT_PURPOSE,
  "with both on one lead, the BASELINE is the one found");

/* ── The other kinds keep their own labels, and none of them is the baseline ───────────────────── */
ok(isClientBaseline(fullMeasure) === false && auditRoleLabel(fullMeasure) === INTERNAL_MEASUREMENT_LABEL, "a full measure stays an internal measurement");
ok(isClientBaseline(replay) === false, "a day-28 replay is not the baseline either");
ok(isClientBaseline(freeCheck) === false, "a 3-run free check is not the baseline");
ok(isClientBaseline(hook) === false, "an outreach hook is not the baseline");
ok(isClientBaseline(null) === false && isClientBaseline(undefined) === false, "absent is not the baseline — never a default");

/* ── 6. A frozen baseline stays immutable for the remeasurement ───────────────────────────────── */
{
  /* The replay repeats the ASKED set of the audit the POINTER names. The pointer is claimed by
     trigger on audit_purpose='baseline' and guarded immutable in the database, so the only thing
     code has to get right is never nominating a different audit as the baseline. */
  const onLead = [discovery, fullMeasure, realBaseline, freeCheck];
  const judged = onLead.filter((a) => isClientBaseline(a));
  ok(judged.length === 1 && judged[0] === realBaseline,
    "⛔ exactly ONE audit on the lead is judgeable as the baseline, whatever else was run beside it");
}

/* ── 2/3/4/5: the approval gate, modelled exactly as paid-baseline/index.ts writes it ──────────── */
/** Mirrors the `approve` branch. If that branch changes, this changes with it. */
function approve(questions: string[]): { ok: boolean; error?: string } {
  const next = questions.map((q) => q.trim()).filter(Boolean);
  if (next.length === 0) return { ok: false, error: "questions_required" };
  if (next.length !== BASELINE_QUESTIONS) return { ok: false, error: "baseline_question_count" };
  return { ok: true };
}
const q = (n: number) => Array.from({ length: n }, (_, i) => `Who is a locksmith in town ${i + 1}?`);

ok(approve(q(BASELINE_QUESTIONS)).ok, `exactly ${BASELINE_QUESTIONS} approved questions freeze the baseline`);
ok(approve(q(80)).error === "baseline_question_count", "⛔ the 80 discovery questions cannot be approved as the baseline");
ok(approve(q(19)).error === "baseline_question_count", "19 is refused — a shorter baseline than the one sold");
ok(approve(q(21)).error === "baseline_question_count", "21 is refused — stated exactly, never 'at least'");
ok(approve([]).error === "questions_required", "an empty set is refused before the count rule");
ok(BASELINE_RUNS === 3, "the paid baseline runs 3 times — startPaidBaseline sends BASELINE_RUNS, never a UI number");

/* ── 2. A paid client with discovery and no baseline is 'needs_questions', not 'running' ───────── */
{
  /** Mirrors ClientHub's `bs`, and paid-client-hub's rule that `audit` resolves ONLY from
   *  lead.baseline_audit_id — which is why a discovery audit can never fill it. */
  const hubStatus = (baselineStatus: string | null, pointer: string | null) =>
    baselineStatus || (pointer ? "running" : "needs_questions");
  ok(hubStatus(null, null) === "needs_questions",
    "⛔ MCLocksmiths: paid, discovery complete, pointer NULL → needs_questions, so Prepare Baseline is offered");
  ok(hubStatus(null, "some-real-baseline") === "running", "a claimed pointer with no status still reads as running");
  ok(hubStatus("complete", "some-real-baseline") === "complete", "a stored status always wins");
}

/* ── 5. Full Measurement stays blocked before the baseline freezes ─────────────────────────────── */
{
  /** create-ai-audit order gate, verbatim: `isMeasurement && leadPaid && !(pointer && frozen)`. */
  const refused = (paid: boolean, pointer: string | null, frozen: boolean) => paid && !(pointer && frozen);
  ok(refused(true, null, false) === true, "⛔ paid + no pointer → baseline_not_frozen, even with discovery finished");
  ok(refused(true, "b", false) === true, "paid + pointer still measuring → refused");
  ok(refused(true, "b", true) === false, "paid + frozen baseline → the full measure may run");
  ok(refused(false, null, false) === false, "an unpaid prospect may still be measured — no refund set to protect");
}

console.log(f ? `\n${f} FAILED` : "\nAll passed");
process.exit(f ? 1 : 0);
