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
/** The words when Google showed an overview and no business name could be READ from it (state 2 of 3:
 *  none shown / shown, names not read / shown, names listed). Only said when the run's names are not
 *  withheld.
 *  ⛔ NEVER "no businesses named" (Paul, 2026-10-11): an empty extraction is not proof the overview named
 *  nobody — the scrape runs text together and the extractor can miss names. Say what we know: an overview
 *  was shown and its names could not be read. Every surface shows Google's own text beside it. */
export const OVERVIEW_NO_NAMES_TEXT = 'Overview shown, names could not be read';
/** The short label on the public report's overview row. */
export const AI_OVERVIEW_CONTEXT_LABEL = 'Shown for context, not scored';
/** Said wherever the overview sits beside a score. */
export const AI_OVERVIEW_NOT_SCORED = 'Shown for context, not counted in the score.';

/* ══ THE OVERVIEW'S TEXT, READABLE (2026-10-11) ══════════════════════════════════════════════════════
   The actor returns an overview as the page's text run together with NO separators: a sentence glued to
   the next heading or label ("…facilities.Top Commercial Electricians", "…01134360017 | SmartOhm
   Commercial ServicesServices:"), Google Maps cards and Google's own share / copy controls after it
   (measured on 81 stored overviews + a live full-overview run, 2026-10-11). Read that way, the
   competitor extractor found none of the businesses a full overview listed.
   This puts back the space the scrape dropped and cuts Google's controls. It NEVER writes a word and
   never removes one of the overview's own; the stored answer is untouched. One copy, read by the
   extractor (extract-competitors) and the display. */

/** Google's own controls that trail the overview (share / copy / feedback). Everything from the
 *  earliest one is page furniture, never the answer. Multi-word phrases only. */
const OVERVIEW_FURNITURE = [
  'learn morecopied', 'copied to clipboard', 'failed to copy', 'share public link', 'this public link is valid',
  'ai responses may include mistakes', 'ai can make mistakes', 'your feedback helps google improve', 'report a problem',
];

/** The overview with the scrape's missing spaces put back and Google's trailing controls cut. */
export function overviewReadableText(raw: string): string {
  let text = String(raw || '');
  const hay = text.toLowerCase();
  const cut = Math.min(...OVERVIEW_FURNITURE.map((m) => { const i = hay.indexOf(m); return i < 0 ? Infinity : i; }));
  if (Number.isFinite(cut)) text = text.slice(0, cut);
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/([a-z0-9)\]’”'"%])([.!?:;])(?=[A-Z])/g, '$1$2 ')
    /* A name glued to the next card label: "Commercial ServicesServices:", "Moorcroft RdPhone:". */
    .replace(/([a-z])([A-Z][a-z]{2,}:)/g, '$1 $2')
    .trim();
}

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

/* ══ THE OVERVIEW'S TEXT, MADE READABLE (2026-10-11, report restyle) ═════════════════════════════════
   What the actor returns for an AI Overview (measured on 81 stored overviews, 2026-10-11): the page's
   text run together with NO separators — "…industrial facilities.Top Commercial Electricians in Leeds"
   (a sentence glued to the next HEADING), and Google Maps cards glued in after the summary
   ("…in Wallasey.Wirral 24 Hour Plumber4.8(105)PlumberOpen5 Moorcroft RdPhone: …"), sometimes with the
   card details repeated. Audits before the full-overview add-on (switched on 2026-10-11) carry only the
   snippet Google shows before "Show more", so their text can end on a bare heading.
   This turns that into what a reader can take in. It NEVER writes a word: it adds the missing space
   (overviewReadableText, above — the extractor's copy too), keeps the overview's own complete
   sentences, drops a dangling heading / card fragment, and says `truncated` so the caller closes with
   "…". The stored answer is untouched; `named` and the competitor names are decided on the stored
   cell, never on this text.
   ══════════════════════════════════════════════════════════════════════════════════════════════════ */

/** A Google Maps card's rating + review count as the overview text carries it: "4.8(105)", "5.0 (1,204)". */
const MAPS_CARD_RE = /\d\.\d\s?\(\d[\d,.]*[kK]?\)/;
/** The longest summary the reader is given; the report clamps it further to two lines. */
export const OVERVIEW_SUMMARY_CHARS = 420;

/** The readable text on one line (the display never keeps the scrape's line breaks). */
function unglue(raw: string): string {
  return overviewReadableText(raw).replace(/\s+/g, ' ').trim();
}

function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?:])\s+(?=[A-Z0-9“"(£])/).map((s) => s.trim()).filter(Boolean);
}

/**
 * The overview's opening, readable: its own complete sentences up to OVERVIEW_SUMMARY_CHARS, stopping
 * before a Maps card or a dangling heading. `truncated` = the overview said more than this.
 * Empty when not even one sentence can be read (the caller then shows the names alone).
 */
export function overviewSummaryText(raw: string): { text: string; truncated: boolean } {
  const t = unglue(raw);
  if (!t) return { text: '', truncated: false };
  const card = t.search(MAPS_CARD_RE);
  const head = card >= 0 ? t.slice(0, card) : t;
  let truncated = card >= 0;
  const keep: string[] = [];
  const seen = new Set<string>();
  let len = 0;
  for (const s of sentencesOf(head)) {
    const complete = /[.!?]$/.test(s);
    const intro = /:$/.test(s);
    if (!complete && !intro) {
      /* A bare heading or a business name glued before its card: not a sentence the overview finished
         on this page. A long unpunctuated opening is still the overview's own words — kept, marked. */
      if (!keep.length && s.split(/\s+/).length >= 10) keep.push(s);
      truncated = true;
      break;
    }
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    if (keep.length && len + s.length + 1 > OVERVIEW_SUMMARY_CHARS) { truncated = true; break; }
    seen.add(k); keep.push(s); len += s.length + 1;
    if (intro) { truncated = true; break; }
  }
  return { text: keep.join(' '), truncated };
}

/** The whole overview for "Read the overview": spaces restored, a repeated sentence shown once, each
 *  Maps card's rating set off so it does not run into the name. Still only the overview's own words. */
export function overviewFullText(raw: string): string {
  const t = unglue(raw).replace(new RegExp(`\\s?(${MAPS_CARD_RE.source})\\s?`, 'g'), ' $1 ');
  const seen = new Set<string>();
  return sentencesOf(t).filter((s) => { const k = s.toLowerCase(); if (s.length > 25 && seen.has(k)) return false; seen.add(k); return true; }).join(' ').replace(/\s+/g, ' ').trim();
}

export interface AiOverviewView {
  state: AiOverviewState;
  /** Shown only: did the overview name the business (the same ruler as every other answer). */
  named: boolean | null;
  /** Shown only: the overview's opening, cleaned for reading (overviewSummaryText). Never the stored
   *  bytes: those are the cell's, read by the named ruler and extract-competitors. */
  answerText: string;
  /** Shown only: the overview said more than `answerText` — close it with "…". */
  truncated: boolean;
  /** Shown only: the whole overview, cleaned for reading (overviewFullText), for "Read the overview". */
  fullText: string;
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
  const empty = (state: AiOverviewState): AiOverviewView => ({ state, named: null, answerText: '', truncated: false, fullText: '', citations: [], competitors: [] });
  const cells = row?.status === 'done' && row.cells && typeof row.cells === 'object' ? row.cells as Record<string, unknown> : null;
  if (cells && hasOverviewStamp(cells)) {
    const cell = cells[AI_OVERVIEW_ENGINE];
    const text = answerOf(cell);
    if (cells[AI_OVERVIEW_STAMP_KEY] === 'shown' && text) {
      const c = cell as { citations?: unknown; competitors?: unknown };
      const summary = overviewSummaryText(text);
      return {
        state: 'shown',
        named: cellNamed(cell as NamedCell, opts.named),
        answerText: summary.text,
        truncated: summary.truncated,
        fullText: overviewFullText(text),
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
