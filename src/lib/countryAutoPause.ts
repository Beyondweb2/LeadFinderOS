/* THE PER-COUNTRY WHATSAPP AUTO SWITCH-OFF (2026-10-15, feat/send-error-capture) — the TypeScript mirror of the SQL rule
   `public.country_whatsapp_auto_pause` (migration 20261029090000). The DATABASE decides (a trigger on every failed
   WhatsApp write, whoever wrote it); this copy exists so the rule is readable, tested and worded once for the screens.
   `scripts/country-auto-pause.test.ts` pins the two copies together.

   Malaysia and Singapore only. The UK keeps the queue's own burst auto-pause (src/lib/whatsappPace.ts), unchanged.
   Counted on real sends to the country since it was last switched on (test + simulated sends never count):
     • TRIAL — while COUNTRY_TRIAL_SENDS or fewer sends have gone, ANY failure switches it off, except Meta 131026
       (that one number is not on WhatsApp: a fact about the number, not about sending to the country).
     • AFTER — COUNTRY_AUTO_PAUSE_FAILS or more failures among the last COUNTRY_AUTO_PAUSE_WINDOW sends. */

export const COUNTRY_TRIAL_SENDS = 5;
export const COUNTRY_AUTO_PAUSE_WINDOW = 5;
export const COUNTRY_AUTO_PAUSE_FAILS = 2;
export const NOT_ON_WHATSAPP_CODE = 131026;

export interface CountrySendOutcome {
  /** When the send was made (ISO). */
  at: string;
  failed: boolean;
  code: number | null;
}

export interface CountryAutoPauseVerdict {
  switchOff: boolean;
  sends: number;
  failed: number;
}

/** sends: every real send to the country since it was switched on, in any order. */
export function countryAutoPauseVerdict(sends: readonly CountrySendOutcome[]): CountryAutoPauseVerdict {
  const all = sends.length;
  const last = [...sends].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, COUNTRY_AUTO_PAUSE_WINDOW);
  const failed = last.filter((s) => s.failed).length;
  const trialFail = last.filter((s) => s.failed && s.code !== NOT_ON_WHATSAPP_CODE).length;
  const switchOff = (all <= COUNTRY_TRIAL_SENDS && trialFail >= 1) || failed >= COUNTRY_AUTO_PAUSE_FAILS;
  return { switchOff, sends: all, failed };
}

/** The banner's headline for a country that switched itself off. The reason itself is the stored one, word for word. */
export function countryAutoPauseHeadline(countryName: string): string {
  return `WhatsApp to ${countryName} switched itself off`;
}
