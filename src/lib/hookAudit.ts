/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE ADAPTIVE HOOK AUDIT — one module, imported by create-ai-audit (the plan), the queue processor
   (the step) and the report builder (the summary). Plain TypeScript, no Deno, no React.

   WHAT A HOOK AUDIT IS FOR (Paul, 2026-09-20). It is NOT a statistical baseline. Its one job is to
   find the first credible search where a prospect is not recommended, so outreach can say something
   specific and true: "I asked ChatGPT '<question>'. It named A, B and C but not you." The paid
   baseline stays the measuring stick; this is the cheapest honest snapshot.

   THE RULE. Up to HOOK_MAX_QUESTIONS questions are PLANNED and ORDERED at creation, but only the
   first is queued. When it settles, ONE ENGINE — HOOK_DECIDING_ENGINE, Gemini — decides whether to
   continue (Paul, 2026-09-21; ChatGPT decided this jointly with Gemini until then, which meant a
   ChatGPT-only gap on Q1 could stop the hook before Gemini was ever asked a second question, and a
   3/3-on-Gemini lead-qualification rule could never observe a genuine 3/3):
     · Gemini answered and did NOT name the business → a GEMINI VISIBILITY GAP. Stop. Keep the
       question, who it named instead, the citations — all read from Gemini's own answer.
     · Gemini answered and DID name the business → queue the next planned question, whatever
       ChatGPT did on the same question. ChatGPT's answer is still stored and still shown in the
       report's per-question breakdown; it just never decides whether another question runs.
     · Gemini produced no evaluable answer (the row failed after its retries) → stop, truthfully,
       as a provider failure. It is never reported as a gap — an unanswered question is not a "yes".
   After the last planned question, stop regardless (max_questions_reached) — this is also the only
   way a hook run ends with Gemini having genuinely named the business in all three, which is what
   the Gemini-3/3 lead-qualification rule (_shared/hook-not-interested.ts) keys on.

   ⛔ ONE ai_audit_run, ALWAYS. The next question is another ai_audit_queue row on the SAME run;
   nothing here ever mints run 2. Provider retries stay retries of the queue row.
   ⛔ GEMINI DECIDES; CHATGPT IS NEVER DISCARDED. A ChatGPT-only miss must never stop the hook or be
   reported as the gap that stopped it — but it is not silently dropped either: it stays on the
   queue row's own stored result and in the report's per-engine table, exactly as measured.
   ⛔ Every field lives in ai_audit_runs.results.hook — existing jsonb, no migration.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { cellNamed, type NamedCell } from './namedSignal.ts';
import { OUTREACH_HOOK_QUESTIONS } from './auditQuestionCounts.ts';

/** Ceiling on questions a hook may ask. The same number the callers state as question_count. */
export const HOOK_MAX_QUESTIONS = OUTREACH_HOOK_QUESTIONS;

/** The ONE engine that decides whether a hook continues, stops on a gap, or stops on a provider
 *  failure (Paul, 2026-09-21). Named once so evaluateHookQuestion and geminiNamedAllThree cannot
 *  independently drift onto two different engines. */
export const HOOK_DECIDING_ENGINE = 'gemini';

export type HookStopReason = 'visibility_gap_found' | 'max_questions_reached' | 'provider_failure';

export interface HookCitation { title: string; url: string }

/** The structured gap — everything a future message generator needs, kept exactly as measured. */
export interface HookGap {
  /** 0-based position in `planned`; the report says "second search" for 1. */
  question_index: number;
  question: string;
  /** Engine key as stored on the queue row (e.g. `chatgpt`, `gemini`). */
  engine: string;
  target_named: false;
  /** Businesses the engine recommended in that answer, as measured (uncleaned). */
  named_instead: string[];
  citations: HookCitation[];
  /** Engines that answered the SAME question and DID name the business — the truthful qualifier. */
  named_on_engines: string[];
  answer_excerpt: string;
}

export interface HookState {
  version: 1;
  /** The ordered plan; at most HOOK_MAX_QUESTIONS. */
  planned: string[];
  /** Index of the next planned question to queue; equals questions queued so far. */
  next_index: number;
  /** Questions that have settled and been evaluated. */
  executed: number;
  stop_reason: HookStopReason | null;
  gap: HookGap | null;
  /** Questions where every answering engine named the business, in execution order. */
  named_in: Array<{ question_index: number; question: string; engines: string[] }>;
}

export function isHookState(v: unknown): v is HookState {
  return !!v && typeof v === 'object' && (v as { version?: unknown }).version === 1 &&
    Array.isArray((v as { planned?: unknown }).planned);
}

/* ── The plan ───────────────────────────────────────────────────────────────────────────────── */

/** How broadly commercial a question reads. Higher runs first. Deterministic and cheap: the
 *  generator already writes local-intent questions; this only decides their ORDER so Q1 is the
 *  broad "recommend a good <trade> in <town>" ask and the narrowest intent runs last. */
export function hookBreadthScore(question: string, town: string): number {
  const q = question.toLowerCase();
  let score = 0;
  if (/\brecommend/.test(q)) score += 4;
  if (/\b(best|good|top|reliable|trusted|reputable)\b/.test(q)) score += 2;
  if (/\bwho\b/.test(q)) score += 1;
  const t = town.split(',')[0].trim().toLowerCase();
  if (t && q.includes(t)) score += 2;
  if (/\b(near me|nearby|local|in my area)\b/.test(q)) score += 1;
  // Narrow intents: a price, an emergency, a named service or a comparison run later.
  if (/\b(cost|price|how much|cheap|quote)\b/.test(q)) score -= 2;
  if (/\b(emergency|24|out of hours|same day|urgent)\b/.test(q)) score -= 1;
  if (/\b(vs|versus|compare|difference)\b/.test(q)) score -= 2;
  if (q.length > 110) score -= 1;
  return score;
}

/** Order the generated questions broadest-first and cap at HOOK_MAX_QUESTIONS. Stable: ties keep
 *  the generator's order, so the same generated set always yields the same plan. */
export function planHookQuestions(generated: readonly string[], ctx: { town: string }): string[] {
  const seen = new Set<string>();
  const unique = generated
    .map((q) => q.trim())
    .filter((q) => q && !seen.has(q.toLowerCase()) && (seen.add(q.toLowerCase()), true));
  return unique
    .map((q, i) => ({ q, i, s: hookBreadthScore(q, ctx.town) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, HOOK_MAX_QUESTIONS)
    .map((x) => x.q);
}

export function initialHookState(planned: readonly string[]): HookState {
  return { version: 1, planned: [...planned], next_index: 1, executed: 0, stop_reason: null, gap: null, named_in: [] };
}

/* ── The step ───────────────────────────────────────────────────────────────────────────────── */

export type HookEngineCell = NamedCell & {
  answer_text?: unknown;
  competitors?: unknown;
  citations?: unknown;
};

export type HookEvaluation =
  | { outcome: 'gap'; gap: Omit<HookGap, 'question_index' | 'question'>; namedEngines: string[] }
  | { outcome: 'named'; namedEngines: string[] }
  | { outcome: 'no_valid_answer' };

export function hasAnswer(cell: unknown): cell is HookEngineCell {
  return !!cell && typeof cell === 'object' &&
    typeof (cell as { answer_text?: unknown }).answer_text === 'string' &&
    ((cell as { answer_text: string }).answer_text).trim().length > 0;
}

/* ── The Gemini 3/3 lead-qualification check (Paul, 2026-09-21) ────────────────────────────────
   evaluateHookQuestion above ALREADY makes Gemini (HOOK_DECIDING_ENGINE) the sole decider of
   whether the hook continues past a question — so by construction a hook that executes all three
   questions did so because Gemini named the business on Q1 and Q2 (a Q1/Q2 Gemini gap or provider
   failure stops the hook before this can ever be three rows long). This function re-derives the
   answer independently rather than trusting stop_reason, because 'max_questions_reached' is not
   the only way to reach three executed rows — Q3 itself can settle as a Gemini gap or a Gemini
   provider failure and still leave exactly three rows behind. It reads those three rows on its own
   terms, Gemini's cell only, so a future change to the hook's own state machine can never silently
   change what counts as "genuinely named all three" for this specific classification. */

/** True only when exactly three rows are given, every one settled 'done' with a genuine,
 *  non-error Gemini answer, and Gemini named the business in every one. A missing engine block,
 *  an unsettled/failed row, or an unanswered/errored Gemini cell on ANY of the three makes this
 *  false — absence or failure is never counted as a hit. */
export function geminiNamedAllThree(rows: readonly { status?: string | null; result?: unknown }[]): boolean {
  if (rows.length !== 3) return false;
  return rows.every((r) => {
    if (r.status !== 'done' || !r.result || typeof r.result !== 'object') return false;
    const cell = (r.result as Record<string, unknown>)[HOOK_DECIDING_ENGINE];
    return hasAnswer(cell) && cellNamed(cell as NamedCell);
  });
}

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && !!s.trim()).map((s) => s.trim()) : [];
}

function citationList(v: unknown): HookCitation[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((c) => {
    const url = (c as { url?: unknown })?.url;
    if (typeof url !== 'string' || !url) return [];
    const title = (c as { title?: unknown })?.title;
    return [{ title: typeof title === 'string' ? title : '', url }];
  });
}

/**
 * Evaluate one settled question. `decidingEngine` (Gemini — HOOK_DECIDING_ENGINE) alone decides
 * the outcome: 'no_valid_answer' when IT gave no evaluable answer (whatever ChatGPT did), 'named'
 * when it named the business (whatever ChatGPT did), 'gap' — read entirely from its own cell —
 * when it answered but did not name the business.
 *
 * `engineOrder` is used only to compute `namedEngines`/`named_on_engines`: the OTHER scored
 * engines that also answered and named the business, kept as the truthful qualifier ("ChatGPT
 * named them, though Gemini didn't") but never consulted for the outcome itself.
 *
 * ⛔ Only engines that produced an answer count for that qualifier either way. A missing or empty
 * cell is neither a gap nor a naming — it is absent, and absence never decides.
 */
export function evaluateHookQuestion(
  cells: Record<string, unknown> | null | undefined,
  engineOrder: readonly string[],
  decidingEngine: string = HOOK_DECIDING_ENGINE,
): HookEvaluation {
  /* ⛔ SCORED ENGINES ONLY — the caller passes its own list (chatgpt, gemini). A SERP capture or an
     unscored engine block may sit in the same cell map and must never decide a gap. */
  const keys = engineOrder.filter((e) => !!cells && e in cells);
  const answered = keys.filter((e) => hasAnswer((cells as Record<string, unknown>)[e]));
  const namedEngines = answered.filter((e) => cellNamed((cells as Record<string, HookEngineCell>)[e]));

  const decidingCell = cells && typeof cells === 'object' ? (cells as Record<string, unknown>)[decidingEngine] : undefined;
  if (!hasAnswer(decidingCell)) return { outcome: 'no_valid_answer' };
  if (cellNamed(decidingCell as NamedCell)) return { outcome: 'named', namedEngines };

  const cell = decidingCell as HookEngineCell;
  return {
    outcome: 'gap',
    namedEngines,
    gap: {
      engine: decidingEngine,
      target_named: false,
      named_instead: stringList(cell.competitors),
      citations: citationList(cell.citations),
      named_on_engines: namedEngines.filter((e) => e !== decidingEngine),
      answer_excerpt: String(cell.answer_text).trim().slice(0, 600),
    },
  };
}

export type HookAction = 'stop' | 'next';

/** Apply one evaluation to the state. Pure; the caller persists the state and queues `nextQuestion`. */
export function advanceHookState(
  state: HookState,
  questionIndex: number,
  evaluation: HookEvaluation,
): { state: HookState; action: HookAction; nextQuestion: string | null } {
  const question = state.planned[questionIndex] ?? '';
  const executed = Math.max(state.executed, questionIndex + 1);
  if (evaluation.outcome === 'gap') {
    return {
      action: 'stop',
      nextQuestion: null,
      state: { ...state, executed, stop_reason: 'visibility_gap_found', gap: { question_index: questionIndex, question, ...evaluation.gap } },
    };
  }
  if (evaluation.outcome === 'no_valid_answer') {
    return { action: 'stop', nextQuestion: null, state: { ...state, executed, stop_reason: 'provider_failure' } };
  }
  const named_in = [...state.named_in, { question_index: questionIndex, question, engines: evaluation.namedEngines }];
  const nextIndex = questionIndex + 1;
  if (nextIndex >= state.planned.length || nextIndex >= HOOK_MAX_QUESTIONS) {
    return { action: 'stop', nextQuestion: null, state: { ...state, executed, named_in, stop_reason: 'max_questions_reached' } };
  }
  return {
    action: 'next',
    nextQuestion: state.planned[nextIndex],
    state: { ...state, executed, named_in, next_index: nextIndex + 1 },
  };
}

/* ── The summary (report + future outreach generator) ───────────────────────────────────────── */

export interface HookReportSummary {
  questionsTested: number;
  maxQuestions: number;
  stopReason: HookStopReason;
  gap: {
    questionIndex: number;
    question: string;
    engine: string;
    engineLabel: string;
    namedInstead: string[];
    citations: HookCitation[];
    namedOnEngineLabels: string[];
    /** The engine's own answer, verbatim (as measured, truncated to 600 chars — see HookGap).
     *  Restored 2026-09-21: the report's model/evidence box was dropped when the hook became
     *  adaptive because this field never reached HookReportSummary, even though HookGap always
     *  carried it. Empty string (never fabricated) when the stored gap predates this field. */
    answerExcerpt: string;
  } | null;
  /** Every tested question, in order, with what each answering engine did. `named: null` = no answer. */
  tested: Array<{
    question: string;
    isGap: boolean;
    perEngine: Array<{ engine: string; label: string; named: boolean | null }>;
  }>;
}

/**
 * Build the report summary from the persisted state and the run's settled queue rows. Returns null
 * unless the hook has STOPPED for a reportable reason — a hook still running has nothing to say,
 * and a provider failure falls back to the ordinary rendering, which already handles failed runs.
 * `namedInstead` is supplied by the caller so competitor-cleanliness rules stay in one place.
 */
export function buildHookReportSummary(input: {
  state: unknown;
  rows: Array<{ question: string; status?: string | null; result?: unknown }>;
  engineOrder: readonly string[];
  engineLabel: (engine: string) => string;
  namedInstead: (gap: HookGap) => string[];
}): HookReportSummary | null {
  const { state } = input;
  if (!isHookState(state) || !state.stop_reason || state.stop_reason === 'provider_failure') return null;
  const byQuestion = new Map(input.rows.map((r) => [r.question.trim().toLowerCase(), r]));
  const tested = state.planned.slice(0, state.executed).map((question, i) => {
    const row = byQuestion.get(question.trim().toLowerCase());
    const cells = row?.status === 'done' && row.result && typeof row.result === 'object' ? row.result as Record<string, unknown> : null;
    return {
      question,
      isGap: state.gap?.question_index === i,
      perEngine: input.engineOrder.filter((e) => !!cells && e in cells).map((e) => ({
        engine: e,
        label: input.engineLabel(e),
        named: hasAnswer(cells![e]) ? cellNamed(cells![e] as HookEngineCell) : null,
      })),
    };
  });
  return {
    questionsTested: state.executed,
    maxQuestions: HOOK_MAX_QUESTIONS,
    stopReason: state.stop_reason,
    gap: state.gap ? {
      questionIndex: state.gap.question_index,
      question: state.gap.question,
      engine: state.gap.engine,
      engineLabel: input.engineLabel(state.gap.engine),
      namedInstead: input.namedInstead(state.gap),
      citations: state.gap.citations,
      namedOnEngineLabels: state.gap.named_on_engines.map(input.engineLabel),
      answerExcerpt: typeof state.gap.answer_excerpt === 'string' ? state.gap.answer_excerpt : '',
    } : null,
    tested,
  };
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth'];
export function ordinalWord(index: number): string {
  return ORDINALS[index] ?? `${index + 1}th`;
}

/** The words. Plain, platform-specific, never a percentage. Tested directly, rendered verbatim. */
export function hookReportCopy(summary: HookReportSummary, businessName: string): {
  eyebrow: string;
  headline: string;
  lede: string;
  earlier: string | null;
  count: string;
  caveat: string;
} {
  const eyebrow = 'Quick AI Visibility Check';
  const caveat = 'This is a quick snapshot, not your full AI visibility measurement.';
  const n = summary.questionsTested;
  const count = `${n} of up to ${summary.maxQuestions} ${n === 1 ? 'search' : 'searches'} tested`;
  if (!summary.gap) {
    return {
      eyebrow,
      headline: 'Strong initial AI visibility',
      lede: `${businessName} was named across the ${n === 3 ? 'three' : n === 2 ? 'two' : String(n)} ${n === 1 ? 'search' : 'searches'} tested. This is still only a quick snapshot rather than a full visibility baseline.`,
      earlier: null,
      count,
      caveat,
    };
  }
  const g = summary.gap;
  const headline = g.questionIndex === 0
    ? 'We found a visibility gap.'
    : `We found a visibility gap on the ${ordinalWord(g.questionIndex)} search.`;
  const lede = `We asked ${g.engineLabel}: “${g.question}”`;
  const earlier = g.questionIndex === 0
    ? null
    : `${businessName} was found in the ${g.questionIndex === 1 ? 'first search' : 'earlier searches'}, but not in this one.`;
  return { eyebrow, headline, lede, earlier, count: `Gap found after ${n} ${n === 1 ? 'search' : 'searches'} · ${count}`, caveat };
}
