/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PLANNING AN AUDIT'S SIZE — the two dials, the spend they imply, and the calls they take.

   ⛔ WHY THIS IS ITS OWN MODULE AND NOT PART OF auditQuestionCounts. That file is the POLICY: the
   numbers, and the reasoning behind each. This is the ARITHMETIC every consumer of those numbers
   has to agree on — the clamps, the validators, the expected-response sum and the batch plan. The
   SPA and create-ai-audit both import it, so the screen cannot offer a size the server refuses and
   the total quoted before the button cannot drift from the total recorded on the run.

   ⛔ CLAMPING IS NOT VALIDATION, AND BOTH ARE HERE ON PURPOSE. The clamps exist so a garbled
   persisted value resolves to something sane. The validators exist so a value somebody STATED
   outside the bounds is refused rather than quietly shrunk — quietly running 80 as 40 is the fault
   this whole area is scarred by (the 10..75 full-measure dial over a generator capped at 20; a
   16-question baseline truncated to 12; a 40-question discovery re-run sliced to 5).

   IMPORTED BY AN EDGE FUNCTION: relative imports with an explicit .ts extension only, no @/ alias,
   no dependencies beyond the policy module — see CLAUDE.md §4.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  DISCOVERY_QUESTIONS,
  DISCOVERY_MIN_QUESTIONS,
  DISCOVERY_MAX_QUESTIONS,
  DISCOVERY_MIN_RUNS,
  DISCOVERY_MAX_RUNS,
  DISCOVERY_DEFAULT_RUNS,
  GENERATOR_ABSOLUTE_MAX_QUESTIONS,
} from './auditQuestionCounts.ts';

/** Clamp an untrusted discovery question count into its bounds. Junk → the default. */
export function clampDiscoveryQuestions(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : DISCOVERY_QUESTIONS;
  return Math.min(DISCOVERY_MAX_QUESTIONS, Math.max(DISCOVERY_MIN_QUESTIONS, v));
}

/** True when `n` is a question count a discovery audit may actually be started with. */
export function isValidDiscoveryQuestionCount(n: unknown): boolean {
  return typeof n === 'number' && Number.isInteger(n)
    && n >= DISCOVERY_MIN_QUESTIONS && n <= DISCOVERY_MAX_QUESTIONS;
}

/** Clamp an untrusted discovery run count into 1..3. Junk → DISCOVERY_DEFAULT_RUNS. */
export function clampDiscoveryRuns(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : DISCOVERY_DEFAULT_RUNS;
  return Math.min(DISCOVERY_MAX_RUNS, Math.max(DISCOVERY_MIN_RUNS, v));
}

/** True when `n` is a run count a discovery audit may actually be started with. */
export function isValidDiscoveryRuns(n: unknown): boolean {
  return typeof n === 'number' && Number.isInteger(n)
    && n >= DISCOVERY_MIN_RUNS && n <= DISCOVERY_MAX_RUNS;
}

/**
 * HOW MANY AI ANSWERS AN AUDIT WILL ASK FOR — questions × runs × engines.
 *
 * ⛔ THE SCREEN AND THE SERVER COMPUTE IT WITH THE SAME FUNCTION. A total quoted before the button
 * is pressed is a spend promise; deriving it twice is how the two drift. `engines` is the length
 * of the engine list the server actually queues (AUDIT_ENGINES), never a hardcoded 2 — if an
 * engine is ever disabled the total has to follow it without anybody remembering to edit a sum.
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
 * asking one call for 80 returns 40 and nothing says so — the caller's fill would then top the
 * rest up from templates, and the screen would say 80 over a queue running half of them
 * generated. That is exactly the lie the old 10..75 dial told. A target above the per-call cap is
 * asked for across several calls instead, each under it, with the questions produced so far fed
 * back as a coverage directive so the calls do not simply paraphrase each other. The caller pools,
 * dedupes by intent and fills to the target.
 *
 * `excludedCount` over-asks by one slot per question that will be filtered out afterwards (the
 * full measure's baseline exclusion), bounded at one generator call's worth: past that it buys
 * nothing but latency. Discovery passes 0 — it excludes nothing.
 *
 * The sizes are spread evenly so no call asks for a handful, which the model answers worse than a
 * full batch.
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
