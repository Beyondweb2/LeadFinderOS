import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  hookReportState, hookRunInFlight, hookStateNeedsPolling, hookStateOf, pickHookAudit, scoreHookAuditForCard,
  type HookCardAudit, type HookCardScore, type HookReportState,
} from '@/lib/hookVisibility';
import type { HookScoreRow } from '@/lib/hookScore';

/* The Inbox AI visibility card's loader (2026-09-25). READ-ONLY, and it runs for ONE lead: the
   conversation that is open. It reads that lead's audits, then the queue rows of the one run the
   card shows. The decisions are pure and live in src/lib/hookVisibility.ts.
   Polls every POLL_MS only while the answer can still change on its own (running or preparing the
   report), and stops once the report is ready, the run has failed, or MEASURING_STALL_MS has
   passed. Nothing here writes, spends or sends.
   ⛔ THE REPORT BAR READS `report` FROM HERE (2026-09-26), not from useInbox's audit cache: that
   cache is patched by realtime events the database never publishes for ai_audits/ai_audit_runs.
   See hookReportState for the record. */

// results->hook is a jsonb projection the generated types cannot describe; RLS still scopes the read.
const sb = supabase as unknown as { from: (t: string) => any };

const POLL_MS = 10_000;
const AUDIT_SELECT = 'id, lead_id, short_code, created_at, business_name, business_type, location_text, is_market, audit_purpose, baseline_target_runs, is_measurement, baseline_contract, ai_audit_runs(id, status, run_number, created_at, hook:results->hook, competitor_cleaning:results->competitor_cleaning)';

export interface HookVisibilityData {
  /** Null when the lead has no outreach audit with a run. The report state is still set. */
  audit: HookCardAudit | null;
  runId: string | null;
  runStatus: string | null;
  inFlight: boolean;
  state: unknown;
  card: HookCardScore | null;
  report: HookReportState;
}

type LoadedAudit = HookCardAudit & { lead_id: string | null; short_code: string | null };

async function load(leadId: string): Promise<HookVisibilityData> {
  const { data: audits, error } = await sb.from('ai_audits').select(AUDIT_SELECT)
    .eq('lead_id', leadId).order('created_at', { ascending: false }).limit(10);
  if (error) throw new Error(error.message ?? 'Could not read audits');
  const list: LoadedAudit[] = ((audits ?? []) as LoadedAudit[]).map((a) => ({
    ...a,
    lead_id: a.lead_id ?? null,
    short_code: a.short_code ?? null,
    // The run's projected keys, reassembled as the `results` shape the helpers read.
    ai_audit_runs: (a.ai_audit_runs ?? []).map((r) => {
      const p = r as unknown as { id: string; status: string | null; run_number: number | null; created_at?: string | null; hook?: unknown; competitor_cleaning?: unknown };
      return { id: p.id, status: p.status, run_number: p.run_number, created_at: p.created_at ?? null, results: { hook: p.hook ?? null, competitor_cleaning: p.competitor_cleaning ?? null } };
    }),
  }));
  const picked = pickHookAudit(list);
  if (!picked) {
    return { audit: null, runId: null, runStatus: null, inFlight: false, state: null, card: null, report: hookReportState({ leadId, audits: list, picked: null, score: null }) };
  }
  const { data: rows, error: rowsError } = await sb.from('ai_audit_queue')
    .select('id, question, status, result, engines').eq('run_id', picked.runId).order('created_at', { ascending: true });
  if (rowsError) throw new Error(rowsError.message ?? 'Could not read audit results');
  const state = hookStateOf(picked.runResults);
  const card = scoreHookAuditForCard({ audit: picked.audit, state, runResults: picked.runResults, rows: (rows ?? []) as HookScoreRow[] });
  return {
    audit: picked.audit,
    runId: picked.runId,
    runStatus: picked.runStatus,
    inFlight: hookRunInFlight(picked.runStatus),
    state,
    card,
    report: hookReportState({ leadId, audits: list, picked, score: card.score }),
  };
}

export function hookVisibilityQueryKey(leadId: string | null | undefined) {
  return ['hook-visibility', leadId ?? null] as const;
}

export function useHookVisibility(leadId: string | null | undefined) {
  return useQuery({
    queryKey: hookVisibilityQueryKey(leadId),
    enabled: !!leadId,
    queryFn: () => load(leadId as string),
    refetchInterval: (q) => (q.state.data && hookStateNeedsPolling(q.state.data.report) ? POLL_MS : false),
    staleTime: 30_000,
  });
}
