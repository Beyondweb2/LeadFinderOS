export type LeadAuditState = { auditId: string; runId: string; status: string };

/* ⛔ ONE READING OF A ROW'S AUDIT STATE (2026-09-28). The row used to test pending/running only, so a
   run the processor had moved to `processing` (or a `queued` one) showed "Run audit" again while it
   was still in flight — an invitation to start the same audit twice. Positive matches both ways:
   done = complete|capped, running = the processor's in-flight states; anything else (failed,
   cancelled, no run) offers Run. */
const AUDIT_RUN_IN_FLIGHT: ReadonlySet<string> = new Set(['pending', 'queued', 'running', 'processing']);
export type AuditRowState = 'done' | 'running' | 'none';
export function auditRowState(a: LeadAuditState | null | undefined): AuditRowState {
  if (!a) return 'none';
  if (a.status === 'complete' || a.status === 'capped') return 'done';
  if (AUDIT_RUN_IN_FLIGHT.has(a.status)) return 'running';
  return 'none';
}
/** While any row is mid-audit the map re-reads on this interval, so "Audit running" turns into
 *  "Audit complete" without a reload. Idle, it does not poll at all. */
export const OUTREACH_AUDIT_MAP_POLL_MS = 20_000;
export function auditMapHasRunning(map: Record<string, LeadAuditState> | undefined): boolean {
  return !!map && Object.values(map).some((a) => auditRowState(a) === 'running');
}
