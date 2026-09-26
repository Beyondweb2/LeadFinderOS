/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ⚠️ SUPERSEDED FOR NEW AUDITS (2026-09-25). A new hook audit is 3 questions × 2 engines, all queued at
   once, never stopping early: state version 2, scored by src/lib/hookScore.ts. Everything below
   about planning one question at a time is the VERSION-1 record. It still runs for any v1 run
   that was in flight at deploy, and it still renders historical v1 audits with their own
   denominators. Do not build new behaviour on it.

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

import { cellNamed, type NamedCell, type NamedContext } from './namedSignal.ts';
import { OUTREACH_HOOK_QUESTIONS } from './auditQuestionCounts.ts';
import { HOOK_SCORE_QUESTIONS, hasAnswer, hookBreadthScore, isHookStateV2, rowsFromRunResults, scoreHookRun, type HookScoreContext, type HookStateV2 } from './hookScore.ts';

/* One copy of each: the v2 score (hookScore.ts) owns them, this v1 module re-exports them. */
export { hasAnswer, hookBreadthScore };

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

/**
 * ⛔ WHETHER THIS RUN HAS EARNED THE DEEP SALES CRAWL (2026-09-22).
 *
 * The CHEAP crawl — fault signals and site info — runs for every audit that finalises and is not
 * governed by this at all; it is free and it is what Paul reads before a conversation. This decides
 * only the EXPENSIVE half: the extra sitemap reads and the Phase 1 evidence findings, which exist to
 * build a sales argument and are therefore worth paying for exactly where there is a sale to make.
 *
 * For a HOOK audit that is one outcome and one only:
 *   · visibility_gap_found   → yes. This is the lead we are about to message.
 *   · max_questions_reached  → no. Gemini named them in every question; _shared/hook-not-interested
 *                              auto-marks the lead not interested. Nobody will send this message.
 *   · provider_failure       → no. There is no hook, so there is nothing to attach findings to.
 *   · still running (null)   → no, yet. The run finalises again when the next question settles, and
 *                              the caller's dedupe re-crawls deeply then because the shallow row it
 *                              wrote carries no evidence.
 *
 * For a VERSION-2 hook (3 questions × 2 engines, hookScore.ts) the same idea, read from the score:
 *   · complete with at least one missed search → yes. There is a hook to message about.
 *   · complete 6/6                             → no. The lead leaves active outreach.
 *   · incomplete (a failed or pending result)  → no. No final score means no hook.
 * `ctx` must be the report's NamedContext so "missed" means the same thing here as on screen.
 *
 * 🔴 AND IT FAILS OPEN, WHICH IS THE ONLY SAFE DIRECTION. Everything that is NOT a recognisable hook
 * state — a paid baseline, a remeasure, a free check, a manual audit, a malformed `results`, a shape
 * this code has not seen — returns TRUE and keeps the behaviour it has today. Written as "is a hook
 * AND is not a gap" rather than "is a gap" on purpose: a future shape change then switches this gate
 * OFF rather than silently switching the evidence off for every non-hook audit in the book. Absence
 * must never fall through as a real answer, and the absent case here is the ordinary one
 * (CLAUDE.md §4).
 */
export function shouldDeepCrawl(runResults: unknown, ctx: HookScoreContext = {}): boolean {
  const hook = (runResults as { hook?: unknown } | null | undefined)?.hook;
  if (isHookStateV2(hook)) {
    const score = scoreHookRun(hook, rowsFromRunResults(runResults), ctx);
    return score.complete && score.misses.length > 0;
  }
  if (!isHookState(hook)) return true;
  return hook.stop_reason === 'visibility_gap_found';
}

/* ── The plan ───────────────────────────────────────────────────────────────────────────────── */

/* hookBreadthScore moved to hookScore.ts (re-exported above) so the v2 hook pick and this v1
   plan rank wording with one function. */

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
  /** 'six' = a version-2 hook (3 questions × 2 engines). Absent = version 1. The copy branches on it. */
  shape?: 'six';
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
  /** VERSION 2 ONLY: the complete score, straight from scoreHookRun (the same numbers the Inbox card,
   *  the 6/6 rule and the send guard read). The quick report's percentage is `percent`, and its raw
   *  count is `named` of `total`. Never set on an incomplete score, so it cannot print a partial one. */
  score?: {
    named: number;
    total: number;
    percent: number;
    questions: number;
    perEngine: Array<{ engine: string; label: string; named: number; total: number }>;
  };
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
 *
 * ⛔ `namedInstead` READS THE ROWS, NEVER `state.gap.named_instead` (2026-09-21 — the reason the
 * hook report's competitor list was always empty, live-verified on z8q2ty). `evaluateHookQuestion`
 * captures `named_instead` from `cell.competitors` at the moment a question settles — but
 * `cell.competitors` is ALWAYS `[]` at that point (`_shared/enrichment/ai-search.ts`'s
 * `normalizeEngineBlock`: "ALWAYS EMPTY AT SCAN TIME"). The canonical LLM extraction
 * (`extract-competitors`) only runs LATER, at the run's transition to terminal — structurally
 * AFTER `process-ai-audit-queue` has already evaluated the hook step and persisted its gap. So the
 * stored `gap.named_instead` is a permanent, empty snapshot for every hook gap that has ever
 * existed; it is never revisited once extraction actually completes.
 * The fix reads the SAME rows `tested` already reads (settled at REPORT-RENDER time, long after
 * extraction has run) and pulls the gap's own question+engine cell's `competitors` — the same
 * canonical, already-cleaned array `extract-competitors` wrote back into `ai_audit_queue`/
 * `ai_audit_runs.results.questions[].engines[].competitors`. Nothing here re-parses the raw answer
 * or invents a second extractor; it only re-points the report at data that already existed and was
 * simply never read. `namedInstead` is still supplied by the caller so competitor-cleanliness
 * rules stay in one place. */
export function buildHookReportSummary(input: {
  state: unknown;
  rows: Array<{ question: string; status?: string | null; result?: unknown }>;
  engineOrder: readonly string[];
  engineLabel: (engine: string) => string;
  namedInstead: (competitors: string[]) => string[];
  /** The report's own NamedContext and town/trade. Version 2 only: the score must use the same
   *  ruler as the report's counts. Version 1 is rendered exactly as it always was. */
  namedCtx?: NamedContext;
  town?: string | null;
  trade?: string | null;
}): HookReportSummary | null {
  const { state } = input;
  if (isHookStateV2(state)) return buildHookReportSummaryV2(state, input);
  if (!isHookState(state) || !state.stop_reason || state.stop_reason === 'provider_failure') return null;
  const byQuestion = new Map(input.rows.map((r) => [r.question.trim().toLowerCase(), r]));
  const cellsFor = (question: string): Record<string, unknown> | null => {
    const row = byQuestion.get(question.trim().toLowerCase());
    return row?.status === 'done' && row.result && typeof row.result === 'object' ? row.result as Record<string, unknown> : null;
  };
  const tested = state.planned.slice(0, state.executed).map((question, i) => {
    const cells = cellsFor(question);
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
  const gapCompetitors = (): string[] => {
    if (!state.gap) return [];
    const cells = cellsFor(state.gap.question);
    const cell = cells ? cells[state.gap.engine] : null;
    return hasAnswer(cell) ? stringList((cell as HookEngineCell).competitors) : [];
  };
  return {
    questionsTested: state.executed,
    maxQuestions: HOOK_MAX_QUESTIONS,
    stopReason: state.stop_reason,
    gap: state.gap ? {
      questionIndex: state.gap.question_index,
      question: state.gap.question,
      engine: state.gap.engine,
      engineLabel: input.engineLabel(state.gap.engine),
      namedInstead: input.namedInstead(gapCompetitors()),
      citations: state.gap.citations,
      namedOnEngineLabels: state.gap.named_on_engines.map(input.engineLabel),
      answerExcerpt: typeof state.gap.answer_excerpt === 'string' ? state.gap.answer_excerpt : '',
    } : null,
    tested,
  };
}

/**
 * VERSION 2: the six-result hook. Null until the score is COMPLETE (every one of the six results a
 * valid answer). A partial audit falls back to the ordinary rendering, which labels failed and
 * in-flight runs itself. The "gap" is the hook pick (hookScore.ts pickHookResult: the strongest
 * Google AI miss, else the strongest ChatGPT miss). Its competitors and citations are read from that
 * exact question's cell for that exact engine and nowhere else.
 */
function buildHookReportSummaryV2(
  state: HookStateV2,
  input: Parameters<typeof buildHookReportSummary>[0],
): HookReportSummary | null {
  const score = scoreHookRun(state, input.rows, { named: input.namedCtx, town: input.town, trade: input.trade });
  if (!score.complete) return null;
  const pick = score.hook;
  const statusOf = (qi: number, e: string) => score.results.find((r) => r.questionIndex === qi && r.engine === e)?.status;
  const tested = state.planned.map((question, i) => ({
    question,
    isGap: pick?.questionIndex === i,
    perEngine: input.engineOrder.filter((e) => score.results.some((r) => r.questionIndex === i && r.engine === e)).map((e) => {
      const st = statusOf(i, e);
      return { engine: e, label: input.engineLabel(e), named: st === 'named' ? true : st === 'not_named' ? false : null };
    }),
  }));
  let gap: HookReportSummary['gap'] = null;
  if (pick) {
    const row = input.rows.find((r) => r.question.trim().toLowerCase() === pick.question.trim().toLowerCase() && r.status === 'done');
    const cell = row?.result && typeof row.result === 'object' ? (row.result as Record<string, unknown>)[pick.engine] : null;
    gap = {
      questionIndex: pick.questionIndex,
      question: pick.question,
      engine: pick.engine,
      engineLabel: input.engineLabel(pick.engine),
      namedInstead: input.namedInstead(pick.competitors),
      citations: hasAnswer(cell) ? citationList((cell as HookEngineCell).citations) : [],
      namedOnEngineLabels: score.results
        .filter((r) => r.questionIndex === pick.questionIndex && r.engine !== pick.engine && r.status === 'named')
        .map((r) => input.engineLabel(r.engine)),
      answerExcerpt: pick.answerExcerpt,
    };
  }
  return {
    shape: 'six',
    questionsTested: state.planned.length,
    maxQuestions: HOOK_SCORE_QUESTIONS,
    stopReason: pick ? 'visibility_gap_found' : 'max_questions_reached',
    gap,
    score: {
      named: score.named,
      total: score.expected,
      percent: score.percent ?? 0,
      questions: state.planned.length,
      perEngine: input.engineOrder
        .map((e) => score.perEngine.find((t) => t.engine === e))
        .filter((t): t is NonNullable<typeof t> => !!t)
        .map((t) => ({ engine: t.engine, label: input.engineLabel(t.engine), named: t.named, total: t.expected })),
    },
    tested,
  };
}

/** The words. Plain, platform-specific, never a percentage. Tested directly, rendered verbatim.
 *
 * 🔴 RESTORED TOWARD THE ORIGINAL REPORT DESIGN (2026-09-21, Paul — page 1 of the baseline PDF is
 * the visual reference). Two things this used to say are gone for good:
 *   · any "N of up to M searches" / "gap found after N searches" process wording — the adaptive
 *     execution count is internal methodology, not something a prospect needs to see;
 *   · the "found in the first search, but not this one" / "ChatGPT did name them" cross-question
 *     qualifiers — the report shows ONLY the failed search, never the earlier successful one(s).
 * `earlier` and `count` are gone from the return shape because nothing renders them any more. */
export function hookReportCopy(summary: HookReportSummary, businessName: string): {
  eyebrow: string;
  headline: string;
  lede: string;
  caveat: string;
} {
  const eyebrow = 'Quick AI Visibility Check';
  const caveat = 'This is a quick snapshot, not your full AI visibility measurement.';
  const n = summary.questionsTested;
  /* VERSION 2 (2026-09-25): engine-specific, always. The six-result hook knows exactly which engine
     missed, and a Gemini miss beside a ChatGPT naming must never read as "AI doesn't recommend you". */
  /* 🔴 REDESIGNED 2026-09-26 (Paul): the quick report now leads with the PERCENTAGE, like the older
     Findable report led with its count, so the verdict is about the whole check, not one search.
     Three verdicts, keyed on the complete score only. The sub-line states the per-engine counts, which
     the reader can check against the table below it. No sales fluff, and never a claim that three
     questions are their full AI visibility (the caveat says so). */
  if (summary.shape === 'six') {
    const s = summary.score;
    const named = s?.named ?? summary.tested.reduce((t, q) => t + q.perEngine.filter((e) => e.named === true).length, 0);
    const total = s?.total ?? summary.tested.reduce((t, q) => t + q.perEngine.length, 0);
    const engines = s?.perEngine ?? [];
    const quickCaveat = `This is a quick check of ${n === 1 ? 'one question' : `${n} questions`}, not your full AI visibility measurement.`;
    if (total > 0 && named === 0) {
      return {
        eyebrow,
        headline: "You're not being named in these AI searches yet.",
        lede: engines.length === 2
          ? `Neither ${engines[0].label} nor ${engines[1].label} named ${businessName} in any of the ${total} answers.`
          : `${businessName} wasn't named in any of the ${total} answers.`,
        caveat: quickCaveat,
      };
    }
    if (total > 0 && named === total) {
      return {
        eyebrow,
        headline: "You're being named consistently in this quick check.",
        lede: `${engines.length ? engines.map((e) => e.label).join(' and ') : 'Every engine'} named ${businessName} in all ${total} answers.`,
        caveat: quickCaveat,
      };
    }
    return {
      eyebrow,
      headline: "You're being named, but not consistently.",
      lede: engines.length
        ? `${engines.map((e) => `${e.label} named you in ${e.named} of ${e.total}`).join(', and ')} answers.`
        : `${businessName} was named in ${named} of ${total} answers.`,
      caveat: quickCaveat,
    };
  }
  if (!summary.gap) {
    return {
      eyebrow,
      headline: 'Strong initial AI visibility',
      lede: `${businessName} was named across the ${n === 3 ? 'three' : n === 2 ? 'two' : String(n)} ${n === 1 ? 'search' : 'searches'} tested. This is still only a quick snapshot rather than a full visibility baseline.`,
      caveat,
    };
  }
  /* ⛔ NEVER "AI never recommends you" (Paul, 2026-09-21) — a gap on question 2 or 3 means the
     business WAS named earlier; "isn't recommending you consistently yet" is the truthful,
     non-overstated claim. Only a Q1 miss (nothing to be inconsistent WITH yet) earns the stronger,
     still-truthful "for this search yet" wording. */
  const headline = summary.gap.questionIndex === 0
    ? "AI isn't recommending you for this search yet."
    : "AI isn't recommending you consistently yet.";
  return { eyebrow, headline, lede: '', caveat };
}
