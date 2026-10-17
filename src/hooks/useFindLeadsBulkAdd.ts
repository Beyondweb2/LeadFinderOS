/* FIND LEADS: the network for the ONE add path (src/lib/findLeadsBulkAdd.ts holds every rule). */
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdge, EdgeFunctionError } from '@/lib/edgeInvoke';
import {
  runFindLeadsBulkAdd, type AddContext, type BulkAddLead, type BulkAddOutcome, type LookupAnswer, type AddRowAnswer,
} from '@/lib/findLeadsBulkAdd';

type RpcAnswer = { ok?: boolean; error?: string; rows?: AddRowAnswer[] };
const rpc = (name: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (n: string, a: unknown) => Promise<{ data: unknown; error: { message?: string } | null }>)(name, args);

/** A refusal that means "you have hit a limit", not "this lookup broke". */
function isLimitRefusal(e: { status?: number | null; code?: string | null }): boolean {
  if (e.status === 429) return true;
  return e.code === 'usage_paused' || e.code === 'all_stop' || e.code === 'not_ready_to_sell';
}

export function useFindLeadsBulkAdd() {
  return useCallback(async (
    leads: readonly BulkAddLead[],
    ctxOf: (lead: BulkAddLead) => AddContext,
    emailOf: (lead: BulkAddLead) => string | null,
    campaignId: string | null,
  ): Promise<BulkAddOutcome> => {
    const res = await runFindLeadsBulkAdd(leads, ctxOf, emailOf, campaignId, {
      addLeads: async (rows, c, commit) => {
        const { data, error } = await rpc('coverage_add_leads', { _rows: rows, _campaign_id: c, _commit: commit });
        return error ? { ok: false } : ((data ?? { ok: false }) as RpcAnswer);
      },
      lookup: async (placeId) => {
        try {
          const d = await invokeEdge<LookupAnswer & { error?: string }>('google-place-details', { placeId, triggerSource: 'add_to_crm' });
          return d && !(d as { error?: string }).error ? d : null;
        } catch (e) {
          if (e instanceof EdgeFunctionError && isLimitRefusal({ status: e.status, code: e.code })) return { limit: true };
          return null;
        }
      },
    });
    if (res.ok && (res as { summary: { added: number } }).summary.added > 0) {
      window.dispatchEvent(new CustomEvent('crm-lead-added'));
      window.dispatchEvent(new CustomEvent('sales-lead-changed'));
    }
    return res;
  }, []);
}
