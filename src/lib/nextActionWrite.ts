import { leadRpc, type RpcResult } from '@/lib/leadRpc';
import { notifyLeadChanged } from '@/lib/leadSync';
import { recordStateChange } from '@/lib/leadOutcome';
import { salesStateOf, type LeadStateInput } from '@/lib/leadState';
import { meetingDayTime, meetingNote } from '@/lib/nextActionView';

/* ⛔ THE ONE WRITE FOR A NEXT ACTION (2026-10-02, Paul: "ONE shared model and ONE shared set of action types").
 *
 * The model: outreach_leads.next_action (the next_action_type enum; the types offered are NEXT_ACTION_OPTIONS
 * in src/lib/salesCrm.ts), next_action_date (a London DAY) and next_action_note (what to do, at most 500
 * characters). Time exists only for a Meeting: call_booked_at, the booked instant. Every screen writes through
 * these two functions, which call the ownership-checked server functions for BOTH roles:
 *   lead_set_follow_up → the three columns at once + History "Follow-up set" (lead_activity follow_up_set);
 *   lead_set_call_booked → the meeting time.
 * Reminders (notify_due_follow_ups) read the day; nothing here changes that. Screens: the lead workspace
 * (LeadCrmPanel), the Outreach row and phone card (NextActionEditor), the bulk "Set Action" menu and the
 * Inbox's lead popup (useOutreach.updateNextAction). They all draw the same form (NextActionForm). */

export interface NextActionInput {
  /** A NEXT_ACTION_OPTIONS value; 'none' clears (completed / cancelled — the History row says cleared). */
  nextAction: string;
  /** 'YYYY-MM-DD' (London day) or null. Ignored for 'none'. */
  date: string | null;
  /** What to do, in words, or null. */
  note: string | null;
  /** A Meeting's time as an ISO instant: books call_booked_at and sets the Meeting on that day. */
  meetingAt?: string | null;
}

export type WriteResult = RpcResult & { patch?: Record<string, unknown> };

/** Save a lead's next action (both roles). ⛔ INSTANT, AND THE DATABASE STILL WINS (as the workspace's save,
 *  2026-09-28): the chosen values reach every open screen the moment Save is pressed (an optimistic notice —
 *  nobody re-reads yet); a refusal sends a plain notice, so every reader re-reads the true row. */
export async function saveNextAction(leadId: string, a: NextActionInput, stateLead?: LeadStateInput): Promise<WriteResult> {
  if (a.nextAction === 'meeting' && a.meetingAt) return bookMeeting(leadId, a.meetingAt, a.note, stateLead);
  const none = a.nextAction === 'none';
  const note = (a.note ?? '').trim() || null;
  const date = none ? null : (a.date || null);
  const patch = { next_action: a.nextAction, next_action_date: date, next_action_note: note };
  notifyLeadChanged(leadId, undefined, patch, true);
  const r = await leadRpc('lead_set_follow_up', { _lead_id: leadId, _next_action: a.nextAction, _date: date, _note: note });
  if (!r.ok) { notifyLeadChanged(leadId); return r; }
  notifyLeadChanged(leadId, undefined, patch);
  return { ...r, patch };
}

/** Book a meeting: the time (call_booked_at) and the Next Action "Meeting" on that London day — one Save, so
 *  the Next Action is still human-set. With the lead's state, History also records "Meeting booked". */
export async function bookMeeting(leadId: string, iso: string, note: string | null | undefined, stateLead?: LeadStateInput): Promise<WriteResult> {
  if (!Number.isFinite(Date.parse(iso))) return { ok: false, error: 'bad_meeting_time' };
  const at = new Date(iso).toISOString();
  const booked = await leadRpc('lead_set_call_booked', { _lead_id: leadId, _at: at });
  if (!booked.ok) return booked;
  const { day, time } = meetingDayTime(at);
  const text = meetingNote(time, note);
  const r = await leadRpc('lead_set_follow_up', { _lead_id: leadId, _next_action: 'meeting', _date: day, _note: text });
  const patch = { call_booked_at: at, next_action: 'meeting', next_action_date: day, next_action_note: text };
  if (!r.ok) { notifyLeadChanged(leadId, undefined, { call_booked_at: at }); return r; }
  if (stateLead) await recordStateChange(leadId, salesStateOf(stateLead), salesStateOf({ ...stateLead, call_booked_at: at }), 'meeting_booked');
  notifyLeadChanged(leadId, undefined, patch);
  return { ...r, patch };
}
