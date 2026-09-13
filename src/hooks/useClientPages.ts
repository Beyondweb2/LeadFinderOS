import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { pageStatusFor } from '@/lib/deliveryCockpit';

/* ══ THE CLIENT'S PLANNED PAGES, one line each (2026-09-13) ═══════════════════════════════════
   client_pages is the page-plan queue's table (owner RLS policy `for all`, so a browser read and
   a browser status write both work). Read for a SET of leads at once so the Dashboard's client
   card makes one request for every paying client rather than one per client; the cockpit passes a
   single id. "Built" is status = live; the tick flips live ↔ planned directly on the row — the
   page-generator's plan_update action deliberately whitelists only planned/held/removed (it is the
   queue's own controls), so this is the one place a page is marked live, and it is a fact about
   delivery, not about planning.
   ⚠️ client_pages is not in the generated Supabase types for its queue columns (hand-added on
   2026-08-28), so the client is loosely typed — the AiAudit pattern. */

export interface ClientPageLine {
  id: string;
  lead_id: string;
  job: string | null;
  town: string | null;
  service: string | null;
  status: string;
  wave: number | null;
  position: number | null;
}

export function useClientPages(leadIds: readonly string[]) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const ids = useMemo(() => [...new Set(leadIds.filter(Boolean))].sort(), [leadIds]);
  const queryKey = useMemo(() => ['client-pages', user?.id ?? null, ids.join(',')] as const, [user?.id, ids]);

  const query = useQuery({
    queryKey,
    enabled: !!user && ids.length > 0,
    queryFn: async (): Promise<ClientPageLine[]> => {
      const client = supabase as unknown as SupabaseClient;
      const { data, error } = await client
        .from('client_pages')
        .select('id, lead_id, job, town, service, status, wave, position')
        .in('lead_id', ids)
        .order('wave', { ascending: true })
        .order('position', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClientPageLine[];
    },
  });

  const setPageBuilt = useCallback(async (pageId: string, built: boolean): Promise<string | null> => {
    const client = supabase as unknown as SupabaseClient;
    const { error } = await client
      .from('client_pages')
      .update({ status: pageStatusFor(built), updated_at: new Date().toISOString() })
      .eq('id', pageId);
    await queryClient.invalidateQueries({ queryKey: ['client-pages'] });
    return error ? error.message : null;
  }, [queryClient]);

  return { pages: query.data ?? null, isLoading: query.isLoading, error: query.error, setPageBuilt };
}
