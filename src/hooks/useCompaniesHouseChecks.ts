import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdge } from '@/lib/edgeInvoke';
import { CH_CONCURRENCY, type CompaniesHouseCheckRow } from '@/lib/companiesHouse';
import { chTargetsKey, chTargetsOf, createChRunner, type ChUnavailable } from '@/lib/companiesHouseRunner';

/* ══ THE COMPANIES HOUSE CHECK FOR A SET OF RESULTS (Find Leads, 2026-10-02) ═══════════════════════
   Only the results the caller marks as targets (UK, no website — isCompaniesHouseTarget) are ever
   looked at; a result with a website never reaches Companies House. The lifecycle — "Checking…" at
   once, stored checks first, the rest a few at a time, every NEW result set processed, a late result
   never lost — lives in src/lib/companiesHouseRunner.ts (tested without a browser). This hook gives it
   the real reads and lookups and redraws when it changes.
   ⛔ The runner is ONE per page session (module level), so a result looked up for one search is reused
   by the next search without a refresh, and survives the table re-mounting. */

const COLUMNS = 'place_id, fingerprint, business_name, postcode, town, match, company_number, company_name, company_status, company_type, incorporated_on, registered_locality, registered_postcode, evidence, candidates_seen, version, checked_at';
// companies_house_checks is not in the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const runner = createChRunner({
  concurrency: CH_CONCURRENCY,
  readStored: async (ids) => {
    const { data, error } = await sb.from('companies_house_checks').select(COLUMNS).in('place_id', ids);
    if (error) throw error;
    return (data ?? []) as CompaniesHouseCheckRow[];
  },
  lookup: (t) => invokeEdge<{ ok: boolean; error?: string; check?: CompaniesHouseCheckRow }>('companies-house-check', { placeId: t.id, name: t.name, address: t.address }),
});

export type { ChUnavailable };
export const CH_UNAVAILABLE_WORDS: Record<ChUnavailable, string> = {
  not_configured: 'Companies House is not connected yet.',
  rate_limited: 'Companies House was busy. Run the search again in a few minutes.',
  unavailable: 'Companies House could not be reached. Run the search again later.',
};

export interface CompaniesHouseChecks {
  rowFor: (placeId: string) => CompaniesHouseCheckRow | null;
  isChecking: (placeId: string) => boolean;
  /** Why the rest were not checked this run, when a run stopped early. */
  stoppedBecause: ChUnavailable | null;
  /** Lookups still running for this result set (0 = settled). */
  pending: number;
}

export function useCompaniesHouseChecks(items: { id: string; name: string; address?: string | null; isTarget: boolean }[]): CompaniesHouseChecks {
  const targets = useMemo(() => chTargetsOf(items.filter((i) => i.isTarget)), [items]);
  const key = chTargetsKey(targets);
  const [, setVersion] = useState(0);
  useEffect(() => runner.subscribe(() => setVersion(runner.state().version)), []);
  /* EVERY change of the target set starts a run — a new search, a changed listing, or none at all
     (which clears the last run's "Checking…" so the finished order is not held back). */
  useEffect(() => { void runner.setTargets(targets); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = runner.state();
  /* The render before the run starts (a brand-new set): anything without a row is already Checking…. */
  const starting = s.key !== key;
  const fpById = useMemo(() => new Map(targets.map((t) => [t.id, t.fp])), [targets]);
  const mine = useMemo(() => new Set(targets.map((t) => t.id)), [targets]);
  return {
    // A row stored for an older version of the listing (renamed, new postcode) is not shown as this one's.
    rowFor: (id) => runner.rowFor(id, fpById.get(id)),
    isChecking: (id) => (starting ? mine.has(id) && !runner.rowFor(id, fpById.get(id)) : s.checking.has(id)),
    stoppedBecause: s.stoppedBecause,
    pending: starting ? targets.filter((t) => !runner.rowFor(t.id, t.fp)).length : [...s.checking].filter((id) => mine.has(id)).length,
  };
}
