import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  coverageKey, coverageStateFor,
  hasLeadPool, summarise, applyFilters, applySuppressionPatch, countLeadsByPair, workersByPair, foundAddedByPair,
  type CoverageFacts, type CoverageRow, type CoverageTown, type CoverageSummary,
  type SuppressionPatch, type CoverageWorker, type WorkedByEntry, type FoundAdded, type SearchRunRecord,
} from '@/lib/coverageState';
import { coverageQueryKey, coverageTownsQueryKey } from '@/lib/coverageFreshness';
import { ABROAD_TOWNS, abroadTownKey, type CoverageCountry } from '@/lib/coverageCountries';
import { MALAYSIA_COVERAGE_TOWNS } from '@/data/malaysiaCoverageTowns';
import { coveragePairsFor } from '@/lib/malaysiaCoverage';
import { townPopulation } from '@/lib/abroadTownPopulation';

/* ⚠️ The grading lives in src/lib/coverageState.ts and is unit-tested there. This hook fetches the
   facts and applies it — it deliberately decides nothing about what "worked" means, so the page and
   the tests cannot drift apart. */

export interface CoverageTownRow extends CoverageTown {
  county: string | null;
  /** Malaysia / Singapore only: another name for the town ("Penang"), and true when the row is not on the list
   *  but a lead or search named it. */
  aka?: string;
  fromLeads?: boolean;
  suppressed_at: string | null;
  suppressed_reason: string | null;
}

/* The row the page actually renders: a town, its suppression state, and its grade. Named so the
   suppression fields cannot be lost by a signature that only promises CoverageRow.
   `leadCount` is HOW MANY leads are in the CRM for this trade+town — separate from `state` on
   purpose. The ladder is exclusive (a town shows at its furthest rung only), so a `measured` or
   `worked` town said nothing about whether leads had been pulled there. That was the gap: the rung
   answers "how far has this gone", the count answers "have I pulled leads from here". */
/* `workers` = who owns a contacted lead in this trade+town (2026-09-28); empty when nobody can be named. */
/* `foundAdded` = Found vs Added, with / without a website, from the search runs (2026-09-29); null = never searched. */
export type GradedTown = CoverageTownRow & { state: CoverageRow['state']; leadCount: number; hasPool: boolean; workers: CoverageWorker[]; foundAdded: FoundAdded | null };

interface Pair { trade: string; town: string; country?: string | null }

/* ⛔ SPLIT INTO TWO READS (2026-08-19). The 733-town list is static ONS data; the measured/leads/
   worked pairs are what change. Fetching them together meant a lead-add — which invalidates the
   pairs — refetched all 733 towns too, and the one combined request did towns THEN audits THEN the
   ~1,500-lead scan sequentially before anything rendered. Now they are two edge calls on two keys:
   towns hard-cached, pairs on the invalidated key, both firing in parallel. */
interface TownsData { towns: CoverageTownRow[] }
/* `pooled` is OPTIONAL: an older `coverage` deploy does not send it, and the client must be able
   to tell "not sent" from "none" — see hasLeadPool. */
interface PairsData { pairs: { measured: Pair[]; leads: Pair[]; worked: Pair[]; pooled?: Pair[]; workedBy?: WorkedByEntry[]; runs?: SearchRunRecord[] } }

/* ⛔ THE KEY IS DEFINED IN src/lib/coverageFreshness.ts, not here, because the WRITER needs it too.
   useOutreach marks this query stale when the lead list changes — and it has to be the writer's job,
   not a listener in this hook: Coverage is UNMOUNTED when a lead is added (there is no add button on
   that page), so no listener here could ever hear it. invalidateQueries works with no subscriber,
   which is exactly why the fix lives at the write. */

/** `country` (2026-10-14): UK = uk_towns and every non-Malaysia/Singapore lead, exactly as before; Malaysia /
 *  Singapore = their town list (coverageCountries.ts) and that country's leads only. */
export function useCoverage(country: CoverageCountry = 'UK') {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  /* ⛔ WAS A MOUNT EFFECT, AND THAT IS THE BUG PAUL FELT. `useEffect(() => fetchAll(), [fetchAll])`
     with isLoading starting `true` meant leaving the page and coming back refetched 733 towns and
     showed a spinner every time — CLAUDE.md §6c's "it loses my place", the same fault as useInbox.
     React Query is already configured in App.tsx (staleTime 5 min, no refetch on focus), so the
     second visit inside five minutes now renders from cache with no request and no spinner.

     ⛔ THE STATIC TOWNS AND THE DYNAMIC PAIRS ARE TWO QUERIES ON PURPOSE (2026-08-19). Together they
     were one 3-second sequential read that a lead-add refetched in full. Now the towns hard-cache
     (staleTime Infinity — ONS data, only a reseed or a suppression moves them, and suppression
     patches this cache directly) while the pairs sit on the key useOutreach invalidates. They fire
     in parallel, so first paint waits on the slower of two smaller reads, not their sum. */
  const townsQuery = useQuery({
    queryKey: coverageTownsQueryKey(user?.id),
    queryFn: async (): Promise<TownsData> => {
      const { data: res, error: e } = await supabase.functions.invoke('coverage', { body: { action: 'towns' } });
      if (e) throw new Error(e.message);
      if (!res?.ok) throw new Error(res?.error ?? 'coverage towns failed');
      return { towns: (res.towns ?? []) as CoverageTownRow[] };
    },
    /* The page is auth-gated, but the key includes the id — firing before it resolves would cache
       the result under `undefined` and then never be read again under the real id. */
    enabled: !!user?.id,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const pairsQuery = useQuery({
    queryKey: coverageQueryKey(user?.id),
    queryFn: async (): Promise<PairsData> => {
      const { data: res, error: e } = await supabase.functions.invoke('coverage', { body: { action: 'pairs' } });
      if (e) throw new Error(e.message);
      if (!res?.ok) throw new Error(res?.error ?? 'coverage pairs failed');
      return { pairs: res.pairs ?? { measured: [], leads: [], worked: [] } };  // pooled stays undefined
    },
    enabled: !!user?.id,
  });

  const ukTowns = useMemo(() => townsQuery.data?.towns ?? [], [townsQuery.data]);
  const rawPairs = pairsQuery.data?.pairs ?? null;
  /* The pairs cut to the chosen country (UK: every pair except a Malaysia / Singapore lead's — the same towns
     match as before). `pooled` / `measured` are UK-only facts and pass through untouched. */
  const countryPairs = useMemo(() => (rawPairs ? coveragePairsFor(country, rawPairs) : null), [rawPairs, country]);
  const pairs = useMemo(() => (rawPairs && countryPairs ? { ...rawPairs, ...countryPairs } : null), [rawPairs, countryPairs]);
  const towns: CoverageTownRow[] = useMemo(() => {
    if (country === 'UK') return ukTowns;
    const row = (t: { name: string; region: string | null; aka?: string }, fromLeads: boolean): CoverageTownRow => ({
      /* Approximate, from the fixed sourced table; a town with no source figure stays null (blank). */
      id: `${country}:${t.name}`, name: t.name, region: t.region, population: townPopulation(country, t.name, t.region).population, county: null,
      suppressed_at: null, suppressed_reason: null, aka: t.aka, fromLeads,
    });
    /* ⛔ MALAYSIA'S 50,000+ TOWNS (2026-10-23, scripts/build-malaysia-coverage-towns.mjs) ARE ADDED HERE, ON THE
       COVERAGE SCREEN ONLY, never to ABROAD_TOWNS: that list is also read by the business-name cleaner on every
       sending path (cleanBusinessName.ts), and widening it would change what messages say. A lead in one of these
       towns already counts under its own name (an unlisted town is a row of its own), so the row it used to make
       "from your leads" is now this listed row — never both. */
    const hand = ABROAD_TOWNS[country];
    const handKeys = new Set(hand.map((t) => abroadTownKey(t.name)));
    const more = country === 'Malaysia'
      ? MALAYSIA_COVERAGE_TOWNS.map(([, name, state]) => ({ name, region: state })).filter((t) => !handKeys.has(abroadTownKey(t.name)))
      : [];
    const listed = new Set([...handKeys, ...more.map((t) => abroadTownKey(t.name))]);
    const fromLeads = (countryPairs?.extraTowns ?? []).filter((t) => !listed.has(abroadTownKey(t.name)));
    return [...[...hand, ...more].map((t) => row(t, false)), ...fromLeads.map((t) => row(t, true))];
  }, [country, ukTowns, countryPairs]);
  const isLoading = townsQuery.isLoading || pairsQuery.isLoading;
  const queryError = townsQuery.error || pairsQuery.error;
  const error = queryError ? (queryError as Error).message : null;

  /* Built once per fetch, not per row: coverageKey canonicalises the trade, and doing that inside a
     733-row render loop would be the same work 733 times.
     ⚠️ The endpoint still SENDS `measured` (one entry per completed market audit) and nothing reads
     it any more — the `measured` rung went with the market view on 2026-09-09, because it graded a
     town on a market audit and the last one was run on 24 August. Coverage now answers only what it
     is used for: which towns have leads, which have been contacted, and how big they are. */
  const facts: CoverageFacts = useMemo(() => ({
    leadPairs: new Set((pairs?.leads ?? []).map((p) => coverageKey(p.trade, p.town))),
    workedPairs: new Set((pairs?.worked ?? []).map((p) => coverageKey(p.trade, p.town))),
    /* ⚠️ UNDEFINED WHEN THE ENDPOINT DOES NOT SEND IT, never an empty Set. hasLeadPool reads absence
       as "assume a pool" — the old behaviour — whereas an empty Set means "no town has one" and
       would relabel every row with a priced Find-leads button during a deploy window. */
    pooledPairs: pairs?.pooled
      ? new Set(pairs.pooled.map((p) => coverageKey(p.trade, p.town)))
      : undefined,
  }), [pairs]);

  /* ⛔ COUNTED FROM THE SAME `pairs.leads` THE `leads` RUNG IS DERIVED FROM — one fetch, one truth.
     Built once per fetch rather than per row: coverageKey canonicalises the trade, and doing that
     inside a 733-row render loop would be the same work 733 times (the reason `facts` is memoised
     above for exactly the same shape of work). */
  const leadCounts = useMemo(
    () => countLeadsByPair(pairs?.leads ?? []),
    [pairs],
  );
  /* Who worked each pair, folded on the same key as the rung. An older deploy sends no workedBy: no names. */
  const workers = useMemo(() => workersByPair(pairs?.workedBy), [pairs]);
  /* Found vs Added per pair, from the search runs. An older deploy sends no runs: no breakdown (null). */
  const foundAdded = useMemo(() => foundAddedByPair(pairs?.runs), [pairs]);

  const gradeFor = useCallback((trade: string, includeSuppressed: boolean): GradedTown[] => {
    return towns
      .filter((t) => includeSuppressed || !t.suppressed_at)
      .map((t) => ({
        ...t,
        state: coverageStateFor(trade, t, facts),
        leadCount: leadCounts.get(coverageKey(trade, t.name)) ?? 0,
        /* ⛔ A SEPARATE FACT FROM `state`. Measured and has-a-pool are independent — 20 of 42
           measured markets had no pool — and the row needs both to label its button honestly.
           Computed here with state and leadCount because facts lives in this hook and coverageKey
           canonicalisation must not run 733 times in a render loop. */
        hasPool: hasLeadPool(trade, t, facts),
        workers: workers.get(coverageKey(trade, t.name)) ?? [],
        foundAdded: foundAdded.get(coverageKey(trade, t.name)) ?? null,
      }));
  }, [towns, facts, leadCounts, workers, foundAdded]);

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
    const key = coverageTownsQueryKey(user?.id);
    const cached = queryClient.getQueryData<TownsData>(key);
    const patched = cached
      ? applySuppressionPatch(cached.towns, townId, (res as { town?: SuppressionPatch }).town)
      : null;

    if (!patched) {
      /* Could not patch honestly — no row returned, or nothing in the cache matches it. Refetch
         rather than leave the screen disagreeing with the database about a write that happened. */
      await queryClient.invalidateQueries({ queryKey: key });
      return;
    }
    queryClient.setQueryData<TownsData>(key, { towns: patched });
  }, [queryClient, user?.id]);

  const regions = useMemo(
    () => [...new Set(towns.map((t) => t.region).filter(Boolean) as string[])].sort(),
    [towns],
  );

  /* Retry refetches BOTH halves. React Query's refetch identity is stable per query, so this
     useCallback does not churn. */
  const townsRefetch = townsQuery.refetch;
  const pairsRefetch = pairsQuery.refetch;
  const refetch = useCallback(async () => {
    await Promise.all([townsRefetch(), pairsRefetch()]);
  }, [townsRefetch, pairsRefetch]);

  /* Malaysia: place text that is not one town, with its lead counts (shown apart, counted under no town). */
  const unclearPlaces = useMemo(() => countryPairs?.unclearPlaces ?? [], [countryPairs]);

  return { towns, isLoading, error, gradeFor, setSuppressed, regions, refetch, applyFilters, summarise, unclearPlaces };
}

export type { CoverageRow, CoverageSummary };
