import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { MarketOption, MarketViewResult } from '@/lib/marketView';

/* ============================================================
   MARKET VIEW — loading a trade + town, and the two actions that can follow.

   READING is free and automatic. SPENDING never is: every path that costs money (the lead search,
   the audit batch, the LLM re-extraction) is a separate explicit call behind its own confirm in the
   page. This hook exposes them; it never fires them.
   ============================================================ */

export interface UseMarketView {
  options: MarketOption[];
  optionsLoading: boolean;
  view: MarketViewResult | null;
  loading: boolean;
  error: string | null;
  /** force = skip the session cache and refetch. Used by reload() and after anything that changes
   *  the underlying data (an audit batch, a lead search, a re-extraction). */
  load: (trade: string, town: string, force?: boolean) => Promise<MarketViewResult | null>;
  reload: () => Promise<MarketViewResult | null>;
  refreshOptions: () => Promise<void>;
}

/** Read the REAL message out of a functions.invoke error. supabase-js sets `error` on any non-2xx
 *  and its .message is the useless "Edge Function returned a non-2xx status code" — the real one is
 *  in the body, reachable via error.context. Reading only .message is what made the bulk-audit
 *  failure unreadable for a day. */
async function realError(fnErr: { message: string }): Promise<string> {
  let real = fnErr.message;
  try {
    const ctx = (fnErr as unknown as { context?: Response }).context;
    if (ctx && typeof ctx.text === 'function') {
      const body = await ctx.text();
      const parsed = body ? JSON.parse(body) as { error?: string } : null;
      if (parsed?.error) real = parsed.error;
    }
  } catch { /* keep the wrapper message if the body cannot be read */ }
  return real;
}

/* ── SESSION CACHE ────────────────────────────────────────────────────────────────────────────
   Coming back to Find Leads should re-render what was on screen, not sit on a spinner while an
   edge function re-folds a market that has not changed. Mirrors how the lead search already keeps
   its results in sessionStorage: same storage, same "survives navigation, dies with the tab".

   Keyed on trade + town, so two markets never serve each other's numbers. TTL is short because the
   view is a claim about live data — an audit batch or a lead search changes it, and both call
   reload(force) anyway, so the TTL only covers plain navigation. */
const CACHE_KEY = 'leadfinder_market_view';
const CACHE_TTL_MS = 10 * 60 * 1000;

const cacheKeyFor = (trade: string, town: string) =>
  `${trade.trim().toLowerCase()}|||${town.trim().toLowerCase()}`;

function readCache(trade: string, town: string): MarketViewResult | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { key?: string; at?: number; result?: MarketViewResult };
    if (!parsed?.key || parsed.key !== cacheKeyFor(trade, town)) return null;
    if (!parsed.at || Date.now() - parsed.at > CACHE_TTL_MS) return null;
    // A cached shape from an older deploy would render half a panel; require the fields the page
    // actually reads rather than trusting whatever was stored.
    const r = parsed.result;
    if (!r || !r.concentration || !Array.isArray(r.named) || !Array.isArray(r.pool) || !r.poolState) return null;
    return r;
  } catch {
    return null;   // quota, private mode, malformed JSON — a cache miss, never an error
  }
}

function writeCache(trade: string, town: string, result: MarketViewResult): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ key: cacheKeyFor(trade, town), at: Date.now(), result }));
  } catch { /* best effort */ }
}

export function useMarketView(): UseMarketView {
  const [options, setOptions] = useState<MarketOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [view, setView] = useState<MarketViewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<{ trade: string; town: string } | null>(null);

  const refreshOptions = useCallback(async () => {
    setOptionsLoading(true);
    try {
      const { data, error: fnErr } = await supabase.functions
        .invoke<{ ok?: boolean; options?: MarketOption[]; error?: string }>('market-view', { body: { action: 'options' } });
      if (fnErr) { setError(await realError(fnErr)); return; }
      if (data?.ok === false) { setError(data.error ?? 'Could not load markets.'); return; }
      setOptions(data?.options ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOptionsLoading(false);
    }
  }, []);

  /* ⛔ RETURNS THE VIEW IT JUST FETCHED, as well as setting it.
     A caller that needs the FRESH view immediately after a reload cannot get it from `view`: that
     is React state, and the closure the caller was created in still holds the PREVIOUS value until
     a re-render. autoCleanIfDirty did exactly that — `await onReload()` then read a stale `view` —
     so on the first measurement of a market it read runIds: [] and shouldAutoClean() returned false
     for want of a run, every time. Wisbech driving instructors sat at 125.5 distinct names per
     audit against a threshold of 15 and the auto-clean never fired.
     Returning the value makes the fresh view reachable at the one moment it is needed, without a
     ref, a re-render dependency, or a second fetch. */
  const load = useCallback(async (trade: string, town: string, force = false): Promise<MarketViewResult | null> => {
    if (!trade || !town) return null;
    setLast({ trade, town });
    setError(null);

    /* CACHE FIRST, and return without touching the network. The loading state is deliberately not
       raised here: flashing a spinner before painting a result we already hold is the thing this
       is meant to remove. */
    if (!force) {
      const hit = readCache(trade, town);
      if (hit) { setView(hit); setLoading(false); return hit; }
    }

    setLoading(true);
    try {
      const { data, error: fnErr } = await supabase.functions
        .invoke<MarketViewResult>('market-view', { body: { action: 'view', trade, town } });
      if (fnErr) { setError(await realError(fnErr)); setView(null); return null; }
      if (data && data.ok === false) { setError(data.error ?? 'Could not load this market.'); setView(null); return null; }
      setView(data ?? null);
      if (data) writeCache(trade, town, data);
      return data ?? null;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setView(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /* reload() ALWAYS forces. Every caller is something that just changed the underlying data — an
     audit batch, a lead search, a re-extraction — so serving the pre-change cache would show the
     operator the state they were trying to move on from. */
  const reload = useCallback(async (): Promise<MarketViewResult | null> => {
    if (!last) return null;
    return await load(last.trade, last.town, true);
  }, [last, load]);

  /* No auto-fetch of the trade/town OPTIONS list any more. The picker it fed is gone: the market
     is now whatever is typed into Find Leads' own niche and location boxes, deliberately including
     trades and towns with no audits yet. refreshOptions stays callable, but firing it on every
     mount would be an edge-function round trip for a dropdown that no longer exists. */

  return { options, optionsLoading, view, loading, error, load, reload, refreshOptions };
}
