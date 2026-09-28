/* ══ THE QUEUE'S SEND WINDOW, IN THE RECIPIENT'S OWN TIME (2026-09-28) ═════════════════════════════════
   🔴 WHY. process-whatsapp-queue opened ONE window, 07:00–21:30 Europe/London, for everyone. An Indian
   prospect (IST, UTC+5:30) would have been messaged 11:30–02:00 their time in BST — five of the
   window's hours after 21:00 in India — and never during their morning.
   ⛔ THE WINDOW IS CHOSEN FROM THE NUMBER WE SEND TO, NEVER FROM outreach_leads.country. The country
   column was measured wrong on ~370 live rows (349 UK businesses stored as USA, 24 foreign ones as UK);
   the dialling code of the destination is the recipient's own country by definition.
   ⛔ UK IS UNCHANGED: every number that is not an Indian mobile/landline (+91) gets the London window,
   exactly the constants the queue had (07:00 inclusive – 21:30 exclusive, DST-correct).
   INDIA: 10:00–19:00 IST — ordinary business hours (the TRAI commercial-communication window is wider,
   10:00–21:00; this stays inside it on purpose). IST has no DST.
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
export const INDIA_SEND_WINDOW: SendWindow = { tz: 'Asia/Kolkata', startMin: 10 * 60, endMin: 19 * 60, label: 'India' };

/** Every window the queue can be serving — the tick runs while ANY of them is open. */
export const SEND_WINDOWS: readonly SendWindow[] = [LONDON_SEND_WINDOW, INDIA_SEND_WINDOW];

/** The window for a destination in WhatsApp digits (E.164 without "+", e.g. "919876543210"). */
export function sendWindowForDigits(digits: string | null | undefined): SendWindow {
  const d = String(digits ?? '').replace(/\D/g, '');
  return /^91\d{10}$/.test(d) ? INDIA_SEND_WINDOW : LONDON_SEND_WINDOW;
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
