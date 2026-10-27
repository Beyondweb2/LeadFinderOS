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
   ⛔ OLD AUDITS SHOW WHAT THEY CAPTURED (2026-10-19; until then they showed nothing). A question with no
   stamp is read from its stored overview answer / results page (overviewReadingOf); only when neither
   says anything is it 'not_recorded', drawn as a neutral "not recorded" chip — never a guess.

   Plain TypeScript, no React, relative imports with explicit `.ts`: edge functions reach this file.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { cellNamed, type NamedCell, type NamedContext } from './namedSignal.ts';

/** The stored engine key (the actor's own name for it). */
export const AI_OVERVIEW_ENGINE = 'ai_overview';
/** The meta key the queue writes on every new question. Mirrors ai-search.ts AI_OVERVIEW_META_KEY. */
export const AI_OVERVIEW_STAMP_KEY = '_ai_overview';
/** What every surface calls it. */
export const AI_OVERVIEW_LABEL = 'Google AI';
/** The short column / row label the client report uses (auditReport ENGINE_LABELS reads it). */
export const AI_OVERVIEW_REPORT_LABEL = 'Google AI';
/** The words when Google showed none for a search. */
export const NO_OVERVIEW_TEXT = 'No AI answer shown';
/** The one-line explanation beside it, for the screens with room. */
export const NO_OVERVIEW_DETAIL = 'Google did not show an AI answer for this search, so it is left out of the score (not a penalty).';
/** The words when Google showed an overview and no business name could be READ from it (state 2 of 3:
 *  none shown / shown, names not read / shown, names listed). Only said when the run's names are not
 *  withheld.
 *  ⛔ NEVER "no businesses named" (Paul, 2026-10-11): an empty extraction is not proof the overview named
 *  nobody — the scrape runs text together and the extractor can miss names. Say what we know: an overview
 *  was shown and its names could not be read. Every surface shows Google's own text beside it. */
export const OVERVIEW_NO_NAMES_TEXT = 'AI answer shown, names could not be read';
/** The short label on the public report's overview row. */
export const AI_OVERVIEW_CONTEXT_LABEL = 'Not in score';
/** Said wherever the overview sits beside a score. */
export const AI_OVERVIEW_NOT_SCORED = 'Not in score: this audit was run before Google AI was scored.';

/* ══ GOOGLE AI IN THE SCORE — VERSIONED (Paul, 2026-10-19) ═══════════════════════════════════════════
   Renamed "Google AI" (was "Google AI Overview") and counted in the named percentage for audits created on or
   after GOOGLE_AI_SCORED_SINCE: SCORING METHOD 2. Only the searches where Google showed an AI answer count —
   none shown is left out of the score, never a penalty ("No AI answer shown", grey).
   ⛔ NOTHING STORED IS REWRITTEN. The method is DERIVED from the audit's own creation time, so every older audit
      keeps the score it had (method 1, Google AI "not in score"), and a client's guarantee compares like with like:
      a re-measure is judged by its BASELINE's method (scoringMethodFor(baseline)), the other number shown as extra.
   ⛔ The send gates, the hook pick and the 6/6 rule read method 1 (scoreHookRun's own fields) — unchanged. */
export const GOOGLE_AI_SCORED_SINCE = '2026-10-19T08:57:00Z';
export type ScoringMethod = 1 | 2;
export function scoringMethodFor(auditCreatedAt: string | null | undefined): ScoringMethod {
  const t = auditCreatedAt ? Date.parse(auditCreatedAt) : NaN;
  return Number.isFinite(t) && t >= Date.parse(GOOGLE_AI_SCORED_SINCE) ? 2 : 1;
}
export const IN_SCORE_TEXT = 'in score';
export const NOT_IN_SCORE_TEXT = 'not in score';
export const LEFT_OUT_OF_SCORE_TEXT = 'left out of the score';

/** What a screen says about ONE search's Google AI beside the score. "In score" only for a search where Google
 *  actually showed an AI answer (method 2); a search with none shown (or pending / failed / not recorded) is
 *  "left out of the score", never in it and never a miss; a method-1 audit never scored Google AI at all. */
export function overviewScoreNote(state: AiOverviewState, inScore: boolean): string {
  if (!inScore) return NOT_IN_SCORE_TEXT;
  return state === 'shown' ? IN_SCORE_TEXT : LEFT_OUT_OF_SCORE_TEXT;
}

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

/* ══ WHAT THE STORED QUESTION SAYS ABOUT THE OVERVIEW (2026-10-19, Paul: "AI Overview everywhere") ══
   🔴 THE BUG THIS FIXES: every screen read the overview ONLY through the `_ai_overview` stamp, which the
   queue has written since 2026-10-11. But the overview's ANSWER has been stored in the `ai_overview` cell
   since July (measured 2026-10-19: 3,712 stored overview answers across ~1,300 audits with no stamp), so
   every audit before 11 Oct showed no overview at all although Google's answer was sitting in the row.
   The stamp is now one of three readings, each only from what was captured:
     · the stamp, where the queue wrote one (the queue's own verdict);
     · else an `ai_overview` cell with answer text → 'shown' (Google's answer is right there);
     · else the organic results page came back (`_google_serp`, stored since 2026-09-15) and carried no
       overview → 'not_shown' — the SAME test aiOverviewStamp (ai-search.ts) applies to a new question;
     · else nothing is known → null ('not_recorded'), never a guess. */
export type OverviewReading = 'shown' | 'not_shown';

export function overviewReadingOf(cells: unknown): OverviewReading | null {
  if (!cells || typeof cells !== 'object') return null;
  const c = cells as Record<string, unknown>;
  const s = c[AI_OVERVIEW_STAMP_KEY];
  if (s === 'shown' || s === 'not_shown') return s;
  if (answerOf(c[AI_OVERVIEW_ENGINE])) return 'shown';
  const serp = c['_google_serp'];
  return serp && typeof serp === 'object' ? 'not_shown' : null;
}

/** Does this question's stored result say anything about the overview (the stamp, a captured answer,
 *  or a results page that came back without one)? */
export function hasOverviewStamp(cells: unknown): boolean {
  return overviewReadingOf(cells) !== null;
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
  const reading = cells ? overviewReadingOf(cells) : null;
  if (cells && reading) {
    const cell = cells[AI_OVERVIEW_ENGINE];
    const text = answerOf(cell);
    if (reading === 'shown' && text) {
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
    case 'not_recorded': return NOT_RECORDED_TEXT;
  }
}

/** The words when the audit holds nothing about the overview for a search (an audit from before it was
 *  captured, or a results page that did not come back). Neutral — never "not shown", never a failure. */
export const NOT_RECORDED_TEXT = 'Not recorded';
/** The chip while the audit's searches are still being asked. */
const WAITING_TEXT = 'Waiting';

/* ══ THE CHIP (2026-10-19) ════════════════════════════════════════════════════════════════════════
   Google AI Overview beside ChatGPT and Gemini, as a chip, on every surface that shows those two. One
   tally and one set of words, so the Inbox, the audit window, Outreach and the reports cannot disagree.
   ⛔ DISPLAY ONLY: `named` / `shown` count what was captured and are never part of any score. The chip
   says "not scored" where there is room and in its tooltip everywhere. */
export interface OverviewTally {
  /** Searches (question × run) where Google showed an overview. */
  shown: number;
  /** Of those, the overview named the business. */
  named: number;
  /** Searches where the results page came back with no overview. */
  notShown: number;
  /** Searches where nothing is known (pending, failed, or not recorded). */
  unknown: number;
  /** Of `unknown`, the searches still being asked. */
  pending: number;
  total: number;
}

export function overviewTally(views: ReadonlyArray<Pick<AiOverviewView, 'state' | 'named'>>): OverviewTally | null {
  if (!views.length) return null;
  const shown = views.filter((v) => v.state === 'shown').length;
  const named = views.filter((v) => v.state === 'shown' && v.named === true).length;
  const notShown = views.filter((v) => v.state === 'not_shown').length;
  const pending = views.filter((v) => v.state === 'pending').length;
  return { shown, named, notShown, unknown: views.length - shown - notShown, pending, total: views.length };
}

/** Every done question's overview straight from stored queue rows (the report / Outreach fold). A row
 *  that is not done is left out, like the ChatGPT and Gemini counts beside it. */
export function overviewTallyFromRows(rows: ReadonlyArray<{ status?: string | null; result?: unknown }>, named?: NamedContext): OverviewTally | null {
  const done = rows.filter((r) => r.status === 'done' && r.result && typeof r.result === 'object');
  return overviewTally(done.map((r) => overviewFor({ status: 'done', cells: r.result }, { stamped: true, named })));
}

export type OverviewChipTone = 'named' | 'not_named' | 'neutral';

/** The chip's figure: "1/1" (named of the searches that showed one), "No AI Overview shown", or
 *  "Not recorded". An older payload with no tally says "Not recorded". */
export function overviewChipValue(t: OverviewTally | null | undefined): string {
  if (!t || t.total === 0) return NOT_RECORDED_TEXT;
  if (t.shown > 0) return `${t.named}/${t.shown}`;
  if (t.notShown > 0) return NO_OVERVIEW_TEXT;
  return t.pending > 0 ? WAITING_TEXT : NOT_RECORDED_TEXT;
}

/** The whole chip as text: "Google AI Overview 1/1", "No AI Overview shown", "Google AI Overview not recorded". */
export function overviewChipText(t: OverviewTally | null | undefined, label: string = AI_OVERVIEW_LABEL): string {
  const v = overviewChipValue(t);
  if (v === NO_OVERVIEW_TEXT) return v;
  if (v === WAITING_TEXT) return `${label} checking…`;
  return v === NOT_RECORDED_TEXT ? `${label} not recorded` : `${label} ${v}`;
}

/** Named on every overview shown → named; shown and missed at least once → not_named; else neutral. */
export function overviewChipTone(t: OverviewTally | null | undefined): OverviewChipTone {
  if (!t || t.shown === 0) return 'neutral';
  return t.named === t.shown ? 'named' : 'not_named';
}

/** The tooltip: what the figure means, and that it is not scored. */
export function overviewChipTitle(t: OverviewTally | null | undefined, inScore = false): string {
  const tail = inScore ? 'Counted in the score.' : 'Not in the score for this audit.';
  if (t && t.shown === 0 && t.notShown === 0 && t.pending > 0) return `${AI_OVERVIEW_LABEL}: the searches are still being asked.`;
  if (!t || t.total === 0 || (t.shown === 0 && t.notShown === 0)) return `${AI_OVERVIEW_LABEL}: nothing recorded for this audit. Not in score.`;
  if (t.shown === 0) return `${AI_OVERVIEW_LABEL}: Google showed no AI answer for ${t.total === 1 ? 'this search' : `these ${t.total} searches`}, so it is left out of the score (not a penalty).`;
  let s = `${AI_OVERVIEW_LABEL}: shown on ${t.shown} of ${t.total} ${t.total === 1 ? 'search' : 'searches'}, named in ${t.named}.`;
  if (t.notShown) s += ` ${t.notShown} showed none${inScore ? ' (left out of the score)' : ''}.`;
  return s + ' ' + tail;
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

/** The overview as one plain evidence line (call screen, call script): "Google AI Overview: named in 1 of 1
 *  shown (not scored)" / "No AI Overview shown (not scored)" / "Google AI Overview: not recorded". Display
 *  only — never a spoken claim, never part of the score line before it. */
export function overviewEvidenceLine(t: OverviewTally | null | undefined, inScore = false): string {
  const v = overviewChipValue(t);
  if (t && t.shown > 0) return `${AI_OVERVIEW_LABEL}: named in ${t.named} of ${t.shown} shown (${inScore ? IN_SCORE_TEXT : NOT_IN_SCORE_TEXT})`;
  if (v === NO_OVERVIEW_TEXT) return `${NO_OVERVIEW_TEXT} (left out of the score)`;
  if (v === WAITING_TEXT) return `${AI_OVERVIEW_LABEL}: checking…`;
  return `${AI_OVERVIEW_LABEL}: not recorded`;
}
