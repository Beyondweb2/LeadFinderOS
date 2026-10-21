/* AI DRAFT OUTCOMES (2026-10-21, Paul) — the readout's arithmetic. The outcomes themselves are recorded by ONE writer,
   the database trigger `trg_ai_reply_draft_outcome` (migration 20261115090000), whichever button closed the draft; the
   rows are summed per intent by `ai_draft_outcome_summary()` (admin only). This file only folds those rows for display.
   Record: docs/ai-handles-replies.md "Draft outcomes". */

export interface DraftOutcomeRow {
  intent: string;
  versions: number;
  sent_unchanged: number;
  sent_edited: number;
  regenerated: number;
  discarded: number;
  superseded: number;
  not_used: number;
  avg_words_changed: number | null;
  avg_share_changed: number | null;
}

export interface DraftOutcomeIntent {
  intent: string;
  label: string;
  sent: number;
  unchanged: number;
  edited: number;
  /** edited ÷ sent, 0–1; null when nothing was sent */
  editedShare: number | null;
  avgWordsChanged: number | null;
  regenerated: number;
  discarded: number;
  other: number;
}

export interface DraftOutcomeSummary {
  sent: number;
  unchanged: number;
  edited: number;
  /** unchanged ÷ sent, 0–1; null when nothing was sent */
  unchangedShare: number | null;
  regenerated: number;
  discarded: number;
  other: number;
  /** most edited first: edited count, then edited share */
  intents: DraftOutcomeIntent[];
}

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const share = (part: number, whole: number): number | null => (whole > 0 ? part / whole : null);

/** "first_reply_pitch" → "First reply pitch". The raw key stays in the tooltip. */
export function intentLabel(intent: string): string {
  const s = (intent || 'unknown').replace(/[_-]+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Unknown';
}

export function summariseDraftOutcomes(rows: DraftOutcomeRow[] | null | undefined): DraftOutcomeSummary {
  const intents: DraftOutcomeIntent[] = (rows ?? []).map((r) => {
    const unchanged = n(r.sent_unchanged);
    const edited = n(r.sent_edited);
    const sent = unchanged + edited;
    return {
      intent: r.intent, label: intentLabel(r.intent), sent, unchanged, edited,
      editedShare: share(edited, sent),
      avgWordsChanged: r.avg_words_changed == null ? null : n(r.avg_words_changed),
      regenerated: n(r.regenerated), discarded: n(r.discarded),
      other: n(r.superseded) + n(r.not_used),
    };
  });
  intents.sort((a, b) => b.edited - a.edited || (b.editedShare ?? -1) - (a.editedShare ?? -1) || b.sent - a.sent || a.label.localeCompare(b.label));
  const sum = (k: keyof DraftOutcomeIntent) => intents.reduce((t, i) => t + n(i[k]), 0);
  const sent = sum('sent');
  const unchanged = sum('unchanged');
  return {
    sent, unchanged, edited: sum('edited'), unchangedShare: share(unchanged, sent),
    regenerated: sum('regenerated'), discarded: sum('discarded'), other: sum('other'), intents,
  };
}

export function pct(v: number | null): string {
  return v == null ? '—' : `${Math.round(v * 100)}%`;
}

/* LEVEL 2: the automatic replies (outcome 'auto_sent', one writer: trg_ai_reply_draft_outcome), per reply type, from
   ai_auto_send_summary() — today = the London day. */
export interface AutoSentRow { intent: string; today: number; in_period: number; waiting: number }
export interface AutoSentSummary {
  today: number;
  inPeriod: number;
  waiting: number;
  /** most sent today first, then in the period */
  intents: Array<{ intent: string; today: number; inPeriod: number; waiting: number }>;
}

export function summariseAutoSent(rows: AutoSentRow[] | null | undefined): AutoSentSummary {
  const intents = (rows ?? []).map((r) => ({ intent: r.intent, today: n(r.today), inPeriod: n(r.in_period), waiting: n(r.waiting) }))
    .sort((a, b) => b.today - a.today || b.inPeriod - a.inPeriod || a.intent.localeCompare(b.intent));
  return {
    today: intents.reduce((t, i) => t + i.today, 0),
    inPeriod: intents.reduce((t, i) => t + i.inPeriod, 0),
    waiting: intents.reduce((t, i) => t + i.waiting, 0),
    intents,
  };
}
