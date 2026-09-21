/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE FULL MEASURE — the operator's chosen question count (1..80) x their chosen run count (1..3),
   day 0, AFTER the baseline is frozen. FULL_MEASURE_QUESTIONS x MEASUREMENT_DEFAULT_RUNS is what
   the automatic post-freeze start asks for and what the wizard opens on.

   What it is for: finding which questions, and which of the client's towns, are winnable, so we
   know where to build pages. What it is NOT: a comparison. The refund is judged on the frozen
   baseline (outreach_leads.baseline_audit_id) and nothing else, and this audit is never compared
   to anything.

   ⛔ DISJOINT FROM THE BASELINE BY CONSTRUCTION (Paul, 2026-09-12). A 12 x 3 baseline already gives
   every judged question 6 answer cells against MIN_CELLS_FOR_QUESTION_CLAIM = 4, so it is a valid
   winnability read on its own; re-asking those 12 buys nothing. And a measurement that CONTAINS the
   judged set is a comparable one — a client could call it the "after". So the baseline's asked set
   is excluded here in two layers: a coverage directive asks the model to avoid those intents, and
   `excludeAsked` removes any paraphrase that came back anyway. The directive is the polite request;
   the filter is the guarantee.

   ⛔ THE TOWNS LIVE HERE, NOT IN THE BASELINE (option C). The baseline is the home town only; the
   client's `areas_list` is spread across this measure by the same allocator the baseline used to
   use, at this measure's ceiling. The client is told plainly: we judge the refund where you trade,
   we measure your ambitions to decide what to build.

   IMPORTED BY AN EDGE FUNCTION: relative imports with an explicit .ts extension only (CLAUDE.md §4).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  FULL_MEASURE_QUESTIONS,
  FULL_MEASURE_MIN_QUESTIONS,
  FULL_MEASURE_MAX_QUESTIONS,
  MEASUREMENT_MIN_RUNS,
  MEASUREMENT_MAX_RUNS,
  MEASUREMENT_DEFAULT_RUNS,
  GENERATOR_ABSOLUTE_MAX_QUESTIONS,
} from './auditQuestionCounts.ts';
import { allocateAreas, type AreaAllocation } from './baselineContract.ts';
import { questionKey } from './seedGuard.ts';

/**
 * Remove every question that is in the baseline's asked set, case- and punctuation-insensitively
 * (the queue's own identity rule). Order is preserved; nothing is added.
 */
export function excludeAsked(questions: readonly string[], asked: readonly string[]): string[] {
  if (!asked.length) return [...questions];
  const banned = new Set(asked.map((q) => questionKey(q ?? '')));
  return questions.filter((q) => !banned.has(questionKey(q ?? '')));
}

/**
 * How many to ASK the generator for, so that after the exclusion filter `wanted` survive.
 * Over-asks by the size of the excluded set (every excluded question is one the model might
 * paraphrase back), capped at the generator's absolute ceiling — never above it, because a
 * request the generator silently truncates is the fault GENERATOR_ABSOLUTE_MAX_QUESTIONS exists
 * to name.
 */
export function overAskFor(wanted: number, excludedCount: number): number {
  const w = Math.max(0, Math.floor(wanted));
  const e = Math.max(0, Math.floor(excludedCount));
  return Math.min(GENERATOR_ABSOLUTE_MAX_QUESTIONS, w + e);
}

/**
 * Spread the full measure across the home town and the client's picked areas. Same allocator the
 * baseline used until 2026-09-12, at the measure's own ceiling. Four towns → 10 / 4 / 3 / 3.
 * No `mainFloor`: nothing in this measure is a refund test, so nothing needs protecting.
 */
export function fullMeasureAllocation(
  homeTown: string,
  areas: readonly string[],
  /** The operator's chosen size for THIS measure. Defaults to the policy default so every existing
   *  caller is unchanged; the wizard and the post-freeze starter pass what was actually asked for. */
  ceiling: number = FULL_MEASURE_QUESTIONS,
): {
  allocation: AreaAllocation[];
  dropped: string[];
} {
  return allocateAreas(homeTown, [...areas], clampFullMeasureQuestions(ceiling), 0);
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
   THE TWO DIALS — size and repetition. Both are clamped HERE, by one function each, and both the
   SPA and create-ai-audit import them, so the screen cannot offer a value the server refuses and
   the server cannot refuse a value the screen showed as valid.

   ⚠️ CLAMPING IS NOT VALIDATION. These exist so a persisted/garbled value resolves to something
   sane; the server ALSO refuses an out-of-range value that was stated explicitly, rather than
   quietly running a smaller audit than was asked for (the silent-truncation fault).
   ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** Clamp an untrusted question count into the full measure's bounds. Junk → the default. */
export function clampFullMeasureQuestions(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : FULL_MEASURE_QUESTIONS;
  return Math.min(FULL_MEASURE_MAX_QUESTIONS, Math.max(FULL_MEASURE_MIN_QUESTIONS, v));
}

/** True when `n` is a question count a full measure may actually be started with. */
export function isValidFullMeasureQuestionCount(n: unknown): boolean {
  return typeof n === 'number' && Number.isInteger(n)
    && n >= FULL_MEASURE_MIN_QUESTIONS && n <= FULL_MEASURE_MAX_QUESTIONS;
}

/** Clamp an untrusted run count into 1..3. Junk → MEASUREMENT_DEFAULT_RUNS. */
export function clampMeasurementRuns(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : MEASUREMENT_DEFAULT_RUNS;
  return Math.min(MEASUREMENT_MAX_RUNS, Math.max(MEASUREMENT_MIN_RUNS, v));
}

/** True when `n` is a run count a full measure may actually be started with. */
export function isValidMeasurementRuns(n: unknown): boolean {
  return typeof n === 'number' && Number.isInteger(n)
    && n >= MEASUREMENT_MIN_RUNS && n <= MEASUREMENT_MAX_RUNS;
}

/**
 * HOW MANY AI ANSWERS THIS MEASURE WILL ASK FOR — questions × runs × engines.
 *
 * ⛔ THE SCREEN AND THE SERVER COMPUTE IT WITH THE SAME FUNCTION. A total quoted before the button
 * is pressed is a spend promise; deriving it twice is how the two drift. `engines` is the length of
 * the engine list the server actually queues (AUDIT_ENGINES), never a hardcoded 2.
 */
export function expectedResponses(questions: number, runs: number, engines: number): number {
  const q = Math.max(0, Math.floor(Number(questions) || 0));
  const r = Math.max(0, Math.floor(Number(runs) || 0));
  const e = Math.max(0, Math.floor(Number(engines) || 0));
  return q * r * e;
}

/**
 * SPLIT A GENERATION TARGET INTO CALLS THE GENERATOR WILL HONOUR.
 *
 * ⛔ WHY THIS EXISTS. generateQuestions clamps EVERY call at GENERATOR_ABSOLUTE_MAX_QUESTIONS, so
 * asking one call for 80 returns 40 and nothing says so — the exact fault that made the old
 * 10..75 dial a lie. A target above the cap is asked for across several calls instead, each under
 * it, with the questions produced so far fed back as a coverage directive so the calls do not
 * simply repeat each other. The caller pools, dedupes by intent and fills to the target.
 *
 * The over-ask (one extra slot per excluded baseline question, same rule as `overAskFor`) is
 * bounded at one generator call's worth: past that it buys nothing but latency.
 *
 * Returns the per-call sizes, largest first is NOT required — they are spread evenly so no call
 * asks for a handful, which the model answers worse than a full batch.
 */
export function planGenerationBatches(target: number, excludedCount = 0): number[] {
  const t = Math.max(0, Math.floor(Number(target) || 0));
  if (t === 0) return [];
  const over = Math.min(Math.max(0, Math.floor(Number(excludedCount) || 0)), GENERATOR_ABSOLUTE_MAX_QUESTIONS);
  const total = t + over;
  const batches = Math.ceil(total / GENERATOR_ABSOLUTE_MAX_QUESTIONS);
  const base = Math.floor(total / batches);
  const spare = total - base * batches;
  return Array.from({ length: batches }, (_, i) => base + (i < spare ? 1 : 0));
}
