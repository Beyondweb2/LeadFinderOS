/* THE PER-COUNTRY WHATSAPP AUTO SWITCH-OFF — the TypeScript mirror of the SQL rule `public.country_whatsapp_auto_pause`
   (migration 20261122090000, which replaced 20261029090000's trial rule on 2026-10-22, docs/country-auto-off.md). The
   DATABASE decides (a trigger on every failed WhatsApp write, whoever wrote it); this copy exists so the rule is readable,
   tested and worded once for the screens. `scripts/country-auto-off.test.ts` pins the two copies together.

   Malaysia, Singapore and Australia. The UK keeps the queue's own burst auto-pause (src/lib/whatsappPace.ts), unchanged.
   Counted on real sends to the country since it was last switched on (test + simulated sends never count):
     • PATTERN — at least `minFails` failures AND at least `failPct` % of the last `window` sends failed.
     • SYSTEMIC — any failed send in that window with a Meta code about OUR account or template (COUNTRY_SYSTEMIC_CODES).
   One failed number never switches a country off: that lead alone is flagged (No WhatsApp for Meta 131026, WhatsApp failed
   otherwise — _shared/whatsapp-failure.ts routing, unchanged). 22 Oct: Australia went off on 1 of 5, a number not on
   WhatsApp.
   2026-10-22 (fix/auto-off-counts, migration 20261124090000): a failure that is NOT ON WHATSAPP (Meta 131026, or its lead
   is flagged No WhatsApp) is left out entirely — not a failure and not one of the window's sends — and so is a failure the
   webhook has not settled on the lead yet (it is counted when the lead is marked; a trigger re-runs the check then).
   Australia went off twice on 22 Oct with 3 of 5 failures being numbers not on WhatsApp. */

/** The defaults when the country's setting is NULL (outreach_country_settings.whatsapp_auto_off_*). */
export const COUNTRY_AUTO_OFF_DEFAULTS = { minFails: 5, window: 10, failPct: 50 } as const;

/** Meta codes about our account, login or template — never one number. One is enough to switch a country off.
 *  Login / permission (0, 3, 10, 190, 200), account restricted / rated down / unpaid / unregistered / maintenance
 *  (368, 131031, 131042, 131045, 131048, 131057, 133010), not allowed to message this country (130497), marketing
 *  switched off or limited (131063, 131064), template missing / against policy / paused / disabled (132001, 132007,
 *  132015, 132016). Not here: 131026 (that number is not on WhatsApp), 131049 / 131050 (that person), rate limits. */
export const COUNTRY_SYSTEMIC_CODES: readonly number[] = [
  0, 3, 10, 190, 200, 368, 130497, 131031, 131042, 131045, 131048, 131057, 131063, 131064, 132001, 132007, 132015, 132016, 133010,
];

export interface CountrySendOutcome {
  /** When the send was made (ISO). */
  at: string;
  failed: boolean;
  code: number | null;
  /** The number is not on WhatsApp (Meta 131026, or the lead is flagged No WhatsApp): never counted. */
  notOnWhatsApp?: boolean;
  /** The webhook has not marked the lead yet: not counted until it has. */
  unsettled?: boolean;
}

export interface CountryAutoOffSettings {
  whatsapp_auto_off_min_fails?: number | null;
  whatsapp_auto_off_window?: number | null;
  whatsapp_auto_off_fail_pct?: number | null;
}

export interface CountryAutoPauseVerdict {
  switchOff: boolean;
  /** Sends in the window counted. */
  sends: number;
  failed: number;
  /** Sends left out (not on WhatsApp, or not settled yet), over the whole period. */
  notCounted: number;
  /** The newest systemic code in the window, when that is the reason. */
  systemicCode: number | null;
}

/** The three numbers for a country (NULL / absent = the default). */
export function countryAutoOffRule(s?: CountryAutoOffSettings | null) {
  return {
    minFails: s?.whatsapp_auto_off_min_fails ?? COUNTRY_AUTO_OFF_DEFAULTS.minFails,
    window: s?.whatsapp_auto_off_window ?? COUNTRY_AUTO_OFF_DEFAULTS.window,
    failPct: s?.whatsapp_auto_off_fail_pct ?? COUNTRY_AUTO_OFF_DEFAULTS.failPct,
  };
}

/** sends: every real send to the country since it was switched on, in any order. */
export function countryAutoPauseVerdict(sends: readonly CountrySendOutcome[], settings?: CountryAutoOffSettings | null): CountryAutoPauseVerdict {
  const rule = countryAutoOffRule(settings);
  const counted = sends.filter((s) => !(s.failed && (s.notOnWhatsApp === true || s.unsettled === true)));
  const last = [...counted].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, rule.window);
  const failed = last.filter((s) => s.failed).length;
  const systemicCode = last.find((s) => s.failed && s.code != null && COUNTRY_SYSTEMIC_CODES.includes(s.code))?.code ?? null;
  const pattern = failed >= rule.minFails && failed * 100 >= rule.failPct * last.length;
  return { switchOff: systemicCode != null || pattern, sends: last.length, failed, notCounted: sends.length - counted.length, systemicCode };
}

/** The rule in one plain line, for the settings screen. */
export function countryAutoOffRuleWords(s?: CountryAutoOffSettings | null): string {
  const r = countryAutoOffRule(s);
  return `Each switches itself off only if at least ${r.minFails} sends fail and they are at least ${r.failPct}% of its last ${r.window}, `
    + 'or if Meta refuses a send for a reason about our account or template. Numbers that are not on WhatsApp are not counted, '
    + 'and one failed number only marks that lead.';
}

/** The banner's headline for a country that switched itself off. The reason itself is the stored one, word for word. */
export function countryAutoPauseHeadline(countryName: string): string {
  return `WhatsApp to ${countryName} switched itself off`;
}
