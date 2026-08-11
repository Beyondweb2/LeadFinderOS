import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  coverageKey, coverageStateFor, summarise, applyFilters, applySuppressionPatch, countLeadsByPair,
  type CoverageFacts, type CoverageRow, type CoverageTown, type CoverageSummary,
  type SuppressionPatch,
} from '@/lib/coverageState';

/* ⚠️ The grading lives in src/lib/coverageState.ts and is unit-tested there. This hook fetches the
   facts and applies it — it deliberately decides nothing about what "worked" means, so the page and
   the tests cannot drift apart. */

export interface CoverageTownRow extends CoverageTown {
  county: string | null;
  suppressed_at: string | null;
  suppressed_reason: string | null;
}

/* The row the page actually renders: a town, its suppression state, and its grade. Named so the
   suppression fields cannot be lost by a signature that only promises CoverageRow.
   `leadCount` is HOW MANY leads are in the CRM for this trade+town — separate from `state` on
   purpose. The ladder is exclusive (a town shows at its furthest rung only), so a `measured` or
   `worked` town said nothing about whether leads had been pulled there. That was the gap: the rung
   answers "how far has this gone", the count answers "have I pulled leads from here". */
export type GradedTown = CoverageTownRow & { state: CoverageRow['state']; leadCount: number };

interface Pair { trade: string; town: string }

interface CoverageData {
  towns: CoverageTownRow[];
  pairs: { measured: Pair[]; leads: Pair[]; worked: Pair[] };
}

/* ⛔ SCOPED TO THE USER. Every fact behind this view is owner-filtered server-side, so a cache
   shared across sign-ins would show one operator another's coverage until it went stale. */
const coverageQueryKey = (userId: string | undefined) => ['coverage', userId] as const;

export function useCoverage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  /* ⛔ WAS A MOUNT EFFECT, AND THAT IS THE BUG PAUL FELT. `useEffect(() => fetchAll(), [fetchAll])`
     with isLoading starting `true` meant leaving the page and coming back refetched 733 towns and
     showed a spinner every time — CLAUDE.md §6c's "it loses my place", the same fault as useInbox.
     React Query is already configured in App.tsx (staleTime 5 min, no refetch on focus), so the
     second visit inside five minutes now renders from cache with no request and no spinner. */
  const { data, isLoading, error: queryError, refetch } = useQuery({
    queryKey: coverageQueryKey(user?.id),
    queryFn: async (): Promise<CoverageData> => {
      const { data: res, error: e } = await supabase.functions.invoke('coverage', { body: { action: 'view' } });
      if (e) throw new Error(e.message);
      if (!res?.ok) throw new Error(res?.error ?? 'coverage failed');
      return {
        towns: (res.towns ?? []) as CoverageTownRow[],
        pairs: res.pairs ?? { measured: [], leads: [], worked: [] },
      };
    },
    /* The page is auth-gated, but the key includes the id — firing before it resolves would cache
       the result under `undefined` and then never be read again under the real id. */
    enabled: !!user?.id,
  });

  const towns = useMemo(() => data?.towns ?? [], [data]);
  const pairs = data?.pairs ?? null;
  const error = queryError ? (queryError as Error).message : null;

  /* Built once per fetch, not per row: coverageKey canonicalises the trade, and doing that inside a
     733-row render loop would be the same work 733 times. */
  const facts: CoverageFacts = useMemo(() => ({
    measuredPairs: new Set((pairs?.measured ?? []).map((p) => coverageKey(p.trade, p.town))),
    leadPairs: new Set((pairs?.leads ?? []).map((p) => coverageKey(p.trade, p.town))),
    workedPairs: new Set((pairs?.worked ?? []).map((p) => coverageKey(p.trade, p.town))),
  }), [pairs]);

  /* ⛔ COUNTED FROM THE SAME `pairs.leads` THE `leads` RUNG IS DERIVED FROM — one fetch, one truth.
     Built once per fetch rather than per row: coverageKey canonicalises the trade, and doing that
     inside a 733-row render loop would be the same work 733 times (the reason `facts` is memoised
     above for exactly the same shape of work). */
  const leadCounts = useMemo(
    () => countLeadsByPair(pairs?.leads ?? []),
    [pairs],
  );

  const gradeFor = useCallback((trade: string, includeSuppressed: boolean): GradedTown[] => {
    return towns
      .filter((t) => includeSuppressed || !t.suppressed_at)
      .map((t) => ({
        ...t,
        state: coverageStateFor(trade, t, facts),
        leadCount: leadCounts.get(coverageKey(trade, t.name)) ?? 0,
      }));
  }, [towns, facts, leadCounts]);

  const setSuppressed = useCallback(async (townId: string, suppress: boolean, reason?: string) => {
    const { data: res, error: e } = await supabase.functions.invoke('coverage', {
      body: { action: suppress ? 'suppress' : 'unsuppress', town_id: townId, reason },
    });
    if (e || !res?.ok) throw new Error(e?.message ?? res?.error ?? 'could not update');

    /* ⛔ THE CACHE IS PATCHED FROM THE ROW THE SERVER RETURNED, NOT FROM WHAT WE ASSUME IT WROTE.
       This is the invalidation half of the migration, and the part CLAUDE.md §6c says to prove:
       a stale list is worse than a lost scroll position, because it makes you act on wrong data.
       Patching rather than invalidating is deliberate — invalidating refetches all 733 towns for a
       one-field change — but it is only honest because `town` below is the database's own row.
       The previous code invented `new Date().toISOString()` client-side, a timestamp nobody wrote.
       ⚠️ If the endpoint is ever deployed older than this hook it returns no `town`, and we fall
       back to invalidating rather than guessing. An absent value is not an answer (§6). */
    const key = coverageQueryKey(user?.id);
    const cached = queryClient.getQueryData<CoverageData>(key);
    const patched = cached
      ? applySuppressionPatch(cached.towns, townId, (res as { town?: SuppressionPatch }).town)
      : null;

    if (!patched) {
      /* Could not patch honestly — no row returned, or nothing in the cache matches it. Refetch
         rather than leave the screen disagreeing with the database about a write that happened. */
      await queryClient.invalidateQueries({ queryKey: key });
      return;
    }
    queryClient.setQueryData<CoverageData>(key, { ...cached!, towns: patched });
  }, [queryClient, user?.id]);

  const regions = useMemo(
    () => [...new Set(towns.map((t) => t.region).filter(Boolean) as string[])].sort(),
    [towns],
  );

  return { towns, isLoading, error, gradeFor, setSuppressed, regions, refetch, applyFilters, summarise };
}

export type { CoverageRow, CoverageSummary };
