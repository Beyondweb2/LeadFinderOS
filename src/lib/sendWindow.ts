/* ══ THE QUEUE'S SEND WINDOW (2026-09-28; India removed 2026-10-15) ══════════════════════════════════
   The queue sends 07:00–21:30 Europe/London (07:00 inclusive – 21:30 exclusive, DST-correct).
   ⛔ INDIA IS NO LONGER AN OUTREACH MARKET (2026-10-15). There used to be a second window here, 10:00–19:00 IST,
   for +91 numbers. It is gone: a +91 number gets NO special hours, and cold WhatsApp to anything that is not a
   UK mobile is refused outright (src/lib/ukColdDestination.ts). The window is still chosen from the digits we
   send to, never from outreach_leads.country (measured wrong on ~370 live rows).
   ⛔ MALAYSIA AND SINGAPORE (2026-10-14): a Malaysian / Singapore MOBILE gets its own country's hours (09:00-19:00
   local by default, set per country in outreach_country_settings — src/lib/outreachMarkets.ts). Every other number keeps
   the London window, byte for byte. Pass the settings; left out, MY / SG use their defaults.
   ⛔ PURE (one relative import of another pure leaf): the queue imports this by relative path. */
/* ⛔ AUSTRALIA (2026-10-22): an Australian mobile's window is read in the LEAD's zone (`leadTz`, src/lib/auLeadZone.ts),
   Mon–Fri. Without a zone it never opens ("needs state"). A caller that has no lead to read passes nothing and the
   Australian lead is simply held — never sent in a guessed zone. */
import { AU_LEAD_ZONES, AU_SEND_DAYS, ABROAD_MARKETS, channelOn, localWeekday, mobileMarketOf, windowForMarket, windowOpenAt,
         type CountrySettings, type Market } from './outreachMarkets.ts';

export interface SendWindow {
  /** IANA zone the window is read in. */
  tz: string;
  /** Minutes from local midnight, start inclusive / end exclusive. */
  startMin: number;
  endMin: number;
  label: string;
  /** Local weekdays it opens on (0 = Sunday). Absent = every day. */
  days?: readonly number[];
  /** No zone for a per-lead-zone market (Australia): never open. */
  needsState?: boolean;
}

export const LONDON_SEND_WINDOW: SendWindow = { tz: 'Europe/London', startMin: 7 * 60, endMin: 21 * 60 + 30, label: 'UK' };
export const SEND_WINDOWS: readonly SendWindow[] = [LONDON_SEND_WINDOW];

/** The window for a destination in WhatsApp digits. One window for everyone now (the digits stay in the signature so
 *  a future market is a one-line change here, not a new call site). */
export function sendWindowForDigits(digits: string | null | undefined, settings?: CountrySettings | null, leadTz?: string | null): SendWindow {
  const m = mobileMarketOf(digits);
  if (m === 'MY' || m === 'SG' || m === 'AU') return { ...windowForMarket(m, settings, LONDON_SEND_WINDOW, leadTz), label: m };
  return LONDON_SEND_WINDOW;
}

/** Local minutes-from-midnight in `tz` at `now`. */
export function localMinutes(tz: string, now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

export function windowOpen(w: SendWindow, now: Date = new Date()): boolean {
  return windowOpenAt(w, now);
}

/** Is the window for THIS destination open now? `leadTz` = an Australian lead's zone (src/lib/auLeadZone.ts). */
export function windowOpenForDigits(digits: string | null | undefined, now: Date = new Date(), settings?: CountrySettings | null,
                                    leadTz?: string | null): boolean {
  return windowOpen(sendWindowForDigits(digits, settings, leadTz), now);
}

/** Is ANY window open (the queue's outer gate)? */
export function anyWindowOpen(now: Date = new Date(), settings?: CountrySettings | null): boolean {
  if (SEND_WINDOWS.some((w) => windowOpen(w, now))) return true;
  return marketWindowOpen(ABROAD_MARKETS, 'whatsapp', now, settings);
}

/** Is a switched-on market's own window open now (Malaysia / Singapore; Australia: in ANY of its zones)? */
export function marketWindowOpen(markets: readonly Market[], channel: 'whatsapp' | 'sms', now: Date = new Date(),
                                 settings?: CountrySettings | null): boolean {
  return markets.some((m) => m !== 'UK' && channelOn(settings ?? null, m, channel)
    && (m === 'AU'
      ? AU_LEAD_ZONES.some((tz) => windowOpen({ ...windowForMarket(m, settings, LONDON_SEND_WINDOW, tz), label: m }, now))
      : windowOpen({ ...windowForMarket(m, settings, LONDON_SEND_WINDOW), label: m }, now)));
}

export { AU_SEND_DAYS, localWeekday };
