/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE FULL MEASURE — 20 questions x 3 runs, day 0, AFTER the baseline is frozen.

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
import { FULL_MEASURE_QUESTIONS, GENERATOR_ABSOLUTE_MAX_QUESTIONS } from './auditQuestionCounts.ts';
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
export function fullMeasureAllocation(homeTown: string, areas: readonly string[]): {
  allocation: AreaAllocation[];
  dropped: string[];
} {
  return allocateAreas(homeTown, [...areas], FULL_MEASURE_QUESTIONS, 0);
}
