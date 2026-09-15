/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHICH BRANCH A TEMPLATE'S VARIABLES COME FROM — one rule, read by both senders.

   🔴 THE FAULT THIS EXISTS TO END (2026-09-15). `audit_followup` failed its first real send with a
   bare "Edge Function returned a non-2xx status code". Both senders decided "does this template
   need the lead's audit?" with the SAME hand-written expression:

       tvars.includes("trade") || tvars.includes("competitors")

   `audit_followup` declares `trade_plural`, `town`, `rival_1..3` and `audit_url` — and NOT `trade`
   or `competitors`. So it answered NO, fell through to the plain opener branch, and
   `claimTemplatePayload` was called with no trade, no rivals and no audit link. The first resolver
   threw, the plain branch has no catch, and the operator got a 500 with the reason in an edge log
   nobody can read. `competitor_hook` had the identical shape and was one Inbox press from the same
   500 the day it became visible.

   ⛔ IT IS THE GUARD-KEYED-TO-TODAY'S-INSTANCE FAULT, AGAIN (CLAUDE.md §8). The predicate named the
   variables the templates of the day happened to declare, instead of the PROPERTY that decides:
   can this variable only be answered by the lead's completed audit? A template registered later
   with a new audit-derived variable name would have joined the wrong side, silently, and the first
   evidence would again be a 500 in front of a prospect.

   ⛔ SO THE UNIT IS THE VARIABLE, NOT THE TEMPLATE. Nothing here lists a template name: add a
   variable to the right set and every template that declares it routes correctly, forever.
   ⚠️ AND THE ORDER BELOW IS PART OF THE RULE. `onboarding_followup` declares `trade_plural` and
   `town` but is NOT an audit template — its branch resolves them from the lead row. It is matched
   FIRST, by `onboarding_url`, exactly as both senders already do. Reordering these breaks it.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Variables only a lead's completed audit can answer. */
export const AUDIT_DERIVED_VARS: ReadonlySet<string> = new Set([
  "trade", "trade_plural", "competitors", "rival_1", "rival_2", "rival_3", "audit_url",
]);

/** The four ways a send resolves its variables. Named for the branch each sender already has. */
export type TemplateBranch = "contact_name" | "onboarding" | "audit" | "plain";

/**
 * Which branch must build this template's payload.
 *
 * ⛔ FIRST MATCH WINS, and the order is the senders' own. A template declaring BOTH
 * `onboarding_url` and an audit variable is an onboarding send that also names a trade — that is
 * `onboarding_followup`, and its branch resolves the trade from the lead.
 */
export function branchForVars(vars: readonly string[]): TemplateBranch {
  if (vars.includes("contact_first_name")) return "contact_name";
  if (vars.includes("onboarding_url")) return "onboarding";
  if (vars.some((v) => AUDIT_DERIVED_VARS.has(v))) return "audit";
  return "plain";
}

/**
 * Does this template need the lead's completed audit resolved before its payload is built?
 *
 * ⛔ BOTH SENDERS READ THIS. Written out at either of them it is the one-rule-in-N-places failure
 * this codebase has recorded six times — and here the two copies were already identical AND
 * already wrong, so a reviewer comparing them would have found them in perfect agreement.
 */
export const buildsFromAudit = (vars: readonly string[]): boolean => branchForVars(vars) === "audit";

/* ⛔ WHAT EACH BRANCH CAN ACTUALLY SUPPLY. This is the half that makes the test possible: a routing
   rule alone cannot tell you a template landed somewhere that leaves a variable blank.
   ⚠️ `town` appears on THREE branches and that is real, not sloppy: the audit branch takes it from
   the audit, the onboarding branch from the lead row, and the plain branch carries it for the
   greeting-name rule (it is never a Meta parameter there — see displayName.ts §30). */
export const BRANCH_SUPPLIES: Record<TemplateBranch, ReadonlySet<string>> = {
  contact_name: new Set(["name", "contact_first_name"]),
  onboarding: new Set(["name", "onboarding_url", "trade", "trade_plural", "town"]),
  audit: new Set([
    "name", "trade", "trade_plural", "competitors", "rival_1", "rival_2", "rival_3",
    "town", "audit_url", "url",
  ]),
  plain: new Set(["name", "url", "town"]),
};

/** Variables this template declares that its branch cannot answer. Empty means it can be sent. */
export function unsuppliedVars(vars: readonly string[]): string[] {
  const supplies = BRANCH_SUPPLIES[branchForVars(vars)];
  return vars.filter((v) => !supplies.has(v));
}
