import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export interface Campaign {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  default_sale_type: string | null;
}

/**
 * Thin campaigns hook. Campaigns are a team-readable grouping concept:
 * any authenticated user sees the whole list; anyone can create one.
 */
export function useCampaigns() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCampaigns = useCallback(async () => {
    const { data, error } = await supabase
      .from('campaigns')
      .select('id, name, created_by, created_at, default_sale_type')
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

  const createCampaign = useCallback(async (name: string, defaultSaleType: string | null = null): Promise<Campaign | null> => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    if (!user) {
      toast({ title: 'Not authenticated', description: 'Please log in to create a campaign.', variant: 'destructive' });
      return null;
    }

    const { data, error } = await supabase
      .from('campaigns')
      .insert({ name: trimmed, created_by: user.id, default_sale_type: defaultSaleType })
      .select('id, name, created_by, created_at, default_sale_type')
      .single();

    if (error) {
      toast({ title: 'Could not create campaign', description: error.message, variant: 'destructive' });
      return null;
    }

    const created = data as Campaign;
    setCampaigns((prev) => [...prev, created]);
    return created;
  }, [user, toast]);

  return { campaigns, isLoading, createCampaign, refetch: fetchCampaigns };
}
