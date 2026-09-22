/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE PAID-BASELINE STATE MACHINE — one place for the statuses, the transitions and the words.

   needs_questions → needs_approval → approved → starting → running → complete
                                                    ↑           │
                                                    └── revert ──┘  (create-ai-audit refused)

   🔴 WHY `starting` EXISTS (2026-09-22). Three callers can start a paid baseline — the operator's
   Run button, the 30-second queue backstop (ensureBaselinesForPaidOnboardings) and the Stripe
   webhook — and every one of them read "does this lead already have a baseline?" and then paid for
   one. Two callers inside the same second both read "no" and both bought. `starting` is the CLAIM:
   the conditional update approved→starting succeeds for exactly one caller; the others see
   `start_in_progress` and wait. It is written immediately before the spend and replaced by
   `running` (audit created) or `approved` (refused) straight after.

   ⚠️ IMPORTED BY AN EDGE FUNCTION: a leaf, relative imports only, explicit `.ts` (CLAUDE.md §3).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type PaidBaselineStatus = 'needs_questions' | 'needs_approval' | 'approved' | 'starting' | 'running' | 'complete' | 'failed';

export const EDITABLE_BASELINE_STATUS_FILTER =
  'baseline_status.is.null,baseline_status.in.(needs_questions,needs_approval,failed)';

/** Statuses at which the approved question set is frozen and must not be edited. */
export const FROZEN_BASELINE_STATUSES: readonly PaidBaselineStatus[] = ['approved', 'starting', 'running', 'complete'];

/** Statuses at which the measurement has begun — context and questions are both locked. */
export const STARTED_BASELINE_STATUSES: readonly PaidBaselineStatus[] = ['starting', 'running', 'complete'];

/** A `starting` claim older than this is a crashed starter and may be reclaimed. Well above the
 *  create-ai-audit round trip (seconds) and well below anything an operator would wait for. */
export const START_CLAIM_STALE_MS = 5 * 60 * 1000;

export function normalizePaidBaselineStatus(value: unknown): PaidBaselineStatus {
  const status = typeof value === 'string' ? value.trim() : '';
  return status === 'needs_approval' || status === 'approved' || status === 'starting' || status === 'running'
      || status === 'complete' || status === 'failed'
    ? status
    : 'needs_questions';
}

export function isFrozenBaselineStatus(value: unknown): boolean {
  return FROZEN_BASELINE_STATUSES.includes(normalizePaidBaselineStatus(value));
}

export function isStartedBaselineStatus(value: unknown): boolean {
  return STARTED_BASELINE_STATUSES.includes(normalizePaidBaselineStatus(value));
}

export function requireUpdatedRow(value: unknown, code: string): void {
  if (!value || typeof value !== 'object' || !(value as { id?: unknown }).id) throw new Error(code);
}

/**
 * May this row be claimed for a start right now? `approved` always; `starting` only when the
 * previous claim is stale (the starter crashed between claim and outcome). Everything else — a
 * draft, a running or complete baseline, a fresh claim — is refused.
 */
export function canClaimStart(row: { baseline_status?: unknown; updated_at?: unknown }, nowMs: number): boolean {
  const status = normalizePaidBaselineStatus(row.baseline_status);
  if (status === 'approved') return true;
  if (status !== 'starting') return false;
  /* Absent means "do not" on a spending path: a `starting` row with no readable claim time is
     left alone, exactly as the database filter (`updated_at.lt.…` is false for NULL) leaves it. */
  const claimedAt = Date.parse(String(row.updated_at ?? ''));
  return Number.isFinite(claimedAt) && nowMs - claimedAt > START_CLAIM_STALE_MS;
}

/** The PostgREST `.or()` filter that makes canClaimStart atomic at the database. */
export function startClaimFilter(nowMs: number): string {
  const staleBefore = new Date(nowMs - START_CLAIM_STALE_MS).toISOString();
  return `baseline_status.eq.approved,and(baseline_status.eq.starting,updated_at.lt.${staleBefore})`;
}

/** Skips that mean "another starter has it" rather than "nothing can start". */
export const START_IN_PROGRESS_SKIP = 'start_in_progress';

export function paidBaselineRunState(started: { audit_id?: string; skipped?: string }): { status: 'approved' | 'starting' | 'running'; audit_id?: string; start_note?: string } {
  if (started.skipped === START_IN_PROGRESS_SKIP && !started.audit_id) return { status: 'starting', start_note: started.skipped };
  if (started.skipped && !started.audit_id) return { status: 'approved', start_note: started.skipped };
  return { status: 'running', ...(started.audit_id ? { audit_id: started.audit_id } : {}), ...(started.skipped ? { start_note: started.skipped } : {}) };
}

/**
 * startPaidBaseline's skip codes in operator English. The backstop only logs these; the operator's
 * Run button must show them, because a skip on a row the operator has just approved is a refusal.
 */
export function describeStartSkip(skipped: string): string {
  if (skipped.startsWith('awaiting_questionnaire_2')) {
    const fields = skipped.match(/\(([^)]*)\)/)?.[1] ?? 'the client context';
    return `The baseline cannot start until the client context is complete: ${fields}. Fill it in section A, save, and start again.`;
  }
  if (skipped.startsWith('ambiguous_multi_run_audit')) {
    return 'An earlier multi-run audit on this lead cannot be told apart from a baseline, so nothing was started. Check the lead’s audits before starting again.';
  }
  switch (skipped) {
    case 'needs_baseline_questions': return 'No approved question set is stored for this client. Prepare and approve the questions first.';
    case 'awaiting_operator_run': return 'The question set is not approved yet. Approve it, then start the baseline.';
    case 'lead_refunded': return 'This client was refunded; a refunded client never gets another baseline.';
    case 'no_business_type': return 'Add a business category before starting the baseline.';
    case 'no_location': return 'Add a primary location before starting the baseline.';
    case 'no_lead_id': return 'The onboarding record has no linked lead, so nothing can be measured.';
    case START_IN_PROGRESS_SKIP: return 'The baseline is already being started.';
    default: return `The baseline did not start: ${skipped}.`;
  }
}

/** The one label per status the operator screens show. */
export function paidBaselineStatusLabel(status: unknown): string {
  switch (normalizePaidBaselineStatus(status)) {
    case 'needs_questions': return 'Needs questions';
    case 'needs_approval': return 'Ready for approval';
    case 'approved': return 'Approved, ready to start';
    case 'starting': return 'Starting baseline';
    case 'running': return 'Baseline running';
    case 'complete': return 'Baseline completed';
    case 'failed': return 'Error';
  }
}

/**
 * What the client hub shows for a lead. The stored status wins; a lead with a claimed baseline
 * audit and no stored status (RG, Ronnie's — paid before the status column existed) is read from
 * the audit itself, and a finalised audit is `complete`, never `running`.
 */
export function hubBaselineStatus(
  onboarding: { baseline_status?: unknown } | null | undefined,
  audit: { baseline_completed_at?: unknown } | null | undefined,
): PaidBaselineStatus {
  const stored = typeof onboarding?.baseline_status === 'string' ? onboarding.baseline_status.trim() : '';
  if (stored) return normalizePaidBaselineStatus(stored);
  if (audit) return audit.baseline_completed_at ? 'complete' : 'running';
  return 'needs_questions';
}
