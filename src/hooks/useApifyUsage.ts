import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/* THE APIFY ACCOUNT'S MONTHLY SPEND, where the operator will actually see it.
 *
 * Apify runs every AI-visibility search and every SEO scan. When its monthly cap is reached it stops
 * serving BOTH, and the audit questions fail with an HTTP 402 that the UI used to report as "term too
 * broad". The account sat at 99.8% for two days before that happened, and `apify-usage.ts` logged
 * CRITICAL 170 times into edge-function logs nobody reads.
 *
 * Read through the apify-usage-status function, not straight from the table: apify_account_usage has
 * RLS on with NO policies, so a direct read returns 200 with an empty array and would look exactly
 * like a healthy account with no data.
 *
 * NEVER THROWS AND NEVER BLOCKS. This is a status line beside the real work; if it cannot load, it
 * renders nothing. A billing widget must not be able to break the audit page.
 */

export interface ApifyUsage {
  capturedAt: string | null;
  monthlyUsageUsd: number | null;
  maxMonthlyUsageUsd: number | null;
  /** 0–1. Recomputed server-side from used/cap so a mid-cycle cap RISE is reflected immediately. */
  usagePct: number | null;
  cycleStart: string | null;
  cycleEnd: string | null;
}

export { APIFY_WARN_PCT, APIFY_HIGH_PCT, APIFY_CRITICAL_PCT, apifyTone, apifyWarningText, type ApifyTone } from '@/lib/apifyTiers';

/** `enabled: false` defers the read until it turns true (2026-09-27, site-wide speed pass): the
 *  Outreach table only shows the usage inside its bulk-audit dialog, and was calling the edge
 *  function on every visit. `loaded` separates "not answered yet" from "answered with nothing", so a
 *  screen never says the usage was unreadable while it is still being read. */
export function useApifyUsage({ enabled = true }: { enabled?: boolean } = {}): { usage: ApifyUsage | null; reload: () => void; loaded: boolean } {
  const [usage, setUsage] = useState<ApifyUsage | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions
        .invoke<{ ok?: boolean; usage?: ApifyUsage | null }>('apify-usage-status', { body: {} });
      if (error) { setUsage(null); return; }
      setUsage(data?.usage ?? null);
    } catch {
      setUsage(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { if (enabled) load(); }, [load, enabled]);

  return { usage, reload: load, loaded };
}
