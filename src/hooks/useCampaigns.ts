import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

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
 * Thin campaigns hook. Campaigns are a team-readable grouping concept:
 * any authenticated user sees the whole list; anyone can create one; only the
 * creator can edit theirs (enforced by RLS).
 */
/** Stable empty — a fresh array per render re-runs every picker's memo. */
const EMPTY_CAMPAIGNS: Campaign[] = [];

export function useCampaigns() {
  const { user } = useAuth();
  const { toast } = useToast();
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
     ⚠️ NOT keyed by user: campaigns are team-readable by design (any authenticated user sees the
     whole list; RLS restricts only who may edit). Keying by user would cache the same shared
     list once per account. */
  const queryKey = useMemo(() => ['campaigns'] as const, []);

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

  const campaigns = query.data ?? EMPTY_CAMPAIGNS;
  const isLoading = query.isPending;

  const refetch = useCallback(
    () => { void queryClient.invalidateQueries({ queryKey }); },
    [queryClient, queryKey],
  );

  /* Each mutation has the authoritative row back from `.select().single()`, so the shared list
     is patched with what the database stored and then invalidated. One helper, so the three
     cannot drift. */
  const patchCache = useCallback(async (fn: (prev: Campaign[]) => Campaign[]) => {
    queryClient.setQueryData<Campaign[]>(queryKey, (prev) => fn(prev ?? EMPTY_CAMPAIGNS));
    await queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  const createCampaign = useCallback(async (input: CampaignInput): Promise<Campaign | null> => {
    const trimmed = input.name.trim();
    if (!trimmed) return null;
    if (!user) {
      toast({ title: 'Not authenticated', description: 'Please log in to create a campaign.', variant: 'destructive' });
      return null;
    }

    const { data, error } = await db
      .from('campaigns')
      .insert({
        name: trimmed,
        created_by: user.id,
        default_sale_type: input.default_sale_type ?? null,
        description: input.description?.trim() || null,
        method: input.method || null,
        default_template: input.default_template ?? null,
        campaign_type: input.campaign_type ?? 'audit',
      })
      .select(CAMPAIGN_COLS)
      .single();

    if (error) {
      toast({ title: 'Could not create campaign', description: error.message, variant: 'destructive' });
      return null;
    }

    const created = data as Campaign;
    /* ⛔ AWAITED, AND THAT ORDERING IS THE POINT THE DELETED EVENT WAS MAKING. The picker's
       onChange sets the new id as selected right after this resolves; if the shared list did not
       already contain it, a consumer validating the id against the list treats it as unknown and
       resets the selection to "No campaign". The event existed to win that race — the cache write
       wins it directly. */
    await patchCache((prev) => [...prev, created]);
    return created;
  }, [user, toast, patchCache]);

  const updateCampaign = useCallback(async (id: string, patch: CampaignInput): Promise<Campaign | null> => {
    const trimmed = patch.name.trim();
    if (!trimmed) return null;

    const { data, error } = await db
      .from('campaigns')
      .update({
        name: trimmed,
        default_sale_type: patch.default_sale_type ?? null,
        description: patch.description?.trim() || null,
        method: patch.method || null,
        default_template: patch.default_template ?? null,
        campaign_type: patch.campaign_type ?? 'audit',
      })
      .eq('id', id)
      .select(CAMPAIGN_COLS)
      .single();

    if (error) {
      toast({ title: 'Could not save campaign', description: error.message, variant: 'destructive' });
      return null;
    }

    const updated = data as Campaign;
    await patchCache((prev) => prev.map((c) => (c.id === id ? updated : c)));
    return updated;
  }, [toast, patchCache]);

  /**
   * Delete a campaign. The outreach_leads.campaign_id FK is ON DELETE SET NULL, so
   * its leads are simply UNASSIGNED (moved to "No campaign") — never deleted. The
   * per-campaign lead_claims (teammate assignments) are removed (ON DELETE CASCADE).
   * Emits 'campaign-deleted' so the leads view can refetch and show "No campaign"
   * immediately. RLS allows this only for the campaign's creator.
   */
  const deleteCampaign = useCallback(async (id: string): Promise<boolean> => {
    const { error } = await db.from('campaigns').delete().eq('id', id);
    if (error) {
      toast({ title: 'Could not delete campaign', description: error.message, variant: 'destructive' });
      return false;
    }
    await patchCache((prev) => prev.filter((c) => c.id !== id));
    /* KEPT: Outreach.tsx listens for this to refetch its leads and show them as "No campaign"
       immediately. Cross-feature, not the self-sync the created event was doing. */
    window.dispatchEvent(new CustomEvent('campaign-deleted', { detail: { id } }));
    return true;
  }, [toast, patchCache]);

  return { campaigns, isLoading, createCampaign, updateCampaign, deleteCampaign, refetch };
}
