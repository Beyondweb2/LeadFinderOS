import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { leadRpc, type RpcResult } from '@/lib/leadRpc';
import type { CampaignMethod, CampaignSummary } from '@/lib/campaignRules';
import { announceQueueChanged, WHATSAPP_QUEUE_KEY } from '@/lib/whatsappQueueView';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   The Campaigns screens' reads and writes — every one a role-checked database function
   (migration 20261006120000). The server decides what this person may see: a salesperson gets only their
   own campaigns, and another owner's campaign answers 'not_found' whatever id is sent. Nothing here filters
   by owner in the browser.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface CampaignFields { name: string; trade: string; method: CampaignMethod; area?: string | null }

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

/** The writes. Each returns the server's answer; the caller words a refusal with campaignErrorText. */
export function useCampaignActions() {
  const qc = useQueryClient();
  const refresh = useCallback(async (id?: string) => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: MY_CAMPAIGNS_KEY }),
      qc.invalidateQueries({ queryKey: ['campaigns'] }), // the pickers' list (useCampaigns)
      ...(id ? [qc.invalidateQueries({ queryKey: ['campaign-detail', id] }), qc.invalidateQueries({ queryKey: ['campaign-leads', id] })] : []),
      qc.invalidateQueries({ queryKey: ['campaign-candidates'] }),
      qc.invalidateQueries({ queryKey: WHATSAPP_QUEUE_KEY }),
    ]);
    /* Leads changed on the server in bulk: Outreach re-reads its list; the queue panel re-reads at once. */
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('campaign-leads-changed'));
    announceQueueChanged();
  }, [qc]);

  const nameAvailable = useCallback((name: string, except?: string) => leadRpc('campaign_name_available', { _name: name, _except: except ?? null }), []);
  /* Sales workspace v2: a campaign is made from four fields (campaign_new) and edited the same way. */
  const create = useCallback(async (f: CampaignFields) => { const r = await leadRpc('campaign_new', { _name: f.name, _trade: f.trade, _method: f.method, _area: f.area || null }); if (r.ok) await refresh(); return r; }, [refresh]);
  const update = useCallback(async (id: string, f: CampaignFields) => { const r = await leadRpc('campaign_update', { _campaign_id: id, _name: f.name, _trade: f.trade, _method: f.method, _area: f.area || null }); if (r.ok) await refresh(id); return r; }, [refresh]);
  /** ⛔ Delete never deletes leads or history: the campaign is archived, its queued openers are paused,
   *  its leads keep their campaign (campaign_archive). */
  const remove = useCallback(async (id: string) => { const r = await leadRpc('campaign_archive', { _campaign_id: id }); if (r.ok) await refresh(); return r; }, [refresh]);
  /** Launch: one call; the server walks every new lead of the campaign through the queue's safeguards. */
  const launch = useCallback(async (id: string) => { const r = await leadRpc('campaign_launch', { _campaign_id: id }); await refresh(id); return r; }, [refresh]);
  const stop = useCallback(async (id: string) => { const r = await leadRpc('campaign_stop', { _campaign_id: id }); await refresh(id); return r; }, [refresh]);

  return { nameAvailable, create, update, remove, launch, stop, refresh };
}
