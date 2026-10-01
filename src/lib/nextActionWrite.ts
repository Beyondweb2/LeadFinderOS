import { leadRpc, type RpcResult } from '@/lib/leadRpc';
import { notifyLeadChanged } from '@/lib/leadSync';
import { recordStateChange } from '@/lib/leadOutcome';
import { salesStateOf, type LeadStateInput } from '@/lib/leadState';
import { hhmmOf, londonInstant, meetingDayTime } from '@/lib/nextActionView';

/* ⛔ THE ONE WRITE FOR A NEXT ACTION (2026-10-02, Paul: "ONE shared model and ONE shared set of action types").
 *
 * The model: outreach_leads.next_action (the next_action_type enum; the types offered are NEXT_ACTION_OPTIONS
 * in src/lib/salesCrm.ts), next_action_date (a UK DAY), next_action_time (an optional UK time on that day,
 * for EVERY type) and next_action_note (what to do, at most 500 characters). Every screen writes through
 * these functions, which call the ownership-checked server function for BOTH roles:
 *   lead_set_follow_up → the four columns at once + History "follow_up_set" saying set / rescheduled /
 *   changed / updated / completed / cleared. ⛔ ONE NEXT ACTION (2026-10-02): call_booked_at ("Meeting booked")
 *   is set by the server ONLY as the mirror of a Meeting Next Action with a time, and cleared the moment the
 *   Next Action stops being that Meeting (completed, cleared, changed, time removed). lead_set_call_booked is a
 *   wrapper over the same write. A logged Call back / Meeting booked saves its Next Action through here too
 *   (src/lib/leadOutcome.ts).
 * Reminders (notify_due_follow_ups) read the day and print the time. Screens: the lead workspace
 * (LeadCrmPanel), the Outreach row and phone card (NextActionEditor), the bulk "Set Action" menu and the
 * Inbox's lead popup (useOutreach.updateNextAction). They all draw the same form (NextActionForm). */

export interface NextActionInput {
  /** A NEXT_ACTION_OPTIONS value; 'none' clears it. */
  nextAction: string;
  /** 'YYYY-MM-DD' (UK day) or null. Ignored for 'none'. */
  date: string | null;
  /** 'HH:MM' UK time on that day, or null (no time). Ignored without a day. */
  time?: string | null;
  /** What to do, in words, or null. */
  note: string | null;
  /** ✓ Done (History: completed) rather than Clear (cleared). Only with 'none'. */
  done?: boolean;
}

export type WriteResult = RpcResult & { patch?: Record<string, unknown> };

/** Save a lead's next action (both roles). ⛔ INSTANT, AND THE DATABASE STILL WINS (as the workspace's save,
 *  2026-09-28): the chosen values reach every open screen the moment Save is pressed (an optimistic notice —
 *  nobody re-reads yet); a refusal sends a plain notice, so every reader re-reads the true row. With the lead's
 *  state, a Meeting booked here also records "Meeting booked" in History. */
export async function saveNextAction(leadId: string, a: NextActionInput, stateLead?: LeadStateInput): Promise<WriteResult> {
  const none = a.nextAction === 'none';
  /* Done / Clear take the note with the action (the server does the same; History keeps it). */
  const note = none ? null : ((a.note ?? '').trim() || null);
  const date = none ? null : (a.date || null);
  const time = date ? hhmmOf(a.time) : null;
  const meetingAt = a.nextAction === 'meeting' && date && time ? londonInstant(date, time) : null;
  /* ⛔ call_booked_at is the Meeting's mirror (migration 20261002180000): the timed Meeting's instant, else null —
     so completing, clearing or changing a Meeting takes its booking with it, on every open screen at once. */
  const patch: Record<string, unknown> = { next_action: a.nextAction, next_action_date: date, next_action_time: time, next_action_note: note, call_booked_at: meetingAt };
  notifyLeadChanged(leadId, undefined, patch, true);
  const r = await leadRpc('lead_set_follow_up', { _lead_id: leadId, _next_action: a.nextAction, _date: date, _note: note, _time: time, _done: !!(none && a.done) });
  if (!r.ok) { notifyLeadChanged(leadId); return r; }
  if (meetingAt && stateLead) await recordStateChange(leadId, salesStateOf(stateLead), salesStateOf({ ...stateLead, call_booked_at: meetingAt }), 'meeting_booked');
  notifyLeadChanged(leadId, undefined, patch);
  return { ...r, patch };
}

/** The workspace's "When is the call / meeting?" box: a booked instant → the Meeting on that UK day and time,
 *  through the same write (the server books call_booked_at from it). */
export async function bookMeeting(leadId: string, iso: string, note: string | null | undefined, stateLead?: LeadStateInput): Promise<WriteResult> {
  if (!Number.isFinite(Date.parse(iso))) return { ok: false, error: 'bad_meeting_time' };
  const { day, time } = meetingDayTime(iso);
  return saveNextAction(leadId, { nextAction: 'meeting', date: day, time, note: note ?? null }, stateLead);
}
