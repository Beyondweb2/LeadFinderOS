/* Per-engine score chips on the Inbox lead list (ChatGPT, Gemini, Google AI) — one leaf, no React.
   Numbers come from the lead's NEWEST audit via the one-call inbox_engine_signals() read (useInbox); the DB counts, the Inbox gets
   six small ints per audit. Judged on the stored model verdict, the same ruler as the Gemini count it replaces. A glance, not the
   guarantee: the report and the guarantee keep their own rules. Absent data is GREY ("no answer"), never red. */
export const ENGINE_KEYS = ['chatgpt', 'gemini', 'overview'] as const;
export type EngineKey = (typeof ENGINE_KEYS)[number];
/** Screens say "Gemini" (not "Google AI"); the overview is shown as "Google AI". */
export const ENGINE_CHIP_LABELS: Record<EngineKey, string> = { chatgpt: 'ChatGPT', gemini: 'Gemini', overview: 'Google AI' };

export interface EngineScore { named: number; answers: number }
export type EngineScores = Record<EngineKey, EngineScore | null>;
export interface EngineSignalRow {
  audit_id: string; lead_id: string | null;
  chatgpt_answers?: number | null; chatgpt_named?: number | null;
  gemini_answers?: number | null; gemini_named?: number | null;
  overview_answers?: number | null; overview_named?: number | null;
}
export type EngineTone = 'named' | 'not_named' | 'none';

export function engineTone(score: EngineScore | null | undefined): EngineTone {
  if (!score || !(score.answers > 0)) return 'none';
  return score.named > 0 ? 'named' : 'not_named';
}

const scoreOf = (answers: number | null | undefined, named: number | null | undefined): EngineScore | null => {
  const a = Number(answers ?? 0);
  return a > 0 ? { named: Math.min(Number(named ?? 0), a), answers: a } : null;
};

/** Newest audit per lead (`audits` is newest-first) that carries any engine answer wins. */
export function engineScoresByLead(
  audits: readonly { id: string; lead_id: string | null }[],
  signals: readonly EngineSignalRow[],
): Map<string, EngineScores> {
  const byAudit = new Map<string, EngineScores>();
  for (const s of signals) {
    const scores: EngineScores = {
      chatgpt: scoreOf(s.chatgpt_answers, s.chatgpt_named),
      gemini: scoreOf(s.gemini_answers, s.gemini_named),
      overview: scoreOf(s.overview_answers, s.overview_named),
    };
    if (scores.chatgpt || scores.gemini || scores.overview) byAudit.set(s.audit_id, scores);
  }
  const out = new Map<string, EngineScores>();
  for (const a of audits) {
    if (!a.lead_id || out.has(a.lead_id)) continue;
    const sc = byAudit.get(a.id);
    if (sc) out.set(a.lead_id, sc);
  }
  return out;
}

export function engineChipTitle(key: EngineKey, score: EngineScore | null | undefined): string {
  const label = ENGINE_CHIP_LABELS[key];
  if (!score || !(score.answers > 0)) return `${label}: no answer yet, or no audit`;
  return `${label}: named in ${score.named} of ${score.answers} answers`;
}
