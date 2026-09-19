export type PaidBaselineStatus = 'needs_questions' | 'needs_approval' | 'approved' | 'running' | 'complete' | 'failed';

export const EDITABLE_BASELINE_STATUS_FILTER =
  'baseline_status.is.null,baseline_status.in.(needs_questions,needs_approval,failed)';

export function normalizePaidBaselineStatus(value: unknown): PaidBaselineStatus {
  const status = typeof value === 'string' ? value.trim() : '';
  return status === 'needs_approval' || status === 'approved' || status === 'running'
      || status === 'complete' || status === 'failed'
    ? status
    : 'needs_questions';
}

export function requireUpdatedRow(value: unknown, code: string): void {
  if (!value || typeof value !== 'object' || !(value as { id?: unknown }).id) throw new Error(code);
}

export function paidBaselineRunState(started: { audit_id?: string; skipped?: string }): { status: 'approved' | 'running'; audit_id?: string; start_note?: string } {
  if (started.skipped && !started.audit_id) return { status: 'approved', start_note: started.skipped };
  return { status: 'running', ...(started.audit_id ? { audit_id: started.audit_id } : {}), ...(started.skipped ? { start_note: started.skipped } : {}) };
}
