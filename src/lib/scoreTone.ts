/* ════════════════════════════════════════════════════════════════════════════════════════════════
   AI SCORE COLOURS (sales-team-today release, 2026-10-06) — the ONE rule for colouring a naming result.

   A count "named / asked" (one engine: ChatGPT 2/3, Google AI 0/3) or the overall percentage named is
   coloured by its PROPORTION, so a different denominator in future needs no new table:
     all named           → strong  (green)
     half or more named  → good    (green-ish)
     some but under half → weak    (amber)
     none named          → poor    (red)
     no data / running / failed / incomplete → none (neutral) — never red: a failure is not "not named".
   ⛔ COLOUR, NEVER A WORD. "The numbers are the judgement" (Paul, HookVisibilityView): no poor/good/
      excellent label is shown — the tone only colours the real count.
   ⛔ Not an SEO score: this is only the actual naming result.
   Pure. No React.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type ScoreTone = 'strong' | 'good' | 'weak' | 'poor' | 'none';

/** The tone for `named` out of `expected`. Anything not a complete, valid count is 'none'. */
export function scoreTone(named: number | null | undefined, expected: number | null | undefined): ScoreTone {
  if (typeof named !== 'number' || typeof expected !== 'number' || !Number.isFinite(named) || !Number.isFinite(expected)) return 'none';
  if (expected <= 0 || named < 0 || named > expected) return 'none';
  if (named === expected) return 'strong';
  if (named === 0) return 'poor';
  return named / expected >= 0.5 ? 'good' : 'weak';
}

/** The tone for a whole-number percentage named (0–100). */
export function percentTone(percent: number | null | undefined): ScoreTone {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) return 'none';
  return scoreTone(Math.round(percent), 100);
}

/** Tailwind classes per tone: a soft chip, its text, its ring and a solid edge. */
export const SCORE_TONE_CLASS: Record<ScoreTone, { chip: string; text: string; edge: string; solid: string }> = {
  strong: { chip: 'bg-emerald-500/15 ring-emerald-500/40', text: 'text-emerald-700 dark:text-emerald-300', edge: 'border-l-emerald-500', solid: 'bg-emerald-600 text-white' },
  good: { chip: 'bg-lime-500/15 ring-lime-500/40', text: 'text-lime-700 dark:text-lime-300', edge: 'border-l-lime-500', solid: 'bg-lime-600 text-white' },
  weak: { chip: 'bg-amber-500/15 ring-amber-500/40', text: 'text-amber-700 dark:text-amber-300', edge: 'border-l-amber-500', solid: 'bg-amber-500 text-white' },
  poor: { chip: 'bg-red-500/15 ring-red-500/40', text: 'text-red-700 dark:text-red-300', edge: 'border-l-red-500', solid: 'bg-red-600 text-white' },
  none: { chip: 'bg-muted ring-border', text: 'text-muted-foreground', edge: 'border-l-border', solid: 'bg-muted text-muted-foreground' },
};

/** The engine's name on sales-facing screens: Gemini is "Google AI" (the engine key stays 'gemini'). */
export function salesEngineLabel(engineOrLabel: string | null | undefined): string {
  const s = (engineOrLabel ?? '').trim();
  return /^gemini$/i.test(s) || /^google ai$/i.test(s) ? 'Google AI' : /^chatgpt$/i.test(s) ? 'ChatGPT' : s || 'AI';
}
