/* THE SALES VIEW OF A LEAD — pure, derived, never stored (multi-user, 2026-09-27).
 *
 * ⛔ NO SECOND LIFECYCLE. The pipeline is outreach_leads.status, written by the queue, the inbound
 * handler and the operator as before. A "sales stage" is a READING of that status (plus the lead's
 * follow-up date and call-booked stamp), so the rep and the admin can never disagree about where a
 * lead is. The only status this feature adds is 'won_pending_onboarding': the rep closed it and the
 * admin onboards — it grants no paid-client access and starts no delivery.
 *
 * ⛔ ENUMERATED, NEVER FALLEN THROUGH. Every known status is listed; an unknown one reads as
 * 'other' and shows its raw value, rather than being quietly filed as "new" or "contacted". */
import { CONTACT_METHODS, LOGGED_CONTACT_METHODS, contactMethodLabel } from './contactMethods.ts';
import { lostReasonLabel } from './lostReason.ts';

export type SalesStage =
  | 'new' | 'queued' | 'contacted' | 'replied' | 'interested' | 'awaiting_decision'
  | 'won' | 'not_interested' | 'client' | 'other';

const STAGE_OF_STATUS: Record<string, SalesStage> = {
  not_contacted: 'new',
  no_whatsapp: 'new',
  no_whatsapp_needs_sms: 'new',
  whatsapp_failed: 'new',
  queued: 'queued',
  initial_contact: 'contacted',
  second_attempt: 'contacted',
  report_sent: 'contacted',
  awaiting_reply: 'contacted',
  email_sent: 'contacted',
  site_sent: 'contacted',
  already_visible: 'contacted',
  bounced: 'contacted',
  replied: 'replied',
  interested: 'interested',
  price_given: 'awaiting_decision',
  won_pending_onboarding: 'won',
  not_interested: 'not_interested',
  opted_out: 'not_interested',
  closed: 'not_interested',
  payment_received: 'client',
  in_delivery: 'client',
  completed: 'client',
  refunded: 'client',
};

export function salesStageOf(status: string | null | undefined): SalesStage {
  const s = (status ?? '').trim();
  if (!s) return 'other';
  return STAGE_OF_STATUS[s] ?? 'other';
}

/** The stages a salesperson may SET (the server's lead_set_stage allowlist — keep them equal;
 *  scripts/sales-crm.test.ts asserts it against the migration). */
export const SALES_SETTABLE_STATUSES = ['interested', 'price_given', 'not_interested', 'won_pending_onboarding'] as const;
export type SalesSettableStatus = typeof SALES_SETTABLE_STATUSES[number];
/** Follow-up bucket from next_action_date (a DATE, compared as London calendar days). */
export type FollowUpBucket = 'overdue' | 'today' | 'upcoming' | 'none';

/** Today's date in London as YYYY-MM-DD — a stored day is a calendar day, never a UTC instant. */
export function londonToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** 'HH:MM' from a stored time ('14:30:00', '14:30') — null when absent or not a time. */
export function hhmmOf(t: string | null | undefined): string | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)/.exec((t ?? '').trim());
  return m ? `${m[1]}:${m[2]}` : null;
}

/** ⛔ A NEXT ACTION'S TIME IS UK TIME (2026-10-02). The instant of `day` + `hhmm` in Europe/London — BST or GMT
 *  as that day has it — whatever clock this computer runs on (Paul's is Asia/Bangkok). Null without both. */
export function londonInstant(day: string, hhmm: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const guess = Date.parse(`${day}T${hhmm}:00Z`);
  if (!Number.isFinite(guess)) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const shown = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
  return new Date(guess - (shown - guess)).toISOString();
}

/** The due bucket of a Next Action. ⛔ DAY-BASED unless it has a time (2026-10-02, Paul): a date-only action is
 *  "today" all day and overdue from the next UK day, as before; a timed one is overdue the moment its UK time
 *  has passed ("Call · Today · 16:00" is due at 13:00 UK, overdue at 16:01). */
export function followUpBucket(date: string | null | undefined, today: string, time?: string | null, nowMs: number = Date.now()): FollowUpBucket {
  if (!date) return 'none';
  const d = date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return 'none';
  if (d < today) return 'overdue';
  if (d === today) {
    const t = hhmmOf(time);
    const at = t ? londonInstant(d, t) : null;
    return at && nowMs > Date.parse(at) ? 'overdue' : 'today';
  }
  return 'upcoming';
}

/** The words for each stored next_action value. The first eight are the ones the form offers today
 *  (NEXT_ACTION_OPTIONS); the rest are older values that can still be on a row (read, never offered).
 *  ⛔ The SQL twin is public.next_action_label (the reminders) — the suite holds the two equal. */
export const NEXT_ACTION_LABEL: Record<string, string> = {
  call: 'Call',
  send_follow_up: 'WhatsApp follow-up',
  email: 'Email',
  follow_up: 'Follow up',
  send_info: 'Send information',
  send_proposal: 'Send proposal',
  chase_payment: 'Chase payment',
  meeting: 'Meeting',
  send_voice_note: 'Voice note',
  send_initial_text: 'Send opener',
  '2nd_follow_up': 'Second follow-up',
  send_draft: 'Send link',
  check_3_day_removal: 'Check in',
  remove_if_no_reply: 'Close if no reply',
};

/** A stored type in words (an unknown one as itself, never dropped). */
export function nextActionWords(v: unknown): string {
  const s = String(v ?? '').trim();
  return NEXT_ACTION_LABEL[s] ?? s.replace(/_/g, ' ');
}

/** "Thu 2 Oct" — a stored UK day in History. */
function historyDay(d: unknown): string | null {
  const s = String(d ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '') : null;
}
/** "Call · Thu 2 Oct · 14:30" from a follow_up_set row's values. */
function historyAction(na: unknown, date: unknown, time: unknown): string {
  return [nextActionWords(na), historyDay(date), hhmmOf(time as string | null)].filter(Boolean).join(' · ');
}

/** Owner initials for the avatar fallback: "Paul Smith" → "PS", "Sumi" → "SU", "" → "?". */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Find Leads state for one result, as lead_identity_lookup returns it. 'paused' (2026-09-29): the usage
 *  guard refused the lookup (suspended, or over the lookup limit) — nothing is known, nothing is offered. */
export type IdentityState = 'new' | 'yours' | 'claimable' | 'owned' | 'protected' | 'paused';

export function isIdentityState(v: unknown): v is IdentityState {
  return v === 'new' || v === 'yours' || v === 'claimable' || v === 'owned' || v === 'protected' || v === 'paused';
}

/** Plain-English refusal for a claim/add/queue result the server returned. Unknown codes are shown
 *  as themselves — a catch-all sentence would hide what actually happened. */
export function refusalText(code: string | null | undefined, ownerName?: string | null): string {
  switch (code) {
    case 'already_owned': return ownerName ? `Already added · ${ownerName}` : 'Already added by someone else';
    case 'already_contacted': return 'Already contacted — it cannot be claimed';
    // The claim rule (lead_claim_block, 2026-10-01): sales eligibility, never a channel fact like No WhatsApp.
    case 'not_interested': return 'They said no — it cannot be claimed';
    case 'suppressed': return 'Outreach to this business is stopped — it cannot be claimed';
    case 'archived': return 'This lead is archived';
    case 'client': return 'This business is a client';
    case 'exists': return ownerName ? `Already added · ${ownerName}` : 'Already in LeadFinderOS';
    case 'no_trade': return 'Search first, so the lead has a trade';
    case 'no_name': return 'The business has no name';
    case 'not_found': return 'That lead no longer exists';
    case 'not_your_lead': return 'That lead is not assigned to you';
    case 'no_role': return 'Your account has no access';
    case 'template_required': return 'Choose which approved opener to send first';
    case 'not_an_initial_opener': return 'Bulk initial outreach sends an approved opener only';
    case 'stage_not_allowed': return 'Only the admin can set that status';
    /* lead_set_follow_up's stale-screen check (migration 20261007105000). */
    case 'stale_next_action': return 'Kept the newer Next Action — it was changed somewhere else since you opened this';
    case 'bad_expected': return 'Could not check the Next Action — close and open the lead again';
    /* lead_set_lost_reason (why they said no, 2026-10-01). */
    case 'not_not_interested': return 'The lead is not Not interested any more, so no reason was saved';
    case 'reason_not_allowed': return 'Pick one of the reasons';
    case 'reason_note_required': return 'Say briefly why (needed for Other)';
    case 'reason_note_too_long': return 'The note is too long';
    case 'admin_only': return 'Only the admin can change that';
    case 'unknown_campaign': return 'That campaign no longer exists';
    case 'sales_only': return 'Only a salesperson removes leads from their own list';
    case 'queued': return 'An opener is waiting to send — it cannot be removed until it has gone';
    case 'onboarding': return 'Won / onboarding — the admin handles it from here';
    case 'not_yours': return 'Not assigned to you, or a client';
    case 'no_leads': return 'Select at least one lead';
    case 'too_many': return 'Too many at once — select 500 or fewer';
    // The usage guard (2026-09-29). The same words everywhere, never a cost or a limit's number.
    case 'usage_paused': return 'Usage temporarily paused — contact Paul';
    case 'no_phone': return 'This lead has no phone number';
    case 'wrong_number': return 'This number is marked Wrong number — the admin can clear it on the lead';
    case 'opted_out': return 'This number asked to stop — marketing templates are not sent to it';
    default: return code ? `Refused: ${code}` : 'Something went wrong';
  }
}

/* ── "REMOVE FROM MY LEADS" (2026-09-28) — the words, in one place for the workspace and the bulk bar.
   What happens is decided by sales_remove_leads, per lead; this only says it. ⛔ Never "delete". */
export const REMOVE_FROM_MY_LEADS_LABEL = 'Remove from my leads';
export const REMOVE_FROM_MY_LEADS_EXPLAINER: readonly string[] = [
  'Never contacted: it is unassigned and goes back to the unowned book, where the admin can assign it. Its notes and history stay with it.',
  'Already contacted (a call, message, email or any logged contact): it is archived and stays yours, with its history and status — it leaves your working list (Show archived brings it back) and can never be picked up as untouched.',
  'Nothing is deleted. Clients, won / onboarding leads and leads with an opener waiting to send are left as they are.',
];

/** One sentence for what the server did. */
export function removeOutcomeText(r: { released?: number; archived?: number; skipped?: Record<string, number> }): string {
  const parts: string[] = [];
  const n = (x: number, one: string, many: string) => `${x} ${x === 1 ? one : many}`;
  if (r.released) parts.push(`${n(r.released, 'lead', 'leads')} unassigned (back to the unowned book)`);
  if (r.archived) parts.push(`${n(r.archived, 'contacted lead', 'contacted leads')} archived (still yours)`);
  for (const [reason, count] of Object.entries(r.skipped ?? {})) {
    if (count > 0) parts.push(`${count} not removed — ${refusalText(reason)}`);
  }
  return parts.length ? parts.join(' · ') : 'Nothing changed';
}

/** One sentence for a bulk campaign move. */
export function campaignMoveText(r: { moved?: number; unchanged?: number; skipped?: Record<string, number> }, campaignName: string | null): string {
  const parts: string[] = [];
  const to = campaignName ? `to ${campaignName}` : 'out of their campaign';
  if (r.moved) parts.push(`${r.moved} moved ${to}`);
  if (r.unchanged) parts.push(`${r.unchanged} already there`);
  for (const [reason, count] of Object.entries(r.skipped ?? {})) {
    if (count > 0) parts.push(`${count} not moved — ${refusalText(reason)}`);
  }
  return parts.length ? parts.join(' · ') : 'Nothing changed';
}

export const QUEUE_SKIP_LABEL: Record<string, string> = {
  not_found: 'no longer exists',
  not_yours: 'not assigned to you',
  archived: 'archived',
  client: 'a client',
  not_new: 'already past “new”',
  already_contacted: 'already contacted',
  /* Sales workspace v2 (sales_queue_opener): a real logged conversation stops the cold opener; the lead keeps
     its campaign. A dialler tap never gets here — it writes nothing. */
  contacted_by_phone: 'already contacted by phone — initial opener not queued',
  contacted_logged: 'already in conversation (a logged contact) — initial opener not queued',
  no_phone: 'no phone',
  not_a_uk_mobile: 'not a UK or Indian mobile',
  opted_out: 'opted out',
  daily_limit: 'over your daily limit',
};

/* ⛔ THE OUTCOME LIST IS lead_log_contact's ALLOWLIST (newest: migration 20260930140000) — the server refuses
   anything else, and scripts/contact-claim.test.ts pins the two together. Added 2026-09-28: left
   voicemail, meeting booked, then message_sent. An outcome records ACTIVITY only: it never writes the
   status or the next action (Next Action is human-set only). What a tap ALSO does is src/lib/leadState.ts
   (outcomeRule — every value here has one; agency_controls_site is kept for old rows, no longer offered). */
/* `for`: which methods an outcome is offered for (contactMethods `kind`): 'call' = a phone call only,
   'message' = anything that is not a call, 'linkedin' = a LinkedIn message only, 'any' = every method. The server accepts every outcome for
   every method; this only keeps the buttons sensible ("No answer" to an email means nothing). */
export const CALL_OUTCOMES = [
  { value: 'no_answer', label: 'No answer', for: 'call' },
  { value: 'left_voicemail', label: 'Left voicemail', for: 'call' },
  { value: 'message_sent', label: 'Sent, no reply yet', for: 'message' },
  { value: 'connection_sent', label: 'Connection request sent', for: 'linkedin' },
  { value: 'spoke_to_owner', label: 'Spoke to owner', for: 'any' },
  { value: 'interested', label: 'Interested', for: 'any' },
  { value: 'call_back', label: 'Call back', for: 'any' },
  { value: 'meeting_booked', label: 'Meeting / call booked', for: 'any' },
  { value: 'not_interested', label: 'Not interested', for: 'any' },
  { value: 'wrong_number', label: 'Wrong number', for: 'call' },
  { value: 'agency_controls_site', label: 'Agency controls site', for: 'any' },
] as const;

/* The Last contact reading (lastLoggedContactOf), each outcome's rule (outcomeRule / outcomePlan) and the
   outcome → Next Action suggestion live in src/lib/leadState.ts (lead state audit, 2026-09-30). */

/** The outcomes offered for one contact method. */
export function outcomesFor(method: string) {
  const kind = CONTACT_METHODS.find((m) => m.value === method)?.kind ?? 'message';
  return CALL_OUTCOMES.filter((o) => o.for === 'any' || (o.for === 'linkedin' ? method === 'linkedin' : o.for === 'call' ? kind === 'call' : kind !== 'call'));
}

/* The social follow-up ("LinkedIn message sent → Follow up in 3 days", Social Enrichment 2026-09-30) is
   part of the ONE outcome → Next Action rule, src/lib/leadState.ts suggestNextAction (merged 2026-09-30 —
   it was a second copy of the same rule: same days, same note). */

/** How the contact happened, as logged by hand — the one set (src/lib/contactMethods.ts). WhatsApp is
 *  recorded by the messages themselves, so it is never logged here. */
export const CONTACT_CHANNEL_OPTIONS = LOGGED_CONTACT_METHODS.map((m) => ({ value: m.value, label: m.short }));

export const WEBSITE_CONTROL_OPTIONS = [
  { value: 'client_controls', label: 'They control the website' },
  { value: 'agency_controls', label: 'An agency controls it' },
  { value: 'third_party_profile_only', label: 'Only a third-party profile' },
  { value: 'no_website', label: 'No website' },
  { value: 'unknown', label: 'Unknown' },
] as const;

/* THE NEXT ACTION CHOICES (lead state audit, 2026-09-30): "what do I do next with this lead?" — one per
   way of doing it, plus Follow up for anything else (LinkedIn, Facebook, Instagram, in person — the
   note says which). Voice note is gone as a choice (a WhatsApp follow-up; never used); older stored
   values still read through nextActionView's labels. Email / Send information / Meeting: migration
   20260930150000. */
export const NEXT_ACTION_OPTIONS = [
  { value: 'call', label: 'Call' },
  { value: 'send_follow_up', label: 'WhatsApp follow-up' },
  { value: 'email', label: 'Email' },
  { value: 'follow_up', label: 'Follow up (other)' },
  { value: 'send_info', label: 'Send information' },
  /* 2026-10-02 (Paul): commercially distinct work — a proposal / offer to send; money outstanding on a sale. */
  { value: 'send_proposal', label: 'Send proposal' },
  { value: 'chase_payment', label: 'Chase payment' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'none', label: 'Nothing planned' },
] as const;

export const ACTIVITY_LABEL: Record<string, string> = {
  lead_added: 'Lead added',
  lead_claimed: 'Lead claimed',
  lead_assigned: 'Lead assigned',
  lead_unassigned: 'Lead unassigned',
  note: 'Internal note',
  stage_changed: 'Pipeline status changed',
  state_changed: 'Status changed',
  follow_up_set: 'Next action',
  call_booked: 'Meeting booking',
  call_outcome: 'Call',
  contact_logged: 'Contact',
  website_control_set: 'Website control',
  audit_run: 'AI visibility check run',
  bulk_queued: 'Opener queued',
  marked_interested: 'Interested ⭐',
  details_set: 'Details updated',
  archived_set: 'Archive',
  crawl_run: 'Website crawl started',
  report_link: 'Report link sent',
  /* Written by fn conversation-triage when a reply contains a clear opt-out phrase (Admin control centre,
     release 2): future automated outreach is suppressed. The body carries the words shown. */
  opted_out: 'Asked to stop',
  /* request_lead_transfer (2026-09-30): the salesperson asked the admin to move the lead. */
  transfer_requested: 'Transfer requested',
  /* lead_set_lost_reason (2026-10-01): why a Not interested lead said no; a correction keeps the old one. */
  lost_reason_set: 'Why they said no',
  /* The delivery workflow (2026-10-02, _shared/client-setup.ts recordLeadEvent) — meaningful events only. */
  payment_received: 'Payment received',
  handoff_saved: 'Sales handoff',
  /* fn quick-close share_link (2026-10-04): how the payment link reached them — copied / emailed / WhatsApp. */
  payment_link_shared: 'Payment link',
  onboarding_submitted: 'Client submitted onboarding',
  delivery_submitted: 'Ready for delivery',
  discovery_run: 'Discovery run',
  baseline_approved: 'Questions approved & frozen',
  baseline_run: 'Baseline run',
  build_started: 'Build started',
  launched: 'Launched',
  /* Client missing-info actions (2026-10-05, _shared/client-info-request.ts). "Opened" is never "sent". */
  client_info_requested: 'Missing info requested from salesperson',
  client_info_answered: 'Salesperson answered the info request',
  client_contact_opened: 'Client contact opened',
};

/** Where Find email found an address (lead_find_email / lead_set_email). */
const EMAIL_SOURCE_WORDS: Record<string, string> = { website_crawl: 'their website crawl', onboarding: 'their questionnaire', same_business: 'another record of the same business', website_scrape: 'their website' };

const DETAIL_FIELD_LABEL: Record<string, string> = {
  services: 'services', service_areas: 'service areas', address: 'address', website: 'website',
  contact_name: 'contact', search_keyword: 'trade', search_location: 'town', email: 'email', email_source: 'found in', wrong_number: 'wrong number',
  social: 'social profile', facebook_url: 'Facebook', instagram_url: 'Instagram', cleanup: 'why', original: 'was',
};

/** One activity row in words, for the lead's History and the paid client's handoff. ONE rule, so the
 *  two screens can never describe the same row differently. */
export function activityDetail(
  a: { kind: string; body?: string | null; data?: Record<string, unknown> | null },
  actorName: (id: string | null) => string,
): string | null {
  const d = a.data ?? {};
  const outcome = CALL_OUTCOMES.find((o) => o.value === d.outcome)?.label ?? String(d.outcome ?? '');
  const channel = d.channel ? contactMethodLabel(String(d.channel)) : null;
  switch (a.kind) {
    case 'note': return a.body ?? null;
    case 'call_outcome':
    case 'contact_logged': return `${a.kind === 'contact_logged' && channel ? channel + ': ' : ''}${outcome}${a.body ? ` — ${a.body}` : ''}`;
    case 'stage_changed': return `${String(d.from ?? '—').replace(/_/g, ' ')} → ${String(d.to ?? '—').replace(/_/g, ' ')}`;
    /* leadState.stateChangedWords is the full-label version the lead History uses; this one is the same
       words for the states that have no qualifier (scripts/lead-state.test.ts compares them). */
    case 'state_changed': { const w = (v: unknown) => { const t = String(v ?? '—').replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); }; return `Status: ${w(d.from)} → ${w(d.to)}`; }
    /* ⛔ WHAT HAPPENED, IN WORDS (2026-10-02): lead_set_follow_up records the change and what it was before.
       Older rows (no "change") read as before, in the type's words. */
    case 'follow_up_set': {
      const from = (d.from ?? {}) as Record<string, unknown>;
      const now = historyAction(d.next_action, d.date, d.time);
      const note = d.note ? ` — ${String(d.note)}` : '';
      const fromNote = from.note ? ` — ${String(from.note)}` : '';
      switch (d.change) {
        /* Done / Clear take the note with them (2026-10-02) — History keeps it, from the row before. */
        case 'completed': return `Completed: ${historyAction(from.next_action, from.date, from.time)}${fromNote}`;
        case 'cleared': return from.next_action && from.next_action !== 'none' ? `Cleared: ${historyAction(from.next_action, from.date, from.time)}${fromNote}` : 'Next action cleared';
        case 'set': return `Set: ${now}${note}`;
        case 'rescheduled': return `Rescheduled: ${now} (was ${[historyDay(from.date) ?? 'no date', hhmmOf(from.time as string | null)].filter(Boolean).join(' · ')})${note}`;
        case 'changed': return `Changed: ${nextActionWords(from.next_action)} → ${now}${note}`;
        case 'updated': return `Note changed: ${now}${note}`;
      }
      if (!d.next_action || d.next_action === 'none') return 'Next action cleared';
      return `${nextActionWords(d.next_action)}${d.date ? ` on ${String(d.date)}` : ''}${d.note ? ` — ${String(d.note)}` : ''}`;
    }
    /* The meeting's time in London, or why the booking ended: it follows the Meeting Next Action (2026-10-02), so
       completing it reads "Done", changing to another action "Replaced by the next action", a removed time
       "Time removed"; a clear (or an older row with no reason — Not interested cancels it) reads "Cancelled". */
    case 'call_booked': return d.at ? new Date(String(d.at)).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }).replace(',', '')
      : d.reason === 'completed' ? 'Done' : d.reason === 'changed' ? 'Replaced by the next action' : d.reason === 'time_removed' ? 'Time removed' : 'Cancelled';
    case 'bulk_queued': return d.template ? String(d.template) : null;
    case 'archived_set': return d.archived ? 'Archived' : 'Restored';
    case 'transfer_requested': return d.note ? String(d.note) : 'No reason given';
    case 'lost_reason_set': return [
      `Reason: ${lostReasonLabel(d.reason as string | null)}${d.from_reason ? ` (was ${lostReasonLabel(d.from_reason as string)})` : ''}`,
      d.note ? `Note: ${String(d.note)}` : null,
    ].filter(Boolean).join('\n');
    case 'marked_interested': return d.on === false ? 'Unstarred' : 'Starred';
    case 'lead_added': return d.source ? `Source: ${String(d.source).replace(/_/g, ' ')}` : null;
    case 'lead_assigned':
    case 'lead_unassigned': return `${actorName((d.from as string) ?? null)} → ${d.to ? actorName(d.to as string) : 'Unassigned'}`;
    case 'details_set': {
      const parts = Object.keys(d).map((k) => {
        const v = d[k];
        const shown = k === 'wrong_number' ? (v === true ? 'marked — no templates or automated WhatsApp' : 'cleared by the admin') : k === 'email_source' ? (EMAIL_SOURCE_WORDS[String(v)] ?? String(v)) : Array.isArray(v) ? (v.length ? v.join(', ') : 'cleared') : v == null || v === '' ? 'cleared' : String(v);
        return `${DETAIL_FIELD_LABEL[k] ?? k.replace(/_/g, ' ')}: ${shown}`;
      });
      return parts.length ? parts.join(' · ') : null;
    }
    case 'report_link': return d.channel ? `By ${contactMethodLabel(String(d.channel))}` : null;
    case 'website_control_set': return d.value ? String(d.value).replace(/_/g, ' ') : null;
    case 'crawl_run': return d.url ? String(d.url) : null;
    case 'opted_out': return a.body ?? 'Future automated outreach is suppressed';
    /* Written by fn quick-close: "copied (to send by hand)", "emailed to x", "sent on WhatsApp (test mode)". */
    case 'payment_link_shared': return a.body ?? null;
    default: return null;
  }
}
