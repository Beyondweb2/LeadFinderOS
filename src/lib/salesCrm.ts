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

export const SALES_STAGE_LABEL: Record<SalesStage, string> = {
  new: 'New',
  queued: 'Queued',
  contacted: 'Contacted',
  replied: 'Replied',
  interested: 'Interested',
  awaiting_decision: 'Awaiting decision',
  won: 'Won · awaiting admin',
  not_interested: 'Not interested',
  client: 'Client',
  other: 'Other',
};

/** The stages a salesperson may SET (the server's lead_set_stage allowlist — keep them equal;
 *  scripts/sales-crm.test.ts asserts it against the migration). */
export const SALES_SETTABLE_STATUSES = ['interested', 'price_given', 'not_interested', 'won_pending_onboarding'] as const;
export type SalesSettableStatus = typeof SALES_SETTABLE_STATUSES[number];
export const SALES_SETTABLE_LABEL: Record<SalesSettableStatus, string> = {
  interested: 'Interested',
  price_given: 'Awaiting decision (price given)',
  not_interested: 'Not interested',
  won_pending_onboarding: 'Won — hand to admin',
};

/** Follow-up bucket from next_action_date (a DATE, compared as London calendar days). */
export type FollowUpBucket = 'overdue' | 'today' | 'upcoming' | 'none';

/** Today's date in London as YYYY-MM-DD — a stored day is a calendar day, never a UTC instant. */
export function londonToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function followUpBucket(date: string | null | undefined, today: string): FollowUpBucket {
  if (!date) return 'none';
  const d = date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return 'none';
  if (d < today) return 'overdue';
  if (d === today) return 'today';
  return 'upcoming';
}

export interface SalesLeadRow {
  id: string;
  business_name: string | null;
  status: string | null;
  next_action: string | null;
  next_action_date: string | null;
  next_action_note: string | null;
  call_booked_at: string | null;
  whatsapp_sent_at: string | null;
  updated_at: string | null;
  created_at: string | null;
  is_archived: boolean | null;
}

/** Needs attention = the three things a rep must act on today. */
export function needsAttention(l: SalesLeadRow, today: string, nowMs: number): { reply: boolean; followUp: boolean; call: boolean } {
  const reply = salesStageOf(l.status) === 'replied';
  const b = followUpBucket(l.next_action_date, today);
  const followUp = b === 'overdue' || b === 'today';
  const callAt = l.call_booked_at ? new Date(l.call_booked_at).getTime() : NaN;
  const call = Number.isFinite(callAt) && callAt >= nowMs - 12 * 3600_000 && callAt <= nowMs + 36 * 3600_000;
  return { reply, followUp, call };
}

export type MyLeadsFilter = 'attention' | 'replies' | 'followups' | 'calls' | 'interested' | 'new' | 'all';
export const MY_LEADS_FILTER_LABEL: Record<MyLeadsFilter, string> = {
  attention: 'Needs attention',
  replies: 'Replies',
  followups: 'Follow-ups due',
  calls: 'Calls booked',
  interested: 'Interested',
  new: 'Not contacted yet',
  all: 'All my leads',
};

export function matchesFilter(l: SalesLeadRow, f: MyLeadsFilter, today: string, nowMs: number): boolean {
  if (l.is_archived) return f === 'all';
  const a = needsAttention(l, today, nowMs);
  const stage = salesStageOf(l.status);
  switch (f) {
    case 'attention': return a.reply || a.followUp || a.call;
    case 'replies': return a.reply;
    case 'followups': return followUpBucket(l.next_action_date, today) !== 'none';
    case 'calls': return !!l.call_booked_at;
    case 'interested': return stage === 'interested' || stage === 'awaiting_decision';
    case 'new': return stage === 'new';
    case 'all': return true;
  }
}

/** Owner initials for the avatar fallback: "Paul Smith" → "PS", "Sumi" → "SU", "" → "?". */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Find Leads state for one result, as lead_identity_lookup returns it. */
export type IdentityState = 'new' | 'yours' | 'claimable' | 'owned' | 'protected';

export function isIdentityState(v: unknown): v is IdentityState {
  return v === 'new' || v === 'yours' || v === 'claimable' || v === 'owned' || v === 'protected';
}

/** Plain-English refusal for a claim/add/queue result the server returned. Unknown codes are shown
 *  as themselves — a catch-all sentence would hide what actually happened. */
export function refusalText(code: string | null | undefined, ownerName?: string | null): string {
  switch (code) {
    case 'already_owned': return ownerName ? `Already added · ${ownerName}` : 'Already added by someone else';
    case 'already_contacted': return 'Already contacted — it cannot be claimed';
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
    case 'admin_only': return 'Only the admin can change that';
    default: return code ? `Refused: ${code}` : 'Something went wrong';
  }
}

export const QUEUE_SKIP_LABEL: Record<string, string> = {
  not_found: 'no longer exists',
  not_yours: 'not assigned to you',
  archived: 'archived',
  client: 'a client',
  not_new: 'already past “new”',
  already_contacted: 'already contacted',
  no_phone: 'no phone',
  not_a_uk_mobile: 'not a UK mobile',
  opted_out: 'opted out',
  daily_limit: 'over your daily limit',
};

/* ⛔ THE OUTCOME LIST IS lead_log_contact's ALLOWLIST (migration 20260928120000) — the server refuses
   anything else, and scripts/sales-readiness.test.ts pins the two together. Two were added
   2026-09-28 (left voicemail, meeting booked). An outcome records ACTIVITY only: it never writes the
   status or the next action (Next Action is human-set only). */
export const CALL_OUTCOMES = [
  { value: 'no_answer', label: 'No answer' },
  { value: 'left_voicemail', label: 'Left voicemail' },
  { value: 'spoke_to_owner', label: 'Spoke to owner' },
  { value: 'interested', label: 'Interested' },
  { value: 'call_back', label: 'Call back' },
  { value: 'meeting_booked', label: 'Meeting / call booked' },
  { value: 'not_interested', label: 'Not interested' },
  { value: 'wrong_number', label: 'Wrong number' },
  { value: 'agency_controls_site', label: 'Agency controls site' },
] as const;

/** How the contact happened. WhatsApp is recorded by the messages themselves, so it is not here. */
export const CONTACT_CHANNEL_OPTIONS = [
  { value: 'call', label: 'Call' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'email', label: 'Email' },
  { value: 'in_person', label: 'In person' },
  { value: 'other', label: 'Other' },
] as const;

export const WEBSITE_CONTROL_OPTIONS = [
  { value: 'client_controls', label: 'They control the website' },
  { value: 'agency_controls', label: 'An agency controls it' },
  { value: 'third_party_profile_only', label: 'Only a third-party profile' },
  { value: 'no_website', label: 'No website' },
  { value: 'unknown', label: 'Unknown' },
] as const;

export const NEXT_ACTION_OPTIONS = [
  { value: 'call', label: 'Call' },
  { value: 'send_follow_up', label: 'WhatsApp follow-up' },
  { value: 'send_voice_note', label: 'Send voice note' },
  { value: 'follow_up', label: 'Follow up (other)' },
  { value: 'none', label: 'Nothing planned' },
] as const;

export const ACTIVITY_LABEL: Record<string, string> = {
  lead_added: 'Lead added',
  lead_claimed: 'Lead claimed',
  lead_assigned: 'Lead assigned',
  lead_unassigned: 'Lead unassigned',
  note: 'Internal note',
  stage_changed: 'Stage changed',
  follow_up_set: 'Follow-up set',
  call_booked: 'Call booked',
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
};

const DETAIL_FIELD_LABEL: Record<string, string> = {
  services: 'services', service_areas: 'service areas', address: 'address', website: 'website',
  contact_name: 'contact', search_keyword: 'trade', search_location: 'town',
};
const REPORT_CHANNEL_LABEL: Record<string, string> = { email: 'Email', linkedin: 'LinkedIn', sms: 'Text message', in_person: 'In person', other: 'Other' };

/** One activity row in words, for the lead's History and the paid client's handoff. ONE rule, so the
 *  two screens can never describe the same row differently. */
export function activityDetail(
  a: { kind: string; body?: string | null; data?: Record<string, unknown> | null },
  actorName: (id: string | null) => string,
): string | null {
  const d = a.data ?? {};
  const outcome = CALL_OUTCOMES.find((o) => o.value === d.outcome)?.label ?? String(d.outcome ?? '');
  const channel = CONTACT_CHANNEL_OPTIONS.find((c) => c.value === d.channel)?.label;
  switch (a.kind) {
    case 'note': return a.body ?? null;
    case 'call_outcome':
    case 'contact_logged': return `${a.kind === 'contact_logged' && channel ? channel + ': ' : ''}${outcome}${a.body ? ` — ${a.body}` : ''}`;
    case 'stage_changed': return `${String(d.from ?? '—')} → ${String(d.to ?? '—')}`;
    case 'follow_up_set': return `${String(d.next_action ?? '').replace(/_/g, ' ')}${d.date ? ` on ${String(d.date)}` : ''}${d.note ? ` — ${String(d.note)}` : ''}`;
    case 'bulk_queued': return d.template ? String(d.template) : null;
    case 'archived_set': return d.archived ? 'Archived' : 'Restored';
    case 'marked_interested': return d.on === false ? 'Unstarred' : 'Starred';
    case 'lead_added': return d.source ? `Source: ${String(d.source).replace(/_/g, ' ')}` : null;
    case 'lead_assigned':
    case 'lead_unassigned': return `${actorName((d.from as string) ?? null)} → ${d.to ? actorName(d.to as string) : 'Unassigned'}`;
    case 'details_set': {
      const parts = Object.keys(d).map((k) => {
        const v = d[k];
        const shown = Array.isArray(v) ? (v.length ? v.join(', ') : 'cleared') : v == null || v === '' ? 'cleared' : String(v);
        return `${DETAIL_FIELD_LABEL[k] ?? k.replace(/_/g, ' ')}: ${shown}`;
      });
      return parts.length ? parts.join(' · ') : null;
    }
    case 'report_link': return d.channel ? `By ${REPORT_CHANNEL_LABEL[String(d.channel)] ?? String(d.channel)}` : null;
    case 'website_control_set': return d.value ? String(d.value).replace(/_/g, ' ') : null;
    case 'crawl_run': return d.url ? String(d.url) : null;
    default: return null;
  }
}
