import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { EMPTY_HIDDEN, parseHidden, type DashboardHidden } from '@/lib/dashboardVisibility';

// The table is not in the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

/** The signed-in person's hidden campaigns/templates (their own row only — RLS). Display only. */
export function useDashboardPrefs() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const key = ['dashboard-prefs', user?.id] as const;
  const q = useQuery({
    queryKey: key,
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<DashboardHidden> => {
      const { data, error } = await sb.from('user_preferences').select('dashboard_hidden').eq('user_id', user!.id).maybeSingle();
      if (error) throw error;
      return parseHidden(data?.dashboard_hidden);
    },
  });
  /* Shown at once; a failed save puts the old choice back and says so. */
  const save = useMutation({
    mutationFn: async (next: DashboardHidden) => {
      const { error } = await sb.from('user_preferences')
        .upsert({ user_id: user!.id, dashboard_hidden: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onMutate: async (next) => {
      const before = qc.getQueryData<DashboardHidden>(key);
      qc.setQueryData(key, next);
      return { before };
    },
    onError: (_e, _n, ctx) => {
      qc.setQueryData(key, ctx?.before ?? EMPTY_HIDDEN);
      toast({ title: 'Could not save your dashboard view', description: 'Your change was not kept. Try again.', variant: 'destructive' });
    },
  });
  return { hidden: q.data ?? EMPTY_HIDDEN, loaded: q.isSuccess, setHidden: (next: DashboardHidden) => save.mutate(next) };
}
