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
 * 🔴 SUPERSEDED 2026-09-23 (Paul): the paid baseline now spans the home town AND the approved
 * service areas — Discovery first, then a balanced 20 (src/lib/baselineMix.ts) — and the refund is
 * judged on all 20. The text below is the 2026-09-12 policy it replaced, kept for the reasoning on
 * sample size and variance, which still stands.
 *
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
 * DISCOVERY — the manual breadth scan, and THE flexible opportunity/research audit (Paul,
 * 2026-09-21). Operator-triggered from the AI Audit page and available nowhere else:
 * 1..80 questions (default 40) x 1..3 runs (default 3), with the operator picking which of the
 * generated questions actually run.
 *
 * WHAT IT IS FOR: finding where a business appears, where it is missing, which competitors and
 * sources keep coming up, and which topics or intents deserve a closer look. Breadth, on purpose.
 *
 * ⛔ IT IS NOT A MEASUREMENT AND MUST NEVER BE READ AS ONE, whatever it is dialled to. Even at
 * three runs it is not compared to anything, it never claims a baseline pointer, and the variance
 * in this database is brutal — one business swung 0 -> 0.5 -> 0 -> 0.5 -> 0.6 across five
 * identical runs with no work done (see BASELINE_QUESTIONS). A gap it finds is a lead to follow,
 * not a finding; validating one means measuring it properly afterwards.
 *
 * ⛔ AND IT STILL DOES NOT CHANGE THE PAID BASELINE OR THE FULL MEASURE. Both stay at 20 x 3.
 * Paul's decision 2026-09-20 was to add a third manual option rather than raise the global count,
 * because raising it doubles the Apify bill on every paying client's measurement — and his
 * decision 2026-09-21 was that THIS is the audit that gets the dials, for exactly the same reason.
 *
 * ⛔ THE CEILING IS ABOVE ONE MODEL CALL, AND THAT IS ONLY HONEST BECAUSE GENERATION IS BATCHED.
 * `planGenerationBatches` (src/lib/auditPlan.ts) splits any target above
 * GENERATOR_ABSOLUTE_MAX_QUESTIONS into calls that each sit under it. This was the original sin of
 * the old 10..75 full-measure dial — a policy ceiling the generator silently clamped — so never
 * raise DISCOVERY_MAX_QUESTIONS without checking the batching still covers it.
 */
export const DISCOVERY_QUESTIONS = 40;
/** The operator's bounds. 1 is allowed: a one-question look is a cheap, honest thing to want. */
export const DISCOVERY_MIN_QUESTIONS = 1;
export const DISCOVERY_MAX_QUESTIONS = 80;
/** THREE, the DEFAULT (Paul, 2026-09-21; it was 1 while discovery was a fixed 40 x 1). Stated as a
 *  constant so the default is a fact a test can read rather than a missing value, and so a request
 *  that omits the run count means the same thing as the screen's own default rather than the
 *  cheapest possible thing. */
export const DISCOVERY_DEFAULT_RUNS = 3;
/** ONE. The floor, named so a validator reads a constant rather than a literal. */
export const DISCOVERY_MIN_RUNS = 1;
/**
 * ⛔ THE MOST RUNS A DISCOVERY AUDIT MAY ASK FOR — operator-chosen, 1 to 3 (Paul, 2026-09-20).
 *
 * WHY MORE THAN ONE IS WORTH OFFERING: asking the SAME questions three times turns each one
 * into "named 2 of 3" rather than a coin flip, which is the difference between "the engines do not
 * know this business" and "the engines are inconsistent about it" — fragmentation, the thing
 * discovery is looking for.
 *
 * ⛔ 3, NOT 5. Cost scales linearly: 40 x 3 is 120 questions of Apify against a single audit, and
 * Apify is a single point of failure with a monthly cap shared by every question in the product.
 * The paid baseline's own confidence number is 3; nothing here needs more than the guarantee does.
 */
export const DISCOVERY_MAX_RUNS = 3;

/**
 * ⛔ THE GENERATOR'S ABSOLUTE CEILING — the most questions ONE model call may be asked for.
 *
 * WHY IT IS NAMED. create-ai-audit's generateQuestions re-clamped every call with the BASELINE
 * ceiling (20) as an "absurd value" guard, while the measurement policy allowed 75. So raising a
 * policy maximum silently changed nothing: a 40-question request generated 20. A cap that is not
 * named cannot be reasoned about, and a policy ceiling above it is a lie the screen tells.
 *
 * THE RULE, pinned by scripts/question-ceilings.test.ts: every POLICY ceiling served by ONE
 * generator call is <= this number. DISCOVERY_MAX_QUESTIONS (80) is the single exception, and it
 * is allowed ONLY because `planGenerationBatches` splits it into calls that each sit at or under
 * this cap — the test asserts the batch planner, never an exemption.
 *
 * 40 leaves room above FULL_MEASURE_QUESTIONS (20) for the money/standard two-call split, which
 * over-requests each half and slices, without letting an absurd request reach the model.
 */
export const GENERATOR_ABSOLUTE_MAX_QUESTIONS = 40;
