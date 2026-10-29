import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdge } from '@/lib/edgeInvoke';
import { fetchAllRows } from '@/lib/fetchAllRows';
import type { NamedContact, WaNumber } from '@/lib/ugc/normalize';
import type { PitchLogRow } from '@/lib/ugc/pitchLog';
import type { TemplateKey } from '@/lib/ugc/pitch';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   The UGC Brand Finder's reads and writes (docs/ugc-brand-finder.md). Everything is ugc_* only — never a
   Findable table. RLS decides what is visible (a member: their own rows; the admin: theirs too, but NOT her
   private pitch system or pitch log). Paid work goes through fn ugc-brands; contact logging through the
   ugc_log_contact function, which enforces one active channel per brand.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

// The ugc_* tables are newer than the generated types: read them through an untyped handle.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface UgcAccess { member: boolean; admin: boolean; display_name: string | null; sender_email: string | null }
export interface UgcState { owner: string; member: boolean; admin: boolean; budgetUsd: number; spentThisMonthUsd: number; apifyPct: number | null; pitchWriter: string }

export interface UgcBrand {
  id: string; owner_user_id: string; brand_key: string; name: string; website: string | null; domain: string | null;
  facebook_url: string | null; instagram_url: string | null; linktree_url: string | null; contact_form_url: string | null;
  emails: string[]; wa_numbers: WaNumber[]; phones: string[]; named_contacts: NamedContact[]; enriched_at: string | null;
  niche: string | null; country: string | null; sources: string[]; live_ads_count: number;
  ad_samples: { text?: string; link?: string; started?: string }[]; ad_start_dates: string[]; creators_seen: string[];
  page_created_at: string | null; admin_countries: string[]; shop_links: string[]; has_about_page: boolean | null; has_address: boolean | null;
  research: { snippets?: string[]; product?: string; product_detail?: string; detail_url?: string; pays_for_ugc_evidence?: string };
  track: 'brand' | 'local'; tier_override: string | null; status: string; active_channel: string | null;
  first_contacted_at: string | null; checked_sent_mail_at: string | null; checked_linkedin_at: string | null; follow_ups_sent: number; notes: string | null; todo: string | null; todo_on: string | null;
  pitch_subject: string | null; pitch_body: string | null; pitch_writer: string | null; pitch_written_at: string | null;
  pitch_working: Record<string, unknown>; pitch_attempts: number; last_contacted_at: string | null; last_contacted_via: string | null;
  created_at: string; updated_at: string;
}
export interface UgcRun {
  id: string; source: string; item_cap: number; est_cost_usd: number; actual_cost_usd: number | null; status: string;
  items_found: number | null; brands_added: number | null; brands_updated: number | null; error: string | null; created_at: string; finished_at: string | null;
  apify_status?: string;
}
export interface UgcEvent { id: number; kind: string; detail: Record<string, unknown>; created_at: string }
export interface UgcPitchSystem {
  owner_user_id: string; content: string; about_jess: string; rates: string; templates: Partial<Record<TemplateKey, string>>;
  blocked_list: string[]; signoff_html: string; whatsapp_template: string; whatsapp_template_approved: boolean; updated_at?: string;
}

export const UGC_KEYS = {
  access: ['ugc', 'access'] as const,
  state: ['ugc', 'state'] as const,
  brands: ['ugc', 'brands'] as const,
  runs: ['ugc', 'runs'] as const,
  events: (id: string) => ['ugc', 'events', id] as const,
  system: ['ugc', 'pitch-system'] as const,
  log: ['ugc', 'pitch-log'] as const,
};

export function useUgcAccess(enabled = true) {
  return useQuery({
    queryKey: UGC_KEYS.access,
    enabled,
    queryFn: async (): Promise<UgcAccess> => {
      const { data, error } = await db.rpc('ugc_my_access');
      if (error) throw error;
      return { member: data?.member === true, admin: data?.admin === true, display_name: data?.display_name ?? null, sender_email: data?.sender_email ?? null };
    },
    staleTime: 5 * 60_000,
  });
}

export function useUgcState(enabled = true) {
  return useQuery({ queryKey: UGC_KEYS.state, enabled, queryFn: () => invokeEdge<UgcState>('ugc-brands', { action: 'state' }) });
}

export function useUgcBrands() {
  return useQuery({
    queryKey: UGC_KEYS.brands,
    queryFn: async () => (await fetchAllRows<UgcBrand>('ugc_brands', (from, to) => db.from('ugc_brands').select('*').order('id').range(from, to))).rows,
  });
}

export function useUgcRuns() {
  return useQuery({
    queryKey: UGC_KEYS.runs,
    queryFn: async (): Promise<UgcRun[]> => {
      const { data, error } = await db.from('ugc_runs').select('id, source, item_cap, est_cost_usd, actual_cost_usd, status, items_found, brands_added, brands_updated, error, created_at, finished_at').order('created_at', { ascending: false }).limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUgcEvents(brandId: string | null) {
  return useQuery({
    queryKey: UGC_KEYS.events(brandId ?? ''),
    enabled: !!brandId,
    queryFn: async (): Promise<UgcEvent[]> => {
      const { data, error } = await db.from('ugc_brand_events').select('id, kind, detail, created_at').eq('brand_id', brandId).order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Her private pitch system. Owner-only by RLS: the admin reads nothing here. */
export function useUgcPitchSystem(enabled = true) {
  return useQuery({
    queryKey: UGC_KEYS.system,
    enabled,
    queryFn: async (): Promise<UgcPitchSystem | null> => {
      const { data, error } = await db.from('ugc_pitch_system').select('*').maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

export function useUgcPitchLog(enabled = true) {
  return useQuery({
    queryKey: UGC_KEYS.log,
    enabled,
    queryFn: async () => (await fetchAllRows<Pick<PitchLogRow, 'brand_key' | 'brand_name' | 'repitch_ok_from' | 'pitched_on' | 'channel' | 'outcome'>>('ugc_pitch_log',
      (from, to) => db.from('ugc_pitch_log').select('brand_key, brand_name, repitch_ok_from, pitched_on, channel, outcome').order('id').range(from, to))).rows,
  });
}

export type SearchRequest = {
  source: 'fb_ads' | 'creator_collabs' | 'places' | 'google_search';
  niche?: string; country?: string; itemCap: number; keyword?: string; creators?: string[]; placeTypes?: string[]; area?: string;
};

export function useUgcActions() {
  const qc = useQueryClient();
  const refresh = useCallback((...keys: ReadonlyArray<readonly unknown[]>) => { for (const k of keys) void qc.invalidateQueries({ queryKey: k }); }, [qc]);
  return useMemo(() => ({
    estimate: (r: SearchRequest) => invokeEdge<{ ok: boolean; estUsd: number; itemCap: number; refusal: string | null; budgetUsd: number; spentThisMonthUsd: number }>('ugc-brands', { action: 'estimate', ...r }),
    start: async (r: SearchRequest) => { const x = await invokeEdge<{ ok: boolean; run: UgcRun }>('ugc-brands', { action: 'start', ...r }); refresh(UGC_KEYS.runs, UGC_KEYS.state); return x; },
    contacts: async (brandIds: string[], estimateOnly = false) => {
      const x = await invokeEdge<{ ok: boolean; estUsd: number; sites?: number; refusal?: string | null; run?: UgcRun }>('ugc-brands', { action: 'contacts', brandIds, estimateOnly });
      if (!estimateOnly) refresh(UGC_KEYS.runs, UGC_KEYS.state);
      return x;
    },
    namedContacts: async (top: number, estimateOnly = false) => {
      const x = await invokeEdge<{ ok: boolean; estUsd: number; extraUsd?: number; brands?: number; refusal?: string | null; run?: UgcRun }>('ugc-brands', { action: 'named_contacts', top, estimateOnly });
      if (!estimateOnly) refresh(UGC_KEYS.runs, UGC_KEYS.state);
      return x;
    },
    poll: async (runId: string) => {
      const x = await invokeEdge<{ ok: boolean; run: UgcRun }>('ugc-brands', { action: 'poll', runId });
      if (x.run?.status !== 'running') refresh(UGC_KEYS.runs, UGC_KEYS.brands, UGC_KEYS.state);
      return x;
    },
    pitch: async (brandId: string) => {
      const x = await invokeEdge<{ ok: boolean; outcome: 'drafted' | 'needs_jess'; why?: string; subject?: string; body?: string; template?: string }>('ugc-brands', { action: 'pitch', brandId });
      refresh(UGC_KEYS.brands, UGC_KEYS.events(brandId));
      return x;
    },
    /** One active channel per brand: the database refuses a second channel ('other_channel_active'). */
    logContact: async (brandId: string, via: 'email' | 'instagram' | 'whatsapp', kind: 'pitch' | 'follow_up_1' | 'follow_up_2' | 'ask_who' = 'pitch') => {
      const { data, error } = await db.rpc('ugc_log_contact', { _brand: brandId, _via: via, _kind: kind });
      if (error) throw error;
      refresh(UGC_KEYS.brands, UGC_KEYS.events(brandId));
      return data as { ok: boolean; error?: string; active_channel?: string };
    },
    releaseChannel: async (brandId: string, reason: string) => {
      const { data, error } = await db.rpc('ugc_release_channel', { _brand: brandId, _reason: reason });
      if (error) throw error;
      refresh(UGC_KEYS.brands, UGC_KEYS.events(brandId));
      return data as { ok: boolean; error?: string };
    },
    updateBrand: async (b: Pick<UgcBrand, 'id' | 'owner_user_id'>, patch: Partial<Pick<UgcBrand, 'status' | 'notes' | 'todo' | 'todo_on' | 'tier_override' | 'checked_sent_mail_at' | 'checked_linkedin_at'>>, kind: 'status' | 'note' | 'todo' | 'check') => {
      const { error } = await db.from('ugc_brands').update(patch).eq('id', b.id);
      if (error) throw error;
      const { data: u } = await supabase.auth.getUser();
      await db.from('ugc_brand_events').insert({ brand_id: b.id, owner_user_id: b.owner_user_id, kind, detail: patch, created_by: u.user?.id });
      refresh(UGC_KEYS.brands, UGC_KEYS.events(b.id));
    },
    savePitchSystem: async (ownerId: string, patch: Partial<UgcPitchSystem>) => {
      const { error } = await db.from('ugc_pitch_system').upsert({ owner_user_id: ownerId, ...patch }, { onConflict: 'owner_user_id' });
      if (error) throw error;
      refresh(UGC_KEYS.system);
    },
    importPitchLog: async (ownerId: string, rows: PitchLogRow[]) => {
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await db.from('ugc_pitch_log').upsert(rows.slice(i, i + 500).map((r) => ({ owner_user_id: ownerId, ...r })), { onConflict: 'owner_user_id,brand_key,pitched_on', ignoreDuplicates: true });
        if (error) throw error;
      }
      refresh(UGC_KEYS.log);
    },
    createMember: (a: { name: string; email: string; sender_email: string; password: string }) => invokeEdge<{ ok: boolean; user_id: string }>('ugc-brands', { action: 'create_member', ...a }),
  }), [refresh]);
}
