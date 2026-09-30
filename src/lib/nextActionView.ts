/* THE NEXT ACTION, AS EVERY SCREEN SHOWS IT (UI cleanup pass, 2026-09-29).
 *
 * ⛔ ONE STATE: outreach_leads.next_action / next_action_date / next_action_note — written only by a
 * person, through lead_set_follow_up (the lead popup) or updateNextAction (the Outreach cell). This
 * file only READS it, so the popup, the Inbox list, Outreach and Focus Mode can never describe the
 * same lead's next action in different words. Pure: no imports but the day rule, no I/O.
 *
 * ⛔ ENUMERATED. 'none' and null mean "no next action" and draw nothing; a stored value this file does
 * not know is shown as its own words, never dropped. */
import { followUpBucket, londonToday, type FollowUpBucket } from './salesCrm.ts';

/** The words for each stored next_action value. The first six are the ones the popup offers today
 *  (NEXT_ACTION_OPTIONS); the rest are older values that can still be on a row. */
export const NEXT_ACTION_LABEL: Record<string, string> = {
  call: 'Call',
  send_follow_up: 'WhatsApp follow-up',
  email: 'Email',
  follow_up: 'Follow up',
  send_info: 'Send information',
  meeting: 'Meeting',
  send_voice_note: 'Voice note',
  send_initial_text: 'Send opener',
  '2nd_follow_up': 'Second follow-up',
  send_draft: 'Send link',
  check_3_day_removal: 'Check in',
  remove_if_no_reply: 'Close if no reply',
};

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
}

function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

function dayLabel(d: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
}

/** The lead's next action in words, or null when there is none. */
export function nextActionView(
  lead: { next_action?: string | null; next_action_date?: string | null; next_action_note?: string | null } | null | undefined,
  today: string = londonToday(),
): NextActionView | null {
  return nextActionViewOf(lead?.next_action, lead?.next_action_date, lead?.next_action_note, today);
}

/** The same, from the three values themselves (a row that carries no note passes none). */
export function nextActionViewOf(rawAction: string | null | undefined, rawDate: string | null | undefined, rawNote?: string | null, today: string = londonToday()): NextActionView | null {
  const action = (rawAction ?? '').trim();
  if (!action || action === 'none') return null;
  const label = NEXT_ACTION_LABEL[action] ?? action.replace(/_/g, ' ');
  const note = (rawNote ?? '').trim() || null;
  const date = (rawDate ?? '').slice(0, 10);
  const bucket = followUpBucket(date || null, today);
  if (bucket === 'none') return { label, when: null, short: null, bucket, note };
  const diff = dayDiff(today, date);
  const dm = dayLabel(date, { day: 'numeric', month: 'short' });
  if (bucket === 'overdue') return { label, when: `Overdue · ${dm}`, short: 'Overdue', bucket, note };
  if (bucket === 'today') return { label, when: 'Today', short: 'Today', bucket, note };
  if (diff === 1) return { label, when: 'Tomorrow', short: 'Tomorrow', bucket, note };
  const when = diff < 7 ? dayLabel(date, { weekday: 'short', day: 'numeric', month: 'short' }) : dm;
  return { label, when, short: dm, bucket, note };
}

/** One line for a title / tooltip: "Call · Tomorrow · ring after their website contract ends". */
export function nextActionText(v: NextActionView): string {
  return [v.label, v.when, v.note].filter(Boolean).join(' · ');
}
