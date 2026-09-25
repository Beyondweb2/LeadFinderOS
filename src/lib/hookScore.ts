/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE HOOK VISIBILITY SCORE: 3 QUESTIONS × 2 ENGINES = 6 RESULTS (Paul, 2026-09-25).

   WHAT CHANGED AND WHY. From 2026-09-20 the hook audit was ADAPTIVE (src/lib/hookAudit.ts, state
   version 1): it asked one question at a time and stopped at the first Gemini miss. That found a
   hook cheaply, but it stopped giving a clear picture of whether the business is actually being
   named. Paul preferred the older multi-question format, so a new hook audit now asks THREE
   customer-style questions, each on BOTH engines, and always completes all six results. Nothing
   stops early, whatever the first answer says.

   ⛔ THE SAME THREE QUESTIONS ON BOTH ENGINES — STRUCTURALLY. One ai_audit_queue row is one question,
   and one row runs every engine it lists (chatgpt + gemini) in a single scrape. So "Question 2 on
   ChatGPT" and "Question 2 on Google AI" are two cells of the SAME row. The two engines cannot
   be asked different questions, because that is not something a row can express.

   ⛔ ONE RULER. "Named" is cellNamed() from namedSignal.ts with the SAME NamedContext the report
   passes (business name, trade, town). This file never matches a name itself. The Inbox card, the
   report, the auto Not Interested rule and the deep-crawl gate all call scoreHookRun(), so a result
   cannot be named in one place and not named in another.

   ⛔ A FAILURE IS NEVER A "NOT NAMED". A failed row or an engine that returned no answer is
   `failed`. The score is COMPLETE only when every expected result is a valid answer. Until then
   there is no percentage and no hook, and callers must label the audit as incomplete. Five valid
   results plus one failure is not 5/6 and not 4/6. It is incomplete.

   ⛔ HISTORICAL AUDITS KEEP THEIR OWN DENOMINATOR. A version-1 (adaptive) hook that stopped after
   one question has two results, not six, and it is scored out of two. Nothing here rewrites an
   old audit as a six-result one.

   Plain TypeScript, no Deno, no React, relative imports with explicit `.ts`. Edge functions
   reach this file.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { cellNamed, type NamedCell, type NamedContext } from './namedSignal.ts';

/** The engines a hook asks, in DISPLAY order. Each queue row lists these, so every question
 *  runs on both. */
export const HOOK_ENGINES = ['chatgpt', 'gemini'] as const;

/** The order a MISSED search is chosen for the outreach hook: Google AI first, then ChatGPT
 *  (Paul, 2026-09-25). Named once so the pick and its test cannot disagree. */
export const HOOK_PICK_ENGINE_ORDER = ['gemini', 'chatgpt'] as const;

/** Operator-facing engine names for the Inbox card. The prospect-facing report keeps its own
 *  label map (auditReport.ts ENGINE_LABELS). */
export const HOOK_ENGINE_LABELS: Record<string, string> = { chatgpt: 'ChatGPT', gemini: 'Google AI' };

/** Questions per new hook audit. */
export const HOOK_SCORE_QUESTIONS = 3;

/** Results in a complete new hook audit: HOOK_SCORE_QUESTIONS × HOOK_ENGINES. Derived, never typed. */
export const HOOK_SCORE_RESULTS = HOOK_SCORE_QUESTIONS * HOOK_ENGINES.length;

/** The internal reason written when a 6/6 hook takes the lead out of active outreach. */
export const HOOK_ALL_NAMED_REASON = `Hook audit: named in ${HOOK_SCORE_RESULTS}/${HOOK_SCORE_RESULTS} ChatGPT + Google AI results`;

/* ── The version-2 state (results.hook on the run; existing jsonb, no migration) ──────────────── */

export interface HookStateV2 {
  version: 2;
  /** The three questions, in order. Every one is queued at creation, and each runs on every
   *  engine in `engines`. */
  planned: string[];
  engines: string[];
  /** Set once, by the queue, when a complete 6/6 took the lead out of active outreach. It records
   *  the reason and never deletes anything. */
  auto_not_interested?: { reason: string; lead_id: string; at: string } | null;
}

export function isHookStateV2(v: unknown): v is HookStateV2 {
  return !!v && typeof v === 'object' && (v as { version?: unknown }).version === 2 &&
    Array.isArray((v as { planned?: unknown }).planned);
}

export function initialHookStateV2(planned: readonly string[], engines: readonly string[] = HOOK_ENGINES): HookStateV2 {
  return { version: 2, planned: [...planned], engines: [...engines] };
}

/* ── Shared cell helpers (hookAudit.ts re-exports these; one copy) ───────────────────────────── */

export function hasAnswer(cell: unknown): cell is NamedCell & { answer_text: string } {
  return !!cell && typeof cell === 'object' &&
    typeof (cell as { answer_text?: unknown }).answer_text === 'string' &&
    ((cell as { answer_text: string }).answer_text).trim().length > 0;
}

/** How broadly commercial and local a question reads. Higher is stronger. Deterministic and cheap.
 *  It ranks wording only and invents nothing. */
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

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && !!s.trim()).map((s) => s.trim()) : [];
}

/* ── The score ─────────────────────────────────────────────────────────────────────────────── */

export type HookResultStatus = 'named' | 'not_named' | 'failed' | 'pending';

export interface HookResult {
  questionIndex: number;
  question: string;
  engine: string;
  label: string;
  status: HookResultStatus;
  /** Who THIS engine named for THIS question. Never merged across cells. Empty unless the
   *  answer is valid. */
  competitors: string[];
  answerExcerpt: string;
}

export interface HookEngineTally {
  engine: string;
  label: string;
  named: number;
  valid: number;
  expected: number;
  failed: number;
  pending: number;
}

export interface HookPick {
  questionIndex: number;
  question: string;
  engine: string;
  label: string;
  /** From the SAME engine and question as `question`. See pickHookResult. */
  competitors: string[];
  answerExcerpt: string;
}

export type HookShape =
  /** A new hook: 3 questions × 2 engines, all queued at once. */
  | 'six'
  /** A version-1 adaptive hook: scored on the questions it actually executed. */
  | 'adaptive_legacy'
  /** An ordinary audit with no hook marker: scored on every question it queued. */
  | 'legacy';

export interface HookScore {
  shape: HookShape;
  expected: number;
  valid: number;
  named: number;
  failed: number;
  pending: number;
  /** True only when every expected result is a valid answer. */
  complete: boolean;
  /** Rounded percentage named. NULL until complete, so a partial audit can never show one. */
  percent: number | null;
  perEngine: HookEngineTally[];
  results: HookResult[];
  /** Valid answers that did not name the business, in question order. */
  misses: HookResult[];
  /** The one search to use for outreach. Null when incomplete or when nothing was missed. */
  hook: HookPick | null;
  /** Complete, and every expected result named the business. */
  allNamed: boolean;
}

export interface HookScoreRow {
  question: string;
  status?: string | null;
  result?: unknown;
  /** The engines this row asked. Absent on some older rows; HOOK_ENGINES is assumed then. */
  engines?: unknown;
}

export interface HookScoreContext {
  /** The same context the report passes to cellNamed. Keep it identical across surfaces. */
  named?: NamedContext;
  /** Used only to rank missed searches for the hook. */
  town?: string | null;
  trade?: string | null;
  /** Operator/report cleanliness rules for competitor names (self-exclusion, suppression). Applied
   *  to each cell's own list. It never moves names between cells. */
  cleanCompetitors?: (names: string[]) => string[];
}

const PENDING_ROW = new Set(['pending', 'running', 'processing', 'queued']);

function rowEngines(row: HookScoreRow | undefined, fallback: readonly string[]): string[] {
  const e = row?.engines;
  return Array.isArray(e) && e.length ? e.filter((x): x is string => typeof x === 'string') : [...fallback];
}

/** Adapt a finalised run's `results.questions` ({question, status, engines: cells}) to rows. */
export function rowsFromRunResults(runResults: unknown): HookScoreRow[] {
  const qs = (runResults as { questions?: unknown } | null | undefined)?.questions;
  if (!Array.isArray(qs)) return [];
  return qs.flatMap((q) => {
    const question = (q as { question?: unknown })?.question;
    if (typeof question !== 'string') return [];
    const cells = (q as { engines?: unknown }).engines;
    return [{ question, status: (q as { status?: string | null }).status ?? null, result: cells && typeof cells === 'object' ? cells : null }];
  });
}

/**
 * Score a hook run from its state (results.hook) and its queue rows.
 *   · version 2: expected = planned × engines. Every planned question counts, queued or not.
 *   · version 1: expected = executed questions × engines. A stopped adaptive hook is scored on
 *     what it asked, never padded to six. A provider-failure stop is never complete.
 *   · no hook marker: expected = the queued questions × the engines each row asked.
 */
export function scoreHookRun(state: unknown, rows: readonly HookScoreRow[], ctx: HookScoreContext = {}): HookScore {
  const v1 = !isHookStateV2(state) && isV1(state) ? state as V1Like : null;
  const v2 = isHookStateV2(state) ? state : null;
  const shape: HookShape = v2 ? 'six' : v1 ? 'adaptive_legacy' : 'legacy';

  /* ⛔ ONE ROW PER QUESTION. A retry reuses its row. If a duplicate row for the same question
     ever appeared, the done one wins, and a question is still only counted once per engine. */
  const byQuestion = new Map<string, HookScoreRow>();
  for (const r of rows) {
    const k = String(r.question ?? '').trim().toLowerCase();
    if (!k) continue;
    const prev = byQuestion.get(k);
    if (!prev || (prev.status !== 'done' && r.status === 'done')) byQuestion.set(k, r);
  }

  const questions: string[] = v2 ? v2.planned
    : v1 ? v1.planned.slice(0, Math.max(0, Math.min(v1.planned.length, Number(v1.executed) || 0)))
    : [...byQuestion.values()].map((r) => r.question);

  const results: HookResult[] = [];
  questions.forEach((question, questionIndex) => {
    const row = byQuestion.get(question.trim().toLowerCase());
    const engines = v2 ? (v2.engines.length ? v2.engines : [...HOOK_ENGINES]) : rowEngines(row, HOOK_ENGINES);
    const cells = row?.status === 'done' && row.result && typeof row.result === 'object' ? row.result as Record<string, unknown> : null;
    const rowPending = !row || PENDING_ROW.has(String(row.status ?? ''));
    for (const engine of HOOK_ENGINES.filter((e) => engines.includes(e))) {
      const label = HOOK_ENGINE_LABELS[engine] ?? engine;
      const cell = cells ? cells[engine] : undefined;
      let status: HookResultStatus;
      if (cells && hasAnswer(cell)) status = cellNamed(cell as NamedCell, ctx.named) ? 'named' : 'not_named';
      else if (rowPending) status = 'pending';
      else status = 'failed';
      const valid = status === 'named' || status === 'not_named';
      const raw = valid ? stringList((cell as { competitors?: unknown }).competitors) : [];
      results.push({
        questionIndex, question, engine, label, status,
        competitors: ctx.cleanCompetitors ? ctx.cleanCompetitors(raw) : raw,
        answerExcerpt: valid ? String((cell as { answer_text: string }).answer_text).trim().slice(0, 600) : '',
      });
    }
  });

  const count = (s: HookResultStatus, list = results) => list.filter((r) => r.status === s).length;
  const named = count('named');
  const valid = named + count('not_named');
  const expected = results.length;
  /* A version-1 hook that stopped on a provider failure, or never stopped, is not complete, even
     if the cells it has are all valid: the plan itself did not finish. */
  const v1Finished = !v1 || v1.stop_reason === 'visibility_gap_found' || v1.stop_reason === 'max_questions_reached';
  const complete = expected > 0 && valid === expected && v1Finished;

  const perEngine: HookEngineTally[] = HOOK_ENGINES.map((engine) => {
    const mine = results.filter((r) => r.engine === engine);
    return {
      engine, label: HOOK_ENGINE_LABELS[engine] ?? engine,
      named: count('named', mine), valid: count('named', mine) + count('not_named', mine),
      expected: mine.length, failed: count('failed', mine), pending: count('pending', mine),
    };
  }).filter((t) => t.expected > 0);

  const misses = results.filter((r) => r.status === 'not_named');
  return {
    shape, expected, valid, named,
    failed: count('failed'), pending: count('pending'),
    complete,
    percent: complete ? Math.round((named / expected) * 100) : null,
    perEngine, results, misses,
    hook: complete ? pickHookResult(misses, { town: ctx.town ?? '', trade: ctx.trade ?? '' }) : null,
    allNamed: complete && named === expected,
  };
}

interface V1Like { version: 1; planned: string[]; executed: number; stop_reason: string | null }
function isV1(v: unknown): boolean {
  return !!v && typeof v === 'object' && (v as { version?: unknown }).version === 1 &&
    Array.isArray((v as { planned?: unknown }).planned);
}

/* ── The hook pick ─────────────────────────────────────────────────────────────────────────── */

/** Does the question name the business's own core trade? A crude stem match that only ever ADDS
 *  to a question's rank and never invents a service. */
function mentionsTrade(question: string, trade: string): boolean {
  const q = question.toLowerCase();
  return trade.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4)
    .some((w) => q.includes(w.replace(/(ies|es|s)$/, '')));
}

/** Rank one missed search as an outreach hook: commercial intent, local relevance, understandable
 *  wording (hookBreadthScore), the core trade, and useful competitor names (up to three, the
 *  number the competitor hook needs). */
export function hookMissScore(r: Pick<HookResult, 'question' | 'competitors'>, ctx: { town: string; trade: string }): number {
  return hookBreadthScore(r.question, ctx.town) +
    (ctx.trade && mentionsTrade(r.question, ctx.trade) ? 2 : 0) +
    Math.min(3, r.competitors.length);
}

/**
 * The strongest genuine missed search. Google AI misses first. Only when Google AI named them in
 * every search is a ChatGPT miss used. No miss on either engine means no hook, and nothing is
 * fabricated. Ties keep question order.
 * ⛔ THE COMPETITORS TRAVEL WITH THE RESULT. They are the picked cell's own list, never another
 * question's and never another engine's.
 */
export function pickHookResult(misses: readonly HookResult[], ctx: { town: string; trade: string }): HookPick | null {
  for (const engine of HOOK_PICK_ENGINE_ORDER) {
    const pool = misses.filter((m) => m.engine === engine && m.status === 'not_named');
    if (!pool.length) continue;
    const best = pool
      .map((m) => ({ m, s: hookMissScore(m, ctx) }))
      .sort((a, b) => b.s - a.s || a.m.questionIndex - b.m.questionIndex)[0].m;
    return {
      questionIndex: best.questionIndex, question: best.question, engine: best.engine, label: best.label,
      competitors: [...best.competitors], answerExcerpt: best.answerExcerpt,
    };
  }
  return null;
}

/** "67% named (4/6)". Only for a complete score. The caller shows progress otherwise. */
export function hookScoreHeadline(score: Pick<HookScore, 'complete' | 'percent' | 'named' | 'expected'>): string | null {
  if (!score.complete || score.percent === null) return null;
  return `${score.percent}% named (${score.named}/${score.expected})`;
}

/** The engine-specific sentence for a miss. It never says "AI" when only one engine missed. */
export function hookMissSentence(engineLabel: string): string {
  return `${engineLabel} didn't name you for this search.`;
}
