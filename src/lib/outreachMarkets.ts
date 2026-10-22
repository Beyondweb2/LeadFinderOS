/* ══ WHICH COUNTRY A NUMBER BELONGS TO, AND MAY WE REACH IT THERE — ONE RULE (2026-10-14, feat/my-sg-support) ══════
   The team now prospects Malaysia and Singapore as well as the UK. Until today every sending path accepted ONLY a UK
   mobile (src/lib/ukColdDestination.ts) and called everything else "No mobile" — so every Malaysian and Singapore
   mobile was flagged as if it were a landline.

   ⛔ THE MARKET IS READ FROM THE DIGITS WE WOULD SEND TO (E.164 without "+", from waNumber.toWhatsAppDigits), never
   from outreach_leads.country — the same law as the UK rule. A positive allowlist:
     UK  447 + 9 digits                     (unchanged: isUkColdDestination)
     MY  60 1x + 7 digits, or 60 11 + 8      (Malaysian mobiles are 01x; only 011 has the longer number — a 1-800 is not one)
     SG  65 + 8 or 9 + 7 digits             (Singapore mobiles start 8 or 9; 3… is VoIP, 6… is a landline)
   Anything else — absent, malformed, a landline, another country — is no market: on a sending path unknown means do not.

   ⛔ A MARKET IS NOT PERMISSION. Each market has its own switch per channel (WhatsApp, SMS, browser calling) in
   public.outreach_country_settings, set by the admin. The UK is ON for all three (its rules are unchanged);
   Malaysia and Singapore start OFF. A mobile in a market that is switched off is NOT "No mobile": it is a real
   mobile we are choosing not to message yet ('country_off'), so nothing is written on the lead.

   The SQL twin is public.mobile_market(country, phone_key) (migration 20261025090000_my_sg_markets.sql); keep equal.

   ⛔ AUSTRALIA (2026-10-22, feat/australia-whatsapp, docs/australia-whatsapp.md): a WhatsApp market like Malaysia — its
   own switch, daily cap and auto-off — with two differences:
     · WHATSAPP ONLY. channelOn answers false for Australian SMS and browser calls whatever is stored (prospect-only;
       texts to +61 stay refused). The SQL twin outreach_channel_on and set_outreach_country refuse them too.
     · ITS HOURS ARE PER LEAD. Australia spans five zones, so the window is read in the zone of the lead's STATE
       (src/lib/auLeadZone.ts), Mon–Fri only. No zone given = the window never opens ("needs state") — never a guess.
     AU  61 4 + 8 digits (Australian mobiles are 04…; 02/03/07/08 are landlines).
   ⛔ PURE, NO IMPORTS: edge functions import this by relative path. */

export type Market = 'UK' | 'MY' | 'SG' | 'AU';
export type OutreachChannel = 'whatsapp' | 'sms' | 'call';
export const MARKETS: readonly Market[] = ['UK', 'MY', 'SG', 'AU'];
/** The markets that are not the UK, in one list (the queue's market loops read this, never a hand-typed pair). */
export const ABROAD_MARKETS: readonly Exclude<Market, 'UK'>[] = ['MY', 'SG', 'AU'];
/** Markets reached by WhatsApp ONLY: SMS and browser calls are never on, whatever is stored. */
export const WHATSAPP_ONLY_MARKETS: ReadonlySet<Market> = new Set<Market>(['AU']);
/** Markets whose hours are read in each lead's own zone (src/lib/auLeadZone.ts), not one country zone. */
export const PER_LEAD_ZONE_MARKETS: ReadonlySet<Market> = new Set<Market>(['AU']);
/** Australia's send days: Monday–Friday in the lead's own zone (0 = Sunday … 6 = Saturday). */
export const AU_SEND_DAYS: readonly number[] = [1, 2, 3, 4, 5];

/** The reason token when a real mobile is in a market whose channel is switched off. Stored / consumed — never rename. */
export const COUNTRY_OFF = 'country_off';

/** The lead `country` value for each market (src/types/outreach.ts `Country`). */
export const MARKET_COUNTRY: Record<Market, string> = { UK: 'UK', MY: 'Malaysia', SG: 'Singapore', AU: 'Australia' };
export const MARKET_NAME: Record<Market, string> = { UK: 'United Kingdom', MY: 'Malaysia', SG: 'Singapore', AU: 'Australia' };

/** The market of a MOBILE number in WhatsApp digits ("60123456789"), or null. */
export function mobileMarketOf(digits: string | null | undefined): Market | null {
  const d = String(digits ?? '').replace(/\D/g, '');
  if (/^447\d{9}$/.test(d)) return 'UK';
  if (/^601([02-9]\d{7}|1\d{8})$/.test(d)) return 'MY';
  if (/^65[89]\d{7}$/.test(d)) return 'SG';
  if (/^614\d{8}$/.test(d)) return 'AU';
  return null;
}

/** The market of ANY callable number (mobile or landline) in WhatsApp digits, or null. Browser calling reaches
 *  landlines too: the UK rule is the existing 44 1/2/3/7 shape (twilio-voice-token UK_CALLABLE, unchanged). */
export function callMarketOf(digits: string | null | undefined): Market | null {
  const d = String(digits ?? '').replace(/\D/g, '');
  if (/^44[1237]\d{8,9}$/.test(d)) return 'UK';
  if (/^60(1([02-9]\d{7}|1\d{8})|[3-9]\d{7,8})$/.test(d)) return 'MY';
  if (/^65[3689]\d{7}$/.test(d)) return 'SG';
  return null;
}

/** One country's stored settings (public.outreach_country_settings). NULL / absent fields mean the default. */
export interface CountrySetting {
  country: Market;
  whatsapp_on?: boolean | null;
  sms_on?: boolean | null;
  call_on?: boolean | null;
  /** The country's own daily cap for the queue (WhatsApp); NULL = no country cap (the UK: the team cap is the cap). */
  whatsapp_daily_cap?: number | null;
  /** The country's own daily cap for texts; NULL = no country cap. */
  sms_daily_cap?: number | null;
  /** Local send hours in minutes after midnight, [start, end). NULL = the existing UK windows (London). */
  send_start_min?: number | null;
  send_end_min?: number | null;
  timezone?: string | null;
  /* 2026-10-15 (src/lib/countryAutoPause.ts): when WhatsApp was last switched on, and the automatic switch-off note. */
  whatsapp_on_since?: string | null;
  whatsapp_auto_paused_at?: string | null;
  whatsapp_auto_pause_reason?: string | null;
  /* 2026-10-22 (docs/country-auto-off.md): when / by whom WhatsApp was last switched off (by NULL = automatically), and the
     auto switch-off rule's three numbers (NULL = COUNTRY_AUTO_OFF_DEFAULTS in src/lib/countryAutoPause.ts). */
  whatsapp_off_at?: string | null;
  whatsapp_off_by?: string | null;
  whatsapp_auto_off_min_fails?: number | null;
  whatsapp_auto_off_window?: number | null;
  whatsapp_auto_off_fail_pct?: number | null;
}

/** What a missing row / missing table means: the UK on (exactly as before), Malaysia and Singapore off. */
export const DEFAULT_COUNTRY_SETTINGS: Record<Market, CountrySetting> = {
  UK: { country: 'UK', whatsapp_on: true, sms_on: true, call_on: true },
  MY: { country: 'MY', whatsapp_on: false, sms_on: false, call_on: false, whatsapp_daily_cap: 50, sms_daily_cap: 25,
        send_start_min: 9 * 60, send_end_min: 19 * 60, timezone: 'Asia/Kuala_Lumpur' },
  SG: { country: 'SG', whatsapp_on: false, sms_on: false, call_on: false, whatsapp_daily_cap: 50, sms_daily_cap: 25,
        send_start_min: 9 * 60, send_end_min: 19 * 60, timezone: 'Asia/Singapore' },
  /* Australia: 09:00–17:00 Mon–Fri in each lead's own zone. `timezone` is only where its daily cap's day is counted from
     (the east coast); the send hours are never read in it. Absent row = OFF, like Malaysia. */
  AU: { country: 'AU', whatsapp_on: false, sms_on: false, call_on: false, whatsapp_daily_cap: 100, sms_daily_cap: null,
        send_start_min: 9 * 60, send_end_min: 17 * 60, timezone: 'Australia/Sydney' },
};

/** The largest per-country daily cap that may be typed (a typo guard; the team cap still binds WhatsApp). */
export const MAX_COUNTRY_DAILY_CAP = 1000;

export type CountrySettings = Record<Market, CountrySetting>;

/** Stored rows → one complete setting per market. A row's NULL keeps the default; a missing row is the default. */
export function countrySettingsFrom(rows: ReadonlyArray<Partial<CountrySetting> & { country?: string | null }> | null | undefined): CountrySettings {
  const out = { UK: { ...DEFAULT_COUNTRY_SETTINGS.UK }, MY: { ...DEFAULT_COUNTRY_SETTINGS.MY }, SG: { ...DEFAULT_COUNTRY_SETTINGS.SG },
                AU: { ...DEFAULT_COUNTRY_SETTINGS.AU } } as CountrySettings;
  for (const r of rows ?? []) {
    const m = String(r?.country ?? '') as Market;
    if (!MARKETS.includes(m)) continue;
    for (const [k, v] of Object.entries(r)) {
      if (k === 'country' || v === null || v === undefined) continue;
      (out[m] as unknown as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

/** Is this channel switched on for this market? Only an explicit true is on (the absent-value law). */
export function channelOn(settings: CountrySettings | null | undefined, market: Market | null, channel: OutreachChannel): boolean {
  if (!market) return false;
  if (channel !== 'whatsapp' && WHATSAPP_ONLY_MARKETS.has(market)) return false;
  const s = (settings ?? DEFAULT_COUNTRY_SETTINGS)[market];
  const v = channel === 'whatsapp' ? s?.whatsapp_on : channel === 'sms' ? s?.sms_on : s?.call_on;
  return v === true;
}

/** ⛔ HELD, NOT RELEASED (2026-10-22): a queued WhatsApp lead whose country's switch is OFF (by hand or automatically) waits
 *  in the queue — nothing written — and sends once the country is switched back on. It used to be released back to New, one
 *  per tick (70 Australian leads on 22 Oct). The UK is not held by this: it has the queue's own pause, unchanged. A null
 *  market (not a mobile we know) is not "held": the drip's own guards refuse it. */
export function heldCountryOff(settings: CountrySettings | null | undefined, market: Market | null): boolean {
  return !!market && market !== 'UK' && !channelOn(settings, market, 'whatsapp');
}

/** The markets whose channel is on — what the browser's checks are given. */
export function marketsOn(settings: CountrySettings | null | undefined, channel: OutreachChannel): Set<Market> {
  return new Set(MARKETS.filter((m) => channelOn(settings, m, channel)));
}

/** May this number be messaged cold on this channel? A mobile in a market whose channel is on. */
export function isReachableMobile(digits: string | null | undefined, channel: 'whatsapp' | 'sms',
                                  settings: CountrySettings | null | undefined): boolean {
  return channelOn(settings, mobileMarketOf(digits), channel);
}

/* ── SEND HOURS BY RECIPIENT COUNTRY ─────────────────────────────────────────────────────────────────────────────
   The UK keeps its existing windows byte for byte (WhatsApp queue 07:00-21:30 London, texts 09:00-20:00 London — the
   callers pass them in as `ukWindow`). Malaysia and Singapore (both UTC+8, no daylight saving) use their own local
   hours, 09:00-19:00 by default, adjustable per country.
   Australia (2026-10-22): its hours (09:00-17:00 by default) are read in the LEAD's zone (`leadTz`, from
   src/lib/auLeadZone.ts), Mon–Fri only. No zone = `needsState`: the window never opens. */
export interface SendWindow {
  tz: string; startMin: number; endMin: number;
  /** Local weekdays the window opens on (0 = Sunday). Absent = every day (the UK, Malaysia, Singapore — unchanged). */
  days?: readonly number[];
  /** A per-lead-zone market with no zone for this lead: never open, nothing is guessed. */
  needsState?: boolean;
}

export function windowForMarket(market: Market, settings: CountrySettings | null | undefined, ukWindow: SendWindow,
                                leadTz?: string | null): SendWindow {
  if (market === 'UK') return ukWindow;
  const s = (settings ?? DEFAULT_COUNTRY_SETTINGS)[market];
  const d = DEFAULT_COUNTRY_SETTINGS[market];
  const start = wholeIn(s?.send_start_min, 0, 24 * 60) ?? (d.send_start_min as number);
  const end = wholeIn(s?.send_end_min, 0, 24 * 60) ?? (d.send_end_min as number);
  if (PER_LEAD_ZONE_MARKETS.has(market)) {
    const ok = typeof leadTz === 'string' && AU_LEAD_ZONES.includes(leadTz);
    return { tz: ok ? leadTz as string : (d.timezone as string), startMin: start, endMin: end, days: AU_SEND_DAYS, ...(ok ? {} : { needsState: true }) };
  }
  return { tz: s?.timezone || (d.timezone as string), startMin: start, endMin: end };
}

/** The IANA zones an Australian lead can be in (src/lib/auLeadZone.ts maps a state to one). A positive list: any other
 *  string is "no zone". */
export const AU_LEAD_ZONES: readonly string[] = [
  'Australia/Sydney', 'Australia/Melbourne', 'Australia/Hobart', 'Australia/Brisbane', 'Australia/Adelaide', 'Australia/Darwin', 'Australia/Perth',
];

/** The local weekday (0 = Sunday … 6 = Saturday) in `tz` at `now`. */
export function localWeekday(tz: string, now: Date = new Date()): number {
  const w = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short' }).format(now);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(w.slice(0, 3));
}

/** The one open-or-not rule every window copy uses: never open when it needs a state, only on its days, then the hours. */
export function windowOpenAt(w: { tz: string; startMin: number; endMin: number; days?: readonly number[]; needsState?: boolean }, now: Date = new Date()): boolean {
  if (w.needsState) return false;
  if (w.days && !w.days.includes(localWeekday(w.tz, now))) return false;
  const m = localMinutes(w.tz, now);
  return m >= w.startMin && m < w.endMin;
}

/** Minutes after local midnight in `tz` at `now`. */
export function localMinutes(tz: string, now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  const g = (k: string) => Number(parts.find((p) => p.type === k)?.value ?? 0);
  return (g('hour') % 24) * 60 + g('minute');
}

export function windowOpen(w: SendWindow, now: Date = new Date()): boolean {
  return windowOpenAt(w, now);
}

/** 00:00 today in `tz`, as a UTC instant — where a country's daily cap counts from. */
export function localDayStartUtc(tz: string, now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(now);
  const g = (k: string) => Number(parts.find((p) => p.type === k)?.value ?? 0);
  const elapsed = (((g('hour') % 24) * 60 + g('minute')) * 60 + g('second')) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - elapsed);
}

/** "09:00" for 540. */
export function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

function wholeIn(v: unknown, lo: number, hi: number): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v)) return null;
  return v < lo || v > hi ? null : v;
}

/** Validate one value the admin typed for a country. null = back to the default. Refused, never clamped. */
export function checkCountryValue(field: 'whatsapp_daily_cap' | 'sms_daily_cap' | 'send_start_min' | 'send_end_min',
                                  v: unknown): { ok: true; value: number | null } | { ok: false; error: string } {
  if (v === null || v === '' || v === undefined) return { ok: true, value: null };
  const n = typeof v === 'string' ? Number(v.trim()) : v;
  const [lo, hi] = field.endsWith('_cap') ? [0, MAX_COUNTRY_DAILY_CAP] : [0, 24 * 60];
  const w = wholeIn(n, lo, hi);
  return w === null ? { ok: false, error: `${field}_out_of_range` } : { ok: true, value: w };
}

/** The SMS sender the texts go from (TWILIO_SMS_FROM, _shared/twilio.ts — checked by digest 2026-10-14). */
export const SMS_SENDER_WORDS = 'Texts go from the team’s UK Twilio number (+44 7400 420187), not a local sender. Malaysian and Singapore networks may filter or block texts from an unregistered foreign sender — delivery depends on sender registration, so check the delivery status of the first few.';
