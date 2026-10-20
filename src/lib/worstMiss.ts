/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE WORST RESULT FOR THE PITCH (Paul, 2026-10-20). The first-reply pitch opens "I asked <engine> "<question>" and it
   mentioned <A>, <B> and <C>." — from the ONE answer that did this business the most harm: it did NOT name them, and it
   named the most other businesses. That answer's own engine, question and names stay together.
   ⛔ Never an answer that named them (so never an engine that named them for that question).
   ⛔ Only the engines we ASK (ChatGPT, Gemini): Google's AI Overview is a search page summary, not something we asked.
   ⛔ Deterministic tie-break: the report's own hook gap first, then Gemini before ChatGPT (HOOK_PICK_ENGINE_ORDER), then
      the earlier question. Names are the report's cleaned per-answer lists (HookReportSummary.tested, through the run's
      junk / suppression gate) — a withheld run has no names, and then the gap is used as it is.
   Pure, no imports: edge-reachable.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface WorstMissInput {
  tested: Array<{ question: string; perEngine: Array<{ engine: string; named: boolean | null; names?: string[] }> }>;
  gap: { question: string; engine: string } | null;
}
export interface WorstMiss { engine: string; question: string; names: string[] }

/** Gemini before ChatGPT on a tie (the hook pick's order). */
export const WORST_MISS_ENGINES = ['gemini', 'chatgpt'] as const;

/** a > b, compared field by field. */
function beats(a: readonly number[], b: readonly number[]): boolean {
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] > b[k];
  return false;
}

export function worstMiss(i: WorstMissInput | null | undefined): WorstMiss | null {
  if (!i) return null;
  let best: { m: WorstMiss; key: [number, number, number, number] } | null = null;
  i.tested.forEach((t, qi) => {
    for (const c of t.perEngine) {
      const er = (WORST_MISS_ENGINES as readonly string[]).indexOf(c.engine);
      if (er < 0 || c.named !== false) continue;
      const names = (c.names ?? []).map((n) => n.trim()).filter(Boolean);
      const isGap = !!i.gap && i.gap.engine === c.engine && i.gap.question === t.question;
      /* Higher is better: more names, then the report's gap, then engine order, then the earlier question. */
      const key: [number, number, number, number] = [names.length, isGap ? 1 : 0, -er, -qi];
      if (!best || beats(key, best.key)) best = { m: { engine: c.engine, question: t.question, names }, key };
    }
  });
  return best ? (best as { m: WorstMiss }).m : null;
}
