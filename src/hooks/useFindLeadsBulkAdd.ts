/* FIND LEADS: the network for the ONE add path (src/lib/findLeadsBulkAdd.ts holds every rule). */
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdge, EdgeFunctionError } from '@/lib/edgeInvoke';
import {
  runFindLeadsBulkAdd, type AddContext, type AddProgress, type BulkAddLead, type BulkAddOutcome, type LookupAnswer,
  type LookupResult, type AddRowAnswer,
} from '@/lib/findLeadsBulkAdd';

type RpcAnswer = { ok?: boolean; error?: string; rows?: AddRowAnswer[] };
const rpc = (name: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (n: string, a: unknown) => Promise<{ data: unknown; error: { message?: string } | null }>)(name, args);

/** A google-place-details refusal → what the add does with it. 429 (the per-minute guard) is waited out and retried;
 *  a refusal no wait will change (403: suspended / not allowed / not ready, or an all-stop) stops further lookups —
 *  the businesses are still added, without a looked-up number. */
export function lookupRefusal(e: { status?: number | null; code?: string | null }): LookupResult {
  if (e.status === 429) return { throttled: true };
  if (e.status === 403 || e.code === 'all_stop' || e.code === 'not_ready_to_sell' || e.code === 'usage_paused') return { limit: true };
  return null;
}

export function useFindLeadsBulkAdd() {
  return useCallback(async (
    leads: readonly BulkAddLead[],
    ctxOf: (lead: BulkAddLead) => AddContext,
    emailOf: (lead: BulkAddLead) => string | null,
    campaignId: string | null,
    onProgress?: (p: AddProgress) => void,
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
          if (e instanceof EdgeFunctionError) return lookupRefusal({ status: e.status, code: e.code });
          return null;
        }
      },
      onProgress,
    });
    /* The list refreshes ONCE, at the end (useFindLeadsCrm coalesces these into one re-check). */
    if (res.ok && (res as { summary: { added: number } }).summary.added > 0) {
      window.dispatchEvent(new CustomEvent('crm-lead-added'));
      window.dispatchEvent(new CustomEvent('sales-lead-changed'));
    }
    return res;
  }, []);
}
