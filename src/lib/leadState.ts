/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE LEAD STATE ENGINE — ONE READING OF "WHERE IS THIS LEAD?" AND "WHAT DOES A LOGGED OUTCOME DO?"
   (lead state audit, 2026-09-30; docs/lead-state-model.md is the full map and the reasoning).

   CONTACT (method) → OUTCOME → VISIBLE STATE → NEXT ACTION → FOLLOW-UP.

   ⛔ THE SALES STATE IS DERIVED, NEVER STORED. outreach_leads.status stays what it always was — the
   WhatsApp pipeline the queue, the inbound handler and the admin write (initial_contact, report_sent,
   no_whatsapp_needs_sms…) — and is NOT rewritten. The small sales state below is a READING of that
   status plus the facts beside it: the Interested star, the booked meeting, the paid amount, the
   newest logged contact and the Wrong number mark. So a weak contact event CANNOT downgrade a strong
   state — a logged voicemail writes only activity, and the reading still says Interested.
   ⛔ ENUMERATED, NEVER FALLEN THROUGH. Every known status is listed; an unknown one reads 'other' and
   shows its raw value (salesStageOf's rule).
   ⛔ STATUS ≠ NEXT ACTION. The state says where the lead is; the Next Action (nextActionView.ts) says
   what to do. "Follow-up" is therefore NOT a state: a lead waiting for a call-back is Contacted /
   Interested with a Next Action "Call · Tomorrow".
   ⛔ NEXT ACTION STAYS HUMAN-SET (Paul, 2026-09-28). An outcome SUGGESTS one (outcomeRule().suggest):
   the Work panel pre-fills it and the person presses Save. The only automatic next-action write is
   the one the rule allows — clearing to 'none' (Not interested).
   Pure and edge-safe (relative imports with .ts): fn sales-performance runs this too.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { CALL_OUTCOMES, salesStageOf } from './salesCrm.ts';
import { CONTACT_METHODS, contactMethodLabel } from './contactMethods.ts';

/* ── 1. THE SALES STATE ──────────────────────────────────────────────────────────────────────── */

export type SalesState =
  | 'new' | 'contacted' | 'replied' | 'interested' | 'meeting_booked'
  | 'won' | 'client' | 'not_interested' | 'wrong_number' | 'other';

export const SALES_STATE_LABEL: Record<SalesState, string> = {
  new: 'New',
  contacted: 'Contacted',
  replied: 'Replied',
  interested: 'Interested',
  meeting_booked: 'Meeting booked',
  won: 'Won · awaiting onboarding', // the status menu's words (PIPELINE_STATUS_OPTIONS) — one label, not four
  client: 'Client',
  not_interested: 'Not interested',
  wrong_number: 'Wrong number',
  other: 'Other',
};

/** Five tones, not ten colours: quiet (new/contacted/other), info (replied), good (interested, won,
 *  client), strong (a meeting to prepare for), stopped (not interested, wrong number). */
export type SalesStateTone = 'quiet' | 'info' | 'good' | 'strong' | 'stopped';
export const SALES_STATE_TONE: Record<SalesState, SalesStateTone> = {
  new: 'quiet', contacted: 'quiet', other: 'quiet',
  replied: 'info',
  interested: 'good', won: 'good', client: 'good',
  meeting_booked: 'strong',
  not_interested: 'stopped', wrong_number: 'stopped',
};

/** The order a filter lists them in (the funnel, then the stops). */
export const SALES_STATES: readonly SalesState[] = ['new', 'contacted', 'replied', 'interested', 'meeting_booked', 'won', 'client', 'not_interested', 'wrong_number', 'other'];

/** A booked meeting still counts as "booked" until this long AFTER its start — a call this morning
 *  still needs its outcome logged. After that it is history (the timeline keeps it). */
export const MEETING_KEEP_AFTER_MS = 12 * 3600_000;

/** Statuses that mean the lead said no / asked to stop. `closed` = removed from the Inbox by the
 *  button (salesStageOf files it here); `opted_out` = a WhatsApp STOP. */
export const NOT_INTERESTED_STATUSES: ReadonlySet<string> = new Set(['not_interested', 'opted_out', 'closed']);
/** Statuses that are the Interested reading on their own (older rows; the star is today's marker). */
export const INTERESTED_STATUSES: ReadonlySet<string> = new Set(['interested', 'price_given']);

export interface LeadStateInput {
  status?: string | null;
  is_potential_work?: boolean | null;
  amount_paid?: unknown;
  call_booked_at?: string | null;
  whatsapp_sent_at?: string | null;
  /** The newest hand-logged contact (lastLoggedContactOf), when the caller has the timeline. `reached`: did ANY
   *  logged contact reach the business (everReached) — absent → judged from this outcome alone. */
  lastLogged?: { outcome: string; at: string; reached?: boolean } | null;
  /** The number is marked Wrong number (lead_wrong_number), when the caller knows. */
  wrongNumber?: boolean | null;
  /** Meta has confirmed a delivery to this number at least once (outreach_leads.whatsapp_ever_delivered). */
  whatsapp_ever_delivered?: boolean | null;
}

/* ⛔ A SEND STAMP IS NOT A CONTACT WHEN THE SEND FAILED (Paul, 2026-10-01: "An attempted contact that failed
   does not count as successful contact"). The queue sets whatsapp_sent_at the moment Meta ACCEPTS a message;
   a second later Meta's webhook may say "not on WhatsApp" (131026) — the status becomes no_whatsapp but the
   stamp is never cleared (leadFailurePatch). 209 of 217 no_whatsapp leads carried it with zero real sends
   (2026-10-01) and read "Contacted". The stamp counts only while the status is not a failed-send status, or
   when Meta has confirmed a delivery at least once. The stored rows are untouched. */
export const FAILED_SEND_STATUSES: ReadonlySet<string> = new Set(['no_whatsapp', 'whatsapp_failed', 'no_whatsapp_needs_sms']);

/* ⛔ AN ATTEMPT IS NOT A CONTACT (Paul, 2026-10-01: "Logged no-answer call: Attempted contact, not successful
   contact. Logged spoke to owner: Contacted."). THE one list of logged outcomes that mean a real conversation
   (was copied in salesPerformance.ts and adminMetrics.ts), and the ones that REACHED the business: a
   conversation, or a message we really sent. No answer, voicemail, a connection request and wrong number
   are attempts — kept in History and the Last contact line, never "Contacted". */
export const CONVERSATION_OUTCOMES: ReadonlySet<string> = new Set([
  'spoke_to_owner', 'interested', 'call_back', 'meeting_booked', 'not_interested', 'agency_controls_site',
]);
export const REACHED_OUTCOMES: ReadonlySet<string> = new Set([...CONVERSATION_OUTCOMES, 'message_sent']);

/* ⛔ THE ROW PILL TELLS THE TRUTH ABOUT CONTACT (2026-10-01). The pill is the solid pipeline badge (Paul,
   2026-10-01: "put the pills back to how they worked yesterday"). But the pipeline status is the WhatsApp
   pipeline: a business the rep REACHED by phone still reads "New" (or "No WhatsApp") there. When the sales
   state is Contacted and the pipeline still says not-contacted / no WhatsApp / failed, the pill shows the
   solid "Contacted" badge instead. Display only — the stored status and its menu are untouched. */
const PIPELINE_NOT_CONTACTED: ReadonlySet<string> = new Set(['', 'not_contacted', 'no_whatsapp', 'no_whatsapp_needs_sms', 'whatsapp_failed']);
export function pillStatusOf(status: string | null | undefined, stage: Pick<SalesStateView, 'state'> | null | undefined): string | null {
  const s = (status ?? '').trim();
  if (stage?.state === 'contacted' && PIPELINE_NOT_CONTACTED.has(s)) return 'initial_contact';
  return status ?? null;
}
/** Statuses on which a leftover send stamp means nothing was delivered: a failed send, or a lead put back to
 *  New / Queued after one (a temporary failure re-queues and keeps the stamp — whatsapp-failure.ts). */
export const STAMP_NOT_CONTACT_STATUSES: ReadonlySet<string> = new Set([...FAILED_SEND_STATUSES, 'not_contacted', 'queued', '']);
export function openerReallySent(l: Pick<LeadStateInput, 'status' | 'whatsapp_sent_at' | 'whatsapp_ever_delivered'>): boolean {
  if (!l.whatsapp_sent_at) return false;
  if (l.whatsapp_ever_delivered === true) return true;
  return !STAMP_NOT_CONTACT_STATUSES.has((l.status ?? '').trim());
}

export interface SalesStateView {
  state: SalesState;
  label: string;
  tone: SalesStateTone;
  /** Short qualifier drawn after the label: "Thu 2 Oct 14:30", "Price given", "Refunded", a raw status. */
  detail: string | null;
}

const paidOf = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) && n > 0; };

/** "Thu 2 Oct 14:30" in London — a meeting is an instant, shown in the salesperson's clock. */
export function meetingWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }).replace(',', '');
}

/** Is a meeting booked and still current (upcoming, or started less than MEETING_KEEP_AFTER_MS ago)? */
export function meetingIsCurrent(callBookedAt: string | null | undefined, nowMs: number): boolean {
  if (!callBookedAt) return false;
  const t = Date.parse(callBookedAt);
  return Number.isFinite(t) && t >= nowMs - MEETING_KEEP_AFTER_MS;
}

/** THE ONE READING. Strongest first — a weaker fact never hides a stronger one:
 *  client › won › not interested › meeting booked › interested › replied › wrong number › contacted › new.
 *  Wrong number sits BELOW the engaged states on purpose: a lead that is interested by email with a
 *  dead phone number is still Interested (the Wrong number pill says the rest). */
export function salesStateOf(l: LeadStateInput, nowMs: number = Date.now()): SalesStateView {
  const status = (l.status ?? '').trim();
  const stage = salesStageOf(status);
  const v = (state: SalesState, detail: string | null = null): SalesStateView => ({ state, label: SALES_STATE_LABEL[state], tone: SALES_STATE_TONE[state], detail });
  if (paidOf(l.amount_paid) || stage === 'client') return v('client', status === 'refunded' ? 'Refunded' : null);
  if (stage === 'won') return v('won');
  const saidNo = NOT_INTERESTED_STATUSES.has(status) || (l.lastLogged?.outcome === 'not_interested' && !l.is_potential_work);
  if (saidNo) return v('not_interested', status === 'opted_out' ? 'Opted out' : null);
  if (meetingIsCurrent(l.call_booked_at, nowMs)) return v('meeting_booked', meetingWhen(l.call_booked_at!));
  if (l.is_potential_work || INTERESTED_STATUSES.has(status)) return v('interested', status === 'price_given' ? 'Price given' : null);
  if (stage === 'replied') return v('replied');
  if (l.wrongNumber) return v('wrong_number');
  // Contacted = the pipeline says so, OR a logged contact REACHED them (not a no-answer / voicemail
  // attempt), OR an opener really went out (a failed send's leftover stamp is not contact).
  const loggedReached = !!l.lastLogged && (l.lastLogged.reached ?? REACHED_OUTCOMES.has(l.lastLogged.outcome));
  if (stage === 'contacted' || loggedReached || openerReallySent(l)) return v('contacted');
  if (stage === 'new' || stage === 'queued') return v('new', stage === 'queued' ? 'Opener queued' : null);
  return v('other', status ? status.replace(/_/g, ' ') : null);
}

/* ── 2. CONTACT OUTCOMES: what each Log Contact button does ────────────────────────────────────── */

/** What an outcome does to the lead, beyond the activity row lead_log_contact always writes. */
export type OutcomeEffect =
  | 'record'          // the record itself: Last contact + History (+ Contacted, derived)
  | 'interested'      // the Interested star
  | 'meeting'         // the star + asks when (call_booked_at) → Meeting booked
  | 'call_back'       // asks which day → Next Action "Call" on that day
  | 'not_interested'  // status not_interested + stop the queue + clear the Next Action
  | 'wrong_number';   // suppress the number (contact_suppressions) — the lead and History stay

/** A Next Action the Work panel PRE-FILLS (never saves). days = null → the person must pick the day. */
export interface NextActionSuggestion { nextAction: string; days: number | null; note: string }

export interface OutcomeRule {
  value: string;
  effect: OutcomeEffect;
  /** Shown on the button as its tooltip — what pressing it changes, in words. */
  does: string;
  /** False = kept for old History rows but no longer a button (an attribute, not an outcome). */
  offered: boolean;
}

const RULES: Record<string, Omit<OutcomeRule, 'value'>> = {
  no_answer:      { effect: 'record', offered: true, does: 'Records the call. Suggests calling again tomorrow.' },
  left_voicemail: { effect: 'record', offered: true, does: 'Records the call. Suggests calling again in 3 days.' },
  message_sent:   { effect: 'record', offered: true, does: 'Records the message. Suggests following up in 3 days.' },
  connection_sent:{ effect: 'record', offered: true, does: 'Records the connection request. Suggests following up in 3 days.' },
  spoke_to_owner: { effect: 'record', offered: true, does: 'Records the conversation. Pick a Next Action below.' },
  interested:     { effect: 'interested', offered: true, does: 'Marks the lead Interested. Suggests sending information today.' },
  call_back:      { effect: 'call_back', offered: true, does: 'Records it and asks which day to call back — sets the Next Action.' },
  meeting_booked: { effect: 'meeting', offered: true, does: 'Marks Interested and asks when — shows Meeting booked with the time.' },
  not_interested: { effect: 'not_interested', offered: true, does: 'Sets Not interested, stops automatic messages and clears the Next Action. History is kept.' },
  wrong_number:   { effect: 'wrong_number', offered: true, does: 'Blocks templates, the queue and automated WhatsApp to this number. The admin can clear it.' },
  /* ⛔ AN ATTRIBUTE, NOT AN OUTCOME (2026-09-30): who controls the website is a fact about the business
     (outreach_leads.website_control), not what happened on the call — logging it as the outcome hid
     the real one ("Last contact: Agency controls site"). It is set on the Work panel's "Learned"
     line instead; the value stays in the server allowlist so older History rows still read. */
  agency_controls_site: { effect: 'record', offered: false, does: 'Older rows only — set "Agency runs the site" instead.' },
};

/** The rule for an outcome. An unknown (older or newer) outcome is a plain record — never a status. */
export function outcomeRule(outcome: string): OutcomeRule {
  const r = RULES[outcome];
  return r ? { value: outcome, ...r } : { value: outcome, effect: 'record', offered: false, does: 'Records the contact.' };
}

/** Every outcome the server accepts has a rule (the test holds CALL_OUTCOMES to this). */
export const OUTCOME_RULE_VALUES: readonly string[] = Object.keys(RULES);

/** The buttons for one method: the method's outcomes (salesCrm outcomesFor) that are still offered. */
export function offeredOutcomes<T extends { value: string }>(forMethod: readonly T[]): T[] {
  return forMethod.filter((o) => outcomeRule(o.value).offered);
}

/** The words for an outcome ("Left voicemail"), an unknown one readably. */
export function outcomeLabel(outcome: string): string {
  return CALL_OUTCOMES.find((o) => o.value === outcome)?.label ?? (outcome.replace(/_/g, ' ') || 'Contact');
}

/* ── 3. OUTCOME → NEXT ACTION (a suggestion, pre-filled; the person saves) ────────────────────── */

/** Days a message follow-up is suggested after (Paul's example, 2026-09-30: "message sent → follow up
 *  in 3 days"; the same number the social-outreach rule uses). */
export const MESSAGE_FOLLOW_UP_DAYS = 3;
export const NO_ANSWER_RETRY_DAYS = 1;
export const VOICEMAIL_RETRY_DAYS = 3;

/** THE ONE RULE for what a logged outcome suggests as the Next Action. null = no suggestion. */
export function suggestNextAction(method: string, outcome: string): NextActionSuggestion | null {
  const m = CONTACT_METHODS.find((x) => x.value === method);
  const on = m ? m.label : contactMethodLabel(method);
  switch (outcome) {
    case 'no_answer': return { nextAction: 'call', days: NO_ANSWER_RETRY_DAYS, note: 'Try again — no answer' };
    case 'left_voicemail': return { nextAction: 'call', days: VOICEMAIL_RETRY_DAYS, note: 'Call again — voicemail left' };
    case 'message_sent': return { nextAction: method === 'email' ? 'email' : 'follow_up', days: MESSAGE_FOLLOW_UP_DAYS, note: `Follow up on the ${on}` };
    case 'connection_sent': return { nextAction: 'follow_up', days: MESSAGE_FOLLOW_UP_DAYS, note: 'Follow up on the LinkedIn connection request' };
    case 'spoke_to_owner': return { nextAction: 'follow_up', days: null, note: '' };
    case 'interested': return { nextAction: 'send_info', days: 0, note: 'Send the information / sign-up link' };
    case 'call_back': return { nextAction: 'call', days: null, note: 'They asked to be called back' };
    default: return null; // meeting: its own when-form; not interested: cleared; wrong number: nothing
  }
}

/* ── 4. WHAT A LOGGED OUTCOME CHANGES (the plan the Work panel carries out, in the open) ──────── */

export interface OutcomePlan {
  /** Set the Interested star. */
  star: boolean;
  /** Write this pipeline status. */
  status: 'not_interested' | 'interested' | null;
  /** Clear the Next Action to 'none' (the one automatic next-action write the rule allows). */
  clearNextAction: boolean;
  /** Cancel the booked meeting (call_booked_at → null): Not interested means the meeting is off. */
  clearMeeting: boolean;
  /** Suppress the number (lead_mark_wrong_number). */
  suppressNumber: boolean;
  /** Open the "when is it?" form (date + time) — the meeting. */
  askMeeting: boolean;
  /** Open the "which day?" form — the call-back. */
  askCallBackDay: boolean;
}

/** THE ONE RULE for a logged outcome's follow-on, for both roles and every screen.
 *  ⛔ Never downgrades: a client or a won lead is only recorded; the star is never set twice; a lead
 *  already Not interested is not re-written. ⛔ Real life: Interested / Meeting booked on a lead that
 *  said no earlier moves it back to Interested (status 'interested' + the star) — EXCEPT an opted-out
 *  number (a WhatsApp STOP), whose status is the suppression's and is left alone. */
export function outcomePlan(outcome: string, lead: { status?: string | null; is_potential_work?: boolean | null; amount_paid?: unknown; next_action?: string | null; call_booked_at?: string | null }, nowMs: number = Date.now()): OutcomePlan {
  const plan: OutcomePlan = { star: false, status: null, clearNextAction: false, clearMeeting: false, suppressNumber: false, askMeeting: false, askCallBackDay: false };
  const { effect } = outcomeRule(outcome);
  const status = (lead.status ?? '').trim();
  const stage = salesStageOf(status);
  const locked = paidOf(lead.amount_paid) || stage === 'client' || stage === 'won';
  if (effect === 'wrong_number') plan.suppressNumber = true; // a number fact — true for any lead
  if (effect === 'call_back') plan.askCallBackDay = true;
  if (effect === 'meeting') plan.askMeeting = true;
  if (locked) return plan;
  if (effect === 'interested' || effect === 'meeting') {
    if (!lead.is_potential_work) plan.star = true;
    if (status === 'not_interested' || status === 'closed') plan.status = 'interested';
  }
  if (effect === 'not_interested') {
    if (!NOT_INTERESTED_STATUSES.has(status)) plan.status = 'not_interested';
    if (lead.next_action && lead.next_action !== 'none') plan.clearNextAction = true;
    /* Found clicking through the Work panel (2026-09-30): a Not interested lead kept its meeting, so a
       later yes jumped straight back to "Meeting booked" for a meeting that was off. */
    if (meetingIsCurrent(lead.call_booked_at, nowMs)) plan.clearMeeting = true;
  }
  return plan;
}

/* ── 5. LAST CONTACT ─────────────────────────────────────────────────────────────────────────── */

type ActivityRow = { kind: string; body?: string | null; data?: Record<string, unknown> | null; created_at: string; actor_user_id?: string | null; lead_id?: string | null };
export const LOGGED_CONTACT_KINDS: ReadonlySet<string> = new Set(['call_outcome', 'contact_logged']);

export interface LastContactView {
  /** "Call", "LinkedIn", "WhatsApp", "Email"… (the method's short name). */
  method: string;
  /** "Left voicemail", "Replied", "Sent"… */
  outcome: string;
  outcomeValue: string | null;
  at: string;
  actorId: string | null;
  note: string | null;
  tone: 'good' | 'bad' | 'neutral';
  /** Did ANY logged contact on this lead reach the business (REACHED_OUTCOMES)? */
  everReached: boolean;
}

const OUTCOME_TONE: Record<string, 'good' | 'bad'> = { interested: 'good', meeting_booked: 'good', not_interested: 'bad', wrong_number: 'bad' };
const shortOf = (method: string) => CONTACT_METHODS.find((m) => m.value === method)?.short ?? contactMethodLabel(method);

/** The newest hand-logged contact in a timeline (any order), or null. */
export function lastLoggedContactOf(rows: ReadonlyArray<ActivityRow> | null | undefined): LastContactView | null {
  let best: ActivityRow | null = null;
  for (const r of rows ?? []) {
    if (!LOGGED_CONTACT_KINDS.has(r.kind)) continue;
    if (!best || Date.parse(r.created_at) > Date.parse(best.created_at)) best = r;
  }
  if (!best) return null;
  const everReached = (rows ?? []).some((r) => LOGGED_CONTACT_KINDS.has(r.kind) && REACHED_OUTCOMES.has(String(r.data?.outcome ?? '')));
  const outcome = String(best.data?.outcome ?? '');
  const channel = best.data?.channel ? String(best.data.channel) : (best.kind === 'call_outcome' ? 'call' : '');
  return {
    method: channel ? shortOf(channel) : 'Contact',
    outcome: outcomeLabel(outcome),
    outcomeValue: outcome || null,
    at: best.created_at,
    actorId: best.actor_user_id ?? null,
    note: (best.body ?? '').trim() || null,
    tone: OUTCOME_TONE[outcome] ?? 'neutral',
    everReached,
  };
}

/** WhatsApp as a contact: the newest message either way. */
export interface WhatsAppTouch { direction: 'inbound' | 'outbound'; at: string; failed?: boolean }

/** THE LAST CONTACT, EVERY CHANNEL: the newer of the newest logged contact and the newest WhatsApp
 *  message (a reply reads "WhatsApp · Replied", a send "WhatsApp · Sent"). A failed send is not a
 *  contact. Either side may be missing. */
export function lastContactOf(logged: LastContactView | null, whatsapp: WhatsAppTouch | null): LastContactView | null {
  const wa: LastContactView | null = whatsapp && !whatsapp.failed && Number.isFinite(Date.parse(whatsapp.at))
    ? { method: 'WhatsApp', outcome: whatsapp.direction === 'inbound' ? 'Replied' : 'Sent', outcomeValue: null, at: whatsapp.at, actorId: null, note: null, tone: whatsapp.direction === 'inbound' ? 'good' : 'neutral', everReached: logged?.everReached ?? false }
    : null;
  if (!logged) return wa;
  if (!wa) return logged;
  return Date.parse(wa.at) > Date.parse(logged.at) ? wa : logged;
}

/** "2h ago", "20m ago", "Yesterday", "3 days ago", "12 Sep". */
export function contactAgo(iso: string, nowMs: number = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((nowMs - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  const day = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  if (day(t) === day(nowMs)) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.round((Date.parse(`${day(nowMs)}T12:00:00Z`) - Date.parse(`${day(t)}T12:00:00Z`)) / 86_400_000);
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
}

/** "Call · Left voicemail · 2h ago". */
export function lastContactText(v: LastContactView, nowMs: number = Date.now()): string {
  return [v.method, v.outcome, contactAgo(v.at, nowMs)].filter(Boolean).join(' · ');
}

/** The newest logged contact per lead, from a batch of activity rows (Outreach / the Inbox list). */
export function lastLoggedByLead(rows: ReadonlyArray<ActivityRow>): Map<string, LastContactView> {
  const by = new Map<string, ActivityRow[]>();
  for (const r of rows) {
    if (!r.lead_id || !LOGGED_CONTACT_KINDS.has(r.kind)) continue;
    const l = by.get(r.lead_id); if (l) l.push(r); else by.set(r.lead_id, [r]);
  }
  const out = new Map<string, LastContactView>();
  for (const [id, rs] of by) { const v = lastLoggedContactOf(rs); if (v) out.set(id, v); }
  return out;
}

/* ── 6. HISTORY: the state change a logged outcome made ───────────────────────────────────────── */

/** "Status: Contacted → Interested" — only when the reading actually changed; null otherwise. */
export function stateChangeText(before: SalesStateView, after: SalesStateView): string | null {
  if (before.state === after.state) return null;
  return `Status: ${before.label} → ${after.label}`;
}

const isState = (v: unknown): v is SalesState => typeof v === 'string' && (SALES_STATES as readonly string[]).includes(v);

/** A stored 'state_changed' row (lead_log_state_change) in the same words. */
export function stateChangedWords(data: Record<string, unknown> | null | undefined): string {
  const w = (v: unknown) => (isState(v) ? SALES_STATE_LABEL[v] : String(v ?? '—'));
  return `Status: ${w(data?.from)} → ${w(data?.to)}`;
}

/* ── 6b. ONE STATUS PILL (Paul, 2026-10-01) ─────────────────────────────────────────────────────────
   A lead row shows ONE pill: the solid pipeline badge (PipelineStatusSelect / OneStatusPill), in its own
   words and colours. Interested is the gold star, never a pill. The sales stage above is NOT drawn as a
   second pill beside it (it was, 2026-09-30, via stateShownByBadge — removed); it appears in the pill's
   tooltip, the lead popup and Focus Mode. ─────────────────────────────────────────────────────────── */

/* ── 7. QUEUE RULES (what the state means for the lists — read, never written) ────────────────── */

/** Out of the normal outreach queues: said no, a client, won (the admin has it). */
export function isOutOfOutreach(s: SalesState): boolean {
  return s === 'not_interested' || s === 'client' || s === 'won';
}
/** Engaged: worth ranking above cold outreach in Next best actions. */
export function isEngaged(s: SalesState): boolean {
  return s === 'replied' || s === 'interested' || s === 'meeting_booked';
}
