import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

/** Stable empty — a fresh Set per render re-runs every consumer's memo. */
const EMPTY: ReadonlySet<string> = new Set<string>();

/* ════════════════════════════════════════════════════════════════════════════════════════════
   WHICH LEADS' PHONE NUMBERS HAVE BEEN COPIED — on React Query since 2026-09-10.

   ⛔ THE `hasFetched` REF WAS DOING SOMETHING WORSE THAN CACHING. It guarded the fetch for the
   LIFETIME OF THE COMPONENT, so the list was read once and then never refreshed — not on a
   refetch call, not after a copy elsewhere, not on returning to the page. And it was set BEFORE
   the await, so a failed read latched it permanently: the hook would report "nothing copied"
   for the rest of the session with no way to recover. React Query holds the list for five
   minutes and can always be invalidated, which is the behaviour the ref was reaching for
   without the trap.

   ⛔ BOTH MUTATIONS READ THE CACHE, NOT A CAPTURED SET. They closed over `copiedPhoneIds` and
   listed it as a dependency, so they were rebuilt on every change and could still be called
   with a stale copy — the "already copied" guard would miss, and a bulk copy would re-send rows
   it had just written. getQueryData is read at call time.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
export function useCopiedPhones() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['copied-phones', user?.id ?? null] as const, [user?.id]);

  const query = useQuery({
    queryKey,
    enabled: !!user,
    queryFn: async (): Promise<ReadonlySet<string>> => {
      const { data, error } = await supabase
        .from('copied_phones')
        .select('lead_id');
      /* Throws rather than returning an empty set: "we could not read which phones you have
         copied" and "you have copied none" are different answers, and only one of them should
         make the app show every number as fresh. */
      if (error) throw new Error(error.message);
      return new Set((data ?? []).map((d) => d.lead_id));
    },
  });

  const copiedPhoneIds = query.data ?? EMPTY;
  const isLoading = !!user && query.isPending;

  /** Add ids to the cached set and then re-read authoritatively. */
  const addToCache = useCallback(async (ids: string[]) => {
    queryClient.setQueryData<ReadonlySet<string>>(queryKey, (prev) => {
      const next = new Set(prev ?? EMPTY);
      for (const id of ids) next.add(id);
      return next;
    });
    await queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  const markAsCopied = useCallback(async (leadId: string) => {
    if (!user) return false;

    const current = queryClient.getQueryData<ReadonlySet<string>>(queryKey) ?? EMPTY;
    if (current.has(leadId)) return true;

    const { error } = await supabase
      .from('copied_phones')
      .insert({ user_id: user.id, lead_id: leadId });

    if (error) {
      /* ⚠️ A UNIQUE-CONSTRAINT VIOLATION IS A SUCCESS, NOT A FAILURE: the row is already there,
         which is exactly the state the caller wanted. Kept verbatim — it is the race two tabs
         or a double click produce. */
      if (error.code === '23505') {
        await addToCache([leadId]);
        return true;
      }
      console.error('Error marking phone as copied:', error);
      return false;
    }

    await addToCache([leadId]);
    return true;
  }, [user, queryClient, queryKey, addToCache]);

  const markMultipleAsCopied = useCallback(async (leadIds: string[]) => {
    if (!user || leadIds.length === 0) return;

    const current = queryClient.getQueryData<ReadonlySet<string>>(queryKey) ?? EMPTY;
    const newIds = leadIds.filter((id) => !current.has(id));
    if (newIds.length === 0) return;

    const rows = newIds.map((leadId) => ({ user_id: user.id, lead_id: leadId }));

    // Use upsert to handle duplicates gracefully
    const { error } = await supabase
      .from('copied_phones')
      .upsert(rows, { onConflict: 'user_id,lead_id', ignoreDuplicates: true });

    if (error) {
      console.error('Error marking phones as copied:', error);
      return;
    }

    await addToCache(newIds);
  }, [user, queryClient, queryKey, addToCache]);

  const isPhoneCopied = useCallback(
    (leadId: string) => copiedPhoneIds.has(leadId),
    [copiedPhoneIds],
  );

  /** Kept for callers that refresh explicitly; invalidates rather than re-running the read. */
  const fetchCopiedPhones = useCallback(
    async () => { await queryClient.invalidateQueries({ queryKey }); },
    [queryClient, queryKey],
  );

  return {
    copiedPhoneIds,
    isLoading,
    markAsCopied,
    markMultipleAsCopied,
    isPhoneCopied,
    fetchCopiedPhones,
  };
}
