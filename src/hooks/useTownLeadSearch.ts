import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Lead } from '@/types/lead';
/* PURE, so they live in the lib and are testable outside Vite — this module pulls in the
   supabase client, which needs import.meta.env and therefore cannot be imported by a node test. */
import { townSearchKey, sortLeadsForDisplay } from '@/lib/nicheView';
export { townSearchKey, sortLeadsForDisplay };

/* ════════════════════════════════════════════════════════════════════════════════════════════
   PARALLEL PER-TOWN LEAD SEARCHES — one independent search per town row, several at once.

   🔴 WHY THIS EXISTS INSTEAD OF REUSING LeadSearchContext.search(). That function is the Find
   Leads PAGE's search, and it is deliberately single-flight: its first act is
   `abortRef.current.abort()`, cancelling whatever was already running, and it writes into ONE
   global `leads` / `isLoading` / `lastSearch`. So two town rows driving it cannot run together —
   the second kills the first, and whichever finishes last owns the only result set. That is
   exactly the one-at-a-time behaviour being replaced, and it is a property of the context, not a
   bug in it: a page with one result list should only have one search in flight.

   So each row gets its OWN search here, keyed by trade+town, with its own status and its own
   results. Rows never share state, so N towns can search at once and each offers "Add all" the
   moment IT finishes.

   ⛔ THE RESULT SHAPE IS NOT RE-DERIVED. search-leads returns `data.leads` already as Lead[];
   the context's only post-processing is (1) drop excluded businesses and (2) sort no-website
   first. Both are applied here through the SAME `isLeadExcluded` the context uses (passed in, not
   copied), so a lead added from a row is the same lead the page would have shown in the same
   order. Re-implementing either rule is how the two screens would drift apart.

   ⚠️ EVERY PRESS IS A REAL SEARCH: ~11p of Places quota, and free within 72h for the same trade
   and town because search-leads short-circuits on its own cache. The caller states the price.
   ⚠️ Nothing here is persisted. A row's results are for this visit; the CRM add is the durable
   act. Persisting them would mean a stale pool offering "Add all" over businesses that may have
   changed, with no way to tell how old it was.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

export type TownSearchState =
  | { kind: 'idle' }
  | { kind: 'searching'; startedAt: number }
  | { kind: 'done'; leads: Lead[] }
  | { kind: 'added'; leads: Lead[]; added: number; dupes: number }
  | { kind: 'error'; message: string };



interface SearchLeadsResponse {
  leads?: Lead[];
  error?: string;
}

export function useTownLeadSearch(isLeadExcluded: (lead: Lead) => boolean) {
  const [states, setStates] = useState<Record<string, TownSearchState>>({});
  /* In-flight keys, in a ref so a second press cannot double-start a town between renders — the
     click handler reads it synchronously. A duplicate press would spend twice for one row. */
  const inFlight = useRef<Set<string>>(new Set());

  const stateFor = useCallback(
    (trade: string, town: string): TownSearchState => states[townSearchKey(trade, town)] ?? { kind: 'idle' },
    [states],
  );

  const searchingCount = Object.values(states).filter((s) => s.kind === 'searching').length;

  const start = useCallback(async (trade: string, town: string) => {
    const key = townSearchKey(trade, town);
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    setStates((p) => ({ ...p, [key]: { kind: 'searching', startedAt: Date.now() } }));
    try {
      /* The same filters SearchForm builds for a town search, and the same function. `skipHistory`
         is NOT sent: unlike the page's own path (which writes its own search_history row with
         post-exclusion counts), nothing here writes one, so letting search-leads write its default
         row keeps the pool indexed rather than invisible to the dashboard. */
      const { data, error } = await supabase.functions.invoke<SearchLeadsResponse>('search-leads', {
        body: { keyword: trade, location: town, radius: 50_000, country: 'UK', townOnly: true },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      const raw = Array.isArray(data?.leads) ? data!.leads! : [];
      const leads = sortLeadsForDisplay(raw.filter((l) => !isLeadExcluded(l)));
      setStates((p) => ({ ...p, [key]: { kind: 'done', leads } }));
    } catch (e) {
      setStates((p) => ({ ...p, [key]: { kind: 'error', message: e instanceof Error ? e.message : 'search failed' } }));
    } finally {
      inFlight.current.delete(key);
    }
  }, [isLeadExcluded]);

  /** Record the outcome of an "Add all" without losing the leads — the row keeps offering View. */
  const markAdded = useCallback((trade: string, town: string, added: number, dupes: number) => {
    const key = townSearchKey(trade, town);
    setStates((p) => {
      const cur = p[key];
      const leads = cur && (cur.kind === 'done' || cur.kind === 'added') ? cur.leads : [];
      return { ...p, [key]: { kind: 'added', leads, added, dupes } };
    });
  }, []);

  const reset = useCallback((trade: string, town: string) => {
    const key = townSearchKey(trade, town);
    setStates((p) => { const n = { ...p }; delete n[key]; return n; });
  }, []);

  return { stateFor, start, markAdded, reset, searchingCount };
}
