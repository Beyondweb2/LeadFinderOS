// THE question-count policy for AI-visibility audits. One module, imported by both the SPA and
// the edge functions (same trick as auditReport.ts — plain TypeScript, no React, no Deno-only
// APIs), because three paths want three different counts for three different reasons and they
// have already drifted into each other once.
//
// The failure this prevents: the Inbox hook and the auto-chain sent NO question_count and simply
// inherited create-ai-audit's DEFAULT_QUESTION_COUNT. Nothing recorded that 3 was the intent, so
// the two cheapest paths in the system were one edit to a shared default away from silently
// tripling their Apify spend — and the auto-chain's comment already claimed the default was 4
// when it was 3, so the drift had started in the documentation.
//
// RESOLUTION RULE: every caller states its own count explicitly, from here. create-ai-audit still
// clamps whatever arrives (a public caller cannot raise its own ceiling), but no path relies on
// the clamp's default to mean what it wants.

/**
 * OUTREACH HOOK — the Inbox audit button, the reply auto-chain and the bulk audit runner.
 * Its whole job is to prove "AI doesn't mention you", which one damning answer does. Kept
 * deliberately cheap: this fires across every lead we contact, so it is the volume path.
 */
export const OUTREACH_HOOK_QUESTIONS = 3;

/**
 * MANUAL WIZARD — the Audit page. Operator-selectable inside these bounds, unchanged: someone
 * looking at one business by hand is allowed to spend a little more on it.
 */
export const WIZARD_MIN_QUESTIONS = 3;
export const WIZARD_MAX_QUESTIONS = 5;
export const WIZARD_DEFAULT_QUESTIONS = 3;

/**
 * PAID BASELINE — findable onboarding. 10 questions, measured over BASELINE_RUNS runs and
 * averaged. Do NOT economise here: this is the money-back guarantee's measuring stick, and the
 * variance is brutal. Measured in this database, one business swung 0 → 0.5 → 0 → 0.5 → 0.6
 * mention rate across five identical runs with no work done, and another's answered-question
 * coverage swung 40%..100% across 18 runs. A small sample cannot defend a refund decision.
 */
export const BASELINE_QUESTIONS = 10;
export const BASELINE_RUNS = 3;
