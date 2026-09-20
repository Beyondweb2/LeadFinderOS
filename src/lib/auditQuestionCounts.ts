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
 * ⛔ FIXED, NOT A DIAL. It was operator-selectable 10..75 (default 40) and that meant two things
 * disagreed: the screen offered 75 while the generator hard-capped every call at 20 (see
 * GENERATOR_ABSOLUTE_MAX_QUESTIONS below), so "40" produced whatever the two-call money split
 * happened to yield. One number, imported by the SPA and the edge function alike.
 *
 * ⛔ DISJOINT FROM THE BASELINE BY CONSTRUCTION (Paul, 2026-09-12). A 12 x 3 baseline already gives
 * every judged question 6 answer cells against MIN_CELLS_FOR_QUESTION_CLAIM = 4, so it is a valid
 * winnability read on its own. The full measure excludes the baseline's asked set — a coverage
 * directive to the model AND a code-level filter — so it never re-measures the judged questions,
 * and never contains them (a measurement that contains the refund set is a comparable one).
 */
export const FULL_MEASURE_QUESTIONS = 20;

/**
 * DISCOVERY — the manual breadth scan. 40 questions x ONE run, operator-triggered from the AI
 * Audit page and available nowhere else.
 *
 * WHAT IT IS FOR: finding where a business appears, where it is missing, which competitors and
 * sources keep coming up, and which topics or intents deserve a closer look. Breadth, on purpose.
 *
 * ⛔ IT IS NOT A MEASUREMENT AND MUST NEVER BE READ AS ONE. One ask per question per engine is a
 * single sample, and the variance in this database is brutal — one business swung 0 -> 0.5 -> 0 ->
 * 0.5 -> 0.6 across five identical runs with no work done (see BASELINE_QUESTIONS). Discovery buys
 * COVERAGE with the runs the baseline spends on CONFIDENCE. A gap it finds is a lead to follow,
 * not a finding; validating one means measuring it properly afterwards.
 *
 * ⛔ AND IT DOES NOT CHANGE THE PAID BASELINE OR THE FULL MEASURE. Both stay at 20 x 3. Paul's
 * decision 2026-09-20 was explicitly to add a third manual option rather than raise the global
 * count, because raising it doubles the Apify bill on every paying client's measurement.
 *
 * ⛔ 40 IS THE GENERATOR'S ABSOLUTE CEILING, not a number above it. One model call, one set.
 */
export const DISCOVERY_QUESTIONS = 40;
/** ONE. Stated as a constant so "40 x 1" is a fact a test can read, not a missing value. */
export const DISCOVERY_RUNS = 1;

/**
 * ⛔ THE GENERATOR'S ABSOLUTE CEILING — the most questions ONE model call may be asked for.
 *
 * WHY IT IS NAMED. create-ai-audit's generateQuestions re-clamped every call with the BASELINE
 * ceiling (20) as an "absurd value" guard, while the measurement policy allowed 75. So raising a
 * policy maximum silently changed nothing: a 40-question request generated 20. A cap that is not
 * named cannot be reasoned about, and a policy ceiling above it is a lie the screen tells.
 *
 * THE RULE, pinned by scripts/question-ceilings.test.ts: every POLICY ceiling in this file and in
 * create-ai-audit is <= this number. Raise this first if a policy ever needs to go higher, and the
 * test says so rather than the generator quietly truncating.
 *
 * 40 leaves room above FULL_MEASURE_QUESTIONS (20) for the money/standard two-call split, which
 * over-requests each half and slices, without letting an absurd request reach the model.
 */
export const GENERATOR_ABSOLUTE_MAX_QUESTIONS = 40;
