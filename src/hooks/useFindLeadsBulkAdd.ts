/* FIND LEADS: the network for the ONE add path (src/lib/findLeadsBulkAdd.ts holds every rule). */
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdge, EdgeFunctionError } from '@/lib/edgeInvoke';
import { useSubscription } from '@/hooks/useSubscription';
import { leadSourceFor } from '@/lib/outreachLeadColumns';
import {
  runFindLeadsBulkAdd, type AddContext, type AddProgress, type BulkAddLead, type BulkAddOutcome, type LookupAnswer,
  type LookupResult, type AddRowAnswer, type AddVisibility, visibilityOf,
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

/** Reads just-created leads back through the person's OWN source (the same table their Outreach reads). null = the
 *  read did not answer — the caller then claims nothing about visibility. */
async function readBack(role: 'admin' | 'sales' | null | undefined, ids: readonly string[]): Promise<AddVisibility | null> {
  if (ids.length === 0) return { visible: 0, queued: 0 };
  const table = leadSourceFor(role).table;
  const rows: { status?: string | null; sms_queued_at?: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await (supabase.from(table as 'outreach_leads') as unknown as {
      select: (c: string) => { in: (k: string, v: readonly string[]) => Promise<{ data: unknown; error: unknown }> };
    }).select('id, status, sms_queued_at').in('id', ids.slice(i, i + 200));
    if (error) return null;
    rows.push(...((data ?? []) as typeof rows));
  }
  return visibilityOf(rows);
}

export function useFindLeadsBulkAdd() {
  const { role } = useSubscription();
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
    if (res.ok && res.summary.added > 0) {
      window.dispatchEvent(new CustomEvent('crm-lead-added'));
      window.dispatchEvent(new CustomEvent('sales-lead-changed'));
      const ids = res.rows.filter((r) => r.outcome === 'created' && r.lead_id).map((r) => r.lead_id as string);
      try { res.visibility = await readBack(role, ids); } catch { res.visibility = null; }
    }
    return res;
  }, [role]);
}
