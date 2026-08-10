import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  coverageKey, coverageStateFor, summarise, applyFilters,
  type CoverageFacts, type CoverageRow, type CoverageTown, type CoverageSummary,
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
   suppression fields cannot be lost by a signature that only promises CoverageRow. */
export type GradedTown = CoverageTownRow & { state: CoverageRow['state'] };

interface Pair { trade: string; town: string }

export function useCoverage() {
  const [towns, setTowns] = useState<CoverageTownRow[]>([]);
  const [pairs, setPairs] = useState<{ measured: Pair[]; leads: Pair[]; worked: Pair[] } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: e } = await supabase.functions.invoke('coverage', { body: { action: 'view' } });
      if (e) throw new Error(e.message);
      if (!data?.ok) throw new Error(data?.error ?? 'coverage failed');
      setTowns((data.towns ?? []) as CoverageTownRow[]);
      setPairs(data.pairs ?? { measured: [], leads: [], worked: [] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* Built once per fetch, not per row: coverageKey canonicalises the trade, and doing that inside a
     733-row render loop would be the same work 733 times. */
  const facts: CoverageFacts = useMemo(() => ({
    measuredPairs: new Set((pairs?.measured ?? []).map((p) => coverageKey(p.trade, p.town))),
    leadPairs: new Set((pairs?.leads ?? []).map((p) => coverageKey(p.trade, p.town))),
    workedPairs: new Set((pairs?.worked ?? []).map((p) => coverageKey(p.trade, p.town))),
  }), [pairs]);

  const gradeFor = useCallback((trade: string, includeSuppressed: boolean): GradedTown[] => {
    return towns
      .filter((t) => includeSuppressed || !t.suppressed_at)
      .map((t) => ({ ...t, state: coverageStateFor(trade, t, facts) }));
  }, [towns, facts]);

  const setSuppressed = useCallback(async (townId: string, suppress: boolean, reason?: string) => {
    const { data, error: e } = await supabase.functions.invoke('coverage', {
      body: { action: suppress ? 'suppress' : 'unsuppress', town_id: townId, reason },
    });
    if (e || !data?.ok) throw new Error(e?.message ?? data?.error ?? 'could not update');
    /* Patch in place rather than refetching: the list is 733 rows and the change is one field.
       A refetch here would also reset the operator's scroll, which is the thing §6c is about. */
    setTowns((prev) => prev.map((t) => t.id === townId
      ? { ...t, suppressed_at: suppress ? new Date().toISOString() : null, suppressed_reason: suppress ? (reason ?? null) : null }
      : t));
  }, []);

  const regions = useMemo(
    () => [...new Set(towns.map((t) => t.region).filter(Boolean) as string[])].sort(),
    [towns],
  );

  return { towns, isLoading, error, gradeFor, setSuppressed, regions, refetch: fetchAll, applyFilters, summarise };
}

export type { CoverageRow, CoverageSummary };
