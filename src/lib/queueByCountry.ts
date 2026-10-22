/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE WHATSAPP QUEUE, ONE TAB PER COUNTRY (2026-10-22, feat/whatsapp-queue-by-country).

   ⛔ A SCREEN RULE ONLY. It reads the rows the page already has and changes no sending behaviour: which country a
      queued lead belongs to is decided by the DIGITS we would send to (mobileMarketOf), never outreach_leads.country.
      A queued lead that is not a reachable mobile (no number, a landline) has no market; it is listed under the UK tab,
      where its "No mobile" warning already was, so nothing waiting ever disappears from the screen.
   Pure: no React, no Supabase.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { mobileMarketOf, windowForMarket, windowOpen, hhmm, MARKETS, type CountrySettings, type Market } from './outreachMarkets';
import { toWhatsAppDigits } from './waNumber';
import type { QueueRow } from './whatsappQueueView';

/** The tabs, left to right. */
export const QUEUE_TABS: readonly Market[] = MARKETS;
export const TAB_LABEL: Record<Market, string> = { UK: 'UK', MY: 'Malaysia', SG: 'Singapore', AU: 'Australia' };
/** The calling code a country's numbers start with (digits only) — the same prefixes the sender's own daily count uses. */
export const TAB_CALLING_CODE: Record<Market, string> = { UK: '44', MY: '60', SG: '65', AU: '61' };

/** Which tab a queued lead is listed under. No reachable mobile → UK (see the header). */
export function tabOfRow(r: Pick<QueueRow, 'phone' | 'country'>): Market {
  return mobileMarketOf(toWhatsAppDigits(r.phone ?? '', r.country ?? null)) ?? 'UK';
}

/** Split the authorised rows into one list per tab. Every row lands in exactly one. */
export function splitByTab(rows: readonly QueueRow[]): Record<Market, QueueRow[]> {
  const out: Record<Market, QueueRow[]> = { UK: [], MY: [], SG: [], AU: [] };
  for (const r of rows) out[tabOfRow(r)].push(r);
  return out;
}

const UK_WINDOW_FALLBACK = { tz: 'Europe/London', startMin: 7 * 60, endMin: 21 * 60 + 30 };

function clock(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
}

/** The tab's local clock: "14:32" in the country's own zone. Australia has one zone per lead, so it has no single clock. */
export function tabClock(m: Market, settings: CountrySettings, now = new Date()): { tz: string | null; time: string; perLead: boolean } {
  if (m === 'AU') return { tz: null, time: '', perLead: true };
  const w = windowForMarket(m, settings, UK_WINDOW_FALLBACK);
  return { tz: w.tz, time: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: w.tz }), perLead: false };
}

/**
 * "Next send" for one country, in that country's own time, from the server's one next-eligible stamp.
 * ⛔ The server has ONE next-send stamp for the whole queue, not one per country, so a country shows it only while it
 *    could be the one sending (switched on, window open). Otherwise it says why it will not: Off / Opens 09:00.
 *    Nothing here is a promise about which country goes next.
 */
export function nextSendWords(m: Market, settings: CountrySettings, teamNextIso: string | null | undefined,
                              opts: { paused?: boolean; ukWindowOpen?: boolean | null; ukStartHour?: number | null } = {}, now = new Date()): string {
  if (m !== 'UK' && settings[m]?.whatsapp_on !== true) return 'Off';
  if (opts.paused) return 'Paused';
  if (m === 'AU') return 'Lead’s own time';
  if (m === 'UK') {
    if (opts.ukWindowOpen === false) return typeof opts.ukStartHour === 'number' ? `Opens ${hhmm(opts.ukStartHour * 60)}` : 'Closed';
  } else {
    const w = windowForMarket(m, settings, UK_WINDOW_FALLBACK);
    if (!windowOpen(w, now)) return `Opens ${hhmm(w.startMin)}`;
  }
  if (!teamNextIso) return '—';
  const tz = windowForMarket(m, settings, UK_WINDOW_FALLBACK).tz;
  return clock(teamNextIso, tz);
}
