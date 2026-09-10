import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface CheckedBusiness {
  business_name: string;
  google_maps_url: string | null;
}

/** Stable empty, so `isChecked` and every consumer memo keep one identity between loads. */
const EMPTY: CheckedBusiness[] = [];

/* ════════════════════════════════════════════════════════════════════════════════════════════
   BUSINESSES ALREADY LOOKED AT — on React Query since 2026-09-10.

   Re-read the whole table on every arrival at Find Leads and threw it away on navigation.

   ⛔ THE MUTATION APPENDS TO THE CACHE AND THEN INVALIDATES. The appended row is exactly what
   was just inserted, so the tick appears with no round trip; the invalidate is what makes the
   next read authoritative. Optimistic-only would leave a business ticked on screen that the
   database refused.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
export function useCheckedBusinesses() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['checked-businesses', user?.id ?? null] as const, [user?.id]);

  const query = useQuery({
    queryKey,
    enabled: !!user,
    queryFn: async (): Promise<CheckedBusiness[]> => {
      const { data, error } = await supabase
        .from('checked_businesses')
        .select('business_name, google_maps_url');
      /* ⛔ THROWS RATHER THAN RETURNING []. This list decides whether a business shows as already
         looked at, so a failed read that reads as "nothing is checked" would invite the operator
         to work through businesses they have already done. React Query keeps the last good list
         alongside the error, which is the honest state. The previous version logged and returned,
         silently leaving the list empty on first load. */
      if (error) throw new Error(error.message);
      return (data ?? []) as CheckedBusiness[];
    },
  });

  const checkedBusinesses = query.data ?? EMPTY;

  /** One rule for "have we seen this before", used by both the guard and the lookup so they
   *  cannot disagree about what counts as a match. */
  const matches = useCallback(
    (b: CheckedBusiness, businessName: string, googleMapsUrl?: string) =>
      b.business_name === businessName || (!!googleMapsUrl && b.google_maps_url === googleMapsUrl),
    [],
  );

  const isChecked = useCallback(
    (businessName: string, googleMapsUrl?: string): boolean =>
      checkedBusinesses.some((b) => matches(b, businessName, googleMapsUrl)),
    [checkedBusinesses, matches],
  );

  const markAsChecked = useCallback(async (businessName: string, googleMapsUrl?: string) => {
    if (!user) return;

    /* ⚠️ READ THE CACHE, NOT A CAPTURED ARRAY. The old version closed over `checkedBusinesses`
       and listed it as a dependency, so the callback was rebuilt on every load and could still
       be invoked with a stale copy between renders — a duplicate insert on a fast double click.
       getQueryData is read at call time. */
    const current = queryClient.getQueryData<CheckedBusiness[]>(queryKey) ?? EMPTY;
    if (current.some((b) => matches(b, businessName, googleMapsUrl))) return;

    const row: CheckedBusiness = { business_name: businessName, google_maps_url: googleMapsUrl || null };
    const { error } = await supabase
      .from('checked_businesses')
      .insert({ user_id: user.id, ...row });

    if (error) {
      console.error('Error marking business as checked:', error);
      return;
    }

    queryClient.setQueryData<CheckedBusiness[]>(queryKey, (prev) => [...(prev ?? EMPTY), row]);
    await queryClient.invalidateQueries({ queryKey });
  }, [user, queryClient, queryKey, matches]);

  return {
    checkedBusinesses,
    markAsChecked,
    isChecked,
  };
}
