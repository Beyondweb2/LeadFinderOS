import type { QueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRowsParallel } from '@/lib/fetchAllRows';

/* ════════════════════════════════════════════════════════════════════════════════════════════
   THE OUTREACH AUDIT MAP — lead_id → its latest audit run (2026-09-27, site-wide speed pass).

   It drives each row's "Run audit" / "Running…" / "Manage" control. It used to be an effect inside
   OutreachTable, which only mounts once every lead has arrived — so this 1,572-audit read (~2 s)
   started AFTER the leads (~2–4 s) and the audit buttons were right only at 4–7 s. Outreach now
   starts it the moment the page opens (prefetchOutreachAuditMap), alongside the leads, and the table
   reads the same cached answer. Measured live: buttons ready at 2.3–3.0 s instead of 3.8–6.7 s, the
   leads 0–0.3 s slower for sharing the line.
   ⚠️ FRESHNESS IS UNCHANGED IN PRACTICE: it was read once per table mount and never updated after;
   it is now read once per page visit, reused for OUTREACH_AUDIT_MAP_STALE_MS so the page-open read
   and the table's own mount do not both fetch. The effect's `[isAdmin]` dependency (unused inside)
   could also fire it twice; a query key cannot.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

export type { LeadAuditState } from './auditRowState.ts';
import type { LeadAuditState } from './auditRowState.ts';
export const OUTREACH_AUDIT_MAP_STALE_MS = 30_000;
export const OUTREACH_AUDIT_MAP_ROOT = ['outreach-audit-map'] as const;
export const outreachAuditMapKey = (userId: string | null | undefined) => [...OUTREACH_AUDIT_MAP_ROOT, userId ?? null] as const;

export { auditRowState, auditMapHasRunning, OUTREACH_AUDIT_MAP_POLL_MS, type AuditRowState } from './auditRowState.ts';

/** Map lead_id → its LATEST audit's latest run + status. RLS-scoped (no explicit user filter),
 *  newest audit first, keep the FIRST audit seen per lead_id; for that audit, its latest run (max
 *  run_number, else newest created_at); audits with no runs are skipped. A failed read is an empty
 *  map, exactly as before (every row offers "Run audit"). */
export async function fetchOutreachAuditMap(): Promise<Record<string, LeadAuditState>> {
  /* ⛔ PAGINATED (2026-09-27): one unpaginated select returned 1,000 of the 1,572 audits, so the
     oldest leads' rows showed "Run audit" for an audit they already had. Newest-first order kept. */
  let data: unknown[] | null = null;
  try {
    data = (await fetchAllRowsParallel<{ id: string }>('Outreach (audit map)', (from, to) => (supabase as unknown as SupabaseClient)
      .from('ai_audits')
      .select('id, lead_id, ai_audit_runs(id, run_number, status, created_at)')
      .order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to), (a) => a.id)).rows;
  } catch { data = null; }
  const map: Record<string, LeadAuditState> = {};
  if (!data) return map;
  for (const row of data as Array<{ id: string; lead_id: string | null; ai_audit_runs: Array<{ id: string; run_number: number | null; status: string | null; created_at: string | null }> | null }>) {
    if (!row.lead_id || map[row.lead_id]) continue; // no lead, or a newer audit already won
    const runs = Array.isArray(row.ai_audit_runs) ? row.ai_audit_runs : [];
    if (runs.length === 0) continue;               // no run yet → nothing to show
    const latestRun = [...runs].sort((a, b) =>
      (b.run_number ?? 0) - (a.run_number ?? 0) ||
      (new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
    )[0];
    map[row.lead_id] = { auditId: row.id, runId: latestRun.id, status: latestRun.status ?? 'pending' };
  }
  return map;
}

/** Start the read now (the Outreach page calls this on open); the table's query joins it. */
export function prefetchOutreachAuditMap(qc: QueryClient, userId: string) {
  return qc.prefetchQuery({ queryKey: outreachAuditMapKey(userId), queryFn: fetchOutreachAuditMap, staleTime: OUTREACH_AUDIT_MAP_STALE_MS });
}
