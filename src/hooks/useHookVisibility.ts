import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { hookRunInFlight, hookStateOf, pickHookAudit, scoreHookAuditForCard, type HookCardAudit, type HookCardScore } from '@/lib/hookVisibility';
import type { HookScoreRow } from '@/lib/hookScore';

/* The Inbox AI visibility card's loader (2026-09-25). READ-ONLY, and it runs for ONE lead: the
   conversation that is open. It reads that lead's audits, then the queue rows of the one run the
   card shows. The decisions are pure and live in src/lib/hookVisibility.ts.
   Polls every POLL_MS only while that run is in flight, so a running check fills in. A terminal run
   is read once. Nothing here writes, spends or sends. */

// results->hook is a jsonb projection the generated types cannot describe; RLS still scopes the read.
const sb = supabase as unknown as { from: (t: string) => any };

const POLL_MS = 10_000;
const AUDIT_SELECT = 'id, created_at, business_name, business_type, location_text, is_market, audit_purpose, baseline_target_runs, is_measurement, baseline_contract, ai_audit_runs(id, status, run_number, hook:results->hook, competitor_cleaning:results->competitor_cleaning)';

export interface HookVisibilityData {
  audit: HookCardAudit;
  runId: string;
  runStatus: string | null;
  inFlight: boolean;
  state: unknown;
  card: HookCardScore;
}

async function load(leadId: string): Promise<HookVisibilityData | null> {
  const { data: audits, error } = await sb.from('ai_audits').select(AUDIT_SELECT)
    .eq('lead_id', leadId).order('created_at', { ascending: false }).limit(10);
  if (error) throw new Error(error.message ?? 'Could not read audits');
  const picked = pickHookAudit(((audits ?? []) as HookCardAudit[]).map((a) => ({
    ...a,
    // The run's projected keys, reassembled as the `results` shape the helpers read.
    ai_audit_runs: (a.ai_audit_runs ?? []).map((r) => {
      const p = r as unknown as { id: string; status: string | null; run_number: number | null; hook?: unknown; competitor_cleaning?: unknown };
      return { id: p.id, status: p.status, run_number: p.run_number, results: { hook: p.hook ?? null, competitor_cleaning: p.competitor_cleaning ?? null } };
    }),
  })));
  if (!picked) return null;
  const { data: rows, error: rowsError } = await sb.from('ai_audit_queue')
    .select('id, question, status, result, engines').eq('run_id', picked.runId).order('created_at', { ascending: true });
  if (rowsError) throw new Error(rowsError.message ?? 'Could not read audit results');
  const state = hookStateOf(picked.runResults);
  return {
    audit: picked.audit,
    runId: picked.runId,
    runStatus: picked.runStatus,
    inFlight: hookRunInFlight(picked.runStatus),
    state,
    card: scoreHookAuditForCard({ audit: picked.audit, state, runResults: picked.runResults, rows: (rows ?? []) as HookScoreRow[] }),
  };
}

export function useHookVisibility(leadId: string | null | undefined) {
  return useQuery({
    queryKey: ['hook-visibility', leadId ?? null],
    enabled: !!leadId,
    queryFn: () => load(leadId as string),
    refetchInterval: (q) => (q.state.data?.inFlight ? POLL_MS : false),
    staleTime: 30_000,
  });
}
