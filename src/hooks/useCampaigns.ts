import { useState, useEffect, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

// description/method aren't in the generated types until the JOB 1 migration is
// applied + types regenerated, so campaign reads/writes go through an untyped
// client (same pattern as the site-tracking columns in useDashboardMetrics).
const db = supabase as unknown as SupabaseClient;

export interface Campaign {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  default_sale_type: string | null;
  description: string | null;
  method: string | null;
}

export interface CampaignInput {
  name: string;
  description?: string | null;
  method?: string | null;
  default_sale_type?: string | null;
}

const CAMPAIGN_COLS = 'id, name, created_by, created_at, default_sale_type, description, method';

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
      })
      .select(CAMPAIGN_COLS)
      .single();

    if (error) {
      toast({ title: 'Could not create campaign', description: error.message, variant: 'destructive' });
      return null;
    }

    const created = data as Campaign;
    setCampaigns((prev) => [...prev, created]);
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

  return { campaigns, isLoading, createCampaign, updateCampaign, refetch: fetchCampaigns };
}
