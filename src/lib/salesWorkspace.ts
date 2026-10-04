/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE SALES WORKSPACE FOLD (Sales Experience, 2026-09-28). Pure: facts in, the dashboard's working
   sections out — Today, the pipeline, next best actions, the follow-up queue, warm/cold, response
   timers, the activity feed, pipeline health, trends, the daily recap, milestones and targets.
   Run by fn sales-performance beside foldSalesPerformance, on the SAME per-lead facts
   (salesPerformance.ts LeadFacts) — contacted / replied / interested / link / won are read from there,
   never re-derived here. docs/sales-experience.md §3 says every rule below in words.

   ⛔ TRANSPARENT RULES ONLY. Every state is a stored fact and a named threshold (the constants just
   below). No score, no probability, no "AI thinks". A number the data cannot support says so
   (trends.enough = false) instead of drawing a shape.
   ⛔ A PERSON'S NEXT ACTION IS NEVER CHANGED HERE. It is read; a due one is surfaced; that is all.
   ⛔ Days are London calendar days (a salesperson's "today").
   ⛔ AN ARCHIVED LEAD IS NEVER WORK (fix workstream 5, 2026-10-04; Session A A-03, master plan M-008). It is not a
      next action, a follow-up (due, overdue, waiting, warm, going cold, interested, sign-up, meeting), a pipeline
      card or a health warning. Its HISTORY stays: today's counts, the activity feed, trends and milestones still
      count what was really done. isActiveWork is the one predicate.
   ⛔ CALL-FIRST (2026-10-04): a due Call is "Call due", an audit ready to use is "Ready to call" and opens the lead
      (the call screen), not WhatsApp; an interested lead says "Ring them, or Quick Close". A WhatsApp reply still
      ranks high (the 24-hour window), but nothing here is a mass-WhatsApp task.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import type { LeadFacts, PerfActivity } from './salesPerformance.ts';
import { conversationState, londonToday } from './conversationState.ts';
import { NEXT_ACTION_OPTIONS, followUpBucket } from './salesCrm.ts';
import type { QuickCloseState } from './quickClose.ts';
import { meetingWhen } from './leadState.ts';
import { WHATSAPP_NEXT_ACTIONS } from './nextActionView.ts';

export const WARM_DAYS = 7;
export const NEEDS_FOLLOW_UP_DAYS = 3;
export const GOING_COLD_DAYS = 14;
export const SIGNUP_UNOPENED_DAYS = 2;
export const INTERESTED_UNTOUCHED_DAYS = 2;
export const AUDIT_READY_DAYS = 3;
export const STUCK_INTERESTED_DAYS = 7;
export const SIGNUP_UNPAID_DAYS = 7;
export const FEED_DAYS = 14;
/** A reply older than this is no longer "waiting on you" in the timers or the action list — it is a
 *  lead going cold (it still sits in the "Replied, unanswered" group, newest first). */
export const REPLY_ACTION_DAYS = 14;
export const TREND_WEEKS = 8;
/** A booked meeting is an action from this long before it starts until MEETING_ACTION_AFTER_MS after. */
export const MEETING_ACTION_BEFORE_MS = 36 * 3600_000;
export const MEETING_ACTION_AFTER_MS = 12 * 3600_000;
/** A trend is drawn only with at least this many contacted leads across the weeks, in this many weeks. */
export const TREND_MIN_CONTACTED = 20;
export const TREND_MIN_ACTIVE_WEEKS = 3;
const DAY = 86_400_000;

export interface WorkspaceLead {
  id: string;
  business_name: string | null;
  status: string | null;
  next_action: string | null;
  next_action_date: string | null;
  next_action_time?: string | null;
  next_action_note: string | null;
  sold_at?: string | null;
  /** A booked call / meeting (lead_set_call_booked) — the Meetings list and the top of Next best actions. */
  call_booked_at?: string | null;
  /** Archived = stopped working it. Absent (an older caller) reads as not archived. */
  is_archived?: boolean | null;
}

/** ⛔ THE ONE "IS THIS STILL WORK?" PREDICATE: an archived lead never is. Its history still counts. */
export function isActiveWork(lead: Pick<WorkspaceLead, 'is_archived'> | undefined | null): boolean {
  return lead?.is_archived !== true;
}
/** A completed hook audit on one of the person's leads (ai_audit_runs status 'complete'). */
export interface WorkspaceAudit { lead_id: string; completed_at: string }

export type Warmth = 'warm' | 'needs_follow_up' | 'going_cold';
export interface PipeLead { id: string; name: string; at: string | null; warmth: Warmth | null; detail?: string;
  /** Where THIS row is worked, when it differs by lead (a due follow-up: its action type decides). */
  link?: ActionLink }
export type Tone = 'green' | 'blue' | 'amber' | 'purple' | 'red' | 'grey';
export type ActionLink = 'whatsapp' | 'lead';
export interface NextAction { kind: string; leadId: string; name: string; title: string; detail: string; at: string | null; tone: Tone; link: ActionLink }
export interface FeedItem { kind: string; leadId: string; name: string; text: string; at: string; tone: Tone; link: ActionLink }
export interface HealthWarning { key: string; tone: Tone; text: string; group?: FollowUpGroup }
export interface Milestone { key: string; label: string; achieved: boolean; achievedAt: string | null; progress: number | null; target: number | null; note?: string }
export type FollowUpGroup = 'overdue' | 'dueToday' | 'repliedUnanswered' | 'interestedUntouched' | 'signupSent' | 'goingCold' | 'meetings' | 'warm';
export type StageKey = 'new' | 'contacted' | 'replied' | 'interested' | 'signup_sent' | 'paid';
export interface TargetInput { period?: 'week' | 'month'; contacts?: number; replies?: number; interested?: number; wins?: number; commission?: number }

export interface SalesWorkspace {
  today: { day: string; contacted: number; replies: number; interested: number; won: number; followUpsDue: number };
  recap: { day: string; contacted: number; replies: number; interested: number; won: number; followUpsCompleted: number; followUpsRemaining: number };
  pipeline: { key: StageKey; label: string; count: number; leads: PipeLead[] }[];
  notInterested: number;
  nextActions: NextAction[];
  followUps: Record<FollowUpGroup, PipeLead[]>;
  warmth: Record<Warmth, number>;
  waiting: { leadId: string; name: string; since: string }[];
  activity: FeedItem[];
  health: HealthWarning[];
  trends: { enough: boolean; reason: string | null; weeks: { weekStart: string; contacted: number; replies: number; interested: number; won: number }[] };
  milestones: Milestone[];
  targets: { period: 'week' | 'month'; since: string; rows: { key: string; label: string; target: number; actual: number | null }[] } | null;
}

export interface WorkspaceInput {
  personId: string | null;
  facts: LeadFacts[];
  leads: Map<string, WorkspaceLead>;
  audits: WorkspaceAudit[];
  activity: PerfActivity[];
  nowMs: number;
  targets?: TargetInput | null;
  /** Commission lines (src/lib/commission.ts: payments +, reversals −), from the payment ledger — for the
   *  £100 milestone, the commission target, the feed and "earned today". Null when the person earns no
   *  commission; a milestone that needs it then says so rather than guessing. */
  commission?: { at: string; amount: number; leadId: string; label: string; business: string }[] | null;
  /** Quick Close per lead (derived state + when the payment link was made), for the next best actions. */
  quickClose?: Map<string, { state: QuickCloseState; linkAt: string | null }>;
}

export const STAGES: { key: StageKey; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'replied', label: 'Replied' },
  { key: 'interested', label: 'Interested' },
  { key: 'signup_sent', label: 'Signup sent' },
  { key: 'paid', label: 'Paid' },
];

/** London calendar day of an instant. */
export function londonDay(ms: number): string { return londonToday(ms); }
const iso = (ms: number | null | undefined) => (ms === null || ms === undefined || !Number.isFinite(ms) ? null : new Date(ms).toISOString());
const last = (a: number[]) => (a.length ? a[a.length - 1] : null);

/** The one stage a lead sits in now: the furthest it has reached. */
export function stageOf(f: LeadFacts): StageKey {
  if (f.won) return 'paid';
  if (f.onboardingSent) return 'signup_sent';
  if (f.interested) return 'interested';
  if (f.responded) return 'replied';
  if (f.contactCount > 0) return 'contacted';
  return 'new';
}

/** Warm / needs follow-up / going cold — only for leads that have engaged (replied or interested) and
 *  are neither won nor out. */
export function warmthOf(f: LeadFacts, lead: WorkspaceLead | undefined, nowMs: number): Warmth | null {
  if (f.won || f.notInterested || !(f.responded || f.interested)) return null;
  const lastTheirs = last(f.humanReplyTimesMs);
  const lastOurs = last(f.contactTimesMs);
  const lastAny = Math.max(lastTheirs ?? -Infinity, lastOurs ?? -Infinity);
  if (Number.isFinite(lastAny) && nowMs - lastAny > GOING_COLD_DAYS * DAY) return 'going_cold';
  const st = conversationState({ messages: f.thread, lastReadAt: null, nextAction: lead?.next_action, nextActionDate: lead?.next_action_date, nowMs });
  const quietOnUs = lastOurs !== null && (lastTheirs === null || lastTheirs < lastOurs) && nowMs - lastOurs > NEEDS_FOLLOW_UP_DAYS * DAY;
  if (st.waitingSinceMs !== null || st.followUpDue || quietOnUs) return 'needs_follow_up';
  if (lastTheirs !== null && nowMs - lastTheirs <= WARM_DAYS * DAY) return 'warm';
  return null;
}

/** The words for a Next Action: the prospect panel's own labels (salesCrm.ts), else the value in words. */
export const nextActionWord = (a: string | null | undefined) => {
  if (!a) return '';
  const o = NEXT_ACTION_OPTIONS.find((x) => x.value === a);
  const w = o ? o.label : a.replace(/_/g, ' ');
  return w.charAt(0).toUpperCase() + w.slice(1);
};
/** Next Actions done on WhatsApp open the thread; the rest open the lead. */
const WHATSAPP_ACTIONS = WHATSAPP_NEXT_ACTIONS;

export function foldSalesWorkspace(input: WorkspaceInput): SalesWorkspace {
  const now = input.nowMs;
  const today = londonToday(now);
  const onToday = (ms: number | null | undefined) => ms !== null && ms !== undefined && Number.isFinite(ms) && londonDay(ms) === today;
  const nameOf = (f: LeadFacts) => f.lead.business_name ?? 'Unnamed business';
  const auditsBy = new Map<string, number>();
  for (const a of input.audits) { const v = Date.parse(a.completed_at); if (!(v <= (auditsBy.get(a.lead_id) ?? -Infinity))) auditsBy.set(a.lead_id, v); }
  const actBy = new Map<string, PerfActivity[]>();
  for (const a of input.activity) { const l = actBy.get(a.lead_id); if (l) l.push(a); else actBy.set(a.lead_id, [a]); }
  for (const l of actBy.values()) l.sort((x, y) => Date.parse(x.created_at) - Date.parse(y.created_at));

  const pipeline = STAGES.map((s) => ({ ...s, count: 0, leads: [] as PipeLead[] }));
  const followUps: Record<FollowUpGroup, PipeLead[]> = { overdue: [], dueToday: [], repliedUnanswered: [], interestedUntouched: [], signupSent: [], goingCold: [], meetings: [], warm: [] };
  const warmth: Record<Warmth, number> = { warm: 0, needs_follow_up: 0, going_cold: 0 };
  const actions: (NextAction & { rank: number })[] = [];
  const waiting: { leadId: string; name: string; since: string; ms: number }[] = [];
  const feed: FeedItem[] = [];
  const todayC = { contacted: 0, replies: 0, interested: 0, won: 0, followUpsDue: 0 };
  let notInterested = 0; let followUpsCompleted = 0;
  const feedFloor = now - FEED_DAYS * DAY;
  /* ── Activity feed (meaningful events only) — HISTORY, so archived leads keep theirs ── */
  const pushFeed = (f: LeadFacts, name: string, soldMs: number | null, auditMs: number | undefined, acts: PerfActivity[]) => {
    /* One "replied" line per lead per day — three messages in a row are one reply, not three events. */
    const replyDays = new Set<string>();
    for (const r of [...f.humanReplyTimesMs].reverse()) if (r >= feedFloor && !replyDays.has(londonDay(r)) && replyDays.add(londonDay(r))) feed.push({ kind: 'reply', leadId: f.lead.id, name, text: `${name} replied on WhatsApp`, at: iso(r)!, tone: 'blue', link: 'whatsapp' });
    if (f.interestedAtMs !== null && f.interestedAtMs >= feedFloor) feed.push({ kind: 'interested', leadId: f.lead.id, name, text: `${name} is interested`, at: iso(f.interestedAtMs)!, tone: 'green', link: 'lead' });
    if (f.linkFirstSentAt && Date.parse(f.linkFirstSentAt) >= feedFloor) feed.push({ kind: 'signup_sent', leadId: f.lead.id, name, text: `Sign-up link sent to ${name}`, at: f.linkFirstSentAt, tone: 'grey', link: 'lead' });
    if (f.linkFirstOpenedAt && Date.parse(f.linkFirstOpenedAt) >= feedFloor) feed.push({ kind: 'signup_opened', leadId: f.lead.id, name, text: `${name} opened the sign-up page`, at: f.linkFirstOpenedAt, tone: 'green', link: 'whatsapp' });
    if (f.won && soldMs !== null && soldMs >= feedFloor) feed.push({ kind: 'payment', leadId: f.lead.id, name, text: `${name} became a client`, at: iso(soldMs)!, tone: 'green', link: 'lead' });
    if (auditMs !== undefined && auditMs >= feedFloor) feed.push({ kind: 'audit', leadId: f.lead.id, name, text: `Audit finished for ${name}`, at: iso(auditMs)!, tone: 'purple', link: 'lead' });
    for (const a of acts) {
      const at = Date.parse(a.created_at);
      if (at < feedFloor) continue;
      if (a.kind === 'follow_up_set' && a.data?.next_action && a.data.next_action !== 'none') feed.push({ kind: 'follow_up', leadId: f.lead.id, name, text: `Follow-up set: ${nextActionWord(String(a.data.next_action))}${a.data.date ? ` on ${a.data.date}` : ''} — ${name}`, at: a.created_at, tone: 'amber', link: 'lead' });
      else if ((a.kind === 'lead_assigned' || a.kind === 'lead_claimed') && (input.personId === null || a.data?.to === input.personId || a.kind === 'lead_claimed')) feed.push({ kind: 'assigned', leadId: f.lead.id, name, text: a.kind === 'lead_claimed' ? `You claimed ${name}` : `${name} was assigned to you`, at: a.created_at, tone: 'grey', link: 'lead' });
      else if (a.kind === 'call_outcome' || a.kind === 'contact_logged') feed.push({ kind: 'contact', leadId: f.lead.id, name, text: `${a.kind === 'call_outcome' ? 'Call' : 'Contact'} logged with ${name}${a.data?.outcome ? ` — ${String(a.data.outcome).replace(/_/g, ' ')}` : ''}`, at: a.created_at, tone: 'grey', link: 'lead' });
    }
  };

  for (const f of input.facts) {
    const lead = input.leads.get(f.lead.id);
    const name = nameOf(f);
    const stage = stageOf(f);
    const active = isActiveWork(lead);
    const w = active ? warmthOf(f, lead, now) : null;
    const lastTouch = Math.max(last(f.humanReplyTimesMs) ?? -Infinity, last(f.contactTimesMs) ?? -Infinity);
    const pl: PipeLead = { id: f.lead.id, name, at: iso(Number.isFinite(lastTouch) ? lastTouch : null), warmth: w };
    if (active) {
      if (f.notInterested && !f.won) notInterested += 1;
      else { const row = pipeline.find((p) => p.key === stage)!; row.count += 1; row.leads.push(pl); }
    }
    if (w) warmth[w] += 1;

    // ── Today (history: what was really done, archived or not) ──
    if (f.contactTimesMs.some(onToday)) todayC.contacted += 1;
    if (f.humanReplyTimesMs.some(onToday)) todayC.replies += 1;
    if (onToday(f.interestedAtMs)) todayC.interested += 1;
    const soldMs = lead?.sold_at ? Date.parse(lead.sold_at) : null;
    if (f.won && onToday(soldMs)) todayC.won += 1;
    const acts = actBy.get(f.lead.id) ?? [];
    const auditMs = auditsBy.get(f.lead.id);
    pushFeed(f, name, soldMs, auditMs, acts);
    /* ⛔ Archived: history above, and nothing below — no action, no follow-up, no waiting reply, no meeting. */
    if (!active) continue;

    // ── The conversation, by the one rule ──
    const st = conversationState({ messages: f.thread, lastReadAt: null, leadStatus: f.lead.status, nextAction: lead?.next_action, nextActionDate: lead?.next_action_date, nowMs: now });
    const out = f.won || f.notInterested;
    /* Warm (Focus Mode's list, moved to Sales → What to do next, 2026-10-01): the same warmth reading. */
    if (!out && w === 'warm') followUps.warm.push(pl);

    /* ── A booked meeting (lead state audit, 2026-09-30): it outranks everything — prepare for it, then
       log how it went. Every upcoming one is on the Meetings list; the action is for the next 36 hours
       and the 12 after it started. Not for a lead that is won or out. ── */
    const meetMs = lead?.call_booked_at ? Date.parse(lead.call_booked_at) : NaN;
    if (!out && Number.isFinite(meetMs) && meetMs >= now - MEETING_ACTION_AFTER_MS) {
      const when = meetingWhen(lead!.call_booked_at!);
      followUps.meetings.push({ ...pl, at: iso(meetMs), detail: when });
      if (meetMs <= now + MEETING_ACTION_BEFORE_MS) {
        const started = meetMs <= now;
        actions.push({ kind: 'meeting', leadId: f.lead.id, name, title: started ? 'Meeting — log how it went' : onToday(meetMs) ? 'Meeting today' : 'Meeting booked',
          detail: when, at: iso(meetMs), tone: 'blue', link: 'lead', rank: -1 });
      }
    }

    // ── Follow-ups (a person's Next Action — read, never changed) ──
    const na = lead?.next_action && lead.next_action !== 'none' ? lead.next_action : null;
    const naDate = na ? lead?.next_action_date ?? null : null;
    if (na && naDate && naDate <= today) {
      todayC.followUpsDue += 1;
      const item: PipeLead = { ...pl, detail: `${nextActionWord(na)}${lead?.next_action_note ? ` — ${lead.next_action_note}` : ''}`, link: WHATSAPP_ACTIONS.has(na) ? 'whatsapp' : 'lead' };
      /* Overdue: an earlier UK day, or today past its UK time (followUpBucket, 2026-10-02). */
      (followUpBucket(naDate, today, lead?.next_action_time ?? null, now) === 'overdue' ? followUps.overdue : followUps.dueToday).push(item);
      const isCall = na === 'call';
      actions.push({ kind: naDate < today ? 'follow_up_overdue' : 'follow_up_due', leadId: f.lead.id, name,
        title: isCall ? (naDate < today ? 'Call overdue' : 'Call due today') : (naDate < today ? 'Follow-up overdue' : 'Follow-up due today'), detail: item.detail!,
        at: `${naDate}T09:00:00Z`, tone: naDate < today ? 'red' : 'amber', link: WHATSAPP_ACTIONS.has(na) ? 'whatsapp' : 'lead', rank: naDate < today ? 1 : 2 });
    }
    // Follow-ups completed today: due at the start of today (its last setting before today), then
    // contacted or re-scheduled today.
    const before = acts.filter((a) => a.kind === 'follow_up_set' && londonDay(Date.parse(a.created_at)) < today).pop();
    const dueAtDawn = before && before.data?.next_action && before.data.next_action !== 'none' && typeof before.data.date === 'string' && before.data.date <= today;
    if (dueAtDawn && (f.contactTimesMs.some(onToday) || acts.some((a) => a.kind === 'follow_up_set' && onToday(Date.parse(a.created_at))))) followUpsCompleted += 1;

    if (!out && st.waitingSinceMs !== null) followUps.repliedUnanswered.push({ ...pl, at: iso(st.waitingSinceMs) });
    if (!out && st.waitingSinceMs !== null && now - st.waitingSinceMs <= REPLY_ACTION_DAYS * DAY) {
      waiting.push({ leadId: f.lead.id, name, since: iso(st.waitingSinceMs)!, ms: st.waitingSinceMs });
      actions.push({ kind: 'reply_waiting', leadId: f.lead.id, name, title: 'New WhatsApp reply', detail: st.label ?? 'Waiting on you', at: iso(st.waitingSinceMs), tone: 'blue', link: 'whatsapp', rank: 0 });
    }
    if (!f.won && f.onboardingOpened && !f.notInterested) {
      actions.push({ kind: 'signup_opened', leadId: f.lead.id, name, title: 'Opened the sign-up page', detail: 'Not paid yet — a good moment to check in', at: f.linkFirstOpenedAt, tone: 'green', link: 'whatsapp', rank: 3 });
    }
    const lastOurs = last(f.contactTimesMs);
    if (f.interested && !out && !f.onboardingSent) {
      const since = f.interestedAtMs ?? null;
      const untouched = since === null ? (lastOurs === null || now - lastOurs > INTERESTED_UNTOUCHED_DAYS * DAY) : !(lastOurs !== null && lastOurs > since) && now - since > INTERESTED_UNTOUCHED_DAYS * DAY;
      if (untouched) {
        followUps.interestedUntouched.push(pl);
        actions.push({ kind: 'interested_untouched', leadId: f.lead.id, name, title: 'Interested — not followed up', detail: 'Ring them, or take the £99 with Quick Close', at: iso(since), tone: 'green', link: 'lead', rank: 4 });
      }
    }
    if (!f.won && !f.notInterested && f.onboardingSent) {
      followUps.signupSent.push({ ...pl, at: f.linkFirstSentAt, detail: f.onboardingOpened ? 'Opened, not paid' : 'Not opened yet' });
      const sentMs = f.linkFirstSentAt ? Date.parse(f.linkFirstSentAt) : null;
      if (!f.onboardingOpened && sentMs !== null && now - sentMs > SIGNUP_UNOPENED_DAYS * DAY) {
        actions.push({ kind: 'signup_unopened', leadId: f.lead.id, name, title: 'Sign-up link not opened', detail: `Sent ${Math.floor((now - sentMs) / DAY)} days ago`, at: f.linkFirstSentAt, tone: 'amber', link: 'whatsapp', rank: 5 });
      }
    }
    if (auditMs !== undefined && !out && now - auditMs <= AUDIT_READY_DAYS * DAY && !(lastOurs !== null && lastOurs > auditMs)) {
      actions.push({ kind: 'audit_ready', leadId: f.lead.id, name, title: 'Ready to call', detail: 'The AI check is in — open the call script and ring them', at: iso(auditMs), tone: 'purple', link: 'lead', rank: 3 });
    }
    if (w === 'going_cold') {
      followUps.goingCold.push(pl);
      actions.push({ kind: 'going_cold', leadId: f.lead.id, name, title: 'Warm lead going cold', detail: `No contact for ${GOING_COLD_DAYS}+ days`, at: pl.at, tone: 'amber', link: 'whatsapp', rank: 7 });
    }

    // ── Quick Close: finish it, or chase the link ──
    const qcs = input.quickClose?.get(f.lead.id);
    if (qcs && !f.won) {
      if (qcs.state === 'in_progress' || qcs.state === 'ready' || qcs.state === 'consents_needed') actions.push({ kind: 'quick_close_finish', leadId: f.lead.id, name, title: qcs.state === 'ready' ? 'Quick Close ready — send the payment link' : qcs.state === 'consents_needed' ? 'Quick Close — Build consents needed' : 'Finish Quick Close', detail: qcs.state === 'consents_needed' ? 'They need to confirm the three new-website consents before the link' : 'Answers are saved — pick up where you left off', at: null, tone: 'amber', link: 'lead', rank: 2 });
      else if (qcs.state === 'link_generated') actions.push({ kind: 'quick_close_link', leadId: f.lead.id, name, title: 'Payment link sent — not paid yet', detail: qcs.linkAt ? `Link made ${new Date(qcs.linkAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'Check they received it', at: qcs.linkAt, tone: 'green', link: 'whatsapp', rank: 3 });
      else if (qcs.state === 'needs_review') actions.push({ kind: 'quick_close_review', leadId: f.lead.id, name, title: 'Quick Close waiting for Paul', detail: 'Domain / agency issue under review', at: null, tone: 'amber', link: 'lead', rank: 8 });
    }

  }

  // One action per lead: the most urgent.
  actions.sort((a, b) => a.rank - b.rank || (b.at ?? '').localeCompare(a.at ?? ''));
  const seen = new Set<string>();
  const nextActions = actions.filter((a) => (seen.has(a.leadId) ? false : (seen.add(a.leadId), true))).slice(0, 12).map(({ rank: _r, ...a }) => a);

  for (const row of pipeline) row.leads.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
  for (const g of Object.values(followUps)) g.sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));
  followUps.repliedUnanswered.reverse(); // newest unanswered reply first — the one most worth answering

  return {
    today: { day: today, ...todayC },
    recap: { day: today, contacted: todayC.contacted, replies: todayC.replies, interested: todayC.interested, won: todayC.won, followUpsCompleted, followUpsRemaining: todayC.followUpsDue },
    pipeline: pipeline.map((p) => ({ ...p, leads: p.leads.slice(0, 100) })),
    notInterested,
    nextActions,
    followUps,
    warmth,
    waiting: waiting.sort((a, b) => a.ms - b.ms).slice(0, 10).map(({ ms: _m, ...w }) => w),
    activity: [...feed, ...(input.commission ?? []).filter((c) => Date.parse(c.at) >= feedFloor && c.amount !== 0).map((c): FeedItem => ({
      kind: 'commission', leadId: c.leadId, name: c.business,
      text: c.amount > 0 ? `+£${c.amount.toFixed(2)} commission earned — ${c.business} (${c.label.toLowerCase()})` : `−£${(-c.amount).toFixed(2)} commission reversed — ${c.business} (${c.label.toLowerCase()})`,
      at: c.at, tone: c.amount > 0 ? 'green' : 'red', link: 'lead',
    }))].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 25),
    health: healthOf(input.facts.filter((f) => isActiveWork(input.leads.get(f.lead.id))), followUps, now),
    trends: trendsOf(input.facts, input.leads, now),
    milestones: milestonesOf(input.facts, input.leads, input.commission ? Math.round(input.commission.reduce((s, c) => s + c.amount, 0) * 100) / 100 : null),
    targets: targetsOf(input, now),
  };
}

function healthOf(facts: LeadFacts[], fu: Record<FollowUpGroup, PipeLead[]>, now: number): HealthWarning[] {
  const out: HealthWarning[] = [];
  const since = now - 14 * DAY;
  const contacted14 = facts.filter((f) => f.contactTimesMs.some((t) => t >= since)).length;
  const replied14 = facts.filter((f) => f.contactTimesMs.some((t) => t >= since) && f.responded).length;
  if (contacted14 >= 20 && replied14 / contacted14 < 0.05) out.push({ key: 'low_replies', tone: 'amber', text: `${contacted14} leads contacted in the last 14 days, ${replied14} replied. Worth trying a different opener or channel.` });
  const replied = facts.filter((f) => f.responded).length;
  const interested = facts.filter((f) => f.interested).length;
  if (replied >= 5 && interested === 0) out.push({ key: 'no_interested', tone: 'amber', text: `${replied} leads have replied but none is marked interested yet.`, group: 'repliedUnanswered' });
  const stuck = facts.filter((f) => f.interested && !f.won && !f.notInterested && (() => { const l = f.contactTimesMs.length ? f.contactTimesMs[f.contactTimesMs.length - 1] : null; return l === null || now - l > STUCK_INTERESTED_DAYS * DAY; })()).length;
  if (stuck > 0) out.push({ key: 'interested_stuck', tone: 'amber', text: `${stuck} interested ${stuck === 1 ? 'lead has' : 'leads have'} had no contact for ${STUCK_INTERESTED_DAYS}+ days.`, group: 'interestedUntouched' });
  const unpaid = facts.filter((f) => f.onboardingSent && !f.won && !f.notInterested && f.linkFirstSentAt && now - Date.parse(f.linkFirstSentAt) > SIGNUP_UNPAID_DAYS * DAY).length;
  if (unpaid > 0) out.push({ key: 'signup_unpaid', tone: 'amber', text: `${unpaid} sign-up ${unpaid === 1 ? 'link was' : 'links were'} sent over ${SIGNUP_UNPAID_DAYS} days ago and not paid.`, group: 'signupSent' });
  if (fu.overdue.length > 0) out.push({ key: 'overdue', tone: 'red', text: `${fu.overdue.length} follow-${fu.overdue.length === 1 ? 'up is' : 'ups are'} overdue.`, group: 'overdue' });
  return out;
}

/** Monday of the UTC week holding ms, as YYYY-MM-DD. */
function weekStart(ms: number): string {
  const d = new Date(ms); const dow = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow)).toISOString().slice(0, 10);
}

function trendsOf(facts: LeadFacts[], leads: Map<string, WorkspaceLead>, now: number): SalesWorkspace['trends'] {
  const weeks: string[] = [];
  for (let i = TREND_WEEKS - 1; i >= 0; i--) weeks.push(weekStart(now - i * 7 * DAY));
  const rows = weeks.map((w) => ({ weekStart: w, contacted: 0, replies: 0, interested: 0, won: 0 }));
  const idx = new Map(weeks.map((w, i) => [w, i]));
  for (const f of facts) {
    const cw = new Set(f.contactTimesMs.map(weekStart)); for (const w of cw) { const i = idx.get(w); if (i !== undefined) rows[i].contacted += 1; }
    const rw = new Set(f.humanReplyTimesMs.map(weekStart)); for (const w of rw) { const i = idx.get(w); if (i !== undefined) rows[i].replies += 1; }
    if (f.interestedAtMs !== null) { const i = idx.get(weekStart(f.interestedAtMs)); if (i !== undefined) rows[i].interested += 1; }
    const sold = leads.get(f.lead.id)?.sold_at; if (f.won && sold) { const i = idx.get(weekStart(Date.parse(sold))); if (i !== undefined) rows[i].won += 1; }
  }
  const total = rows.reduce((s, r) => s + r.contacted, 0);
  const active = rows.filter((r) => r.contacted > 0).length;
  const enough = total >= TREND_MIN_CONTACTED && active >= TREND_MIN_ACTIVE_WEEKS;
  return { enough, reason: enough ? null : `Not enough data yet — a trend needs ${TREND_MIN_CONTACTED}+ contacted leads over ${TREND_MIN_ACTIVE_WEEKS}+ weeks (you have ${total} over ${active}).`, weeks: rows };
}

function longestDayStreak(days: Set<string>): number {
  const sorted = [...days].sort();
  let best = 0; let run = 0; let prev: number | null = null;
  for (const d of sorted) {
    const v = Date.parse(`${d}T12:00:00Z`);
    run = prev !== null && Math.round((v - prev) / DAY) === 1 ? run + 1 : 1;
    best = Math.max(best, run); prev = v;
  }
  return best;
}

function milestonesOf(facts: LeadFacts[], leads: Map<string, WorkspaceLead>, earnedGbp: number | null): Milestone[] {
  const firstOf = (vals: (number | null)[]) => { const v = vals.filter((x): x is number => x !== null && Number.isFinite(x)); return v.length ? new Date(Math.min(...v)).toISOString() : null; };
  const repliedFacts = facts.filter((f) => f.responded);
  const firstReply = firstOf(repliedFacts.map((f) => { const first = f.contactTimesMs[0] ?? -Infinity; return f.humanReplyTimesMs.find((t) => t >= first) ?? null; }));
  const interestedFacts = facts.filter((f) => f.interested);
  const wonFacts = facts.filter((f) => f.won);
  const soldTimes = wonFacts.map((f) => { const s = leads.get(f.lead.id)?.sold_at; return s ? Date.parse(s) : null; });
  const days = new Set<string>(); for (const f of facts) for (const t of f.contactTimesMs) days.add(londonDay(t));
  const streak = longestDayStreak(days);
  const m = (key: string, label: string, n: number, target: number, at: string | null): Milestone => ({ key, label, achieved: n >= target, achievedAt: n >= target ? at : null, progress: n, target });
  return [
    m('first_reply', 'First reply', repliedFacts.length, 1, firstReply),
    m('first_interested', 'First interested lead', interestedFacts.length, 1, firstOf(interestedFacts.map((f) => f.interestedAtMs))),
    m('first_client', 'First client won', wonFacts.length, 1, firstOf(soldTimes)),
    earnedGbp === null
      ? { key: 'earned_100', label: '£100 earned', achieved: false, achievedAt: null, progress: null, target: 100, note: 'Counts from your commission' }
      : { key: 'earned_100', label: '£100 earned', achieved: earnedGbp >= 100, achievedAt: null, progress: Math.round(earnedGbp * 100) / 100, target: 100 },
    m('ten_replies', '10 replies', repliedFacts.length, 10, null),
    m('streak_3', '3-day outreach streak', streak, 3, null),
    m('five_clients', '5 clients won', wonFacts.length, 5, null),
  ];
}

function targetsOf(input: WorkspaceInput, now: number): SalesWorkspace['targets'] {
  const t = input.targets;
  if (!t) return null;
  const period = t.period === 'month' ? 'month' : 'week';
  const d = new Date(now);
  const startMs = period === 'month'
    ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
    : Date.parse(`${weekStart(now)}T00:00:00Z`);
  const inP = (ms: number | null) => ms !== null && Number.isFinite(ms) && ms >= startMs;
  const f = input.facts;
  const actual = {
    contacts: f.filter((x) => x.contactTimesMs.some(inP)).length,
    replies: f.filter((x) => x.humanReplyTimesMs.some(inP)).length,
    interested: f.filter((x) => inP(x.interestedAtMs)).length,
    wins: f.filter((x) => { const s = input.leads.get(x.lead.id)?.sold_at; return x.won && !!s && inP(Date.parse(s)); }).length,
  };
  const rows: { key: string; label: string; target: number; actual: number | null }[] = [];
  const add = (key: keyof TargetInput, label: string, act: number | null) => { const v = Number(t[key]); if (Number.isFinite(v) && v > 0) rows.push({ key, label, target: v, actual: act }); };
  add('contacts', 'Leads contacted', actual.contacts);
  add('replies', 'Replies', actual.replies);
  add('interested', 'Interested', actual.interested);
  add('wins', 'Clients won', actual.wins);
  add('commission', 'Commission (£)', input.commission ? Math.round(input.commission.filter((c) => Date.parse(c.at) >= startMs).reduce((s, c) => s + c.amount, 0) * 100) / 100 : null);
  return { period, since: new Date(startMs).toISOString().slice(0, 10), rows };
}

/** A target as stored (user_preferences.sales_targets) — only positive whole numbers survive. */
export function parseTargets(raw: unknown): TargetInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const out: TargetInput = { period: r.period === 'month' ? 'month' : 'week' };
  let any = false;
  for (const k of ['contacts', 'replies', 'interested', 'wins', 'commission'] as const) {
    const v = Number(r[k]);
    if (Number.isFinite(v) && v > 0 && v < 100000) { out[k] = Math.round(v); any = true; }
  }
  return any ? out : null;
}
