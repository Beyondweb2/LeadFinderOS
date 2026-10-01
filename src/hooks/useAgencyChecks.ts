import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdge } from '@/lib/edgeInvoke';
import { agencyCheckDomain, isCheckFresh, type AgencyCheckRow } from '@/lib/agencyCheck';

/* ══ THE AGENCY CHECK FOR A SET OF RESULTS (Find Leads, 2026-10-01) ═══════════════════════════════
   1. One read of the stored checks for every result's domain (website_agency_checks): fresh ones show
      at once and are never crawled again.
   2. The rest go to fn agency-check AGENCY_CONCURRENCY at a time; each row updates the moment its own
      check finishes, so one slow or broken site never holds up the others.
   A new search starts a new run (results from an old run are ignored when they land). Answers are kept
   for the session, so going back to a search never re-checks it. */

/** Domains checked at once — enough to finish 50 results in a couple of minutes without hammering. */
export const AGENCY_CONCURRENCY = 8;
const COLUMNS = 'domain, website, classification, confidence, agency, agency_domain, evidence, platform, status, failure_reason, pages_checked, version, checked_at';
// website_agency_checks is not in the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
const sessionRows = new Map<string, AgencyCheckRow>();

export interface AgencyChecks {
  rowFor: (website: string | null | undefined) => AgencyCheckRow | null;
  isChecking: (website: string | null | undefined) => boolean;
  progress: { done: number; total: number };
  /** Checks still running for this result set (0 = settled). */
  pending: number;
}

export function useAgencyChecks(items: { websiteUrl?: string | null; hasOwnWebsite: boolean }[]): AgencyChecks {
  const domains = useMemo(() => [...new Set(items.filter((i) => i.hasOwnWebsite).map((i) => agencyCheckDomain(i.websiteUrl)).filter((d): d is string => !!d))].sort(), [items]);
  const key = domains.join('|');
  const [rows, setRows] = useState<Map<string, AgencyCheckRow>>(() => new Map(sessionRows));
  const [checking, setChecking] = useState<Set<string>>(new Set());
  const run = useRef(0);
  const websiteOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of items) { const d = agencyCheckDomain(i.websiteUrl); if (d && i.hasOwnWebsite && !m.has(d)) m.set(d, String(i.websiteUrl)); }
    return m;
  }, [items]);

  useEffect(() => {
    if (!domains.length) return;
    const my = ++run.current;
    const put = (r: AgencyCheckRow) => { sessionRows.set(r.domain, r); if (run.current === my) setRows((prev) => new Map(prev).set(r.domain, r)); };
    void (async () => {
      const now = Date.now();
      const need = domains.filter((d) => { const s = sessionRows.get(d); return !s || !isCheckFresh(s, now); });
      // 1. What is already stored.
      for (let i = 0; i < need.length; i += 150) {
        const { data } = await sb.from('website_agency_checks').select(COLUMNS).in('domain', need.slice(i, i + 150));
        for (const r of (data ?? []) as AgencyCheckRow[]) if (isCheckFresh(r, now)) put(r);
      }
      if (run.current !== my) return;
      const todo = need.filter((d) => !sessionRows.has(d) || !isCheckFresh(sessionRows.get(d)!, now));
      setChecking(new Set(todo));
      // 2. The rest, AGENCY_CONCURRENCY at a time.
      let next = 0;
      const worker = async () => {
        while (run.current === my && next < todo.length) {
          const d = todo[next++];
          try {
            const res = await invokeEdge<{ ok: boolean; check?: AgencyCheckRow }>('agency-check', { website: websiteOf.get(d) ?? `https://${d}` });
            if (res?.ok && res.check) put(res.check);
          } catch { /* stays "not checked" — shown as Unknown with no evidence, never as a verdict */ }
          if (run.current === my) setChecking((prev) => { const n = new Set(prev); n.delete(d); return n; });
        }
      };
      await Promise.all(Array.from({ length: Math.min(AGENCY_CONCURRENCY, todo.length) }, worker));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const done = domains.filter((d) => rows.has(d)).length;
  return {
    rowFor: (w) => { const d = agencyCheckDomain(w); return d ? rows.get(d) ?? null : null; },
    isChecking: (w) => { const d = agencyCheckDomain(w); return !!d && checking.has(d); },
    progress: { done, total: domains.length },
    pending: checking.size,
  };
}
