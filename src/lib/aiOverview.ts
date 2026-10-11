/* ════════════════════════════════════════════════════════════════════════════════════════════════
   GOOGLE AI OVERVIEW — THE ONE READER (2026-10-11, Paul: "audits answer all three engines").

   Every new audit question (hook, discovery, baseline — every purpose; one queue writes them all)
   records Google's AI Overview beside the ChatGPT and Gemini answers: the overview is part of the
   Google results page the scrape already loads, so it costs nothing extra. The queue stamps each
   question `_ai_overview` = 'shown' | 'not_shown' (supabase/functions/_shared/enrichment/ai-search.ts
   aiOverviewStamp), and this file is the ONLY place that turns a stored question into what a screen
   says about the overview.

   ⛔ DISPLAY ONLY. The overview is never in SCORED_ENGINES or HOOK_ENGINES, never in a "named X of Y"
   count, never the hook pick, never the guarantee. It is shown beside the score, labelled so.
   ⛔ "NO OVERVIEW SHOWN" IS A RESULT, NOT AN ERROR. Google does not show one for every search.
   ⛔ OLD AUDITS ARE UNCHANGED. A question with no stamp is 'not_recorded' and every screen draws
   exactly what it drew before (nothing about the overview on the hook surfaces).

   Plain TypeScript, no React, relative imports with explicit `.ts`: edge functions reach this file.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { cellNamed, type NamedCell, type NamedContext } from './namedSignal.ts';

/** The stored engine key (the actor's own name for it). */
export const AI_OVERVIEW_ENGINE = 'ai_overview';
/** The meta key the queue writes on every new question. Mirrors ai-search.ts AI_OVERVIEW_META_KEY. */
export const AI_OVERVIEW_STAMP_KEY = '_ai_overview';
/** What every surface calls it. */
export const AI_OVERVIEW_LABEL = 'Google AI Overview';
/** The short column / row label the client report uses (auditReport ENGINE_LABELS reads it). */
export const AI_OVERVIEW_REPORT_LABEL = 'AI Overview';
/** The words when Google showed none for a search. */
export const NO_OVERVIEW_TEXT = 'No overview shown';
/** The one-line explanation beside it, for the screens with room. */
export const NO_OVERVIEW_DETAIL = 'Google did not show an AI Overview for this search.';
/** Said wherever the overview sits beside a score. */
export const AI_OVERVIEW_NOT_SCORED = 'Shown for context, not counted in the score.';

export type AiOverviewState =
  /** Google showed an overview; `named` / the answer are filled in. */
  | 'shown'
  /** The results page came back without an overview. */
  | 'not_shown'
  /** The question has not finished yet. */
  | 'pending'
  /** The question failed, so nothing is known about the overview either. */
  | 'failed'
  /** An audit from before the stamp — draw nothing new. */
  | 'not_recorded';

export interface AiOverviewView {
  state: AiOverviewState;
  /** Shown only: did the overview name the business (the same ruler as every other answer). */
  named: boolean | null;
  /** Shown only: the overview's own text (trimmed for display by the caller). */
  answerText: string;
  citations: Array<{ title: string; url: string }>;
  /** Shown only: the overview's own competitor list, as stored (callers apply their own gates). */
  competitors: string[];
}

const PENDING_ROW = new Set(['pending', 'running', 'processing', 'queued']);

function answerOf(cell: unknown): string {
  const t = cell && typeof cell === 'object' ? (cell as { answer_text?: unknown }).answer_text : null;
  return typeof t === 'string' ? t.trim() : '';
}

/** Did this question's stored cells carry the stamp at all? (False on every audit before 2026-10-11.) */
export function hasOverviewStamp(cells: unknown): boolean {
  if (!cells || typeof cells !== 'object') return false;
  const s = (cells as Record<string, unknown>)[AI_OVERVIEW_STAMP_KEY];
  return s === 'shown' || s === 'not_shown';
}

/**
 * The overview for ONE question, from its queue row / run question ({status, result|engines}).
 * `stamped` says whether the AUDIT records overviews (any of its questions carries the stamp), so a
 * pending or failed question of a new audit can say so, while an old audit stays 'not_recorded'.
 */
export function overviewFor(
  row: { status?: string | null; cells: unknown } | null | undefined,
  opts: { stamped: boolean; named?: NamedContext },
): AiOverviewView {
  const empty = (state: AiOverviewState): AiOverviewView => ({ state, named: null, answerText: '', citations: [], competitors: [] });
  const cells = row?.status === 'done' && row.cells && typeof row.cells === 'object' ? row.cells as Record<string, unknown> : null;
  if (cells && hasOverviewStamp(cells)) {
    const cell = cells[AI_OVERVIEW_ENGINE];
    const text = answerOf(cell);
    if (cells[AI_OVERVIEW_STAMP_KEY] === 'shown' && text) {
      const c = cell as { citations?: unknown; competitors?: unknown };
      return {
        state: 'shown',
        named: cellNamed(cell as NamedCell, opts.named),
        answerText: text,
        citations: Array.isArray(c.citations)
          ? c.citations.filter((x): x is { title: string; url: string } => !!x && typeof (x as { url?: unknown }).url === 'string')
            .map((x) => ({ title: String(x.title ?? ''), url: x.url }))
          : [],
        competitors: Array.isArray(c.competitors) ? c.competitors.filter((n): n is string => typeof n === 'string' && !!n.trim()) : [],
      };
    }
    return empty('not_shown');
  }
  if (!opts.stamped) return empty('not_recorded');
  if (!row || PENDING_ROW.has(String(row.status ?? ''))) return empty('pending');
  /* A done question of a stamped audit with no stamp: the results page did not come back whole, so
     the overview is unknown. A failed question likewise. Never "not shown" — that would be a guess. */
  return empty('failed');
}

/** True when any of the audit's questions carries the stamp: the audit records overviews. */
export function auditRecordsOverviews(rows: ReadonlyArray<{ cells: unknown }>): boolean {
  return rows.some((r) => hasOverviewStamp(r.cells));
}

/** The short status word for a pill. */
export function overviewStatusWord(v: Pick<AiOverviewView, 'state' | 'named'>): string {
  switch (v.state) {
    case 'shown': return v.named ? 'Named' : 'Not named';
    case 'not_shown': return NO_OVERVIEW_TEXT;
    case 'pending': return 'Waiting';
    case 'failed': return 'Not available';
    case 'not_recorded': return '';
  }
}

/** The overview across an audit's questions, for a one-line summary. Null when nothing is recorded. */
export function overviewSummary(views: ReadonlyArray<Pick<AiOverviewView, 'state' | 'named'>>): {
  shown: number; notShown: number; named: number; unknown: number; total: number; line: string;
} | null {
  const recorded = views.filter((v) => v.state !== 'not_recorded');
  if (!recorded.length) return null;
  const shown = recorded.filter((v) => v.state === 'shown').length;
  const notShown = recorded.filter((v) => v.state === 'not_shown').length;
  const named = recorded.filter((v) => v.state === 'shown' && v.named).length;
  const unknown = recorded.length - shown - notShown;
  const total = recorded.length;
  const searches = (n: number) => `${n} ${n === 1 ? 'search' : 'searches'}`;
  let line: string;
  if (shown === 0 && unknown === 0) line = `${NO_OVERVIEW_TEXT} for ${total === 1 ? 'this search' : `any of the ${searches(total)}`}`;
  else if (shown === 0) line = `${NO_OVERVIEW_TEXT} so far (${notShown} of ${searches(total)})`;
  else {
    line = `Shown on ${shown} of ${searches(total)}, named in ${named}`;
    if (notShown) line += ` · ${notShown} showed none`;
  }
  return { shown, notShown, named, unknown, total, line };
}
