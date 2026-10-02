import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdge } from '@/lib/edgeInvoke';
import { CH_CONCURRENCY, isChCheckFresh, listingFingerprint, type CompaniesHouseCheckRow } from '@/lib/companiesHouse';

/* ══ THE COMPANIES HOUSE CHECK FOR A SET OF RESULTS (Find Leads, 2026-10-02) ═══════════════════════
   Mirrors useAgencyChecks. Only the results the caller marks as targets (UK, no website —
   isCompaniesHouseTarget) are ever looked at; a result with a website never reaches Companies House.
   1. One read of the stored checks for those place ids (companies_house_checks): a fresh one for the
      same listing shows at once and is never looked up again.
   2. The rest go to fn companies-house-check CH_CONCURRENCY at a time; each row fills in as it lands.
   A "not connected" or "busy" answer stops the run — the rest read "Not checked", and the reason is
   kept so the cell can say why. Nothing failed is stored, so the next search tries again. */

const COLUMNS = 'place_id, fingerprint, business_name, postcode, town, match, company_number, company_name, company_status, company_type, incorporated_on, registered_locality, registered_postcode, evidence, candidates_seen, version, checked_at';
// companies_house_checks is not in the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
const sessionRows = new Map<string, CompaniesHouseCheckRow>();

export type ChUnavailable = 'not_configured' | 'rate_limited' | 'unavailable';
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
  const targets = useMemo(() => {
    const m = new Map<string, { id: string; name: string; address: string; fp: string }>();
    for (const i of items) if (i.isTarget && i.id && !m.has(i.id)) m.set(i.id, { id: i.id, name: i.name, address: i.address ?? '', fp: listingFingerprint(i.name, i.address) });
    return [...m.values()].sort((a, b) => a.id.localeCompare(b.id));
  }, [items]);
  const key = targets.map((t) => `${t.id}:${t.fp}`).join('|');
  const [rows, setRows] = useState<Map<string, CompaniesHouseCheckRow>>(() => new Map(sessionRows));
  const [checking, setChecking] = useState<Set<string>>(new Set());
  const [stoppedBecause, setStopped] = useState<ChUnavailable | null>(null);
  const run = useRef(0);

  useEffect(() => {
    if (!targets.length) return;
    const my = ++run.current;
    setStopped(null);
    const put = (r: CompaniesHouseCheckRow) => { sessionRows.set(r.place_id, r); if (run.current === my) setRows((prev) => new Map(prev).set(r.place_id, r)); };
    const fresh = (id: string, fp: string, now: number) => { const s = sessionRows.get(id); return !!s && isChCheckFresh(s, fp, now); };
    void (async () => {
      const now = Date.now();
      let need = targets.filter((t) => !fresh(t.id, t.fp, now));
      // 1. What is already stored (the read fails safe: nothing stored = look it up).
      const fpOf = new Map(need.map((t) => [t.id, t.fp]));
      for (let i = 0; i < need.length; i += 150) {
        const { data } = await sb.from('companies_house_checks').select(COLUMNS).in('place_id', need.slice(i, i + 150).map((t) => t.id));
        for (const r of (data ?? []) as CompaniesHouseCheckRow[]) if (isChCheckFresh(r, fpOf.get(r.place_id) ?? '', now)) put(r);
      }
      if (run.current !== my) return;
      need = need.filter((t) => !fresh(t.id, t.fp, now));
      setChecking(new Set(need.map((t) => t.id)));
      // 2. The rest, CH_CONCURRENCY at a time.
      let next = 0;
      let stop: ChUnavailable | null = null;
      const worker = async () => {
        while (run.current === my && !stop && next < need.length) {
          const t = need[next++];
          try {
            const res = await invokeEdge<{ ok: boolean; error?: string; check?: CompaniesHouseCheckRow }>('companies-house-check', { placeId: t.id, name: t.name, address: t.address });
            if (res?.ok && res.check) put(res.check);
            else if (res?.error === 'not_configured' || res?.error === 'rate_limited') stop = res.error;
          } catch { /* stays "Not checked" — never shown as Not found */ }
          if (run.current === my) setChecking((prev) => { const n = new Set(prev); n.delete(t.id); return n; });
        }
      };
      await Promise.all(Array.from({ length: Math.min(CH_CONCURRENCY, need.length) }, worker));
      if (run.current === my) {
        setChecking(new Set());
        if (stop) setStopped(stop);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const fpById = useMemo(() => new Map(targets.map((t) => [t.id, t.fp])), [targets]);
  return {
    // A row stored for an older version of the listing (renamed, new postcode) is not shown as this one's.
    rowFor: (id) => { const r = rows.get(id); return r && r.fingerprint === fpById.get(id) ? r : null; },
    isChecking: (id) => checking.has(id),
    stoppedBecause,
    pending: checking.size,
  };
}
