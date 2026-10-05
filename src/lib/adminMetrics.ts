/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE ADMIN CONTROL CENTRE FOLD (2026-09-30, Paul: "open one page each day and understand the
   business"). Pure: rows in, numbers out. Run by fn admin-overview on the service role — the browser
   receives only the totals, never the book.

   ⛔ THE DEFINITIONS LIVE HERE AND ONLY HERE (docs/admin-control-centre.md quotes them). Every count
   below is an EVENT IN THE PERIOD unless it says "current" or "cohort":
   - WHO: a WhatsApp send is its sender's (sent_by_user_id); a send with no sender was the queue
     working for the lead's holder (assigned_to_user_id, else the book owner). A logged contact or a
     state move is its actor's. A reply is credited to whoever holds the lead.
   - WHATSAPP SENT: outbound rows with a real-send status (isRealSend) — never test-mode or simulated.
   - REPLY: a genuine inbound message (not test-mode, not looksAutomated) — counted once per lead.
   - CALL: a LOGGED call outcome (lead_activity kind call_outcome). Clicking a number is never a call.
   - EMAIL / SOCIAL: a logged contact on that channel (kind contact_logged).
   - INTERESTED: the first recorded moment a lead became interested — the star, a status move to an
     interested status, a state move to interested / meeting / won, or an interested / meeting outcome.
     A lead that is interested only by an old status with no recorded moment has no date, so it counts
     in the current funnel but never in a period.
   - MEETING: a booked call (call_booked with a time), a meeting_booked outcome or a state move to
     meeting booked — once per lead per period.
   - NOT INTERESTED / WRONG NUMBER / OPT-OUT: the recorded outcome, state move or suppression row.
     Backfilled suppressions (source backfill_*) were bulk imports, never a dated event.
   - PAID / REVENUE / REFUNDS / DISPUTES: payment_ledger only (Stripe). Never a CRM status.
   - COMMISSION: the commission lines (commission.ts), rates as stamped when earned — never recomputed.
   - API COST: api_usage_log charge rows (guard estimates excluded), in US dollars as recorded.
   - COHORT RATES: of the leads a person FIRST contacted in the period, how many have since replied /
     become interested / booked / paid. Always shown with the count it is out of.
   ⛔ Test/internal activity is excluded by metricExclusions.ts; the businesses themselves are not.
   Pure and edge-safe (relative imports with .ts).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { isRealSend } from './realSend.ts';
import { followUpBucket } from './salesCrm.ts';
import { looksAutomated } from './inboundClassify.ts';
import { isPaidLead } from './leadPayment.ts';
import { salesStateOf, openerReallySent, CONVERSATION_OUTCOMES, REACHED_OUTCOMES, NOT_INTERESTED_STATUSES, INTERESTED_STATUSES } from './leadState.ts';
import { serviceRouteForTotal, serviceRouteFromRow, type ServiceRoute } from './findableOffer.ts';
import { DISPUTE_LOST, DISPUTE_RELEASED, type CommissionLine, type EarningsTotals } from './commission.ts';
import { inPeriod, londonDay, type ReportingPeriod } from './reportingPeriod.ts';
import { isExcludedLead, isExcludedUser, isInternalEmail, isTestMessage, type Exclusions } from './metricExclusions.ts';
import { LOST_REASONS, lostReasonLabel } from './lostReason.ts';
import { costFeatureOf, costProviderOf, isChargeRow } from './apiCostLabels.ts';
import { isLiveLeadWithoutTrade } from './leadTrade.ts';
import { HIGH_INTENT, REP_ESCALATE_HOURS, TRIAGE_CATEGORY_LABEL, triageIsOpen, type TriageBucket, type TriageCategory } from './replyTriage.ts';
import { BOTTLENECK_THRESHOLDS, findBottlenecks, foldFeatureUsage, foldNiches, foldTemplates, type Bottleneck, type FeatureRow, type NicheRow, type TemplatesBlock, type UsageRow } from './adminIntelligence.ts';
import { clientHealthOf, type ClientExtras, type ClientHealth } from './clientHealth.ts';
import { attentionAssignable } from './teamBoard.ts';
import { holderTimeline } from './holderTimeline.ts';

/* ── Inputs ─────────────────────────────────────────────────────────────────────────────────────── */

export interface AdminLead {
  id: string;
  business_name: string | null;
  created_at: string;
  added_by_user_id: string | null;
  assigned_to_user_id: string | null;
  sold_by_user_id: string | null;
  sold_at: string | null;
  status: string | null;
  amount_paid: number | null;
  is_potential_work: boolean | null;
  call_booked_at: string | null;
  whatsapp_sent_at: string | null;
  /** Meta confirmed a delivery once (openerReallySent). Absent → judged from the status alone. */
  whatsapp_ever_delivered?: boolean | null;
  next_action: string | null;
  next_action_date: string | null;
  next_action_time?: string | null;
  is_archived: boolean | null;
  phone: string | null;
  email: string | null;
  search_keyword: string | null;
  category: string | null;
  payment_date: string | null;
  refunded_at: string | null;
  service_terminated_at: string | null;
  subscription_status: string | null;
  contract_total_payments: number | null;
  baseline_audit_id: string | null;
  remeasure_due_date: string | null;
  remeasure_audit_id: string | null;
  /** Release 3 (niches: the website cohort). A blank is "no website on record", never "no website". */
  website?: string | null;
  /** Release 4 (client health / the weekly check's start rule). */
  delivery_checklist?: unknown;
  website_build?: unknown;
  /** 2026-09-30: the Stripe link on a failed-payment item. */
  stripe_subscription_id?: string | null;
  stripe_customer_id?: string | null;
  /** Why they said no (lead_set_lost_reason, 2026-10-01). Null = not recorded. */
  lost_reason?: string | null;
  lost_reason_note?: string | null;
  lost_reason_recorded_at?: string | null;
  lost_reason_recorded_by?: string | null;
}
export interface AdminMessage {
  /** Release 3: ties a reply to its triage row (template "positive" replies). */
  id?: string;
  lead_id: string;
  direction: string | null;
  status: string | null;
  created_at: string;
  body: string | null;
  sent_by_user_id: string | null;
  template_name: string | null;
  test_mode: boolean | null;
}
export interface AdminActivity { lead_id: string; actor_user_id: string | null; kind: string; data: Record<string, unknown> | null; created_at: string }
export interface AdminSuppression { lead_id: string | null; reason: string | null; source: string | null; created_at: string; wrong_number_at: string | null; wrong_number_by: string | null }
export interface AdminLedgerRow { id: string; lead_id: string | null; kind: string; status: string; amount_gbp: number; occurred_at: string; sold_by_user_id: string | null; stripe_object_id?: string | null; stripe_payment_intent_id?: string | null }

/** Stripe's own dashboard page for an object, from its id prefix. Null for anything unrecognised —
 *  a guessed link is worse than none. Ids only, never a secret. */
const stripeLink = (label: string, ...ids: (string | null | undefined)[]) => { const url = stripeDashboardUrl(...ids); return url ? { external: { label, url } } : {}; };

export function stripeDashboardUrl(...ids: (string | null | undefined)[]): string | null {
  for (const raw of ids) {
    const id = String(raw ?? '').trim();
    if (!/^[a-z]+_[A-Za-z0-9]+$/.test(id)) continue;
    const path = id.startsWith('du_') || id.startsWith('dp_') ? 'disputes' : id.startsWith('pi_') || id.startsWith('ch_') || id.startsWith('py_') ? 'payments'
      : id.startsWith('sub_') ? 'subscriptions' : id.startsWith('cus_') ? 'customers' : id.startsWith('in_') ? 'invoices' : null;
    if (path) return `https://dashboard.stripe.com/${path}/${id}`;
  }
  return null;
}
/** `source` + `qc_link_at` (2026-10-04, M-022): a Quick Close row exists from the rep's FIRST tap, so it is
 *  "filled the sign-up" only once a payment link was made (`quick_close->>link_generated_at`). */
export interface AdminOnboarding { lead_id: string | null; status: string | null; created_at: string; plan_tier: string | null; website_addon: boolean | null; contact_email?: string | null; source?: string | null; qc_link_at?: string | null }
/** conversation_triage (fn conversation-triage): one row per inbound message. */
export interface TriageRow {
  id: string; message_id: string; lead_id: string | null; message_at: string;
  category: string; bucket: string; reason: string; confidence: number | null; method: string;
  action_taken: string | null; resolved_at: string | null;
}
/** api_usage_log, already summed per (user, function, type) for one period by SQL admin_api_cost(). */
export interface CostRow { user_id: string | null; function_name: string | null; api_type: string | null; usd: number; calls: number }
export interface Person { userId: string; name: string; role: string | null; excluded: boolean }

/* ── Constants (named, so prose never carries the number) ───────────────────────────────────────── */

/** Below this many leads attempted, a channel shows "not enough data" instead of a rate. */
export const CHANNEL_MIN_ATTEMPTS = 20;
/** A quote with no word from them for this many days is a follow-up (the old card's rule). */
export const QUOTE_QUIET_DAYS = 3;
/** A sign-up left unpaid this long is chased (held a day so someone mid-checkout is not chased). */
export const SIGNUP_CHASE_DAYS = 1;
/** Paid clients were promised setup within two working days — flagged once this many days pass. */
export const SETUP_PROMISE_DAYS = 2;

const OPT_OUT_REASONS: ReadonlySet<string> = new Set(['opted_out', 'opt_out', 'stop']);
const DECLINE_REASONS: ReadonlySet<string> = new Set(['replied_no', 'not_interested']);
const LIVE_SUBSCRIPTION: ReadonlySet<string> = new Set(['active', 'trialing', 'past_due']);
const INTERESTED_STATES: ReadonlySet<string> = new Set(['interested', 'meeting_booked', 'won']);
const INTERESTED_OUTCOMES: ReadonlySet<string> = new Set(['interested', 'meeting_booked']);
const CONTACT_KINDS: ReadonlySet<string> = new Set(['call_outcome', 'contact_logged']);
const DEAD_STATUSES: ReadonlySet<string> = new Set(['not_interested', 'opted_out', 'closed', 'refunded']);
/** The dashboard's channel groups over the one contact-method list (contactMethods.ts) — grouped, never
 *  re-listed: every LinkedIn format is LinkedIn; social = LinkedIn, Facebook, Instagram. */
const SOCIAL_GROUPS: ReadonlySet<string> = new Set(['linkedin', 'facebook', 'instagram']);

export type ChannelKey = 'whatsapp' | 'call' | 'email' | 'linkedin' | 'facebook' | 'instagram' | 'other';
export const CHANNELS: readonly ChannelKey[] = ['whatsapp', 'call', 'email', 'linkedin', 'facebook', 'instagram', 'other'];
export const CHANNEL_LABEL: Record<ChannelKey, string> = { whatsapp: 'WhatsApp', call: 'Phone', email: 'Email', linkedin: 'LinkedIn', facebook: 'Facebook', instagram: 'Instagram', other: 'Other' };
export function channelOf(kind: string, channel: unknown): ChannelKey {
  if (kind === 'call_outcome') return 'call';
  const c = String(channel ?? '');
  if (c === 'call') return 'call';
  if (c === 'email') return 'email';
  if (c.startsWith('linkedin')) return 'linkedin';
  if (c === 'facebook') return 'facebook';
  if (c === 'instagram') return 'instagram';
  return 'other';
}

/** The call outcomes the Calls table shows as columns, in order; anything else is "Other". */
export const CALL_OUTCOME_COLUMNS: readonly { key: string; label: string }[] = [
  { key: 'no_answer', label: 'No answer' }, { key: 'left_voicemail', label: 'Voicemail' }, { key: 'spoke_to_owner', label: 'Spoke to owner' },
  { key: 'call_back', label: 'Callback' }, { key: 'interested', label: 'Interested' }, { key: 'meeting_booked', label: 'Meeting booked' },
  { key: 'not_interested', label: 'Not interested' }, { key: 'wrong_number', label: 'Wrong number' },
];

/* ── Outputs ────────────────────────────────────────────────────────────────────────────────────── */

export interface Cohort { contacted: number; replied: number; interested: number; meeting: number; paid: number }
export interface TeamRow {
  userId: string; name: string; role: string | null;
  leadsAdded: number; leadsClaimed: number;
  whatsappSent: number; leadsMessaged: number;
  calls: number; emails: number; social: number; otherContacts: number;
  replies: number; interested: number; meetings: number;
  notInterested: number; wrongNumbers: number; optOuts: number;
  paid: number; revenue: number;
  commissionInitial: number; commissionRecurring: number; commissionDue: number;
  followUpsDue: number; followUpsOverdue: number;
  apiCostUsd: number;
  cohort: Cohort;
}
export type Totals = Omit<TeamRow, 'userId' | 'name' | 'role'>;
export interface ChannelRow { channel: ChannelKey; label: string; attempts: number; replies: number; interested: number; meetings: number; sales: number; enoughData: boolean }
export interface CallRow { userId: string; name: string; total: number; byOutcome: Record<string, number> }
export interface FunnelStage { key: string; label: string; count: number }
export interface Funnel { basis: string; stages: FunnelStage[]; losses: FunnelStage[] }
export interface MoneyBlock { initial: number; recurring: number; gross: number; refunds: number; disputesOpen: number; disputesLost: number; net: number; payments: number }
export interface CostBlock { usd: number; byProvider: { key: string; usd: number }[]; byFeature: { key: string; usd: number }[]; byPerson: { key: string; usd: number }[] }
export interface CommissionSellerRow { userId: string; name: string; initial: number; recurring: number; held: number; reversed: number; paid: number; due: number }
export interface Money {
  period: MoneyBlock; week: MoneyBlock; month: MoneyBlock;
  bySeller: { userId: string; name: string; gross: number; clients: number }[];
  byRoute: { build: number; optimise: number; unknown: number };
  payingClients: number; activeSubscriptions: number; pastDue: number;
  /** Paid leads with no payment in the ledger (paid before it, or outside this Stripe account). */
  /** Payments on a lead row that the ledger never saw. ⛔ `refunded` is split out: a refunded payment
   *  outside the ledger has no refund row either, so it must never read as money kept. */
  outsideLedger: { count: number; amount: number; names: string[]; refunded: { count: number; amount: number; names: string[] } };
  commission: { totals: EarningsTotals | null; periodAdded: number; bySeller: CommissionSellerRow[] };
  cost: { period: CostBlock; today: number; week: number; month: number };
  /** ⛔ Pounds and dollars kept apart — never one combined figure (apiCostLabels.ts). afterCommission is
   *  GBP; apiUsd is the recorded API spend in USD, shown beside it, not subtracted from it. */
  contribution: { revenueNet: number; commission: number; afterCommission: number; apiUsd: number };
}
export interface SinceBlock { whatsappSent: number; replies: number; interested: number; meetings: number; sales: number; revenue: number; commission: number; apiUsd: number }
export type AttentionGroup = 'urgent' | 'today' | 'review' | 'blocked';
export interface AttentionItem {
  key: string; group: AttentionGroup; kind: string;
  leadId: string | null; business: string;
  why: string; owner: string | null; sinceIso: string | null; state: string; action: string;
  /** Where the row opens: a lead, the paid-client hub, the Inbox, or the sign-ups list.
   *  ⛔ It follows where the action is DONE (2026-09-30): a chase on WhatsApp is the Inbox; a client
   *  task is the hub AT its stage (`section`); a list problem is Outreach with that list (`show`). */
  open: 'lead' | 'client' | 'inbox' | 'signups' | 'outreach';
  /** The hub stage to open (ClientHub ?section=): baseline, remeasure, payment… */
  section?: string;
  /** An Outreach list preset (Outreach ?show=): 'no_trade'. */
  show?: string;
  /** Where the money side is handled (Stripe's own dashboard), when the ids are on record. */
  external?: { label: string; url: string };
  /** A reply-triage item: its row id (for "Mark handled") and how sure the filing was. */
  triageId?: string;
  confidence?: number;
  method?: string;
}
export interface TriageSummary {
  /** Replies sorted in the period, by who needed to act. */
  byBucket: Record<TriageBucket, number>;
  byCategory: { category: string; label: string; count: number }[];
  /** Opt-outs suppressed automatically in the period, and any that failed. */
  suppressed: number; suppressionFailed: number;
  aiFiled: number;
  /** Salesperson replies waiting (not on Paul's list unless escalated). */
  repWaiting: number;
}
export interface ClientRow {
  leadId: string; business: string; route: ServiceRoute | null; paidAt: string | null;
  baselineStarted: boolean; remeasureDue: string | null; remeasured: boolean;
  payment: string; refunded: boolean; seller: string | null;
  /** Release 4: site live, weekly check, improvements, blockers. Absent = the extras were not read. */
  health?: ClientHealth;
}

export interface AdminInput {
  period: ReportingPeriod; today: ReportingPeriod; yesterday: ReportingPeriod; week: ReportingPeriod; month: ReportingPeriod;
  nowMs: number;
  bookOwnerId: string | null;
  people: Person[];
  exclusions: Exclusions;
  leads: AdminLead[];
  messages: AdminMessage[];
  activity: AdminActivity[];
  suppressions: AdminSuppression[];
  ledger: AdminLedgerRow[];
  onboarding: AdminOnboarding[];
  commissionLines: CommissionLine[] | null;
  commissionTotals: EarningsTotals | null;
  commissionDueBySeller: Map<string, number>;
  payoutsBySeller: Map<string, number>;
  cost: { period: CostRow[]; today: CostRow[]; yesterday: CostRow[]; week: CostRow[]; month: CostRow[] };
  /** Reply triage rows (release 2). Absent = triage not running yet: no reply items, never "all clear". */
  triage?: TriageRow[] | null;
  /** Release 4: the weekly check, opportunities and directory issues for the paying clients. */
  clientExtras?: ClientExtras | null;
  /** Release 5: feature uses in the period and the one before (SQL admin_feature_usage). */
  usage?: { now: UsageRow[]; previous: UsageRow[] | null } | null;
  /** Sales Team Board (2026-10-01): OPEN lead-assignment tasks. Absent/null = not read → nothing is
   *  treated as delegated (the list shows everything, as before). */
  delegatedTasks?: DelegatedTask[] | null;
  /** "MY ACTIVITY: HIDDEN" (Paul, 2026-10-02: "hide my personal sales/outreach activity from team performance
   *  and sales intelligence"). The people whose OUTREACH is left out of every activity figure — the team
   *  table, channels, calls, templates, niches, why prospects say no, the cohort rates, the funnel's
   *  Contacted, today / yesterday's activity. Attribution is each metric's own WHO (see the header): a send
   *  is its sender's, else the holder's at the time; a reply is the holder's when it arrived; an outcome is
   *  its actor's. ⛔ Never money, clients, delivery, attention, inventory, costs or feature usage — and a
   *  lead is never dropped because of who added, owns or delivers it. Absent / empty = everyone counts. */
  hideActivityOf?: ReadonlySet<string> | null;
}
/** One open lead-assignment task on the Team board: the lead, who holds the task, its state. */
/** One reason on "Why prospects say no": how many, the share of the leads WITH a reason, and who they are. */
export interface LostReasonRow { key: string; label: string; count: number; pct: number; leads: LostReasonLead[] }
export interface LostReasonLead { id: string; business: string; note: string | null; who: string; at: string | null }
export interface LostReasons {
  /** Leads that are Not interested now and said no in the period (test activity excluded). */
  saidNo: number;
  recorded: number;
  /** Said no with no reason recorded — never guessed, never backfilled. */
  unrecorded: number;
  rows: LostReasonRow[];
  unrecordedLeads: LostReasonLead[];
}
/** The most leads listed under one reason (the count is never capped). */
export const LOST_REASON_LIST_MAX = 25;

export interface DelegatedTask { post_id: string; lead_id: string; user_id: string; task_status: string; published_at: string }
export interface DelegatedSummary { count: number; items: { leadId: string; business: string; owner: string; status: string; why: string; kind: string }[] }

export interface AdminOverview {
  period: ReportingPeriod;
  team: TeamRow[];
  totals: Totals;
  excludedActivity: { whatsappSent: number; calls: number; contacts: number; apiCostUsd: number };
  funnel: Funnel;
  channels: ChannelRow[];
  templates: TemplatesBlock;
  niches: NicheRow[];
  nicheBookReplyRate: number | null;
  bottlenecks: Bottleneck[];
  /** Prospect sign-ups (internal / test submissions excluded) started in the period, and how many paid. */
  signups: { started: number; paid: number };
  /** Release 5: null = usage could not be read (never shown as "nothing used"). */
  features: FeatureRow[] | null;
  calls: { rows: CallRow[]; total: CallRow };
  money: Money;
  today: SinceBlock; yesterday: SinceBlock;
  attention: AttentionItem[];
  /** Ordinary follow-ups taken off Paul's list because a salesperson holds them as a board task.
   *  null = the board was not read (nothing was taken off). */
  delegated: DelegatedSummary | null;
  /** null = triage has not run (the page says so rather than implying no replies need anyone). */
  triage: TriageSummary | null;
  /** Open replies waiting for whoever holds them that are not on Paul's list. */
  triageWaitingInInbox: number;
  clients: ClientRow[];
  inventory: { leads: number; active: number; archived: number; addedByTestAccounts: number };
  lostReasons: LostReasons;
  /** Whose outreach the activity figures leave out (input.hideActivityOf), by name. */
  activityScope: { hidden: boolean; people: string[] };
}

/* ── Helpers ────────────────────────────────────────────────────────────────────────────────────── */

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);
const round2 = (n: number) => Math.round(n * 100) / 100;
const zeroCohort = (): Cohort => ({ contacted: 0, replied: 0, interested: 0, meeting: 0, paid: 0 });
function zeroTotals(): Totals {
  return {
    leadsAdded: 0, leadsClaimed: 0, whatsappSent: 0, leadsMessaged: 0, calls: 0, emails: 0, social: 0, otherContacts: 0,
    replies: 0, interested: 0, meetings: 0, notInterested: 0, wrongNumbers: 0, optOuts: 0, paid: 0, revenue: 0,
    commissionInitial: 0, commissionRecurring: 0, commissionDue: 0, followUpsDue: 0, followUpsOverdue: 0, apiCostUsd: 0, cohort: zeroCohort(),
  };
}
function groupBy<T>(rows: T[], key: (r: T) => string | null): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) { const k = key(r); if (!k) continue; const a = m.get(k); if (a) a.push(r); else m.set(k, [r]); }
  return m;
}

/** Per-lead facts, read ONCE and shared by every section. */
interface LeadFacts {
  lead: AdminLead;
  /** Who holds it NOW — for present-tense work (follow-ups due, who to chase, the attention owner). */
  holder: string | null;
  /** Who held it at time t (holderTimeline) — the credit for any past event that names no person. */
  heldBy: (t: number) => string | null;
  /** Contact moments by person (real sends + logged contacts), ascending, with channel. */
  contacts: { at: number; who: string | null; channel: ChannelKey; outcome: string | null; kind: string }[];
  humanReplies: number[];
  interested: { at: number; who: string | null } | null;
  interestedEver: boolean;
  meetings: { at: number; who: string | null }[];
  meetingEver: boolean;
  notInterested: { at: number; who: string | null }[];
  wrongNumber: { at: number; who: string | null }[];
  optOut: { at: number; who: string | null }[];
  hasInbound: boolean;
  lastInbound: number | null;
  lastOutbound: number | null;
}

function leadFacts(input: AdminInput, lead: AdminLead, msgs: AdminMessage[], acts: AdminActivity[], sups: AdminSuppression[]): LeadFacts {
  const ex = input.exclusions;
  const holder = lead.assigned_to_user_id ?? input.bookOwnerId;
  /* ⛔ A PAST EVENT IS CREDITED TO WHOEVER HELD THE LEAD THEN (holderTimeline, 2026-10-01): moving a lead
     never moves its history (Paul: "activity from the reassignment onward should attribute normally"). */
  const timeline = holderTimeline(lead.assigned_to_user_id ?? null, acts);
  const heldBy = (t: number) => timeline(t) ?? input.bookOwnerId;
  const contacts: LeadFacts['contacts'] = [];
  const humanReplies: number[] = [];
  let lastInbound: number | null = null; let lastOutbound: number | null = null; let hasInbound = false;
  for (const m of msgs) {
    if (isTestMessage(m)) continue;
    const t = ms(m.created_at);
    if (m.direction === 'outbound' && isRealSend(m.status)) {
      lastOutbound = lastOutbound === null ? t : Math.max(lastOutbound, t);
      contacts.push({ at: t, who: m.sent_by_user_id ?? heldBy(t), channel: 'whatsapp', outcome: null, kind: 'whatsapp' });
    } else if (m.direction === 'inbound') {
      hasInbound = true;
      if (!looksAutomated(m.body ?? '')) { humanReplies.push(t); lastInbound = lastInbound === null ? t : Math.max(lastInbound, t); }
    }
  }
  let interested: LeadFacts['interested'] = null;
  const meetings: LeadFacts['meetings'] = []; const notInterested: LeadFacts['notInterested'] = [];
  const wrongNumber: LeadFacts['wrongNumber'] = []; const optOut: LeadFacts['optOut'] = [];
  const markInterested = (at: number, who: string | null) => { if (!interested || at < interested.at) interested = { at, who }; };
  for (const a of acts) {
    const at = ms(a.created_at); const who = a.actor_user_id ?? heldBy(at);
    const d = a.data ?? {};
    if (a.kind === 'marked_interested' && d.on !== false) markInterested(at, who);
    if (a.kind === 'stage_changed') {
      const to = String(d.to ?? '');
      if (INTERESTED_STATUSES.has(to) || to === 'won_pending_onboarding') markInterested(at, who);
      if (NOT_INTERESTED_STATUSES.has(to)) (to === 'opted_out' ? optOut : notInterested).push({ at, who });
    }
    if (a.kind === 'state_changed') {
      const to = String(d.to ?? '');
      if (INTERESTED_STATES.has(to)) markInterested(at, who);
      if (to === 'meeting_booked') meetings.push({ at, who });
      if (to === 'not_interested') notInterested.push({ at, who });
      if (to === 'wrong_number') wrongNumber.push({ at, who });
    }
    if (a.kind === 'call_booked' && d.at) meetings.push({ at, who });
    if (CONTACT_KINDS.has(a.kind)) {
      // An excluded actor's contact is KEPT here: every count drops it and tallies it apart as excluded.
      const outcome = String(d.outcome ?? '');
      contacts.push({ at, who, channel: channelOf(a.kind, d.channel), outcome, kind: a.kind });
      if (INTERESTED_OUTCOMES.has(outcome)) markInterested(at, who);
      if (outcome === 'meeting_booked') meetings.push({ at, who });
      if (outcome === 'not_interested') notInterested.push({ at, who });
      if (outcome === 'wrong_number') wrongNumber.push({ at, who });
    }
  }
  for (const s of sups) {
    if (String(s.source ?? '').startsWith('backfill')) continue;
    if (s.wrong_number_at) wrongNumber.push({ at: ms(s.wrong_number_at), who: s.wrong_number_by ?? heldBy(ms(s.wrong_number_at)) });
    const r = String(s.reason ?? '');
    if (OPT_OUT_REASONS.has(r)) optOut.push({ at: ms(s.created_at), who: heldBy(ms(s.created_at)) });
    else if (DECLINE_REASONS.has(r)) notInterested.push({ at: ms(s.created_at), who: heldBy(ms(s.created_at)) });
  }
  contacts.sort((x, y) => x.at - y.at);
  humanReplies.sort((x, y) => x - y);
  const status = String(lead.status ?? '');
  return {
    lead, holder, heldBy, contacts, humanReplies,
    interested,
    interestedEver: interested !== null || lead.is_potential_work === true || INTERESTED_STATUSES.has(status) || status === 'won_pending_onboarding' || isPaidLead(lead),
    meetings, meetingEver: meetings.length > 0 || !!lead.call_booked_at,
    notInterested, wrongNumber, optOut, hasInbound, lastInbound, lastOutbound,
  };
}

const inP = (at: number, p: ReportingPeriod) => Number.isFinite(at) && (p.fromMs === null || at >= p.fromMs) && at < p.toMs;

function moneyBlock(ledger: AdminLedgerRow[], p: ReportingPeriod): MoneyBlock {
  const b: MoneyBlock = { initial: 0, recurring: 0, gross: 0, refunds: 0, disputesOpen: 0, disputesLost: 0, net: 0, payments: 0 };
  for (const r of ledger) {
    if (!inPeriod(r.occurred_at, p)) continue;
    const a = Number(r.amount_gbp) || 0;
    if ((r.kind === 'initial' || r.kind === 'recurring') && r.status === 'succeeded' && a > 0) {
      b.payments += 1; if (r.kind === 'initial') b.initial += a; else b.recurring += a;
    } else if (r.kind === 'refund') b.refunds += a;
    else if (r.kind === 'chargeback') {
      if (DISPUTE_LOST.has(r.status)) b.disputesLost += a;
      else if (!DISPUTE_RELEASED.has(r.status)) b.disputesOpen += a;
    }
  }
  b.gross = b.initial + b.recurring;
  b.net = b.gross - b.refunds - b.disputesLost;
  for (const k of Object.keys(b) as (keyof MoneyBlock)[]) b[k] = round2(b[k]);
  return b;
}

function costBlock(rows: CostRow[], nameOf: (u: string | null) => string): CostBlock {
  const prov = new Map<string, number>(); const feat = new Map<string, number>(); const per = new Map<string, number>();
  let usd = 0;
  for (const r of rows) {
    if (!isChargeRow(r.api_type)) continue;
    const v = Number(r.usd) || 0;
    if (v === 0) continue;
    usd += v;
    const p = costProviderOf(r.api_type); prov.set(p, (prov.get(p) ?? 0) + v);
    const f = costFeatureOf(r.function_name, r.api_type); feat.set(f, (feat.get(f) ?? 0) + v);
    const n = nameOf(r.user_id); per.set(n, (per.get(n) ?? 0) + v);
  }
  const list = (m: Map<string, number>) => [...m].map(([key, v]) => ({ key, usd: round2(v) })).sort((a, b) => b.usd - a.usd);
  return { usd: round2(usd), byProvider: list(prov), byFeature: list(feat), byPerson: list(per) };
}
const costTotal = (rows: CostRow[]) => round2(rows.filter((r) => isChargeRow(r.api_type)).reduce((s, r) => s + (Number(r.usd) || 0), 0));

/* ── The fold ───────────────────────────────────────────────────────────────────────────────────── */

export function foldAdminOverview(input: AdminInput): AdminOverview {
  const ex = input.exclusions;
  const p = input.period;
  const todayDay = londonDay(input.nowMs);
  const people = input.people;
  const nameOf = (u: string | null | undefined): string => {
    if (!u) return 'Unattributed';
    if (isExcludedUser(ex, u)) return 'Internal/test';
    return people.find((x) => x.userId === u)?.name ?? 'Former member';
  };
  /* My activity: hidden. `mine` = a hidden person; `outOf` = left out of an activity figure (a test
     account OR a hidden person). ⛔ Every place that already dropped test accounts uses outOf; the few new
     checks use mine alone — so with nobody hidden, every number is what it was, except templates and
     niches, which now leave test accounts out like everything else (see foldTemplates below). */
  const hide = input.hideActivityOf ?? new Set<string>();
  const mine = (u: string | null | undefined) => !!u && hide.has(u);
  const outOf = (u: string | null | undefined) => isExcludedUser(ex, u) || mine(u);

  const msgsBy = groupBy(input.messages, (m) => m.lead_id);
  const actBy = groupBy(input.activity, (a) => a.lead_id);
  const supBy = groupBy(input.suppressions, (s) => s.lead_id);
  for (const a of msgsBy.values()) a.sort((x, y) => ms(x.created_at) - ms(y.created_at));

  const realLeads = input.leads.filter((l) => !isExcludedLead(ex, l));
  const facts = realLeads.map((l) => leadFacts(input, l, msgsBy.get(l.id) ?? [], actBy.get(l.id) ?? [], supBy.get(l.id) ?? []));
  const leadById = new Map(input.leads.map((l) => [l.id, l]));

  /* Rows per real (not excluded) person; excluded activity is tallied apart for the note. */
  const rows = new Map<string, TeamRow>();
  /* A hidden person has NO row: none of their activity is credited anywhere in the team table, and the
     team totals (summed from the rows) are the rows shown. Their money still counts in Money. */
  for (const x of people) if (!x.excluded && !mine(x.userId)) rows.set(x.userId, { userId: x.userId, name: x.name, role: x.role, ...zeroTotals() });
  const rowFor = (u: string | null | undefined): TeamRow | null => {
    if (!u || isExcludedUser(ex, u) || mine(u)) return null;
    let r = rows.get(u);
    if (!r) { r = { userId: u, name: nameOf(u), role: null, ...zeroTotals() }; rows.set(u, r); }
    return r;
  };
  const excludedActivity = { whatsappSent: 0, calls: 0, contacts: 0, apiCostUsd: 0 };

  // Per person per metric: distinct leads (a person interested twice in a lead counts once).
  const distinct = new Map<string, Set<string>>();
  const once = (u: string | null | undefined, metric: keyof Totals, leadId: string) => {
    const r = rowFor(u); if (!r) return;
    const k = `${r.userId}|${metric}`; let s = distinct.get(k); if (!s) { s = new Set(); distinct.set(k, s); }
    if (s.has(leadId)) return; s.add(leadId); (r[metric] as number) += 1;
  };

  for (const f of facts) {
    const id = f.lead.id;
    if (inPeriod(f.lead.created_at, p)) once(f.lead.added_by_user_id ?? input.bookOwnerId, 'leadsAdded', id);
    for (const c of f.contacts) {
      if (!inP(c.at, p)) continue;
      const excluded = isExcludedUser(ex, c.who);
      if (c.kind === 'whatsapp') {
        if (excluded) { excludedActivity.whatsappSent += 1; continue; }
        const r = rowFor(c.who); if (r) r.whatsappSent += 1;
        once(c.who, 'leadsMessaged', id);
      } else {
        if (excluded) { excludedActivity.contacts += 1; if (c.channel === 'call') excludedActivity.calls += 1; continue; }
        const r = rowFor(c.who); if (!r) continue;
        if (c.channel === 'call') r.calls += 1;
        else if (c.channel === 'email') r.emails += 1;
        else if (SOCIAL_GROUPS.has(c.channel)) r.social += 1;
        else r.otherContacts += 1;
      }
    }
    for (const t of f.humanReplies) if (inP(t, p)) once(f.heldBy(t), 'replies', id);
    if (f.interested && inP(f.interested.at, p)) once(f.interested.who, 'interested', id);
    for (const m of f.meetings) if (inP(m.at, p)) once(m.who, 'meetings', id);
    for (const n of f.notInterested) if (inP(n.at, p)) once(n.who, 'notInterested', id);
    for (const w of f.wrongNumber) if (inP(w.at, p)) once(w.who, 'wrongNumbers', id);
    for (const o of f.optOut) if (inP(o.at, p)) once(o.who, 'optOuts', id);

    /* Cohort: leads FIRST contacted in the period, credited to whoever made that first contact. A lead a
       hidden person reached first stays theirs — it is left out, never handed to whoever came second. */
    // The first contact that REACHED them (a real send, or a reached logged outcome) — the funnel's own rule.
    const first = f.contacts.find((c) => !isExcludedUser(ex, c.who) && (c.kind === 'whatsapp' || REACHED_OUTCOMES.has(String(c.outcome ?? ''))));
    if (first && inP(first.at, p)) {
      const r = rowFor(first.who);
      if (r) {
        r.cohort.contacted += 1;
        if (f.humanReplies.some((t) => t >= first.at)) r.cohort.replied += 1;
        if (f.interestedEver) r.cohort.interested += 1;
        if (f.meetingEver) r.cohort.meeting += 1;
        if (isPaidLead(f.lead)) r.cohort.paid += 1;
      }
    }

    /* Follow-ups (CURRENT): a Next Action someone set, due today or earlier, on a lead still in play. */
    const na = String(f.lead.next_action ?? '');
    if (na && na !== 'none' && f.lead.next_action_date && !f.lead.is_archived && !(na === 'send_draft' && f.hasInbound)) {
      const st = salesStateOf({ status: f.lead.status, is_potential_work: f.lead.is_potential_work, amount_paid: f.lead.amount_paid, call_booked_at: f.lead.call_booked_at, whatsapp_sent_at: f.lead.whatsapp_sent_at }, input.nowMs).state;
      if (st !== 'client' && st !== 'won' && st !== 'not_interested') {
        const due = f.lead.next_action_date.slice(0, 10);
        const r = rowFor(f.holder);
        /* Overdue: an earlier UK day, or today past its UK time (followUpBucket, 2026-10-02). */
        if (r && due <= todayDay) { r.followUpsDue += 1; if (followUpBucket(due, todayDay, f.lead.next_action_time ?? null, input.nowMs) === 'overdue') r.followUpsOverdue += 1; }
      }
    }
  }
  const claimActs = input.activity.filter((a) => a.kind === 'lead_claimed' && inPeriod(a.created_at, p));
  for (const a of claimActs) once(a.actor_user_id, 'leadsClaimed', a.lead_id);

  /* Money by seller. The seller is the ledger's snapshot, else the lead's stamp, else the book owner. */
  const sellerOf = (r: AdminLedgerRow) => r.sold_by_user_id ?? (r.lead_id ? leadById.get(r.lead_id)?.sold_by_user_id : null) ?? input.bookOwnerId;
  const excludedLedgerLead = (r: AdminLedgerRow) => { const l = r.lead_id ? leadById.get(r.lead_id) : null; return !!l && isExcludedLead(ex, l); };
  const ledger = input.ledger.filter((r) => !excludedLedgerLead(r));
  for (const r of ledger) {
    if (!inPeriod(r.occurred_at, p) || r.status !== 'succeeded' || !(Number(r.amount_gbp) > 0)) continue;
    if (r.kind !== 'initial' && r.kind !== 'recurring') continue;
    const row = rowFor(sellerOf(r)); if (!row) continue;
    row.revenue = round2(row.revenue + Number(r.amount_gbp));
    if (r.kind === 'initial') row.paid += 1;
  }
  for (const l of input.commissionLines ?? []) {
    if (l.status === 'not_commissionable' || l.kind !== 'payment' || !inPeriod(l.occurredAt, p)) continue;
    const row = rowFor(l.sellerId); if (!row) continue;
    if (l.paymentNumber === 1) row.commissionInitial = round2(row.commissionInitial + l.commission);
    else row.commissionRecurring = round2(row.commissionRecurring + l.commission);
  }
  for (const [u, due] of input.commissionDueBySeller) { const row = rowFor(u); if (row) row.commissionDue = round2(due); }
  for (const c of input.cost.period) {
    if (!isChargeRow(c.api_type)) continue;
    if (isExcludedUser(ex, c.user_id)) { excludedActivity.apiCostUsd = round2(excludedActivity.apiCostUsd + (Number(c.usd) || 0)); continue; }
    const row = rowFor(c.user_id); if (row) row.apiCostUsd = round2(row.apiCostUsd + (Number(c.usd) || 0));
  }

  const team = [...rows.values()].sort((a, b) => (a.userId === input.bookOwnerId ? -1 : b.userId === input.bookOwnerId ? 1 : a.name.localeCompare(b.name)));
  const totals = zeroTotals();
  for (const r of team) {
    for (const k of Object.keys(totals) as (keyof Totals)[]) {
      if (k === 'cohort') { for (const c of Object.keys(totals.cohort) as (keyof Cohort)[]) totals.cohort[c] += r.cohort[c]; }
      else (totals[k] as number) = round2((totals[k] as number) + (r[k] as number));
    }
  }
  // Distinct-lead metrics must not double count a lead two people touched: recount them book-wide.
  const bookDistinct = (pick: (f: LeadFacts) => boolean) => facts.filter(pick).length;
  totals.replies = bookDistinct((f) => f.humanReplies.some((t) => inP(t, p) && !outOf(f.heldBy(t))));
  totals.interested = bookDistinct((f) => !!f.interested && inP(f.interested.at, p) && !outOf(f.interested.who));
  totals.meetings = bookDistinct((f) => f.meetings.some((m) => inP(m.at, p) && !outOf(m.who)));
  totals.leadsMessaged = bookDistinct((f) => f.contacts.some((c) => c.kind === 'whatsapp' && inP(c.at, p) && !outOf(c.who)));

  /* Funnel: the leads ADDED in the period (all time = the whole book), how far each has got. */
  const cohortLeads = facts.filter((f) => p.fromMs === null || inPeriod(f.lead.created_at, p));
  /* Contacted (funnel) = a real send or a logged contact that REACHED them — never a no-answer attempt (2026-10-01). */
  /* Hidden: the status-only fallback (an opener with no message row) names nobody, so it cannot be shown
     to be someone else's — it is not counted while anyone is hidden. */
  const contactedEver = (f: LeadFacts) => f.contacts.some((c) => !outOf(c.who) && (c.kind === 'whatsapp' || REACHED_OUTCOMES.has(String(c.outcome ?? '')))) || (hide.size === 0 && openerReallySent(f.lead));
  /* Hidden: every stage after Contacted is OF THE LEADS SOMEONE SHOWN REACHED — a reply to a hidden
     person's message is their outcome, not the team's. Leads added stays the book's (inventory). */
  const reachedLeads = hide.size ? cohortLeads.filter(contactedEver) : cohortLeads;
  const funnel: Funnel = {
    basis: (p.fromMs === null ? 'Every lead in the book' : `Leads added ${p.label.toLowerCase() === 'today' ? 'today' : `in ${p.label.toLowerCase()}`}`)
      + (hide.size ? ' (later stages: only leads reached by someone shown — your own outreach is hidden)' : ''),
    stages: [
      { key: 'added', label: 'Leads added', count: cohortLeads.length },
      { key: 'contacted', label: 'Contacted', count: cohortLeads.filter(contactedEver).length },
      { key: 'replied', label: 'Replied', count: reachedLeads.filter((f) => f.humanReplies.length > 0).length },
      { key: 'interested', label: 'Interested', count: reachedLeads.filter((f) => f.interestedEver).length },
      { key: 'meeting', label: 'Meeting booked', count: reachedLeads.filter((f) => f.meetingEver).length },
      { key: 'paid', label: 'Paid', count: reachedLeads.filter((f) => isPaidLead(f.lead) || String(f.lead.status) === 'refunded').length },
    ],
    losses: [
      { key: 'not_interested', label: 'Not interested', count: reachedLeads.filter((f) => NOT_INTERESTED_STATUSES.has(String(f.lead.status)) && String(f.lead.status) !== 'opted_out').length },
      { key: 'wrong_number', label: 'Wrong number', count: reachedLeads.filter((f) => f.wrongNumber.length > 0).length },
      { key: 'opt_out', label: 'Opted out', count: reachedLeads.filter((f) => String(f.lead.status) === 'opted_out' || f.optOut.length > 0).length },
    ],
  };

  /* Channels: leads attempted on the channel in the period, and what followed. A sale or interest is
     "touched by" a channel when that channel reached the lead before it — never "caused by". */
  const paidAtOf = new Map<string, number>();
  for (const r of ledger) if (r.kind === 'initial' && r.status === 'succeeded' && r.lead_id) { const t = ms(r.occurred_at); const prev = paidAtOf.get(r.lead_id); if (prev === undefined || t < prev) paidAtOf.set(r.lead_id, t); }
  for (const f of facts) if (!paidAtOf.has(f.lead.id) && isPaidLead(f.lead)) { const t = ms(f.lead.sold_at ?? f.lead.payment_date); if (Number.isFinite(t)) paidAtOf.set(f.lead.id, t); }
  const channels: ChannelRow[] = CHANNELS.map((ch) => {
    let attempts = 0, replies = 0, interested = 0, meetings = 0, sales = 0;
    for (const f of facts) {
      /* Hidden: a hidden person's contacts do not reach a lead on a channel, and a reply, interest or
         meeting that is theirs (held by / recorded by them) is not the channel's either. */
      const on = f.contacts.filter((c) => c.channel === ch && !outOf(c.who));
      if (!on.length) continue;
      const firstAt = on[0].at;
      if (on.some((c) => inP(c.at, p))) attempts += 1;
      if (ch === 'whatsapp') { if (f.humanReplies.some((t) => inP(t, p) && t >= firstAt && !mine(f.heldBy(t)))) replies += 1; }
      else if (on.some((c) => inP(c.at, p) && CONVERSATION_OUTCOMES.has(String(c.outcome)))) replies += 1;
      if (f.interested && inP(f.interested.at, p) && f.interested.at >= firstAt && !mine(f.interested.who)) interested += 1;
      if (f.meetings.some((m) => inP(m.at, p) && m.at >= firstAt && !mine(m.who))) meetings += 1;
      const paidAt = paidAtOf.get(f.lead.id);
      if (paidAt !== undefined && inP(paidAt, p) && paidAt >= firstAt) sales += 1;
    }
    return { channel: ch, label: CHANNEL_LABEL[ch], attempts, replies, interested, meetings, sales, enoughData: attempts >= CHANNEL_MIN_ATTEMPTS };
  });

  /* Calls: logged call outcomes only, by who logged them. */
  const callRows = new Map<string, CallRow>();
  const callTotal: CallRow = { userId: 'total', name: 'Everyone', total: 0, byOutcome: {} };
  for (const f of facts) for (const c of f.contacts) {
    if (c.channel !== 'call' || c.kind === 'whatsapp' || !inP(c.at, p) || outOf(c.who)) continue;
    const u = c.who ?? 'unknown';
    let r = callRows.get(u); if (!r) { r = { userId: u, name: nameOf(c.who), total: 0, byOutcome: {} }; callRows.set(u, r); }
    const k = CALL_OUTCOME_COLUMNS.some((x) => x.key === c.outcome) ? String(c.outcome) : 'other';
    r.total += 1; r.byOutcome[k] = (r.byOutcome[k] ?? 0) + 1;
    callTotal.total += 1; callTotal.byOutcome[k] = (callTotal.byOutcome[k] ?? 0) + 1;
  }

  /* Money. */
  const routeOf = new Map<string, ServiceRoute | null>();
  for (const o of input.onboarding.slice().sort((a, b) => ms(a.created_at) - ms(b.created_at))) {
    if (!o.lead_id) continue;
    const r = serviceRouteFromRow(o); if (r) routeOf.set(o.lead_id, r);
  }
  const route = (leadId: string) => routeOf.get(leadId) ?? serviceRouteForTotal(leadById.get(leadId)?.contract_total_payments) ?? null;
  const periodMoney = moneyBlock(ledger, p);
  const byRoute = { build: 0, optimise: 0, unknown: 0 };
  const sellerAgg = new Map<string, { gross: number; clients: number }>();
  for (const r of ledger) {
    if (!inPeriod(r.occurred_at, p) || r.status !== 'succeeded' || !(Number(r.amount_gbp) > 0) || (r.kind !== 'initial' && r.kind !== 'recurring')) continue;
    const rt = r.lead_id ? route(r.lead_id) : null;
    byRoute[rt ?? 'unknown'] = round2(byRoute[rt ?? 'unknown'] + Number(r.amount_gbp));
    const s = sellerOf(r) ?? 'unknown';
    const a = sellerAgg.get(s) ?? { gross: 0, clients: 0 };
    a.gross = round2(a.gross + Number(r.amount_gbp)); if (r.kind === 'initial') a.clients += 1;
    sellerAgg.set(s, a);
  }
  const paidLeads = realLeads.filter((l) => isPaidLead(l) && !l.service_terminated_at);
  const ledgerPaidLeads = new Set(ledger.filter((r) => (r.kind === 'initial' || r.kind === 'recurring') && r.status === 'succeeded').map((r) => r.lead_id));
  const outside = realLeads.filter((l) => (Number(l.amount_paid) || 0) > 0 && !ledgerPaidLeads.has(l.id));
  const outsideSum = (ls: AdminLead[]) => ({ count: ls.length, amount: round2(ls.reduce((s, l) => s + (Number(l.amount_paid) || 0), 0)), names: ls.map((l) => l.business_name ?? 'Client') });

  const commissionBySeller = new Map<string, CommissionSellerRow>();
  for (const l of input.commissionLines ?? []) {
    if (l.status === 'not_commissionable' || !l.sellerId) continue;
    const row = commissionBySeller.get(l.sellerId) ?? { userId: l.sellerId, name: nameOf(l.sellerId), initial: 0, recurring: 0, held: 0, reversed: 0, paid: 0, due: 0 };
    if (l.kind === 'payment') { if (l.paymentNumber === 1) row.initial = round2(row.initial + l.commission); else row.recurring = round2(row.recurring + l.commission); }
    else if (l.held) row.held = round2(row.held - l.commission);
    else row.reversed = round2(row.reversed - l.commission);
    commissionBySeller.set(l.sellerId, row);
  }
  for (const [u, v] of input.payoutsBySeller) { const row = commissionBySeller.get(u); if (row) row.paid = round2(v); }
  for (const [u, v] of input.commissionDueBySeller) { const row = commissionBySeller.get(u); if (row) row.due = round2(v); }
  const commissionPeriod = round2((input.commissionLines ?? []).filter((l) => l.status !== 'not_commissionable' && inPeriod(l.occurredAt, p)).reduce((s, l) => s + l.commission, 0));

  const periodCost = costBlock(input.cost.period, nameOf);
  const money: Money = {
    period: periodMoney, week: moneyBlock(ledger, input.week), month: moneyBlock(ledger, input.month),
    bySeller: [...sellerAgg].map(([userId, a]) => ({ userId, name: nameOf(userId), ...a })).sort((a, b) => b.gross - a.gross),
    byRoute,
    payingClients: paidLeads.length,
    activeSubscriptions: paidLeads.filter((l) => LIVE_SUBSCRIPTION.has(String(l.subscription_status))).length,
    pastDue: paidLeads.filter((l) => l.subscription_status === 'past_due').length,
    outsideLedger: { ...outsideSum(outside.filter((l) => String(l.status) !== 'refunded')), refunded: outsideSum(outside.filter((l) => String(l.status) === 'refunded')) },
    commission: { totals: input.commissionTotals, periodAdded: commissionPeriod, bySeller: [...commissionBySeller.values()] },
    cost: { period: periodCost, today: costTotal(input.cost.today), week: costTotal(input.cost.week), month: costTotal(input.cost.month) },
    contribution: { revenueNet: periodMoney.net, commission: commissionPeriod, afterCommission: round2(periodMoney.net - commissionPeriod), apiUsd: round2(periodCost.usd) },
  };

  /* Today / yesterday — the same definitions, book-wide. The activity four follow My activity; sales,
     revenue, commission and API spend are the business's and never do. */
  const since = (q: ReportingPeriod, costRows: CostRow[]): SinceBlock => ({
    whatsappSent: facts.reduce((s, f) => s + f.contacts.filter((c) => c.kind === 'whatsapp' && inP(c.at, q) && !outOf(c.who)).length, 0),
    replies: facts.filter((f) => f.humanReplies.some((t) => inP(t, q) && !outOf(f.heldBy(t)))).length,
    interested: facts.filter((f) => f.interested && inP(f.interested.at, q) && !outOf(f.interested.who)).length,
    meetings: facts.filter((f) => f.meetings.some((m) => inP(m.at, q) && !outOf(m.who))).length,
    sales: ledger.filter((r) => r.kind === 'initial' && r.status === 'succeeded' && inPeriod(r.occurred_at, q)).length,
    revenue: moneyBlock(ledger, q).gross,
    commission: round2((input.commissionLines ?? []).filter((l) => l.status !== 'not_commissionable' && inPeriod(l.occurredAt, q)).reduce((s, l) => s + l.commission, 0)),
    apiUsd: costTotal(costRows),
  });
  const todayBlock = since(input.today, input.cost.today);
  const yesterdayBlock = since(input.yesterday, input.cost.yesterday);

  const ta = triageAttention(input, facts, nameOf, msgsBy, actBy);

  /* Release 3 — templates, niches, bottlenecks, over the same facts. */
  const triageByMessage = new Map((input.triage ?? []).map((r) => [r.message_id, r.category]));
  /* A send is its sender's, else whoever held the lead when it went (the queue working for them) — the same
     WHO as the team table. Left out: a test account's (2026-10-02 — templates and niches had never applied
     the header's test rule; measured live, 40 sends on leads a test account held were showing) and, with
     My activity hidden, a hidden person's. */
  const factsById = new Map(facts.map((f) => [f.lead.id, f]));
  const hiddenSend = (leadId: string, m: { sent_by_user_id?: string | null; created_at: string }) =>
    outOf(m.sent_by_user_id ?? factsById.get(leadId)?.heldBy(ms(m.created_at)) ?? null);
  const templates = foldTemplates({ period: p, facts, msgsBy, triageByMessage, paidAtOf, hiddenSend });
  const niches = foldNiches({ period: p, facts, paidAtOf, hidden: outOf });
  const prospectSignups = input.onboarding.filter((o) => inPeriod(o.created_at, p) && !isInternalEmail(ex, o.contact_email)
    && !(o.lead_id && leadById.get(o.lead_id) && isExcludedLead(ex, leadById.get(o.lead_id)!)));
  const signupLeads = new Set(prospectSignups.map((o) => o.lead_id ?? `row:${o.created_at}`));
  const paidSignupLeads = new Set(prospectSignups.filter((o) => o.status === 'paid' || (o.lead_id && isPaidLead(leadById.get(o.lead_id)))).map((o) => o.lead_id ?? `row:${o.created_at}`));
  const interestedNoNext = facts.filter((f) => {
    const st = salesStateOf({ status: f.lead.status, is_potential_work: f.lead.is_potential_work, amount_paid: f.lead.amount_paid, call_booked_at: f.lead.call_booked_at, whatsapp_sent_at: f.lead.whatsapp_sent_at }, input.nowMs).state;
    /* My activity: hidden (Paul, 2026-10-02) — present-tense work, so the WHO is whoever holds the lead NOW
       (the follow-ups rule). A paid client is never here (client / won states), so delivery is untouched.
       A lead a TEST account holds is out too (measured live: test1's quote was the one left when hidden). */
    return (st === 'interested' || st === 'meeting_booked') && !f.lead.is_archived && (!f.lead.next_action || f.lead.next_action === 'none') && !outOf(f.holder);
  }).length;
  const features = input.usage ? foldFeatureUsage({
    now: input.usage.now, previous: input.usage.previous, costByFeature: money.cost.period.byFeature,
    nameOf, isExcludedUser: (u) => isExcludedUser(ex, u), periodFromDay: p.fromDay,
  }) : null;
  const bottlenecks = findBottlenecks({
    contacted: totals.cohort.contacted, replied: totals.cohort.replied, interested: totals.cohort.interested, meetings: totals.cohort.meeting, sales: totals.cohort.paid,
    signupStarts: signupLeads.size, signupsPaid: paidSignupLeads.size,
    apiUsd: money.cost.period.usd, revenue: money.period.net,
    interestedWithoutNextAction: interestedNoNext,
    deadTemplates: templates.meta.filter((r) => r.leadsSent >= BOTTLENECK_THRESHOLDS.templateDeadSends && r.replies === 0).map((r) => r.template),
    periodLabel: p.label,
    costlyFeatures: features ? features.filter((f) => f.flags.includes('costly_low_use')).map((f) => `${f.label} ($${(f.costUsd ?? 0).toFixed(2)}, ${f.uses} use${f.uses === 1 ? '' : 's'})`) : null,
    unusedFeatures: features ? features.filter((f) => f.flags.includes('unused')).map((f) => f.label) : null,
  });

  return {
    period: p, team, totals, excludedActivity, funnel, channels,
    templates, niches: niches.rows, nicheBookReplyRate: niches.bookReplyRate, bottlenecks,
    signups: { started: signupLeads.size, paid: paidSignupLeads.size },
    features,
    calls: { rows: [...callRows.values()].sort((a, b) => b.total - a.total), total: callTotal },
    money, today: todayBlock, yesterday: yesterdayBlock,
    ...delegation(attentionItems(input, facts, ledger, nameOf, todayDay, ta.items), input, facts, nameOf),
    triage: triageSummary(input, p),
    triageWaitingInInbox: ta.waitingInInbox,
    clients: clientRows(paidLeads.concat(realLeads.filter((l) => String(l.status) === 'refunded' && (Number(l.amount_paid) || 0) > 0)), route, nameOf)
      .map((c) => {
        if (!input.clientExtras) return c;
        const l = leadById.get(c.leadId);
        return { ...c, health: clientHealthOf({
          leadId: c.leadId, route: c.route, websiteBuild: (l?.website_build ?? null) as never, checklist: (l?.delivery_checklist ?? null) as Record<string, unknown> | null,
          baselineStarted: c.baselineStarted, remeasureDue: c.remeasureDue, remeasured: c.remeasured, payment: c.payment, refunded: c.refunded, todayDay,
        }, input.clientExtras) };
      }),
    lostReasons: foldLostReasons(facts, p, ex, nameOf, mine),
    activityScope: { hidden: hide.size > 0, people: [...new Set([...hide].map((u) => nameOf(u)))] },
    inventory: {
      leads: input.leads.length,
      active: input.leads.filter((l) => !l.is_archived).length,
      archived: input.leads.filter((l) => !!l.is_archived).length,
      addedByTestAccounts: input.leads.filter((l) => isExcludedUser(ex, l.added_by_user_id)).length,
    },
  };
}

/* ── Why prospects say no (2026-10-01) ─────────────────────────────────────────────────────────────
   The leads that are Not interested NOW (status not_interested; an opt-out or a Closed conversation is not
   a sales "no") and said no in the period: the moment is the newest "no" in History (the same events the
   funnel's Not interested count reads), or, for a lead with none, when the reason was recorded. All time =
   every such lead. A "no" made by a test account is excluded like every other test activity. The reason is
   the lead's canonical one (lead_set_lost_reason); a lead without one is "Reason not recorded" — counted,
   listed, never guessed. Percentages are of the leads WITH a reason.
   My activity: hidden — a "no" whose newest event is a hidden person's is left out (as a test account's
   is). With no event (measured live 2026-10-02: 256 of 259 all-time "no"s are a bare status), the WHO is
   the person who recorded the reason, else whoever held the lead then — the header's rule for an event
   that names no person. */
function foldLostReasons(facts: LeadFacts[], p: ReportingPeriod, ex: Exclusions, nameOf: (u: string | null | undefined) => string, mine: (u: string | null | undefined) => boolean = () => false): LostReasons {
  const by = new Map<string, LostReasonLead[]>();
  const unrecorded: LostReasonLead[] = [];
  let saidNo = 0;
  for (const f of facts) {
    if (String(f.lead.status ?? '') !== 'not_interested') continue;
    const last = f.notInterested.reduce<{ at: number; who: string | null } | null>((m, n) => (!m || n.at > m.at ? n : m), null);
    if (last && (isExcludedUser(ex, last.who) || mine(last.who))) continue;
    const at = last?.at ?? ms(f.lead.lost_reason_recorded_at);
    if (!last && mine(f.lead.lost_reason_recorded_by ?? (Number.isFinite(at) ? f.heldBy(at) : f.holder))) continue;
    if (p.fromMs !== null && !inP(at, p)) continue;
    saidNo += 1;
    const item: LostReasonLead = {
      id: f.lead.id, business: f.lead.business_name || 'Unnamed business', note: f.lead.lost_reason_note ?? null,
      who: nameOf(f.lead.lost_reason ? f.lead.lost_reason_recorded_by : last?.who), at: Number.isFinite(at) ? new Date(at).toISOString() : null,
    };
    const key = f.lead.lost_reason;
    if (!key) { unrecorded.push(item); continue; }
    const list = by.get(key); if (list) list.push(item); else by.set(key, [item]);
  }
  const recorded = saidNo - unrecorded.length;
  const newest = (a: LostReasonLead, b: LostReasonLead) => Date.parse(b.at ?? '') - Date.parse(a.at ?? '') || 0;
  const order = (k: string) => { const i = LOST_REASONS.findIndex((r) => r.value === k); return i < 0 ? LOST_REASONS.length : i; };
  const rows = [...by.entries()]
    .map(([key, leads]) => ({ key, label: lostReasonLabel(key), count: leads.length, pct: recorded ? Math.round((leads.length / recorded) * 100) : 0, leads: leads.sort(newest).slice(0, LOST_REASON_LIST_MAX) }))
    .sort((a, b) => b.count - a.count || order(a.key) - order(b.key));
  return { saidNo, recorded, unrecorded: unrecorded.length, rows, unrecordedLeads: unrecorded.sort(newest).slice(0, LOST_REASON_LIST_MAX) };
}
/* ── The state WORDS on a Needs-your-attention line (2026-10-01) ─────────────────────────────────────
   The same reading as every screen (salesStateOf) WITH the lead's logged contacts, so a lead reached by phone
   is never described as "New". Labels only: the urgency, "settled" and ordering decisions keep their inputs. */
export function stateLabelOf(l: AdminLead, f: Pick<LeadFacts, 'contacts'> | undefined, nowMs: number): ReturnType<typeof salesStateOf> {
  const logged = (f?.contacts ?? []).filter((c) => c.kind !== 'whatsapp');
  const latest = logged.reduce<typeof logged[number] | null>((a, c) => (!a || c.at > a.at ? c : a), null);
  return salesStateOf({
    status: l.status, is_potential_work: l.is_potential_work, amount_paid: l.amount_paid, call_booked_at: l.call_booked_at,
    whatsapp_sent_at: l.whatsapp_sent_at, whatsapp_ever_delivered: l.whatsapp_ever_delivered,
    lastLogged: latest ? { outcome: String(latest.outcome ?? ''), at: new Date(latest.at).toISOString(), reached: logged.some((c) => REACHED_OUTCOMES.has(String(c.outcome ?? ''))) } : null,
  }, nowMs);
}

/* ── Needs your attention ───────────────────────────────────────────────────────────────────────── */

/** Kinds that mean a person acted on the lead (a Next Action, a booking, a logged contact, a state move). */
const ACTED_KINDS: ReadonlySet<string> = new Set(['follow_up_set', 'call_booked', 'call_outcome', 'contact_logged', 'state_changed', 'marked_interested', 'stage_changed']);
/** Categories that stay Paul's even when the lead has since moved on (a client, a complaint, money). */
const NEVER_SETTLED: ReadonlySet<string> = new Set(['client_message', 'payment_issue', 'escalation', 'complaint', 'opt_out']);

function attentionItems(
  input: AdminInput, facts: LeadFacts[], ledger: AdminLedgerRow[], nameOf: (u: string | null) => string, todayDay: string,
  triageItems: AttentionItem[],
): AttentionItem[] {
  const out: AttentionItem[] = [];
  out.push(...triageItems);
  const nowMs = input.nowMs;
  const leadById = new Map(input.leads.map((l) => [l.id, l]));
  const factsById = new Map(facts.map((f) => [f.lead.id, f]));
  const biz = (id: string | null) => (id ? leadById.get(id)?.business_name ?? 'Unknown business' : '');
  const stateOf = (l: AdminLead) => stateLabelOf(l, factsById.get(l.id), nowMs).label;

  // URGENT — an open dispute on a payment.
  for (const r of ledger) {
    if (r.kind !== 'chargeback' || DISPUTE_RELEASED.has(r.status) || DISPUTE_LOST.has(r.status) || !r.lead_id) continue;
    const l = leadById.get(r.lead_id);
    out.push({ key: `dispute:${r.id}`, group: 'urgent', kind: 'payment_dispute', leadId: r.lead_id, business: biz(r.lead_id),
      why: `A payment dispute of £${Number(r.amount_gbp).toFixed(2)} is open (${r.status.replace(/_/g, ' ')})`,
      owner: nameOf(l?.sold_by_user_id ?? null), sinceIso: r.occurred_at, state: l ? stateOf(l) : 'Client', action: 'Respond to the dispute in Stripe', open: 'client', section: 'payment',
      ...stripeLink('Open the dispute in Stripe', r.stripe_object_id, r.stripe_payment_intent_id) });
  }
  for (const f of facts) {
    const l = f.lead;
    const paid = isPaidLead(l);
    const live = !l.is_archived && !l.service_terminated_at;
    // URGENT — a recurring payment failed.
    if (paid && live && l.subscription_status === 'past_due') {
      out.push({ key: `past_due:${l.id}`, group: 'urgent', kind: 'payment_failed', leadId: l.id, business: l.business_name ?? 'Client',
        why: 'Their monthly payment failed and the subscription is past due', owner: nameOf(l.sold_by_user_id), sinceIso: null,
        state: stateOf(l), action: 'Check the card with them before Stripe gives up', open: 'client', section: 'payment',
        ...stripeLink('Open the subscription in Stripe', l.stripe_subscription_id, l.stripe_customer_id) });
    }
    // TODAY — paid, and setup has not started (no baseline). Refunded leads are not paid (isPaidLead).
    if (paid && live && !l.baseline_audit_id) {
      const since = l.sold_at ?? l.payment_date;
      const days = since ? Math.floor((nowMs - ms(since)) / 86_400_000) : null;
      out.push({ key: `setup:${l.id}`, group: days !== null && days >= SETUP_PROMISE_DAYS ? 'urgent' : 'today', kind: 'setup_not_started', leadId: l.id, business: l.business_name ?? 'Client',
        why: days !== null && days >= SETUP_PROMISE_DAYS ? `Paid ${days} days ago and setup hasn't started — the promise is two working days` : 'Paid and setup has not started yet',
        owner: nameOf(l.sold_by_user_id), sinceIso: since, state: stateOf(l), action: 'Start the baseline', open: 'client', section: 'baseline' });
    }
    // TODAY — the four-week re-measure is past its date and has not run.
    if (paid && live && l.baseline_audit_id && l.remeasure_due_date && !l.remeasure_audit_id && l.remeasure_due_date.slice(0, 10) < todayDay) {
      out.push({ key: `remeasure:${l.id}`, group: 'today', kind: 'remeasure_overdue', leadId: l.id, business: l.business_name ?? 'Client',
        why: `The four-week re-measure was due ${l.remeasure_due_date.slice(0, 10)} and has not run`, owner: nameOf(l.sold_by_user_id),
        sinceIso: `${l.remeasure_due_date.slice(0, 10)}T09:00:00Z`, state: stateOf(l), action: 'Open the client and run the re-measure', open: 'client', section: 'remeasure' });
    }
    // TODAY — quoted and gone quiet (their court, not ours).
    if (!paid && !l.is_archived && l.status === 'price_given') {
      const waitingOnUs = f.lastInbound !== null && (f.lastOutbound === null || f.lastOutbound < f.lastInbound);
      const clock = f.lastInbound ?? f.lastOutbound;
      const d = clock === null ? null : Math.floor((nowMs - clock) / 86_400_000);
      if (!waitingOnUs && d !== null && d >= QUOTE_QUIET_DAYS) {
        out.push({ key: `quoted:${l.id}`, group: 'today', kind: 'quote_quiet', leadId: l.id, business: l.business_name ?? 'Lead',
          why: `Quoted and quiet for ${d} days`, owner: nameOf(f.holder), sinceIso: new Date(clock!).toISOString(),
          state: stateOf(l), action: 'Follow up on the quote in the Inbox', open: 'inbox' });
      }
    }
  }
  // TODAY — filled the sign-up and did not pay.
  const newestSignup = new Map<string, AdminOnboarding>();
  for (const o of input.onboarding) { if (!o.lead_id) continue; const prev = newestSignup.get(o.lead_id); if (!prev || ms(o.created_at) > ms(prev.created_at)) newestSignup.set(o.lead_id, o); }
  for (const [leadId, o] of newestSignup) {
    const l = leadById.get(leadId); if (!l || l.is_archived || isPaidLead(l) || DEAD_STATUSES.has(String(l.status)) || o.status === 'paid') continue;
    // A sign-up Paul (or the team) filled in to test the flow is not a prospect waiting to pay.
    if (isExcludedLead(input.exclusions, l) || isInternalEmail(input.exclusions, o.contact_email)) continue;
    /* ⛔ A QUICK CLOSE IS NOT A FILLED SIGN-UP UNTIL A PAYMENT LINK EXISTS (M-022, 2026-10-04). Its row is
       created at the rep's first tap; the clock starts when the link was made, and the words say so. */
    const quickClose = o.source === 'quick_close';
    const since = quickClose ? (o.qc_link_at ?? null) : o.created_at;
    if (!since) continue;
    const d = Math.floor((nowMs - ms(since)) / 86_400_000);
    if (d < SIGNUP_CHASE_DAYS) continue;
    const ago = d === 1 ? 'yesterday' : `${d} days ago`;
    out.push({ key: `signup:${leadId}`, group: 'today', kind: 'signup_unpaid', leadId, business: l.business_name ?? 'Lead',
      why: quickClose ? `Quick Close sign-up link made ${ago} and not paid` : `Filled the sign-up ${ago} and hasn't paid`, owner: nameOf(factsById.get(leadId)?.holder ?? null),
      sinceIso: since, state: stateOf(l), action: quickClose ? 'Check with the salesperson, then chase in the Inbox' : 'Chase the sign-up in the Inbox', open: 'inbox' });
  }
  // REVIEW — one line: live leads with no trade cannot be sold to.
  const noTrade = facts.filter((f) => isLiveLeadWithoutTrade(f.lead));
  if (noTrade.length) out.push({ key: 'no_trade', group: 'review', kind: 'no_trade', leadId: null, business: `${noTrade.length} lead${noTrade.length === 1 ? '' : 's'}`,
    why: 'No trade stored — checkout refuses them until it is set', owner: null, sinceIso: null, state: '—', action: 'Set the trade on each lead', open: 'outreach', show: 'no_trade' });

  const order: Record<AttentionGroup, number> = { urgent: 0, today: 1, review: 2, blocked: 3 };
  return out.sort((a, b) => order[a.group] - order[b.group] || (ms(a.sinceIso) || 0) - (ms(b.sinceIso) || 0));
}

/* ── Delegated work leaves Paul's list (Sales Team Board, 2026-10-01) ─────────────────────────────
   An ordinary follow-up (attentionAssignable: never urgent, never money or client delivery, never an
   aggregate) whose lead is held by a salesperson who has it as an OPEN board task is theirs now: it
   leaves Needs your attention and is counted in one "delegated" line that opens the team board. The
   moment the task is done or cancelled, or the lead moves, the item comes back if it is still true. */
function delegation(items: AttentionItem[], input: AdminInput, facts: LeadFacts[], nameOf: (u: string | null) => string): { attention: AttentionItem[]; delegated: DelegatedSummary | null } {
  if (!input.delegatedTasks) return { attention: items, delegated: null };
  const holderOf = new Map(facts.map((f) => [f.lead.id, f.holder]));
  const open = new Map<string, DelegatedTask>();
  for (const t of input.delegatedTasks) if ((t.task_status === 'todo' || t.task_status === 'in_progress') && t.user_id !== input.bookOwnerId) open.set(`${t.lead_id}:${t.user_id}`, t);
  const kept: AttentionItem[] = []; const moved: DelegatedSummary['items'] = [];
  for (const i of items) {
    const holder = i.leadId ? holderOf.get(i.leadId) ?? null : null;
    const t = i.leadId && holder ? open.get(`${i.leadId}:${holder}`) : undefined;
    if (t && attentionAssignable(i)) moved.push({ leadId: i.leadId!, business: i.business, owner: nameOf(holder), status: t.task_status, why: i.why, kind: i.kind });
    else kept.push(i);
  }
  return { attention: kept, delegated: { count: moved.length, items: moved } };
}

/* ── Reply triage on Paul's list (release 2) ─────────────────────────────────────────────────────────
   One item per lead at most — its newest still-open triaged reply. What reaches Paul:
   - urgent_admin → URGENT; admin_action → TODAY; review → REVIEW (with the confidence);
   - rep_action → ONLY a live sale nobody is working: a high-intent reply (or a question) on a lead Paul
     holds or nobody holds; or a high-intent reply a salesperson has left for REP_ESCALATE_HOURS.
   Everything else (no_action, a salesperson's ordinary conversation) never appears — the Inbox has it.
   Open = not answered by a person since, no one acted on the lead since, the lead has not settled, and
   not marked handled (replyTriage.ts triageIsOpen). */
/** The items for Paul's list, and the open replies NOT put on it (a salesperson's, or not a live sale). */
function triageAttention(input: AdminInput, facts: LeadFacts[], nameOf: (u: string | null) => string, msgsBy: Map<string, AdminMessage[]>, actBy: Map<string, AdminActivity[]>): { items: AttentionItem[]; waitingInInbox: number } {
  const counts = { waitingInInbox: 0 };
  if (!input.triage?.length) return { items: [], waitingInInbox: 0 };
  const ex = input.exclusions;
  const factsById = new Map(facts.map((f) => [f.lead.id, f]));
  const newest = new Map<string, TriageRow>();
  for (const r of input.triage) {
    if (!r.lead_id || r.bucket === 'no_action') continue;
    const prev = newest.get(r.lead_id);
    if (!prev || ms(r.message_at) > ms(prev.message_at)) newest.set(r.lead_id, r);
  }
  const out: AttentionItem[] = [];
  for (const [leadId, r] of newest) {
    const f = factsById.get(leadId);
    if (!f) continue; // an excluded (test) lead, or no longer in the book
    const at = ms(r.message_at);
    const msgs = msgsBy.get(leadId) ?? [];
    const answeredAfter = msgs.some((m) => m.direction === 'outbound' && isRealSend(m.status) && !isTestMessage(m) && ms(m.created_at) > at && (!!m.sent_by_user_id || !m.template_name));
    const actedAfter = (actBy.get(leadId) ?? []).some((a) => ACTED_KINDS.has(a.kind) && !!a.actor_user_id && ms(a.created_at) > at);
    const st = salesStateOf({ status: f.lead.status, is_potential_work: f.lead.is_potential_work, amount_paid: f.lead.amount_paid, call_booked_at: f.lead.call_booked_at, whatsapp_sent_at: f.lead.whatsapp_sent_at }, input.nowMs);
    const settled = !NEVER_SETTLED.has(r.category) && (st.state === 'client' || st.state === 'won' || st.state === 'not_interested');
    if (!triageIsOpen({ messageAt: r.message_at, answeredAfter, actedAfter, settled, resolvedAt: r.resolved_at, nowMs: input.nowMs })) continue;
    const cat = r.category as TriageCategory;
    const label = TRIAGE_CATEGORY_LABEL[cat] ?? r.category;
    const holderIsRep = !!f.holder && f.holder !== input.bookOwnerId && !isExcludedUser(ex, f.holder);
    const hours = Math.floor((input.nowMs - at) / 3_600_000);
    let group: AttentionGroup; let why: string; let action: string;
    if (r.bucket === 'urgent_admin') { group = 'urgent'; why = `${label}: ${r.reason}`; action = 'Read it and reply yourself'; }
    else if (r.bucket === 'admin_action') { group = 'today'; why = `${label}: ${r.reason}`; action = 'Reply in the Inbox'; }
    else if (r.bucket === 'review') { group = 'review'; why = r.reason; action = 'Read the conversation and decide'; }
    else if (r.bucket === 'rep_action') {
      /* ⛔ Only a LIVE SALE reaches Paul (measured 2026-09-30: surfacing every open question put 37
         "who's asking?"-style replies on the list — salesperson work, the noise the brief forbids).
         Everything else open is counted into one "waiting in the Inbox" line. */
      const hot = HIGH_INTENT.has(cat);
      if (!hot) { counts.waitingInInbox += 1; continue; }
      if (holderIsRep) {
        if (hours < REP_ESCALATE_HOURS) { counts.waitingInInbox += 1; continue; }
        group = 'today'; why = `${label} — ${nameOf(f.holder)} hasn't answered in ${hours} hours`; action = `Check in with ${nameOf(f.holder)}, or reply yourself`;
      } else {
        group = 'today'; why = `${label} — nobody has answered yet`; action = 'Reply in the Inbox';
      }
    } else continue;
    out.push({
      key: `triage:${r.id}`, group, kind: `reply_${r.category}`, leadId, business: f.lead.business_name ?? 'Lead',
      why, owner: f.holder ? nameOf(f.holder) : 'Nobody', sinceIso: r.message_at, state: stateLabelOf(f.lead, f, input.nowMs).label, action, open: 'inbox',
      triageId: r.id, confidence: r.confidence ?? undefined, method: r.method,
    });
  }
  return { items: out, waitingInInbox: counts.waitingInInbox };
}

function triageSummary(input: AdminInput, p: ReportingPeriod): TriageSummary | null {
  if (!input.triage) return null;
  const inP2 = input.triage.filter((r) => inPeriod(r.message_at, p) && !(r.lead_id && input.exclusions.leads.has(r.lead_id)));
  const byBucket: Record<TriageBucket, number> = { urgent_admin: 0, admin_action: 0, rep_action: 0, no_action: 0, review: 0 };
  const cat = new Map<string, number>();
  for (const r of inP2) { if (r.bucket in byBucket) byBucket[r.bucket as TriageBucket] += 1; cat.set(r.category, (cat.get(r.category) ?? 0) + 1); }
  return {
    byBucket,
    byCategory: [...cat].map(([category, count]) => ({ category, label: TRIAGE_CATEGORY_LABEL[category as TriageCategory] ?? category, count })).sort((a, b) => b.count - a.count),
    suppressed: inP2.filter((r) => r.action_taken === 'suppressed').length,
    suppressionFailed: inP2.filter((r) => r.action_taken === 'suppression_failed').length,
    aiFiled: inP2.filter((r) => r.method === 'ai').length,
    repWaiting: inP2.filter((r) => r.bucket === 'rep_action').length,
  };
}

function clientRows(leads: AdminLead[], route: (id: string) => ServiceRoute | null, nameOf: (u: string | null) => string): ClientRow[] {
  const seen = new Set<string>();
  return leads.filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true))).map((l) => {
    const refunded = String(l.status) === 'refunded';
    const payment = refunded ? 'Refunded'
      : l.service_terminated_at ? 'Service ended'
      : l.subscription_status === 'past_due' ? 'Payment failed'
      : l.subscription_status === 'active' || l.subscription_status === 'trialing' ? 'Subscription active'
      : l.subscription_status === 'canceled' ? 'Subscription cancelled'
      : l.subscription_status ? l.subscription_status.replace(/_/g, ' ')
      : 'One-off £ paid, no subscription on record';
    return {
      leadId: l.id, business: l.business_name ?? 'Client', route: route(l.id), paidAt: l.sold_at ?? l.payment_date,
      baselineStarted: !!l.baseline_audit_id, remeasureDue: l.remeasure_due_date ? l.remeasure_due_date.slice(0, 10) : null,
      remeasured: !!l.remeasure_audit_id, payment, refunded, seller: nameOf(l.sold_by_user_id),
    };
  }).sort((a, b) => Number(a.refunded) - Number(b.refunded) || String(a.paidAt).localeCompare(String(b.paidAt)));
}
