/* ════════════════════════════════════════════════════════════════════════════════════════════════
   DISCOVERY PROGRESS — counted in MEASUREMENTS, the real unit of work (2026-09-23).

   A Discovery job is one ordinary audit (audit_purpose 'discovery') in the existing server-side
   queue: run 1 is created on the button press, runs 2 and 3 are started by advanceBaseline on the
   cron tick, and every question of every run is one ai_audit_queue row that asks BOTH engines in a
   single engine call. Nothing here runs anything; it READS the stored rows and says how far along
   the job is. The browser never keeps the job alive and never counts on its own.

     one measurement = one question × one engine × one run
     expected        = questions × engines × target runs        (BS4: 49 × 2 × 3 = 294)

   🔴 WHY: the screen used to say "Discovery running (0/3 runs)" — a run only counts once all 49 of
   its questions land, so at 154 of 294 measurements it still read 0/3, while the rows beside it said
   "named in 1/1 runs" as if a question were finished.

   ⛔ SLOTS, NOT ROWS. A failed run is replaced by advanceBaseline (up to MAX_EXTRA_ATTEMPTS), so a
   question can have more rows than target runs. Each (question, engine) has exactly `targetRuns`
   slots: answers fill them first (capped at targetRuns), failures fill what is left (capped too).
   So a failure that a later run made good stops counting, and a failure never erases an answer.

   ⛔ ABSENCE IS NOT AN ANSWER. An engine missing from a `done` row is a failed measurement for that
   engine (normalizeAiSearch leaves out an engine that returned nothing), never a silent success.

   IMPORTED BY AN EDGE FUNCTION (paid-baseline via _shared/baseline-discovery.ts): no imports, and
   any added later must be relative with an explicit .ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type DiscoveryJobStatus = 'not_started' | 'running' | 'complete' | 'complete_with_failures' | 'needs_attention';
export type DiscoveryQuestionState = 'not_started' | 'running' | 'complete' | 'complete_with_issue';

export const DISCOVERY_JOB_LABELS: Record<DiscoveryJobStatus, string> = {
  not_started: 'Not started',
  running: 'Discovery running',
  complete: 'Discovery complete',
  complete_with_failures: 'Discovery complete with failures',
  needs_attention: 'Discovery needs attention',
};

/** Queue-row statuses that will not change again. */
const ROW_TERMINAL = new Set(['done', 'failed', 'cancelled']);
/** Run statuses that will not change again. Anything else (pending, running, processing) is open. */
const RUN_TERMINAL = new Set(['complete', 'capped', 'failed', 'cancelled']);
/** No new answer for this long while work is still open → say so (the queue may be stuck). */
export const DISCOVERY_STALL_MS = 20 * 60 * 1000;

export interface ProgressRow { run_id: string; question: string; status: string; result: unknown; updated_at?: string | null }
export interface ProgressRun { id: string; run_number: number; status: string; created_at?: string | null }

export interface EngineCount { engine: string; done: number; failed: number; total: number }
export interface QuestionProgress {
  question: string;
  state: DiscoveryQuestionState;
  engines: EngineCount[];
  /** Measurements for this question: done / failed / expected (engines × runs). */
  done: number; failed: number; total: number;
}
export interface DiscoveryProgress {
  status: DiscoveryJobStatus;
  questions: number; engines: string[]; runs_target: number;
  total: number; done: number; failed: number; percent: number;
  questions_complete: number;
  /** Questions with every slot settled (answered or failed) — complete + complete_with_issue. */
  questions_settled: number;
  by_engine: EngineCount[];
  by_question: QuestionProgress[];
  runs_started: number;
  started_at: string | null; updated_at: string | null; completed_at: string | null;
  /** Open work but nothing has changed for DISCOVERY_STALL_MS. */
  stalled: boolean;
  /** advanceBaseline's recorded refusal, when there is one. */
  error: string | null;
}

const key = (q: string) => q.trim();
const answered = (result: unknown, engine: string): boolean => {
  if (!result || typeof result !== 'object') return false;
  const block = (result as Record<string, unknown>)[engine];
  if (!block || typeof block !== 'object') return false;
  const b = block as Record<string, unknown>;
  const errorOnly = 'error' in b && !('answer_text' in b);
  return !errorOnly;
};
const latest = (a: string | null, b: string | null | undefined): string | null => {
  if (!b) return a;
  const tb = new Date(b).getTime();
  if (!Number.isFinite(tb)) return a;
  return !a || tb > new Date(a).getTime() ? new Date(tb).toISOString() : a;
};

/**
 * The job's progress from its stored rows. `questions` is the job's own question set (run 1's queue
 * rows, in order); `targetRuns` is ai_audits.baseline_target_runs; `completedAt` is
 * ai_audits.baseline_completed_at (advanceBaseline writes it once, when the target is met).
 */
export function discoveryProgress(input: {
  questions: string[]; engines: string[]; targetRuns: number;
  runs: ProgressRun[]; rows: ProgressRow[];
  startedAt: string | null; completedAt: string | null; error?: string | null; now?: number;
}): DiscoveryProgress {
  const engines = input.engines.length ? input.engines : ['chatgpt', 'gemini'];
  const R = Math.max(1, Math.round(input.targetRuns || 1));
  const questions = [...new Set(input.questions.map(key).filter(Boolean))];
  const byQ = new Map<string, ProgressRow[]>();
  for (const q of questions) byQ.set(q, []);
  let updatedAt: string | null = null;
  for (const r of input.rows) {
    const list = byQ.get(key(r.question));
    if (list) list.push(r);
    updatedAt = latest(updatedAt, r.updated_at);
  }
  for (const run of input.runs) updatedAt = latest(updatedAt, run.created_at);

  const byQuestion: QuestionProgress[] = questions.map((q) => {
    const rows = byQ.get(q)!;
    const anyOpen = rows.some((r) => r.status === 'running');
    const counts: EngineCount[] = engines.map((engine) => {
      let ok = 0, bad = 0;
      for (const r of rows) {
        if (r.status === 'done') { if (answered(r.result, engine)) ok++; else bad++; }
        else if (ROW_TERMINAL.has(r.status)) bad++;
      }
      const done = Math.min(R, ok);
      return { engine, done, failed: Math.min(R - done, bad), total: R };
    });
    const done = counts.reduce((s, c) => s + c.done, 0);
    const failed = counts.reduce((s, c) => s + c.failed, 0);
    const total = R * engines.length;
    const state: DiscoveryQuestionState = done === total ? 'complete'
      : done + failed === total ? 'complete_with_issue'
      : done + failed > 0 || anyOpen ? 'running' : 'not_started';
    return { question: q, state, engines: counts, done, failed, total };
  });

  const total = questions.length * engines.length * R;
  const done = byQuestion.reduce((s, q) => s + q.done, 0);
  const failed = byQuestion.reduce((s, q) => s + q.failed, 0);
  const byEngine: EngineCount[] = engines.map((engine) => byQuestion.reduce((acc, q) => {
    const c = q.engines.find((e) => e.engine === engine)!;
    return { engine, done: acc.done + c.done, failed: acc.failed + c.failed, total: acc.total + c.total };
  }, { engine, done: 0, failed: 0, total: 0 }));

  const openRows = input.rows.some((r) => !ROW_TERMINAL.has(r.status));
  const openRuns = input.runs.some((r) => !RUN_TERMINAL.has(r.status));
  const error = input.error ?? null;
  const now = input.now ?? Date.now();
  const quietMs = updatedAt ? now - new Date(updatedAt).getTime() : 0;
  /* ⛔ ENUMERATED, NOT an else-branch carrying the rest (CLAUDE.md §4, absent values).
     complete         — advanceBaseline finalised it and every slot is an answer;
     complete_w_fail  — finalised, some slots failed (the rest are kept and shown);
     running          — any row or run still open, or runs remain to be started (the stagger) and
                        nothing has refused;
     needs_attention  — no audit work is open, it is not finalised, and either the chain recorded a
                        refusal or nothing has moved for DISCOVERY_STALL_MS. */
  let status: DiscoveryJobStatus;
  if (input.completedAt) status = done === total ? 'complete' : 'complete_with_failures';
  else if (openRows || openRuns) status = 'running';
  else if (error) status = 'needs_attention';
  else if (quietMs > DISCOVERY_STALL_MS) status = 'needs_attention';
  else status = 'running';

  return {
    status, questions: questions.length, engines, runs_target: R,
    total, done, failed, percent: total ? Math.floor((done / total) * 100) : 0,
    questions_complete: byQuestion.filter((q) => q.state === 'complete').length,
    questions_settled: byQuestion.filter((q) => q.state === 'complete' || q.state === 'complete_with_issue').length,
    by_engine: byEngine, by_question: byQuestion,
    runs_started: input.runs.length,
    started_at: input.startedAt, updated_at: updatedAt, completed_at: input.completedAt,
    stalled: status === 'running' && (openRows || openRuns) && quietMs > DISCOVERY_STALL_MS,
    error,
  };
}

/** A job is finished for good (no more answers will arrive). */
export const isDiscoveryTerminal = (s: DiscoveryJobStatus): boolean => s === 'complete' || s === 'complete_with_failures';

/* ── THE POOL VERSION ──────────────────────────────────────────────────────────────────────────
   A stable id for a Discovery pool: the same questions (trimmed, lower-cased, order-free) give the
   same version. A job records the version it measured; results are attached to a pool only when the
   job's own questions all belong to it (poolMatchesJob), so an old job can never be read as the new
   pool's answers. FNV-1a, 32-bit — an identity check, not security. */
export function poolVersion(questions: string[]): string {
  const norm = [...new Set(questions.map((q) => q.trim().toLowerCase()).filter(Boolean))].sort().join('\n');
  let h = 0x811c9dc5;
  for (let i = 0; i < norm.length; i++) { h ^= norm.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `p${questions.length}-${h.toString(16).padStart(8, '0')}`;
}

/** Every question the job measured is in the pool on screen. A job with a question the pool does
 *  not have measured a different pool, and its results are not this pool's. */
export function poolMatchesJob(pool: string[], jobQuestions: string[]): boolean {
  if (!jobQuestions.length) return false;
  const set = new Set(pool.map((q) => q.trim().toLowerCase()));
  return jobQuestions.every((q) => set.has(q.trim().toLowerCase()));
}

/* ── WHAT THE SCREEN MAY DO — one rule for the button, the regenerate button and the label ─────── */
/** = create-ai-audit AUDIT_ENGINES (every Discovery question asks both, in one engine call). */
export const DISCOVERY_ENGINES = ['chatgpt', 'gemini'];
export function discoveryPlan(questions: number, runs: number, engines: number = DISCOVERY_ENGINES.length) {
  return { questions, engines, runs, measurements: questions * engines * runs };
}

export type DiscoveryViewStatus = DiscoveryJobStatus | 'starting';
export interface DiscoveryView {
  status: DiscoveryViewStatus;
  /** Only a pool with no job may start one — never a second job on the same pool. */
  canRun: boolean;
  /** Not while a job is measuring the pool (it would be spending on questions nobody can see). */
  canRegenerate: boolean;
  /** Groups are built from partial answers and must say so. */
  provisional: boolean;
  /** The screen should re-read the stored state on an interval. */
  poll: boolean;
  buttonLabel: string;
}
export function discoveryView(d: {
  poolSize: number; starting?: boolean;
  audit: { complete: boolean; progress?: Pick<DiscoveryProgress, 'status'> } | null;
}, planLabel: string): DiscoveryView {
  const status: DiscoveryViewStatus = d.audit
    ? (d.audit.progress?.status ?? (d.audit.complete ? 'complete' : 'running'))
    : d.starting ? 'starting' : 'not_started';
  const live = status === 'running' || status === 'starting';
  return {
    status,
    canRun: status === 'not_started' && d.poolSize > 0,
    canRegenerate: !live,
    provisional: status === 'running' || status === 'needs_attention',
    poll: live,
    buttonLabel: status === 'not_started' ? planLabel
      : status === 'starting' ? 'Discovery starting…'
      : DISCOVERY_JOB_LABELS[status],
  };
}

/** "ChatGPT 2/3 · Gemini 1/3 · 1 failed" — the per-question line. */
export const ENGINE_LABELS: Record<string, string> = { chatgpt: 'ChatGPT', gemini: 'Gemini' };
export function questionProgressLine(q: Pick<QuestionProgress, 'engines' | 'failed' | 'state'>): string {
  if (q.state === 'not_started') return 'Not started';
  const parts = q.engines.map((e) => `${ENGINE_LABELS[e.engine] ?? e.engine} ${e.done}/${e.total}`);
  if (q.failed) parts.push(`${q.failed} failed`);
  return parts.join(' · ');
}

/** "named in N of M answered runs" — and, while the question is still being measured, says so. */
export function namedLine(o: { namedRuns: number; runs: number }, state: string | undefined): string {
  const partial = state === 'running' || state === 'not_started';
  return `named in ${o.namedRuns} of ${o.runs} answered run${o.runs === 1 ? '' : 's'}${partial ? ' so far (partial)' : ''}`;
}
