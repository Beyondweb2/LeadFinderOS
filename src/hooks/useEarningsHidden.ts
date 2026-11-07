import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { viewerEarningsHidden } from '@/lib/teamAccounts';

/* HIDE EARNINGS (2026-11-07, src/lib/teamAccounts.ts is the rule). The switch lives in the person's app_metadata, which the
   session's token only picks up on its next refresh — so the account is read fresh from the auth server (getUser), once a
   minute at most. A salesperson's money stays hidden until that read answers (viewerEarningsHidden). Display only. */
export function useEarningsHidden(): boolean {
  const { role } = useSubscription();
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ['me', 'app-metadata', user?.id ?? null],
    enabled: role === 'sales' && !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw error ?? new Error('no user');
      return (data.user.app_metadata ?? {}) as Record<string, unknown>;
    },
  });
  return viewerEarningsHidden(role, q.data ?? null);
}
