import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSubscription } from '@/hooks/useSubscription';

/* AM I READY TO SELL? — the signed-in salesperson's own onboarding status (2026-10-05,
   docs/salesperson-onboarding.md). Reads public.my_onboarding_status(): ready + the missing keys only —
   never a date, version or piece of evidence, never anyone else's.
   ⛔ PRESENTATION. The server refuses every sales action of a not-ready salesperson whatever this says.
   ⛔ FAILS CLOSED for a salesperson: a failed read hides sales actions and says it could not check.
   The admin is never gated (no read at all). */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export interface MyReadiness {
  /** False for the admin (never gated). */
  gated: boolean;
  ready: boolean;
  missing: string[];
  teamGuide: { id: string; label: string } | null;
  loading: boolean;
  failed: boolean;
  acknowledgeTeamGuide: () => Promise<{ ok: boolean; error?: string }>;
}

export function useMyReadiness(): MyReadiness {
  const { role } = useSubscription();
  const qc = useQueryClient();
  const isSales = role === 'sales';
  const q = useQuery({
    queryKey: ['my-readiness'],
    enabled: isSales,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await sb.rpc('my_onboarding_status');
      if (error) throw new Error(String(error.message ?? error));
      return data as { ready: boolean; missing: string[]; team_guide: { id: string; label: string } | null };
    },
  });
  const acknowledgeTeamGuide = async () => {
    const { data, error } = await sb.rpc('my_acknowledge_team_guide');
    if (error) return { ok: false, error: String(error.message ?? error) };
    await qc.invalidateQueries({ queryKey: ['my-readiness'] });
    return (data ?? { ok: false }) as { ok: boolean; error?: string };
  };
  if (!isSales) return { gated: false, ready: true, missing: [], teamGuide: null, loading: false, failed: false, acknowledgeTeamGuide };
  return {
    gated: true,
    ready: q.data?.ready === true,
    missing: q.data?.missing ?? [],
    teamGuide: q.data?.team_guide ?? null,
    loading: q.isLoading,
    failed: q.isError,
    acknowledgeTeamGuide,
  };
}
