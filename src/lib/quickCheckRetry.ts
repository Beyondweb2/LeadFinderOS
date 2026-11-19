/* ════════════════════════════════════════════════════════════════════════════════════════════════
   QUICK CHECK — ONE AUTOMATIC RETRY WHEN THE PROVIDER DIDN'T FINISH (Paul, 2026-11-16, v1-quickcheck-retry).

   The case: at 11:30 on 16 Nov a batch of 15 sales Quick checks started; Apify's AI search hung for 12 of them
   (3 tries × 12 minutes, "run_age_exceeded") and every one ended "Audit incomplete", its link saying "check back shortly"
   for ever.

   The rule:
     • A Quick check (one audit, one run, 1–3 asks, not a baseline / measurement / market) whose run FAILED because the
       provider did not finish (every ask failed with a provider error: timed out, run failed/aborted, stuck) is retried
       ONCE, automatically, LATE_RETRY_AFTER_MS after it failed — the same audit and run, one more search per ask.
     • Within the normal budget limits: the retry goes through the queue's own start path (pool caps, the Apify reserve,
       the paid-action mode). It is never charged to the rep's daily check allowance again (counted once).
     • A budget refusal (cost_cap, pool cap, the Apify reserve) is NOT a provider failure: never retried here.
     • Not when the lead already has a newer audit (the rep pressed Run again), and never for a run already retried
       (the run's results.late_retry stamp — also written by a manual re-run).
     • If it still fails, the report link says LINK_FAILED_WORDS (never "check back shortly"), and the rep's row shows
       "Run again".

   ⛔ SUPERSEDED 2026-11-19 by src/lib/auditSelfHeal.ts (three re-runs at 30 min / 2 h / 6 h, only the missing answers,
   any ordinary audit up to 12 asks, partial answers too). The queue, the incomplete alert and the public link now ask
   healVerdict; this file keeps the link words and the older pure rule (its tests still describe the first retry).

   Pure. Reached by edge functions: relative imports with .ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** How long after the failure the one retry starts. */
export const LATE_RETRY_AFTER_MS = 30 * 60 * 1000;
/** A failure older than this is never retried automatically (no resurrecting yesterday's check). */
export const LATE_RETRY_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** Most Quick checks re-opened per sweep. */
export const LATE_RETRY_PER_SWEEP = 10;
/** Asks in a Quick check (a sales Quick check is 1; the single-check popup up to 3). */
export const QUICK_CHECK_MAX_ASKS = 3;

/** Row errors that mean "the provider did not finish" (process-ai-audit-queue's own words for it). */
export const PROVIDER_FAILURE_ERRORS: ReadonlySet<string> = new Set([
  'run_age_exceeded', 'apify_TIMED-OUT', 'apify_FAILED', 'apify_ABORTED', 'stuck_running_reclaimed', 'deadline_exceeded', 'no_items',
]);

/** What the public link says. */
export const LINK_WAITING_WORDS = 'This audit hasn’t completed yet — check back shortly.';
export const LINK_FAILED_WORDS = 'This check couldn’t be completed, ask your contact to run it again.';

export interface RetryAudit { audit_purpose: string | null; baseline_target_runs: number | null; is_market?: boolean | null; is_measurement?: boolean | null }
export interface RetryRun { status: string | null; results?: Record<string, unknown> | null }
export interface RetryRow { status: string; result: Record<string, unknown> | null; updated_at?: string | null }

/** A Quick check: an ordinary audit (purpose "audit"), one run, 1–3 asks. */
export function isQuickCheck(audit: RetryAudit, runCount: number, askCount: number): boolean {
  return audit.audit_purpose === 'audit' && audit.baseline_target_runs == null && audit.is_market !== true && audit.is_measurement !== true
    && runCount === 1 && askCount >= 1 && askCount <= QUICK_CHECK_MAX_ASKS;
}

/** Did this run fail ONLY because the provider did not finish? (Every ask failed, each with a provider error.) */
export function failedOnProvider(run: RetryRun, rows: RetryRow[]): boolean {
  if (run.status !== 'failed' || !rows.length) return false;
  return rows.every((r) => r.status === 'failed' && PROVIDER_FAILURE_ERRORS.has(String((r.result ?? {}).error ?? '').trim()));
}

/** The run already had its one retry (automatic or manual). */
export function alreadyRetried(run: RetryRun): boolean {
  const s = (run.results ?? {}) as Record<string, unknown>;
  return s.late_retry != null && typeof s.late_retry === 'object';
}

/** When the run's last ask settled (the failure time). null = unknown. */
export function failedAt(rows: RetryRow[]): number | null {
  const t = rows.map((r) => Date.parse(String(r.updated_at ?? ''))).filter(Number.isFinite);
  return t.length ? Math.max(...t) : null;
}

export type RetryVerdict =
  | { kind: 'retry_now' }
  | { kind: 'retry_later'; atMs: number }
  | { kind: 'final'; why: 'not_quick' | 'not_provider' | 'retried' | 'newer_audit' | 'too_old' };

/** The one decision, used by the sweep (retry_now), the incomplete alert (hold while a retry is coming) and the public
 *  link (waiting vs failed). */
export function lateRetryVerdict(o: { audit: RetryAudit; runs: RetryRun[]; rows: RetryRow[]; newerAudit: boolean; nowMs: number }): RetryVerdict {
  if (!isQuickCheck(o.audit, o.runs.length, o.rows.length)) return { kind: 'final', why: 'not_quick' };
  const run = o.runs[0];
  if (alreadyRetried(run)) return { kind: 'final', why: 'retried' };
  if (!failedOnProvider(run, o.rows)) return { kind: 'final', why: 'not_provider' };
  if (o.newerAudit) return { kind: 'final', why: 'newer_audit' };
  const at = failedAt(o.rows);
  if (at == null || o.nowMs - at > LATE_RETRY_MAX_AGE_MS) return { kind: 'final', why: 'too_old' };
  const due = at + LATE_RETRY_AFTER_MS;
  return o.nowMs >= due ? { kind: 'retry_now' } : { kind: 'retry_later', atMs: due };
}

/** The writes that re-open a run for its one retry: the run back to running (its old error dropped, the retry stamped),
 *  and each failed ask back to pending with ONE start left (attempts = maxAttempts - 1). */
export function reopenPatch(run: RetryRun, why: string, nowIso: string, maxAttempts: number) {
  const prev = { ...((run.results ?? {}) as Record<string, unknown>) };
  delete prev.error;
  /* A step-by-step Quick check (results.hook) stopped itself with "provider_failure" when the asks failed. Left in place,
     the finaliser skips the step and the report says "This check didn't finish" even after the retry answers (found on
     the 12 manual re-runs, 16 Nov). Cleared, the step re-reads the retried ask like a first-time answer. */
  const hook = prev.hook;
  if (hook && typeof hook === 'object' && (hook as Record<string, unknown>).stop_reason === 'provider_failure') {
    const h = { ...(hook as Record<string, unknown>) };
    delete h.stop_reason;
    prev.hook = h;
  }
  return {
    run: { status: 'running', results: { ...prev, late_retry: { at: nowIso, kind: 'auto', why } } },
    row: { status: 'pending', attempts: Math.max(0, maxAttempts - 1), result: null },
  };
}

/** What the public link says for an audit with no usable run: still coming (in flight, or a retry is due) vs finished
 *  without a result. */
export function unavailableWords(o: { anyInFlight: boolean; verdict: RetryVerdict | { kind: string } | null }): string {
  if (o.anyInFlight) return LINK_WAITING_WORDS;
  if (o.verdict && (o.verdict.kind === 'retry_now' || o.verdict.kind === 'retry_later')) return LINK_WAITING_WORDS;
  return LINK_FAILED_WORDS;
}
