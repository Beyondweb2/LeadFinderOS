import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { countrySettingsFrom, DEFAULT_COUNTRY_SETTINGS, type CountrySettings, type Market } from '@/lib/outreachMarkets';

/* The per-country sending switches (public.outreach_country_settings, 2026-10-14). Any signed-in role reads them;
   only the admin changes them, through set_outreach_country. A failed read answers the DEFAULTS — the UK on (as
   before), Malaysia and Singapore OFF — so a broken read can only ever send less, never more. */
const sb = supabase as unknown as {
  from: (t: string) => { select: (c: string) => Promise<{ data: unknown[] | null; error: { message: string } | null }> };
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export const COUNTRY_SETTINGS_KEY = ['outreach-country-settings'] as const;

export function useCountrySettings() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: COUNTRY_SETTINGS_KEY,
    staleTime: 60_000,
    queryFn: async (): Promise<CountrySettings> => {
      const { data, error } = await sb.from('outreach_country_settings').select('*');
      if (error) throw new Error(error.message);
      return countrySettingsFrom((data ?? []) as never);
    },
  });
  const save = useCallback(async (country: Market, patch: Record<string, unknown>) => {
    const { data, error } = await sb.rpc('set_outreach_country', { _country: country, _patch: patch });
    const res = data as { ok?: boolean; error?: string } | null;
    if (error || !res?.ok) throw new Error(error?.message ?? res?.error ?? 'save_failed');
    await qc.invalidateQueries({ queryKey: COUNTRY_SETTINGS_KEY });
  }, [qc]);
  return { settings: q.data ?? DEFAULT_COUNTRY_SETTINGS, loaded: q.isSuccess, error: q.error as Error | null, save };
}
