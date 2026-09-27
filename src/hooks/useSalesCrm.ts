import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { useAuth } from '@/hooks/useAuth';
import { isIdentityState, type IdentityState, type SalesLeadRow } from '@/lib/salesCrm';

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

export const SALES_LEAD_COLUMNS =
  'id, business_name, phone, email, website, google_maps_url, address, category, status, next_action, next_action_date, ' +
  'next_action_note, call_booked_at, created_at, updated_at, country, is_archived, place_id, whatsapp_sent_at, ' +
  'whatsapp_delivery_status, whatsapp_template, queued_at, contact_name, search_keyword, search_location, derived_town, ' +
  'rating, review_count, line_type, assigned_to_user_id, assigned_at, added_by_user_id, website_control, website_control_note';

export interface SalesLead extends SalesLeadRow {
  phone: string | null;
  email: string | null;
  website: string | null;
  google_maps_url: string | null;
  address: string | null;
  category: string | null;
  country: string | null;
  place_id: string | null;
  whatsapp_delivery_status: string | null;
  whatsapp_template: string | null;
  queued_at: string | null;
  contact_name: string | null;
  search_keyword: string | null;
  search_location: string | null;
  derived_town: string | null;
  rating: number | null;
  review_count: number | null;
  line_type: string | null;
  assigned_to_user_id: string | null;
  assigned_at: string | null;
  added_by_user_id: string | null;
  website_control: string | null;
  website_control_note: string | null;
}

export interface TeamMember { user_id: string; display_name: string; role: 'admin' | 'sales' | null; status: string; avatar_url: string | null }
export interface LeadActivity { id: string; lead_id: string; actor_user_id: string | null; kind: string; body: string | null; data: Record<string, unknown>; created_at: string }
export interface PoolLead { id: string; business_name: string; trade: string | null; town: string | null; website: string | null; rating: number | null; review_count: number | null; has_phone: boolean; created_at: string }
export interface IdentityHit { k: string; lead_id: string | null; state: IdentityState; owner_id: string | null; owner_name: string | null; added_at: string | null }

export const salesKeys = {
  myLeads: (uid: string | undefined) => ['sales', 'my-leads', uid] as const,
  lead: (id: string | undefined) => ['sales', 'lead', id] as const,
  pool: (q: string, page: number) => ['sales', 'pool', q, page] as const,
  team: ['sales', 'team'] as const,
  activity: (leadId: string | undefined) => ['sales', 'activity', leadId] as const,
  recent: (uid: string | undefined) => ['sales', 'recent', uid] as const,
};

/** The caller's leads (sales: assigned to them; admin: every prospect). Paginated past 1,000. */
export function useMyLeads() {
  const { user } = useAuth();
  return useQuery({
    queryKey: salesKeys.myLeads(user?.id),
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { rows } = await fetchAllRows<SalesLead>('My leads', (from, to) =>
        sb.from('sales_leads').select(SALES_LEAD_COLUMNS)
          .eq('assigned_to_user_id', user!.id)
          .order('updated_at', { ascending: false }).order('id', { ascending: true }).range(from, to));
      return rows;
    },
  });
}

export function useSalesLead(leadId: string | undefined) {
  return useQuery({
    queryKey: salesKeys.lead(leadId),
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await sb.from('sales_leads').select(SALES_LEAD_COLUMNS).eq('id', leadId).maybeSingle();
      if (error) throw error;
      return (data as SalesLead | null) ?? null;
    },
  });
}

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

/** The caller's own recent actions (RLS already limits the rows to leads they may work). */
export function useRecentActivity(limit = 20) {
  const { user } = useAuth();
  return useQuery({
    queryKey: salesKeys.recent(user?.id),
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await sb.from('lead_activity').select('id, lead_id, actor_user_id, kind, body, data, created_at')
        .eq('actor_user_id', user!.id).order('created_at', { ascending: false }).limit(limit);
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

type RpcResult = { ok: boolean; error?: string; [k: string]: unknown };

async function rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> {
  const { data, error } = await sb.rpc(name, args);
  if (error) {
    /* A raised refusal (no_role, not_your_lead, admin_only) arrives as an error whose message IS the code. */
    return { ok: false, error: String(error.message ?? error) };
  }
  return (data ?? { ok: false, error: 'empty_response' }) as RpcResult;
}

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
    queueOpener: m((a: { leadIds: string[] }) => rpc('sales_queue_opener', { _lead_ids: a.leadIds }), () => undefined),
    /** Admin only — the server refuses anyone else. */
    assign: m((a: { leadId: string; to: string | null }) => rpc('assign_lead', { _lead_id: a.leadId, _to_user_id: a.to }), (a) => a.leadId),
  };
}
