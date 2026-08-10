import { useState, useEffect, useCallback } from 'react';
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
export function useCampaigns() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCampaigns = useCallback(async () => {
    const { data, error } = await db
      .from('campaigns')
      .select(CAMPAIGN_COLS)
      .order('created_at', { ascending: true });

    setIsLoading(false);
    if (error) {
      console.error('Error loading campaigns:', error);
      return;
    }
    setCampaigns((data || []) as Campaign[]);
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // Cross-instance sync: useCampaigns has NO shared store — every caller (page,
  // picker, dialog) holds its own list. When ONE instance creates a campaign, the
  // others stay stale until their next fetch, so anything validating an id against
  // its own list (e.g. Find Leads' self-heal effect) treats the brand-new campaign
  // as unknown and resets the selection to "No campaign". Mirror the existing
  // 'campaign-deleted' event pattern: creation broadcasts the row and every
  // instance appends it (deduped), so all lists agree immediately.
  useEffect(() => {
    const onCreated = (e: Event) => {
      const created = (e as CustomEvent).detail?.campaign as Campaign | undefined;
      if (!created?.id) return;
      setCampaigns((prev) => (prev.some((c) => c.id === created.id) ? prev : [...prev, created]));
    };
    window.addEventListener('campaign-created', onCreated);
    return () => window.removeEventListener('campaign-created', onCreated);
  }, []);

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
    setCampaigns((prev) => [...prev, created]);
    // Sync every other useCampaigns instance BEFORE the picker's deferred
    // onChange sets the new id as selected — see the listener above.
    window.dispatchEvent(new CustomEvent('campaign-created', { detail: { campaign: created } }));
    return created;
  }, [user, toast]);

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
    setCampaigns((prev) => prev.map((c) => (c.id === id ? updated : c)));
    return updated;
  }, [toast]);

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
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
    window.dispatchEvent(new CustomEvent('campaign-deleted', { detail: { id } }));
    return true;
  }, [toast]);

  return { campaigns, isLoading, createCampaign, updateCampaign, deleteCampaign, refetch: fetchCampaigns };
}
