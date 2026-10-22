/* ⛔ AN OFF COUNTRY HOLDS ITS QUEUE (2026-10-22, docs/country-auto-off.md). A queued WhatsApp lead whose country's switch is
   OFF (by hand or automatically) waits in the queue — nothing written — and sends once the country is switched back on. It
   used to be released back to New, one per tick (70 Australian leads on 22 Oct). The UK is not held by this: it has the
   queue's own pause, unchanged. A null market (not a mobile we know) is not "held": the drip's own guards refuse it.
   A leaf of its own so src/lib/outreachMarkets.ts (reached by 24 edge functions) did not change. Edge-reachable: relative
   imports with .ts. */
import { channelOn, type CountrySetting, type CountrySettings, type Market } from './outreachMarkets.ts';

export function heldCountryOff(settings: CountrySettings | null | undefined, market: Market | null): boolean {
  return !!market && market !== 'UK' && !channelOn(settings, market, 'whatsapp');
}

/** The stored row with the 2026-10-22 columns: when / by whom WhatsApp was last switched off (by NULL = automatically),
 *  and the auto switch-off rule's three numbers (NULL = COUNTRY_AUTO_OFF_DEFAULTS in src/lib/countryAutoPause.ts). */
export type CountryOffSetting = CountrySetting & {
  whatsapp_off_at?: string | null;
  whatsapp_off_by?: string | null;
  whatsapp_auto_off_min_fails?: number | null;
  whatsapp_auto_off_window?: number | null;
  whatsapp_auto_off_fail_pct?: number | null;
};
