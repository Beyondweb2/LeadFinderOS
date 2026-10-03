import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { leadRpc, type RpcResult } from '@/lib/leadRpc';
import type { CampaignSummary } from '@/lib/campaignRules';
import { announceQueueChanged, MY_QUEUE_KEY } from '@/components/MyWhatsAppQueuePanel';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   The Campaigns screens' reads and writes — every one a role-checked database function
   (migration 20261006120000). The server decides what this person may see: a salesperson gets only their
   own campaigns, and another owner's campaign answers 'not_found' whatever id is sent. Nothing here filters
   by owner in the browser.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface CampaignLeadRow {
  id: string; business_name: string | null; status: string | null; town: string | null; trade: string | null;
  interested: boolean; contacted: boolean; replied: boolean;
}
export interface CandidateLead {
  id: string; business_name: string | null; status: string | null; town: string | null; trade: string | null;
  in_this: boolean; campaign_id: string | null; campaign_name: string | null; in_other_campaign: boolean; sendable: boolean;
}

const failed = (r: RpcResult) => { const e = new Error(String(r.error ?? 'failed')); (e as Error & { code?: string }).code = String(r.error ?? ''); return e; };

export const MY_CAMPAIGNS_KEY = ['my-campaigns'] as const;

export function useMyCampaigns() {
  return useQuery({
    queryKey: MY_CAMPAIGNS_KEY,
    queryFn: async () => {
      const r = await leadRpc('my_campaigns', {});
      if (!r.ok) throw failed(r);
      return { admin: r.admin === true, campaigns: (r.campaigns ?? []) as CampaignSummary[], opener: (r.opener as string | null) ?? null };
    },
  });
}

export function useCampaignDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['campaign-detail', id],
    enabled: !!id,
    queryFn: async () => {
      const r = await leadRpc('campaign_detail', { _campaign_id: id });
      if (!r.ok) throw failed(r);
      return { campaign: r.campaign as CampaignSummary, opener: (r.opener as string | null) ?? null };
    },
    retry: (n, e) => (e as Error & { code?: string }).code !== 'not_found' && n < 2,
  });
}

export function useCampaignLeads(id: string | undefined) {
  return useQuery({
    queryKey: ['campaign-leads', id],
    enabled: !!id,
    queryFn: async () => {
      const r = await leadRpc('campaign_leads', { _campaign_id: id });
      if (!r.ok) throw failed(r);
      return (r.leads ?? []) as CampaignLeadRow[];
    },
  });
}

export function useCampaignCandidates(campaignId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['campaign-candidates', campaignId],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const r = await leadRpc('campaign_candidates', { _campaign_id: campaignId, _search: null });
      if (!r.ok) throw failed(r);
      return (r.leads ?? []) as CandidateLead[];
    },
  });
}

/** The writes. Each returns the server's answer; the caller words a refusal with campaignErrorText. */
export function useCampaignActions() {
  const qc = useQueryClient();
  const refresh = useCallback(async (id?: string) => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: MY_CAMPAIGNS_KEY }),
      qc.invalidateQueries({ queryKey: ['campaigns'] }), // the pickers' list (useCampaigns)
      ...(id ? [qc.invalidateQueries({ queryKey: ['campaign-detail', id] }), qc.invalidateQueries({ queryKey: ['campaign-leads', id] })] : []),
      qc.invalidateQueries({ queryKey: ['campaign-candidates'] }),
      qc.invalidateQueries({ queryKey: MY_QUEUE_KEY }),
    ]);
    /* Leads changed on the server in bulk: Outreach re-reads its list; the queue panel re-reads at once. */
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('campaign-leads-changed'));
    announceQueueChanged();
  }, [qc]);

  const nameAvailable = useCallback((name: string, except?: string) => leadRpc('campaign_name_available', { _name: name, _except: except ?? null }), []);
  const create = useCallback(async (name: string) => { const r = await leadRpc('campaign_create', { _name: name }); if (r.ok) await refresh(); return r; }, [refresh]);
  const rename = useCallback(async (id: string, name: string) => { const r = await leadRpc('campaign_rename', { _campaign_id: id, _name: name }); if (r.ok) await refresh(id); return r; }, [refresh]);
  const remove = useCallback(async (id: string) => { const r = await leadRpc('campaign_delete', { _campaign_id: id }); if (r.ok) await refresh(); return r; }, [refresh]);
  /** Adds in chunks of the server's own limit (500); the totals are summed. */
  const addLeads = useCallback(async (id: string, leadIds: string[]) => {
    let moved = 0; let unchanged = 0; const skipped: Record<string, number> = {};
    for (let i = 0; i < leadIds.length; i += 500) {
      const r = await leadRpc('campaign_add_leads', { _campaign_id: id, _lead_ids: leadIds.slice(i, i + 500) });
      if (!r.ok) { await refresh(id); return r; }
      moved += Number(r.moved ?? 0); unchanged += Number(r.unchanged ?? 0);
      for (const [k, n] of Object.entries((r.skipped ?? {}) as Record<string, number>)) skipped[k] = (skipped[k] ?? 0) + n;
    }
    await refresh(id);
    return { ok: true, moved, unchanged, skipped } as RpcResult;
  }, [refresh]);
  /** Launch: one call; the server walks every new lead of the campaign through the queue's safeguards. */
  const launch = useCallback(async (id: string) => { const r = await leadRpc('campaign_launch', { _campaign_id: id }); await refresh(id); return r; }, [refresh]);
  const stop = useCallback(async (id: string) => { const r = await leadRpc('campaign_stop', { _campaign_id: id }); await refresh(id); return r; }, [refresh]);

  return { nameAvailable, create, rename, remove, addLeads, launch, stop, refresh };
}
