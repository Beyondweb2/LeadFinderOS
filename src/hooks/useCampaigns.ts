import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// description/method aren't in the generated types until the JOB 1 migration is
// applied + types regenerated, so campaign reads/writes go through an untyped
// client (same pattern as the site-tracking columns in useDashboardMetrics).
const db = supabase as unknown as SupabaseClient;

/** What a campaign sells — drives which metrics its dashboard card shows.
 *  'audit' = the audit→pitch→pay funnel; 'site' = the legacy barber-site flow;
 *  'service' = generic (future app/service sells). */
export type CampaignType = 'audit' | 'site' | 'service';
export const CAMPAIGN_TYPE_OPTIONS: { value: CampaignType; label: string }[] = [
  { value: 'audit', label: 'Audit (report → pitch → pay)' },
  { value: 'site', label: 'Site (barber demo-site flow)' },
  { value: 'service', label: 'Service (generic sell)' },
];

export interface Campaign {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  default_sale_type: string | null;
  description: string | null;
  method: string | null;
  default_template: string | null;
  campaign_type: CampaignType | null; // null/unknown → treated as 'audit'
  /* ⛔ WHICH TRADE THIS CAMPAIGN IS FOR — a src/lib/trades.ts slug, set by hand in campaign
     settings so leads added from Coverage and the market view land in the right place.
     NULL = nobody has said yet, which is NOT "for no trade": the add path falls back to the
     selected campaign and says so. Never inferred from `name` — only 4 of 12 names resolve, and a
     rename must not move leads. */
  trade_slug: string | null;
  /** Sales workspace v2: the niche, the optional area, and set when the campaign was deleted (archived). */
  trade?: string | null;
  area?: string | null;
  archived_at?: string | null;
}

export interface CampaignInput {
  name: string;
  description?: string | null;
  method?: string | null;
  default_sale_type?: string | null;
  default_template?: string | null;
  campaign_type?: CampaignType | null;
  /** Optional so an existing caller that never mentions it cannot blank an already-set trade. */
  trade_slug?: string | null;
}

// select('*') rather than a fixed column list: reads keep working whether or not the
// campaign_type migration has been applied (the column simply comes back undefined
// pre-migration and the UI falls back to 'audit'). Writes DO name campaign_type — a
// pre-migration create/edit surfaces the missing-column error in its toast, which is
// the honest signal to run the migration.
const CAMPAIGN_COLS = '*';

/**
 * Thin campaigns hook. ⛔ Since 2026-10-03 campaigns are PRIVATE: RLS returns the admin every campaign and a
 * salesperson only their own (created_by). Direct writes here are admin-only (restrictive policies); a
 * salesperson creates and manages through the campaign_* functions (src/hooks/useMyCampaigns.ts).
 */
/** Stable empty — a fresh array per render re-runs every picker's memo. */
const EMPTY_CAMPAIGNS: Campaign[] = [];

export function useCampaigns() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  /* ⛔ ONE SHARED LIST, WHICH IS WHAT THE window EVENT WAS FAKING. The old comment here said it
     plainly: "useCampaigns has NO shared store — every caller (page, picker, dialog) holds its
     own list", so creating a campaign in one instance left the others stale, and Find Leads'
     self-heal effect would see the brand-new id as unknown and reset the selection to "No
     campaign". The workaround was a 'campaign-created' CustomEvent that every instance listened
     for and appended from. React Query IS the shared store, so the event, its listener and the
     dedupe-on-append are all deleted — verified first that nothing outside this file listened
     for it.
     ⚠️ 'campaign-deleted' STAYS. Outreach.tsx listens for it to refetch its leads and show "No
     campaign" immediately; that is cross-FEATURE signalling, not the self-sync this replaces.
     ⚠️ KEYED BY USER since 2026-10-03: RLS returns a different list to each person (the admin all, a salesperson
     their own), so one cache shared across a sign-out/sign-in would show the last person's campaigns. */
  const queryKey = useMemo(() => ['campaigns', user?.id ?? 'anon'] as const, [user?.id]);

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<Campaign[]> => {
      const { data, error } = await db
        .from('campaigns')
        .select(CAMPAIGN_COLS)
        .order('created_at', { ascending: true });
      /* ⛔ THROWS RATHER THAN LOGGING AND LEAVING THE LIST EMPTY. An empty campaign list and a
         failed read look the same on a picker, and the second one silently offers "No campaign"
         as the only option — which is how a lead lands unassigned. */
      if (error) throw new Error(error.message);
      return (data || []) as Campaign[];
    },
  });

  /* Every row RLS lets this person read (names for history), and the LIVE ones every picker offers: an
     archived (deleted) campaign is never offered, so nothing new can join it. */
  const allCampaigns = query.data ?? EMPTY_CAMPAIGNS;
  const campaigns = useMemo(() => (query.data ? query.data.filter((c) => !c.archived_at) : EMPTY_CAMPAIGNS), [query.data]);
  const isLoading = query.isPending;

  const refetch = useCallback(
    () => { void queryClient.invalidateQueries({ queryKey }); },
    [queryClient, queryKey],
  );

  /* ⛔ SALES WORKSPACE V2 (2026-10-05): the direct create / update / DELETE writes are gone. The delete was a
     hard delete (lead_claims cascade with it); every campaign write now goes through the role-checked
     functions (campaign_new / campaign_update / campaign_archive, src/hooks/useMyCampaigns.ts), and a deleted
     campaign is archived — its leads and history stay. */
  return { campaigns, allCampaigns, isLoading, refetch };
}
