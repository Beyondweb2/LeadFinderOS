import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isIdentityState, type IdentityState } from '@/lib/salesCrm';
import { leadRpc, salesQueueOpener, type RpcResult } from '@/lib/leadRpc';

/* SALES CRM DATA (multi-user, 2026-09-27).
 *
 * ⛔ EVERY READ HERE IS SCOPED BY THE SERVER, NOT BY A FILTER IN THIS FILE. sales_leads returns only
 * the caller's assigned prospects (the admin: every prospect); lead_activity's RLS returns only
 * activity on leads the caller may work; the RPCs check role and assignment themselves. Nothing in
 * this file can widen what a salesperson sees — a missing `.eq()` here would change nothing.
 *
 * The generated types lag the database (INVENTORY §5), so the new view, table and functions are
 * called through `as never` — the shapes are declared locally below. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export interface TeamMember { user_id: string; display_name: string; role: 'admin' | 'sales' | null; status: string; avatar_url: string | null }
export interface LeadActivity { id: string; lead_id: string; actor_user_id: string | null; kind: string; body: string | null; data: Record<string, unknown>; created_at: string }
export interface PoolLead { id: string; business_name: string; trade: string | null; town: string | null; website: string | null; rating: number | null; review_count: number | null; has_phone: boolean; created_at: string }
export interface IdentityHit { k: string; lead_id: string | null; state: IdentityState; owner_id: string | null; owner_name: string | null; added_at: string | null }

export const salesKeys = {
  pool: (q: string, page: number) => ['sales', 'pool', q, page] as const,
  team: ['sales', 'team'] as const,
  activity: (leadId: string | undefined) => ['sales', 'activity', leadId] as const,
};

export function useSalesPool(q: string, page: number, pageSize = 50) {
  return useQuery({
    queryKey: salesKeys.pool(q, page),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await sb.rpc('sales_pool', { _q: q, _limit: pageSize, _offset: page * pageSize });
      if (error) throw error;
      return (data ?? []) as PoolLead[];
    },
  });
}

/** Team names + avatars for owner markers. Any role may read it (names only). */
export function useTeamDirectory() {
  const q = useQuery({
    queryKey: salesKeys.team,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await sb.rpc('team_directory');
      if (error) throw error;
      return (data ?? []) as TeamMember[];
    },
  });
  const byId = useMemo(() => new Map((q.data ?? []).map((m) => [m.user_id, m])), [q.data]);
  return { ...q, byId };
}

export function useLeadActivity(leadId: string | undefined) {
  return useQuery({
    queryKey: salesKeys.activity(leadId),
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await sb.from('lead_activity').select('id, lead_id, actor_user_id, kind, body, data, created_at')
        .eq('lead_id', leadId).order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as LeadActivity[];
    },
  });
}

/** Find Leads: the ownership state of up to 500 search results in one call. */
export async function lookupIdentities(items: Array<{ k: string; place_id?: string | null; phone?: string | null; maps_url?: string | null }>): Promise<Map<string, IdentityHit>> {
  const out = new Map<string, IdentityHit>();
  for (let i = 0; i < items.length; i += 500) {
    const { data, error } = await sb.rpc('lead_identity_lookup', { _items: items.slice(i, i + 500) });
    if (error) throw error;
    for (const r of (data ?? []) as IdentityHit[]) {
      if (r && typeof r.k === 'string' && isIdentityState(r.state)) out.set(r.k, r);
    }
  }
  return out;
}

/* One RPC caller for every lead function (src/lib/leadRpc.ts). */
const rpc = leadRpc;

/** Every CRM write. Each invalidates what it changed; none of them sends anything. */
export function useSalesActions() {
  const qc = useQueryClient();
  const touch = (leadId?: string) => {
    void qc.invalidateQueries({ queryKey: ['sales'] });
    if (leadId) void qc.invalidateQueries({ queryKey: salesKeys.activity(leadId) });
  };
  const m = <A,>(fn: (a: A) => Promise<RpcResult>, leadOf: (a: A) => string | undefined) =>
    useMutation({ mutationFn: fn, onSuccess: (_r, a) => touch(leadOf(a)) });

  return {
    claim: m((a: { leadId: string }) => rpc('claim_lead', { _lead_id: a.leadId }), (a) => a.leadId),
    addLead: m((a: { lead: Record<string, unknown> }) => rpc('sales_add_lead', { _lead: a.lead }), () => undefined),
    note: m((a: { leadId: string; body: string }) => rpc('lead_add_note', { _lead_id: a.leadId, _body: a.body }), (a) => a.leadId),
    stage: m((a: { leadId: string; status: string }) => rpc('lead_set_stage', { _lead_id: a.leadId, _status: a.status }), (a) => a.leadId),
    followUp: m((a: { leadId: string; nextAction: string; date: string | null; note: string | null }) =>
      rpc('lead_set_follow_up', { _lead_id: a.leadId, _next_action: a.nextAction, _date: a.date, _note: a.note }), (a) => a.leadId),
    callBooked: m((a: { leadId: string; at: string | null }) => rpc('lead_set_call_booked', { _lead_id: a.leadId, _at: a.at }), (a) => a.leadId),
    call: m((a: { leadId: string; outcome: string; note: string | null }) =>
      rpc('lead_record_call', { _lead_id: a.leadId, _outcome: a.outcome, _note: a.note }), (a) => a.leadId),
    websiteControl: m((a: { leadId: string; value: string | null; note: string | null }) =>
      rpc('lead_set_website_control', { _lead_id: a.leadId, _value: a.value, _note: a.note }), (a) => a.leadId),
    /** Bulk initial outreach with THE TEMPLATE CHOSEN FOR THIS BATCH (no global selected opener). */
    queueOpener: m((a: { leadIds: string[]; template: string }) => salesQueueOpener(a.leadIds, a.template), () => undefined),
    /** Admin only — the server refuses anyone else. */
    assign: m((a: { leadId: string; to: string | null }) => rpc('assign_lead', { _lead_id: a.leadId, _to_user_id: a.to }), (a) => a.leadId),
  };
}
