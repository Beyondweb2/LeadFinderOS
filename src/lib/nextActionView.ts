/* THE NEXT ACTION, AS EVERY SCREEN SHOWS IT (UI cleanup pass, 2026-09-29).
 *
 * ⛔ ONE STATE: outreach_leads.next_action / next_action_date / next_action_time (optional, UK) /
 * next_action_note — written only by a person, through src/lib/nextActionWrite.ts (lead_set_follow_up). This
 * file only READS it, so the popup, the Inbox list, Outreach and Focus Mode can never describe the
 * same lead's next action in different words. Pure: no imports but the day rule, no I/O.
 *
 * ⛔ ONE NEXT ACTION (2026-10-02, Paul): there is no second, derived "what's next" line anywhere — a booked
 * meeting IS a Meeting Next Action (call_booked_at mirrors it, lead_set_follow_up), a logged Call back IS a
 * Call Next Action. If a screen shows something that looks like a Next Action, it is this one.
 *
 * ⛔ ENUMERATED. 'none' and null mean "no next action" and draw nothing; a stored value this file does
 * not know is shown as its own words, never dropped. */
import { NEXT_ACTION_LABEL, followUpBucket, hhmmOf, londonInstant, londonToday, type FollowUpBucket } from './salesCrm.ts';
export { NEXT_ACTION_LABEL, hhmmOf, londonInstant };

/* NEXT_ACTION_LABEL lives in salesCrm.ts (History needs it there; one map, no circular import). */

/** ⛔ THE ONE LIST of Next Action types done IN a WhatsApp conversation (the Inbox). Everything else —
 *  a call, an email, sending information, a meeting, the generic "follow up" — is done from the lead's
 *  workspace. Read by the Sales workspace fold, the dashboard links and the filters. */
export const WHATSAPP_NEXT_ACTIONS: ReadonlySet<string> = new Set(['send_follow_up', 'send_voice_note', 'send_initial_text', '2nd_follow_up', 'send_draft']);

export interface NextActionView {
  /** "Call", "WhatsApp follow-up"… */
  label: string;
  /** "Overdue · 2 Oct", "Today", "Tomorrow", "Thu 3 Oct", "12 Nov" — null when no date was set. */
  when: string | null;
  /** The short form for a list row: "Overdue", "Today", "Tomorrow", "3 Oct" — null when no date. */
  short: string | null;
  /** overdue / today / upcoming, or 'none' when the action has no date. */
  bucket: FollowUpBucket;
  /** What to do, in the person's own words (next_action_note), or null. */
  note: string | null;
  /** "14:30" — the action's UK time (next_action_time), for every type; null when it has none. */
  time: string | null;
}

function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

function dayLabel(d: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
}

/** The lead's next action in words, or null when there is none. */
export function nextActionView(
  lead: { next_action?: string | null; next_action_date?: string | null; next_action_note?: string | null; next_action_time?: string | null } | null | undefined,
  today: string = londonToday(),
  nowMs: number = Date.now(),
): NextActionView | null {
  return nextActionViewOf(lead?.next_action, lead?.next_action_date, lead?.next_action_note, today, lead?.next_action_time, nowMs);
}

/** The bucket of a stored lead's next action (date + optional UK time), for every count and filter. */
export function nextActionBucketOf(lead: { next_action?: string | null; next_action_date?: string | null; next_action_time?: string | null } | null | undefined, today: string = londonToday(), nowMs: number = Date.now()): FollowUpBucket {
  if (!hasAction(lead?.next_action)) return 'none';
  return followUpBucket(lead?.next_action_date ?? null, today, lead?.next_action_time ?? null, nowMs);
}

/** A booked instant as a datetime-local value in UK time ('2026-10-02T14:30'). */
export function londonLocalInput(iso: string): string {
  const { day, time } = meetingDayTime(iso);
  return `${day}T${time}`;
}

/** The London day and time of a booked meeting: { day: '2026-10-03', time: '14:30' }. */
export function meetingDayTime(iso: string): { day: string; time: string } {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }),
    time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }),
  };
}

/** The same, from the three values themselves (a row that carries no note passes none). */
export function nextActionViewOf(rawAction: string | null | undefined, rawDate: string | null | undefined, rawNote?: string | null, today: string = londonToday(), rawTime?: string | null, nowMs: number = Date.now()): NextActionView | null {
  const action = (rawAction ?? '').trim();
  if (!action || action === 'none') return null;
  const label = NEXT_ACTION_LABEL[action] ?? action.replace(/_/g, ' ');
  const note = (rawNote ?? '').trim() || null;
  const date = (rawDate ?? '').slice(0, 10);
  const time = date ? hhmmOf(rawTime) : null;
  const bucket = followUpBucket(date || null, today, time, nowMs);
  if (bucket === 'none') return { label, when: null, short: null, bucket, note, time: null };
  const diff = dayDiff(today, date);
  const dm = dayLabel(date, { day: 'numeric', month: 'short' });
  if (bucket === 'overdue') return { label, when: diff === 0 ? 'Overdue · Today' : `Overdue · ${dm}`, short: 'Overdue', bucket, note, time };
  if (bucket === 'today') return { label, when: 'Today', short: 'Today', bucket, note, time };
  if (diff === 1) return { label, when: 'Tomorrow', short: 'Tomorrow', bucket, note, time };
  const when = diff < 7 ? dayLabel(date, { weekday: 'short', day: 'numeric', month: 'short' }) : dm;
  return { label, when, short: dm, bucket, note, time };
}

/* ══ NEXT ACTION FILTERS AND SORTS — ONE RULE FOR THE INBOX AND OUTREACH (2026-09-30) ═══════════════
   ⛔ 2026-10-02: a timed action is overdue once its UK time has passed (followUpBucket) — so "Overdue" and
   "Due today" split a day at that time; an untimed one keeps the day rule. "Next 7 days" is what is still to
   come (an overdue action is under Overdue only).
   Both screens, both roles, read the same stored values (next_action / next_action_date / _time) through these,
   so "Overdue" means the same thing everywhere. ⛔ Nothing is invented: an action with no date is
   "No date set", never given one; "No Next Action" is 'none' or empty. A done action is one a person
   cleared (to 'none'), so it is never still due. Days are London calendar days (londonToday). */
export type NextActionWhen = 'all' | 'overdue' | 'today' | 'tomorrow' | 'next7' | 'later' | 'undated' | 'none';
export const NEXT_ACTION_WHEN_OPTIONS: { value: NextActionWhen; label: string }[] = [
  { value: 'all', label: 'Any next action' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due today' },
  { value: 'tomorrow', label: 'Due tomorrow' },
  { value: 'next7', label: 'Next 7 days' },
  { value: 'later', label: 'Later' },
  { value: 'undated', label: 'Set, no date' },
  { value: 'none', label: 'No next action' },
];
export type NextActionKind = 'all' | 'call' | 'whatsapp' | 'email' | 'send_info' | 'send_proposal' | 'chase_payment' | 'meeting' | 'other';
export const NEXT_ACTION_KIND_OPTIONS: { value: NextActionKind; label: string }[] = [
  { value: 'all', label: 'Any type' },
  { value: 'call', label: 'Call' },
  { value: 'whatsapp', label: 'WhatsApp follow-up' },
  { value: 'email', label: 'Email' },
  { value: 'send_info', label: 'Send information' },
  { value: 'send_proposal', label: 'Send proposal' },
  { value: 'chase_payment', label: 'Chase payment' },
  { value: 'meeting', label: 'Meeting / callback' },
  { value: 'other', label: 'Other' },
];

const hasAction = (a: string | null | undefined) => { const v = (a ?? '').trim(); return !!v && v !== 'none'; };

/** The type group of a stored next_action value. */
export function nextActionKindOf(action: string | null | undefined): Exclude<NextActionKind, 'all'> | null {
  if (!hasAction(action)) return null;
  const a = String(action).trim();
  if (a === 'call') return 'call';
  if (WHATSAPP_NEXT_ACTIONS.has(a)) return 'whatsapp';
  if (a === 'email') return 'email';
  if (a === 'send_info') return 'send_info';
  if (a === 'send_proposal') return 'send_proposal';
  if (a === 'chase_payment') return 'chase_payment';
  if (a === 'meeting') return 'meeting';
  return 'other';
}

/** Does a lead's next action pass the When + Type filters? */
export function passesNextActionFilter(
  lead: { next_action?: string | null; next_action_date?: string | null; next_action_time?: string | null } | null | undefined,
  when: NextActionWhen, kind: NextActionKind, today: string = londonToday(), nowMs: number = Date.now(),
): boolean {
  const action = lead?.next_action;
  if (when === 'none') return !hasAction(action);
  if (when === 'all' && kind === 'all') return true;
  if (!hasAction(action)) return false;
  if (kind !== 'all' && nextActionKindOf(action) !== kind) return false;
  if (when === 'all') return true;
  const d = (lead?.next_action_date ?? '').slice(0, 10);
  if (!d) return when === 'undated';
  if (when === 'undated') return false;
  const diff = dayDiff(today, d);
  const overdue = followUpBucket(d, today, lead?.next_action_time ?? null, nowMs) === 'overdue';
  if (when === 'overdue') return overdue;
  if (when === 'today') return diff === 0 && !overdue;
  if (when === 'tomorrow') return diff === 1;
  if (when === 'next7') return diff >= 0 && diff <= 7 && !overdue;
  return diff > 7; // later
}

/** Sort key for "Next Action due soonest" (most overdue first): dated actions by date, then undated
 *  actions, then leads with none. Ascending. */
export function nextActionSortKey(lead: { next_action?: string | null; next_action_date?: string | null; next_action_time?: string | null } | null | undefined): string {
  if (!hasAction(lead?.next_action)) return '3';
  const d = (lead?.next_action_date ?? '').slice(0, 10);
  // Within a day: timed actions by their time, then the day's untimed ones.
  return d ? `1${d} ${hhmmOf(lead?.next_action_time) ?? '24:00'}` : '2';
}

/** One line for a title / tooltip: "Call · Tomorrow · ring after their website contract ends". */
export function nextActionText(v: NextActionView): string {
  return [v.label, v.when, v.time, v.note].filter(Boolean).join(' · ');
}
