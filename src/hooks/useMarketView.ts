import { useCallback, useEffect, useState } from 'react';
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
  load: (trade: string, town: string) => Promise<void>;
  reload: () => Promise<void>;
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

  const load = useCallback(async (trade: string, town: string) => {
    if (!trade || !town) return;
    setLoading(true);
    setError(null);
    setLast({ trade, town });
    try {
      const { data, error: fnErr } = await supabase.functions
        .invoke<MarketViewResult>('market-view', { body: { action: 'view', trade, town } });
      if (fnErr) { setError(await realError(fnErr)); setView(null); return; }
      if (data && data.ok === false) { setError(data.error ?? 'Could not load this market.'); setView(null); return; }
      setView(data ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setView(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const reload = useCallback(async () => {
    if (last) await load(last.trade, last.town);
  }, [last, load]);

  useEffect(() => { void refreshOptions(); }, [refreshOptions]);

  return { options, optionsLoading, view, loading, error, load, reload, refreshOptions };
}
