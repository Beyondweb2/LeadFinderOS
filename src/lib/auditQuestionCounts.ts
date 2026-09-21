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
 * PAID BASELINE — day 0. HOME TOWN ONLY, 20 questions, measured over BASELINE_RUNS runs and
 * FROZEN: the refund is judged on this set and nothing else, and it is replayed verbatim at day 28
 * against outreach_leads.baseline_audit_id. Do NOT economise here: this is the money-back
 * guarantee's measuring stick, and the variance is brutal. Measured in this database, one business
 * swung 0 → 0.5 → 0 → 0.5 → 0.6 mention rate across five identical runs with no work done, and
 * another's answered-question coverage swung 40%..100% across 18 runs. A small sample cannot
 * defend a refund decision.
 *
 * ⛔ 12, NOT 10, AND SINGLE-TOWN (Paul, 2026-09-12). 12 was the old multi-town ceiling; RG's set is
 * 12. The client's extra towns are no longer squeezed in here at two questions each — they live in
 * the FULL MEASURE (below), where winnability decides which towns get pages. The client is told
 * plainly: we judge the refund where you trade, we measure your ambitions to decide what to build.
 *
 * ⛔ NOT SEEDED from the outreach hook any more. The hook is throwaway and never compared; the
 * baseline is generated fresh for the home town.
 */
export const BASELINE_QUESTIONS = 20;
export const BASELINE_RUNS = 3;

/**
 * FULL MEASURE — day 0, AFTER the baseline is frozen, 20 questions x MEASUREMENT_RUNS. Finds which
 * questions (and which of the client's towns) are winnable so we know where to build pages. It is
 * NEVER compared to anything: the refund is judged on the baseline's set and nothing else.
 *
 * ⛔ IT IS A DIAL AGAIN, 1..80 (Paul, 2026-09-21) — BUT ONLY BECAUSE THE GENERATION IS BATCHED.
 * It was fixed at one number on 2026-09-12 for a real reason: the screen offered 75 while the
 * generator hard-capped every call at 20 (now the named GENERATOR_ABSOLUTE_MAX_QUESTIONS, 40), so
 * a "40" the screen said was never a 40 the queue ran. The ceiling below is honest only because
 * `planGenerationBatches` (fullMeasure.ts) splits a target above the generator's per-CALL cap into
 * several calls and the server fills to the target — so 80 means 80 queued rows, or a logged
 * shortfall. Never raise FULL_MEASURE_MAX_QUESTIONS without checking that batching still holds.
 *
 * FULL_MEASURE_QUESTIONS is now the DEFAULT, not the only value: it is what the automatic
 * post-freeze full measure asks for and what the wizard opens on.
 *
 * ⛔ DISJOINT FROM THE BASELINE BY CONSTRUCTION (Paul, 2026-09-12). A 12 x 3 baseline already gives
 * every judged question 6 answer cells against MIN_CELLS_FOR_QUESTION_CLAIM = 4, so it is a valid
 * winnability read on its own. The full measure excludes the baseline's asked set — a coverage
 * directive to the model AND a code-level filter — so it never re-measures the judged questions,
 * and never contains them (a measurement that contains the refund set is a comparable one).
 */
export const FULL_MEASURE_QUESTIONS = 20;
/** The operator's bounds on a full measure's question set. 1 is allowed: a one-question look is a
 *  cheap, honest thing to want, and the run-count dial below is what decides whether it can
 *  support a claim. 80 is the spend ceiling Paul set on 2026-09-21. */
export const FULL_MEASURE_MIN_QUESTIONS = 1;
export const FULL_MEASURE_MAX_QUESTIONS = 80;

/**
 * HOW MANY TIMES A FULL MEASURE ASKS EACH QUESTION, per engine. Operator-selectable 1..3, default
 * 3 — the number the paid baseline uses, so a full measure reads as a FREQUENCY ("named 4 of 6")
 * rather than one lucky ask. Cost scales ~linearly with it: every run is another Apify question
 * run, which is why the maximum is a cost ceiling and not a preference.
 *
 * ⛔ THE SAME NUMBER DECIDES EXECUTION, not just the label. It is stored as
 * ai_audits.baseline_target_runs at creation and advanceBaseline drives the repeats from it with
 * the SAME questions — so a run count that is only in the UI is impossible by construction.
 */
export const MEASUREMENT_MIN_RUNS = 1;
export const MEASUREMENT_MAX_RUNS = 3;
export const MEASUREMENT_DEFAULT_RUNS = 3;

/**
 * ⛔ THE GENERATOR'S ABSOLUTE CEILING — the most questions ONE model call may be asked for.
 *
 * WHY IT IS NAMED. create-ai-audit's generateQuestions re-clamped every call with the BASELINE
 * ceiling (20) as an "absurd value" guard, while the measurement policy allowed 75. So raising a
 * policy maximum silently changed nothing: a 40-question request generated 20. A cap that is not
 * named cannot be reasoned about, and a policy ceiling above it is a lie the screen tells.
 *
 * THE RULE, pinned by scripts/question-ceilings.test.ts: every POLICY ceiling that is served by ONE
 * generator call is <= this number. FULL_MEASURE_MAX_QUESTIONS (80) is the single exception and it
 * is allowed ONLY because `planGenerationBatches` splits it into calls that each sit at or under
 * this cap — the test asserts the batch planner, not an exemption.
 *
 * 40 leaves room above FULL_MEASURE_QUESTIONS (20) for the money/standard two-call split, which
 * over-requests each half and slices, without letting an absurd request reach the model.
 */
export const GENERATOR_ABSOLUTE_MAX_QUESTIONS = 40;
