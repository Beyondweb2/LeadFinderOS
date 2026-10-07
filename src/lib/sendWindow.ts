/* ══ THE QUEUE'S SEND WINDOW (2026-09-28; India removed 2026-10-15) ══════════════════════════════════
   The queue sends 07:00–21:30 Europe/London (07:00 inclusive – 21:30 exclusive, DST-correct).
   ⛔ INDIA IS NO LONGER AN OUTREACH MARKET (2026-10-15). There used to be a second window here, 10:00–19:00 IST,
   for +91 numbers. It is gone: a +91 number gets NO special hours, and cold WhatsApp to anything that is not a
   UK mobile is refused outright (src/lib/ukColdDestination.ts). The window is still chosen from the digits we
   send to, never from outreach_leads.country (measured wrong on ~370 live rows).
   ⛔ PURE, NO IMPORTS: the queue imports this by relative path. */

export interface SendWindow {
  /** IANA zone the window is read in. */
  tz: string;
  /** Minutes from local midnight, start inclusive / end exclusive. */
  startMin: number;
  endMin: number;
  label: string;
}

export const LONDON_SEND_WINDOW: SendWindow = { tz: 'Europe/London', startMin: 7 * 60, endMin: 21 * 60 + 30, label: 'UK' };
export const SEND_WINDOWS: readonly SendWindow[] = [LONDON_SEND_WINDOW];

/** The window for a destination in WhatsApp digits. One window for everyone now (the digits stay in the signature so
 *  a future market is a one-line change here, not a new call site). */
export function sendWindowForDigits(_digits: string | null | undefined): SendWindow {
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
  const m = localMinutes(w.tz, now);
  return m >= w.startMin && m < w.endMin;
}

/** Is the window for THIS destination open now? */
export function windowOpenForDigits(digits: string | null | undefined, now: Date = new Date()): boolean {
  return windowOpen(sendWindowForDigits(digits), now);
}

/** Is ANY window open (the queue's outer gate)? */
export function anyWindowOpen(now: Date = new Date()): boolean {
  return SEND_WINDOWS.some((w) => windowOpen(w, now));
}
