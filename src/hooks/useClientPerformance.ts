import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type {
  DateWindow,
  FinalTotals,
  PageRow,
  PerformancePeriod,
  PerformanceState,
} from '@/lib/searchPerformance';

/* ══ THE PERFORMANCE READ (2026-09-22, Phase 1) ════════════════════════════════════════════════
   One React Query hook over the client-performance edge function. Everything arrives pre-folded:
   the browser receives totals, never daily rows, so a 90-day view is the same payload size as a
   7-day one.

   ⛔ The period is part of the query key. It is not a client-side filter over a cached superset —
      the previous-period comparison is computed server-side against the matching window, so
      "28 days" and "90 days" are different answers to different questions, not two slices of one. */

export interface PerformanceConnection {
  status: string | null;
  gsc_property: string | null;
  last_synced_at: string | null;
  last_sync_error: string | null;
  last_sync_row_count: number | null;
}

export interface PerformanceQueryRow {
  query: string;
  url: string;
  pageLabel: string;
  tracked: boolean;
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
}

export interface PerformancePayload {
  client: {
    lead_id: string;
    business_name: string;
    website: string | null;
    canonical_domain: string | null;
    town: string | null;
  };
  connection: PerformanceConnection | null;
  state: PerformanceState;
  period: PerformancePeriod;
  windows: { current: DateWindow; previous: DateWindow };
  coverage: { first_date: string | null; last_date: string | null; row_count: number };
  overview: { current: FinalTotals; previous: FinalTotals };
  pages: PageRow[];
  queries: PerformanceQueryRow[];
  tracked_count: number;
  untracked_count: number;
}

export function useClientPerformance(leadId: string, period: PerformancePeriod) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['client-performance', user?.id ?? null, leadId, period] as const,
    enabled: !!user && !!leadId,
    // Daily data. Refetching it on every focus spends an edge invocation to redraw the same
    // numbers; a sync only ever lands once a night.
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<PerformancePayload> => {
      const { data, error } = await supabase.functions.invoke('client-performance', {
        body: { lead_id: leadId, period },
      });
      // supabase-js errors are plain objects — String(e) is "[object Object]". Read .message.
      if (error) throw new Error(error.message || 'Could not load performance');
      if (!data?.ok) throw new Error(data?.error || 'Could not load performance');
      return data as PerformancePayload;
    },
  });
}
