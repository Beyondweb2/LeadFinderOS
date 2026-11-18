/* A REP'S HOOK AUDITS PER LEAD PER DAY — WHICH ONES COUNT (v1-audits-always-finish, 2026-11-18).

   create-ai-audit lets a salesperson start at most SALES_HOOKS_PER_LEAD_PER_DAY hook audits on one lead in 24 h. It used to
   count EVERY audit on the lead, including the automatic WhatsApp reply-chain retries and audits that FAILED because the
   AI search provider hung. On 18 Nov HSM Reading Driving School had six failed automatic audits, so the rep pressing
   Audit got "Edge Function returned a non-2xx status code" (the limit) for a check that had never once worked.

   The rule: an audit counts unless every one of its runs failed or was cancelled. A failed audit cost the rep nothing,
   so it uses none of their allowance. An audit with no run yet, or one still running, counts (it is real, in-flight work —
   a double-click is never a second free audit). The per-person limits in the usage guard still apply on top.

   Pure. Reached by an edge function: relative imports with .ts. */

const FAILED_RUN = new Set(['failed', 'cancelled']);

export interface LimitAudit { ai_audit_runs?: Array<{ status?: string | null }> | null }

/** True when this audit uses one of the rep's per-lead slots. */
export function countsTowardLeadLimit(a: LimitAudit): boolean {
  const runs = Array.isArray(a.ai_audit_runs) ? a.ai_audit_runs : [];
  if (!runs.length) return true;
  return !runs.every((r) => FAILED_RUN.has(String(r?.status ?? '')));
}

export function hooksCountingToday(audits: LimitAudit[]): number {
  return audits.filter(countsTowardLeadLimit).length;
}
