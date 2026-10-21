/* ══ THE INBOX SEND WINDOW (2026-10-21, Paul: "every message I send from the Inbox must respect the lead's local send window") ══
   Until now only the outreach QUEUE kept to the send hours; a reply typed at 23:00 went at 23:00. Now every Inbox send — typed reply,
   approved AI draft, Quick reply, template, voice note, text — is checked against the lead's own window:
     · inside it  → sends exactly as before;
     · outside it → the SERVER saves it as a scheduled send ("Queued, sends at 07:00 their time") and the drain
                    (fn inbox-scheduled-send, every minute) sends it when the window opens, re-checking everything first.
   ⛔ ONE RULE, HERE. The send functions (send-whatsapp-message, send-whatsapp-voice, twilio-sms-send, send-whatsapp-media), the drain
      and the Inbox header all read these functions — never a second copy of the hours.
   ⛔ THE HOURS ARE THE OUTREACH HOURS by default, per channel and market: WhatsApp = the queue's window for the destination digits
      (src/lib/sendWindow.ts — UK 07:00-21:30 London; MY/SG their own), texts = the SMS queue's window (09:00-20:00 London; MY/SG theirs).
      ONE setting overrides both: whatsapp_outreach_state.reply_start_min / reply_end_min (minutes after local midnight, read in the
      market's own zone). Absent, half-set or nonsense → the outreach hours (an absent setting is never "always open").
   ⛔ There is no per-lead time zone in the data; the zone comes from the destination digits, as the queue's does.
   PURE: relative imports of pure leaves only (edge functions import this by relative path). */
import { LONDON_SEND_WINDOW, localMinutes, sendWindowForDigits, type SendWindow } from './sendWindow.ts';
import { mobileMarketOf, windowForMarket, type CountrySettings } from './outreachMarkets.ts';
import { SMS_QUEUE_WINDOW } from './smsMessages.ts';
import { WHATSAPP_SERVICE_WINDOW_MS } from './serviceWindow.ts';

export type InboxChannel = 'whatsapp' | 'sms';
/** What is being sent. `text` covers a typed reply, a Quick reply and an approved AI draft (all free text). */
export type ScheduledKind = 'text' | 'template' | 'voice';

export interface ReplyHours { startMin: number | null; endMin: number | null }

const SMS_UK_WINDOW: SendWindow = { tz: 'Europe/London', startMin: SMS_QUEUE_WINDOW.startHour * 60, endMin: SMS_QUEUE_WINDOW.endHour * 60, label: 'UK' };

function whole(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= 24 * 60 ? n : null;
}

/** The setting, only when BOTH ends are valid and start < end. Anything else = not set (the outreach hours apply). */
export function replyHoursFrom(row: { reply_start_min?: unknown; reply_end_min?: unknown } | null | undefined): ReplyHours | null {
  const s = whole(row?.reply_start_min);
  const e = whole(row?.reply_end_min);
  return s !== null && e !== null && s < e ? { startMin: s, endMin: e } : null;
}

/** The window an Inbox send to these digits must keep to. */
export function replyWindowFor(channel: InboxChannel, digits: string | null | undefined,
                               opts: { replyHours?: ReplyHours | null; countrySettings?: CountrySettings | null } = {}): SendWindow {
  const base = channel === 'whatsapp' ? sendWindowForDigits(digits, opts.countrySettings) : smsWindowForDigits(digits, opts.countrySettings);
  const h = opts.replyHours;
  if (h && h.startMin !== null && h.endMin !== null && h.startMin < h.endMin) return { ...base, startMin: h.startMin, endMin: h.endMin };
  return base;
}

function smsWindowForDigits(digits: string | null | undefined, settings?: CountrySettings | null): SendWindow {
  const m = mobileMarketOf(digits);
  if (m === 'MY' || m === 'SG') return { ...windowForMarket(m, settings, SMS_UK_WINDOW), label: m };
  return SMS_UK_WINDOW;
}

export function replyWindowOpen(w: SendWindow, now: Date = new Date()): boolean {
  const m = localMinutes(w.tz, now);
  return m >= w.startMin && m < w.endMin;
}

/** The next instant the window opens (now, if it is open). Whole minutes; DST-correct (one correction pass). */
export function nextWindowOpenAt(w: SendWindow, now: Date = new Date()): Date {
  if (replyWindowOpen(w, now)) return now;
  const m = localMinutes(w.tz, now);
  const delta = m < w.startMin ? w.startMin - m : 24 * 60 - m + w.startMin;
  const floor = Math.floor(now.getTime() / 60_000) * 60_000;
  let at = new Date(floor + delta * 60_000);
  /* A clock change between now and the opening shifts local time by an hour: read the candidate back and correct. */
  const got = localMinutes(w.tz, at);
  let diff = w.startMin - got;
  if (diff > 12 * 60) diff -= 24 * 60;
  if (diff < -12 * 60) diff += 24 * 60;
  if (diff !== 0 && Math.abs(diff) <= 120) at = new Date(at.getTime() + diff * 60_000);
  return at;
}

export function hhmm(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "21:40" — the time in the window's zone. */
export function localClock(tz: string, at: Date = new Date()): string {
  return hhmm(localMinutes(tz, at));
}

/** The Inbox header line: "Their time 21:40 · opens 07:00" / "Their time 10:15 · open until 21:30". */
export function windowStatusLine(w: SendWindow, now: Date = new Date()): { open: boolean; text: string } {
  const open = replyWindowOpen(w, now);
  return { open, text: `Their time ${localClock(w.tz, now)} · ${open ? `open until ${hhmm(w.endMin)}` : `opens ${hhmm(w.startMin)}`}` };
}

/** The thread bubble: "Queued, sends at 07:00 their time". */
export function queuedLabel(sendAtIso: string, tz: string): string {
  const t = Date.parse(sendAtIso);
  return `Queued, sends at ${Number.isFinite(t) ? localClock(tz, new Date(t)) : '—'} their time`;
}

/** Free-form WhatsApp (a typed reply, an AI draft, a voice note) needs the 24-hour window; a template and a text do not. */
export function needsServiceWindow(channel: InboxChannel, kind: ScheduledKind): boolean {
  return channel === 'whatsapp' && kind !== 'template';
}

export type QueueDecision =
  | { kind: 'send_now' }
  | { kind: 'queue'; sendAt: string; tz: string }
  | { kind: 'refuse'; error: 'service_window_closes_first'; detail: string };

/** At the moment of pressing Send: send now, queue it, or refuse it because WhatsApp's 24 hours run out before the window opens. */
export function queueDecision(a: { channel: InboxChannel; kind: ScheduledKind; window: SendWindow; now: Date; lastInboundAt: string | number | null }): QueueDecision {
  if (replyWindowOpen(a.window, a.now)) return { kind: 'send_now' };
  const at = nextWindowOpenAt(a.window, a.now);
  if (needsServiceWindow(a.channel, a.kind)) {
    const last = typeof a.lastInboundAt === 'number' ? a.lastInboundAt : a.lastInboundAt ? Date.parse(a.lastInboundAt) : NaN;
    if (!Number.isFinite(last) || last + WHATSAPP_SERVICE_WINDOW_MS <= at.getTime()) {
      return { kind: 'refuse', error: 'service_window_closes_first', detail: `${HOLD_LABELS.window_expired}: WhatsApp's 24 hours run out before their window opens at ${hhmm(a.window.startMin)}.` };
    }
  }
  return { kind: 'queue', sendAt: at.toISOString(), tz: a.window.tz };
}

/* ── AT SEND TIME (the drain) ─────────────────────────────────────────────────────────────────────────────────────────── */

export const HOLD_LABELS = {
  replied_since: 'They replied since, check before sending',
  window_expired: '24h window expired, use a template',
} as const;
export type HoldReason = keyof typeof HOLD_LABELS;

export const CANCEL_LABELS = {
  opted_out: 'Cancelled — they asked not to be contacted',
  wrong_number: 'Cancelled — the number is marked wrong',
  lead_stopped: 'Cancelled — the lead is stopped',
  by_person: 'Cancelled',
} as const;
export type CancelReason = keyof typeof CANCEL_LABELS;

/** Pipeline statuses that mean "stop contacting" — a queued reply to one of them never goes. Positive list. */
export const STOPPED_LEAD_STATUSES: readonly string[] = ['not_interested', 'wrong_number', 'opted_out', 'do_not_contact'];

export interface DrainFacts {
  channel: InboxChannel;
  kind: ScheduledKind;
  window: SendWindow;
  now: Date;
  /** contact_suppressions verdict for the number/lead: 'other' = suppressed for any other reason (a decline, archived) — every
   *  automated sender refuses those, and a queued reply is sent by the machine. 'unknown' = the read failed (wait, never send). */
  suppression: 'none' | 'opted_out' | 'wrong_number' | 'other' | 'unknown';
  leadArchived: boolean;
  leadStatus: string | null;
  /** The newest inbound message from them (either channel's own log), and the moment the person last looked (queued / released). */
  newestInboundAt: string | null;
  checkedAt: string;
  /** The newest inbound on WhatsApp, for the 24-hour window. */
  lastWhatsappInboundAt: string | null;
  /** An earlier scheduled send in the same conversation has not gone yet — keep the order. */
  earlierPending: boolean;
}

export type DrainDecision =
  | { kind: 'send' }
  | { kind: 'wait'; why: 'window_closed' | 'suppression_unreadable' | 'earlier_pending' }
  | { kind: 'hold'; reason: HoldReason }
  | { kind: 'cancel'; reason: CancelReason };

/** The ORDER is the rule: a stop beats everything, then a newer message from them, then WhatsApp's 24 hours, then the window. */
export function drainDecision(f: DrainFacts): DrainDecision {
  if (f.suppression === 'opted_out') return { kind: 'cancel', reason: 'opted_out' };
  if (f.suppression === 'wrong_number') return { kind: 'cancel', reason: 'wrong_number' };
  if (f.suppression === 'other' || f.leadArchived || (f.leadStatus !== null && STOPPED_LEAD_STATUSES.includes(f.leadStatus))) return { kind: 'cancel', reason: 'lead_stopped' };
  if (f.suppression !== 'none') return { kind: 'wait', why: 'suppression_unreadable' };
  if (f.earlierPending) return { kind: 'wait', why: 'earlier_pending' };
  const inbound = f.newestInboundAt ? Date.parse(f.newestInboundAt) : NaN;
  if (Number.isFinite(inbound) && inbound > Date.parse(f.checkedAt)) return { kind: 'hold', reason: 'replied_since' };
  if (needsServiceWindow(f.channel, f.kind)) {
    const last = f.lastWhatsappInboundAt ? Date.parse(f.lastWhatsappInboundAt) : NaN;
    if (!Number.isFinite(last) || f.now.getTime() - last >= WHATSAPP_SERVICE_WINDOW_MS) return { kind: 'hold', reason: 'window_expired' };
  }
  if (!replyWindowOpen(f.window, f.now)) return { kind: 'wait', why: 'window_closed' };
  return { kind: 'send' };
}

/* ── THE INBOX'S VIEW OF A SCHEDULED ROW ──────────────────────────────────────────────────────────────────────────────── */

export type ScheduledStatus = 'scheduled' | 'sending' | 'sent' | 'held' | 'cancelled' | 'failed';
export interface ScheduledSendRow {
  id: string;
  lead_id: string | null;
  phone: string;
  channel: InboxChannel;
  kind: ScheduledKind;
  body: string | null;
  template_name: string | null;
  send_at: string;
  tz: string;
  status: ScheduledStatus;
  hold_reason: string | null;
  cancel_reason: string | null;
  error: string | null;
  created_at: string;
  queued_by: string | null;
}

/** Still waiting to go (shown in the thread, editable / cancellable). */
export function isOpenScheduled(r: Pick<ScheduledSendRow, 'status'>): boolean {
  return r.status === 'scheduled' || r.status === 'held';
}
/** A held row is a Needs you. */
export function scheduledNeedsYou(r: Pick<ScheduledSendRow, 'status'>): boolean {
  return r.status === 'held';
}
/** Edit is for free text only (a template's words are Meta's; a voice note is a recording). */
export function scheduledEditable(r: Pick<ScheduledSendRow, 'status' | 'kind'>): boolean {
  return isOpenScheduled(r) && r.kind === 'text';
}
/** "Send when open" after a "they replied since" hold: the person has looked. A 24-hour hold can only be cancelled. */
export function scheduledReleasable(r: Pick<ScheduledSendRow, 'status' | 'hold_reason'>): boolean {
  return r.status === 'held' && r.hold_reason === 'replied_since';
}

export function scheduledLine(r: Pick<ScheduledSendRow, 'status' | 'send_at' | 'tz' | 'hold_reason' | 'cancel_reason' | 'error'>): string {
  if (r.status === 'scheduled') return queuedLabel(r.send_at, r.tz);
  if (r.status === 'sending') return 'Sending…';
  if (r.status === 'held') return `Held — ${HOLD_LABELS[r.hold_reason as HoldReason] ?? 'check before sending'}`;
  if (r.status === 'cancelled') return CANCEL_LABELS[r.cancel_reason as CancelReason] ?? 'Cancelled';
  if (r.status === 'failed') return `Not sent — ${r.error || 'the send was refused'}`;
  return 'Sent';
}

/** The send button's word. */
export function sendVerb(open: boolean): 'Send' | 'Queue' {
  return open ? 'Send' : 'Queue';
}

export { LONDON_SEND_WINDOW };
