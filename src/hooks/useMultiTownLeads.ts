import { useCallback, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdge, edgeErrorMessage, EdgeFunctionError } from '@/lib/edgeInvoke';
import { useLeadSearchContext } from '@/contexts/LeadSearchContext';
import { sortLeadsForDisplay } from '@/lib/nicheView';
import {
  COVERAGE_ADD_MAX_ROWS, addRowFor, isLimitRefusal, mergeTownResults, runBulkAdd, runTownSearches,
  type AddPhase, type AddRowAnswer, type AddSummary, type LookupAnswer, type MergedLead, type ResultLead, type TownResult, type TownStatus,
} from '@/lib/multiTownSearch';

/* ══ COVERAGE: MANY TOWNS, ONE LIST, ONE ADD (2026-10-15) ═══════════════════════════════════════
   The network half of src/lib/multiTownSearch.ts (every rule lives there, tested). Each town is the
   SAME search-leads call a Coverage row's "Find leads" makes, with townOnly (never Apify), through
   invokeEdge (session first, one refresh). search-leads writes the run's search_history row itself
   (skipHistory not sent) and returns its id, so an add is credited to the run that found it.
   ⛔ Nothing here is persisted: results are for this visit; the CRM add is the durable act.
   Record: docs/coverage-multi-town.md. */

export type { AddPhase };
export interface TownToSearch { town: string; location: string; country: string }

interface SearchLeadsAnswer {
  leads?: ResultLead[];
  searchRunId?: string | null;
  resolvedCountry?: string | null;
  notFound?: boolean;
  serviceIssue?: boolean;
  notice?: string;
}

type RpcAnswer = { ok?: boolean; error?: string; counts?: Record<string, number>; rows?: AddRowAnswer[] };
const rpc = (name: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (n: string, a: unknown) => Promise<{ data: unknown; error: { message?: string } | null }>)(name, args);

export function useMultiTownLeads(trade: string) {
  const { isLeadExcluded, loadExclusions } = useLeadSearchContext();
  const [statuses, setStatuses] = useState<Record<string, TownStatus>>({});
  const [results, setResults] = useState<TownResult[]>([]);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<{ total: number; searched: number; failed: number; notSearched: number; limitMessage: string | null } | null>(null);
  /* Rows the server says are already in the CRM (rowKey → reason), from the free preview after a search. */
  const [inCrm, setInCrm] = useState<Record<string, string>>({});
  const [addPhase, setAddPhase] = useState<AddPhase>({ kind: 'idle' });
  const runningRef = useRef(false);
  const stopRef = useRef(false);

  const merged = useMemo(() => mergeTownResults(results), [results]);

  /** Mark the rows already in the CRM. Free (no paid API); a failure only leaves the marks off. */
  const markInCrm = useCallback(async (rows: MergedLead[]) => {
    if (rows.length === 0) return;
    const marks: Record<string, string> = {};
    for (let i = 0; i < rows.length; i += COVERAGE_ADD_MAX_ROWS) {
      const chunk = rows.slice(i, i + COVERAGE_ADD_MAX_ROWS);
      const { data, error } = await rpc('coverage_add_leads', { _rows: chunk.map((r) => addRowFor(r, trade, null)), _campaign_id: null, _commit: false });
      const a = (data ?? null) as RpcAnswer | null;
      if (error || !a?.ok) return;
      for (const r of a.rows ?? []) if (r.k && r.outcome === 'skipped') marks[r.k] = r.reasons?.[0] ?? 'already_in_crm';
    }
    setInCrm((p) => ({ ...p, ...marks }));
  }, [trade]);

  const searchTowns = useCallback(async (towns: TownToSearch[]) => {
    if (runningRef.current || towns.length === 0) return null;
    runningRef.current = true;
    stopRef.current = false;
    setRunning(true);
    setLastRun(null);
    await loadExclusions().catch(() => undefined);
    const finalKind: Record<string, TownStatus['kind']> = {};
    const run = await runTownSearches<TownToSearch, ResultLead>(towns, async (t) => {
      try {
        const data = await invokeEdge<SearchLeadsAnswer>('search-leads', {
          keyword: trade, location: t.location, radius: 50_000, country: t.country, townOnly: true,
        });
        if (data?.notFound || data?.serviceIssue) return { ok: false, limit: false, message: data.notice ?? 'That town could not be found on the map.' };
        const runId = typeof data?.searchRunId === 'string' ? data.searchRunId : null;
        const leads = sortLeadsForDisplay((Array.isArray(data?.leads) ? data.leads : [])
          .map((l) => (runId ? { ...l, searchRunId: runId } : l))
          .filter((l) => !isLeadExcluded(l as never)));
        const country = typeof data?.resolvedCountry === 'string' && data.resolvedCountry ? data.resolvedCountry : t.country;
        return { ok: true, result: { town: t.town, location: t.location, country, leads } };
      } catch (e) {
        const limit = e instanceof EdgeFunctionError && isLimitRefusal({ status: e.status, code: e.code });
        return { ok: false, limit, message: edgeErrorMessage(e, 'Search failed') };
      }
    }, {
      onStatus: (town, s, result) => {
        finalKind[town] = s.kind;
        setStatuses((p) => ({ ...p, [town]: s }));
        // Results appear as each town finishes; a town searched again replaces its old answer.
        if (result) setResults((p) => [...p.filter((r) => r.town !== result.town), result]);
      },
      isStopped: () => stopRef.current,
    });
    setLastRun({ total: towns.length, searched: run.searched, failed: run.failed, notSearched: run.notSearched, limitMessage: run.limitMessage });
    runningRef.current = false;
    setRunning(false);
    const all = mergeTownResults(run.results).rows;
    void markInCrm(all);
    /* Towns that were actually searched (found or failed); a town a limit or a Stop kept from starting is not. */
    const searchedTowns = towns.filter((t) => finalKind[t.town] === 'done' || finalKind[t.town] === 'failed').map((t) => t.town);
    return { ...run, searchedTowns };
  }, [trade, isLeadExcluded, loadExclusions, markInCrm]);

  const stop = useCallback(() => { stopRef.current = true; }, []);

  const clear = useCallback(() => {
    if (runningRef.current) return;
    setStatuses({}); setResults([]); setLastRun(null); setInCrm({}); setAddPhase({ kind: 'idle' });
  }, []);

  /** ONE bulk add (runBulkAdd: free duplicate check → paced phone / town lookups → ONE save). */
  const addLeads = useCallback(async (rows: MergedLead[], campaignId: string | null): Promise<AddSummary | null> => {
    stopRef.current = false;
    const res = await runBulkAdd(rows, trade, campaignId, {
      addLeads: async (r, c, commit) => {
        const { data, error } = await rpc('coverage_add_leads', { _rows: r, _campaign_id: c, _commit: commit });
        return error ? { ok: false } : ((data ?? { ok: false }) as RpcAnswer);
      },
      lookup: async (placeId) => {
        try {
          const d = await invokeEdge<LookupAnswer & { error?: string }>('google-place-details', { placeId, triggerSource: 'add_to_crm' });
          return d && !(d as { error?: string }).error ? d : null;
        } catch (e) {
          if (e instanceof EdgeFunctionError && isLimitRefusal({ status: e.status, code: e.code })) return { limit: true };
          return null;
        }
      },
      onPhase: setAddPhase,
      isStopped: () => stopRef.current,
    });
    if (!res) return null;
    if (res.summary.added > 0) {
      window.dispatchEvent(new CustomEvent('crm-lead-added'));
      window.dispatchEvent(new CustomEvent('sales-lead-changed'));
    }
    setInCrm((p) => {
      const n = { ...p };
      for (const r of res.rows) {
        if (!r.k) continue;
        if (r.outcome === 'created') n[r.k] = 'added_now';
        else if (r.outcome === 'skipped' && r.reasons?.[0] !== 'no_contact') n[r.k] = r.reasons?.[0] ?? 'already_in_crm';
      }
      return n;
    });
    return res.summary;
  }, [trade]);

  const resetAdd = useCallback(() => setAddPhase({ kind: 'idle' }), []);

  return { statuses, results, merged, running, lastRun, inCrm, addPhase, searchTowns, stop, clear, addLeads, resetAdd };
}
