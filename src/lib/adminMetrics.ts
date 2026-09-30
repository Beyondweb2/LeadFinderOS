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
import { looksAutomated } from './inboundClassify.ts';
import { isPaidLead } from './leadPayment.ts';
import { salesStateOf, NOT_INTERESTED_STATUSES, INTERESTED_STATUSES } from './leadState.ts';
import { serviceRouteForTotal, serviceRouteFromRow, type ServiceRoute } from './findableOffer.ts';
import { DISPUTE_LOST, DISPUTE_RELEASED, type CommissionLine, type EarningsTotals } from './commission.ts';
import { inPeriod, londonDay, type ReportingPeriod } from './reportingPeriod.ts';
import { isExcludedLead, isExcludedUser, isInternalEmail, isTestMessage, type Exclusions } from './metricExclusions.ts';
import { costFeatureOf, costProviderOf, isChargeRow, usdToGbp } from './apiCostLabels.ts';
import { HIGH_INTENT, REP_ESCALATE_HOURS, TRIAGE_CATEGORY_LABEL, triageIsOpen, type TriageBucket, type TriageCategory } from './replyTriage.ts';

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
  next_action: string | null;
  next_action_date: string | null;
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
}
export interface AdminMessage {
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
export interface AdminLedgerRow { id: string; lead_id: string | null; kind: string; status: string; amount_gbp: number; occurred_at: string; sold_by_user_id: string | null }
export interface AdminOnboarding { lead_id: string | null; status: string | null; created_at: string; plan_tier: string | null; website_addon: boolean | null; contact_email?: string | null }
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
const CONVERSATION_OUTCOMES: ReadonlySet<string> = new Set(['spoke_to_owner', 'interested', 'call_back', 'meeting_booked', 'not_interested', 'agency_controls_site']);
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
  outsideLedger: { count: number; amount: number; names: string[] };
  commission: { totals: EarningsTotals | null; periodAdded: number; bySeller: CommissionSellerRow[] };
  cost: { period: CostBlock; today: number; week: number; month: number };
  contribution: { revenueNet: number; commission: number; apiGbp: number; value: number };
}
export interface SinceBlock { whatsappSent: number; replies: number; interested: number; meetings: number; sales: number; revenue: number; commission: number; apiUsd: number }
export type AttentionGroup = 'urgent' | 'today' | 'review' | 'blocked';
export interface AttentionItem {
  key: string; group: AttentionGroup; kind: string;
  leadId: string | null; business: string;
  why: string; owner: string | null; sinceIso: string | null; state: string; action: string;
  /** Where the row opens: a lead, the paid-client hub, the Inbox, or the sign-ups list. */
  open: 'lead' | 'client' | 'inbox' | 'signups' | 'outreach';
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
}

export interface AdminOverview {
  period: ReportingPeriod;
  team: TeamRow[];
  totals: Totals;
  excludedActivity: { whatsappSent: number; calls: number; contacts: number; apiCostUsd: number };
  funnel: Funnel;
  channels: ChannelRow[];
  calls: { rows: CallRow[]; total: CallRow };
  money: Money;
  today: SinceBlock; yesterday: SinceBlock;
  attention: AttentionItem[];
  /** null = triage has not run (the page says so rather than implying no replies need anyone). */
  triage: TriageSummary | null;
  clients: ClientRow[];
  inventory: { leads: number; active: number; archived: number; addedByTestAccounts: number };
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
  holder: string | null;
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
  const contacts: LeadFacts['contacts'] = [];
  const humanReplies: number[] = [];
  let lastInbound: number | null = null; let lastOutbound: number | null = null; let hasInbound = false;
  for (const m of msgs) {
    if (isTestMessage(m)) continue;
    const t = ms(m.created_at);
    if (m.direction === 'outbound' && isRealSend(m.status)) {
      lastOutbound = lastOutbound === null ? t : Math.max(lastOutbound, t);
      contacts.push({ at: t, who: m.sent_by_user_id ?? holder, channel: 'whatsapp', outcome: null, kind: 'whatsapp' });
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
    const at = ms(a.created_at); const who = a.actor_user_id ?? holder;
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
    if (s.wrong_number_at) wrongNumber.push({ at: ms(s.wrong_number_at), who: s.wrong_number_by ?? holder });
    const r = String(s.reason ?? '');
    if (OPT_OUT_REASONS.has(r)) optOut.push({ at: ms(s.created_at), who: holder });
    else if (DECLINE_REASONS.has(r)) notInterested.push({ at: ms(s.created_at), who: holder });
  }
  contacts.sort((x, y) => x.at - y.at);
  humanReplies.sort((x, y) => x - y);
  const status = String(lead.status ?? '');
  return {
    lead, holder, contacts, humanReplies,
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

  const msgsBy = groupBy(input.messages, (m) => m.lead_id);
  const actBy = groupBy(input.activity, (a) => a.lead_id);
  const supBy = groupBy(input.suppressions, (s) => s.lead_id);
  for (const a of msgsBy.values()) a.sort((x, y) => ms(x.created_at) - ms(y.created_at));

  const realLeads = input.leads.filter((l) => !isExcludedLead(ex, l));
  const facts = realLeads.map((l) => leadFacts(input, l, msgsBy.get(l.id) ?? [], actBy.get(l.id) ?? [], supBy.get(l.id) ?? []));
  const leadById = new Map(input.leads.map((l) => [l.id, l]));

  /* Rows per real (not excluded) person; excluded activity is tallied apart for the note. */
  const rows = new Map<string, TeamRow>();
  for (const x of people) if (!x.excluded) rows.set(x.userId, { userId: x.userId, name: x.name, role: x.role, ...zeroTotals() });
  const rowFor = (u: string | null | undefined): TeamRow | null => {
    if (!u || isExcludedUser(ex, u)) return null;
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
    if (f.humanReplies.some((t) => inP(t, p))) once(f.holder, 'replies', id);
    if (f.interested && inP(f.interested.at, p)) once(f.interested.who, 'interested', id);
    for (const m of f.meetings) if (inP(m.at, p)) once(m.who, 'meetings', id);
    for (const n of f.notInterested) if (inP(n.at, p)) once(n.who, 'notInterested', id);
    for (const w of f.wrongNumber) if (inP(w.at, p)) once(w.who, 'wrongNumbers', id);
    for (const o of f.optOut) if (inP(o.at, p)) once(o.who, 'optOuts', id);

    /* Cohort: leads FIRST contacted in the period, credited to whoever made that first contact. */
    const first = f.contacts.find((c) => !isExcludedUser(ex, c.who));
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
        if (r && due <= todayDay) { r.followUpsDue += 1; if (due < todayDay) r.followUpsOverdue += 1; }
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
  totals.replies = bookDistinct((f) => f.humanReplies.some((t) => inP(t, p)) && !isExcludedUser(ex, f.holder));
  totals.interested = bookDistinct((f) => !!f.interested && inP(f.interested.at, p) && !isExcludedUser(ex, f.interested.who));
  totals.meetings = bookDistinct((f) => f.meetings.some((m) => inP(m.at, p) && !isExcludedUser(ex, m.who)));
  totals.leadsMessaged = bookDistinct((f) => f.contacts.some((c) => c.kind === 'whatsapp' && inP(c.at, p) && !isExcludedUser(ex, c.who)));

  /* Funnel: the leads ADDED in the period (all time = the whole book), how far each has got. */
  const cohortLeads = facts.filter((f) => p.fromMs === null || inPeriod(f.lead.created_at, p));
  const contactedEver = (f: LeadFacts) => f.contacts.some((c) => !isExcludedUser(ex, c.who)) || !!f.lead.whatsapp_sent_at;
  const funnel: Funnel = {
    basis: p.fromMs === null ? 'Every lead in the book' : `Leads added ${p.label.toLowerCase() === 'today' ? 'today' : `in ${p.label.toLowerCase()}`}`,
    stages: [
      { key: 'added', label: 'Leads added', count: cohortLeads.length },
      { key: 'contacted', label: 'Contacted', count: cohortLeads.filter(contactedEver).length },
      { key: 'replied', label: 'Replied', count: cohortLeads.filter((f) => f.humanReplies.length > 0).length },
      { key: 'interested', label: 'Interested', count: cohortLeads.filter((f) => f.interestedEver).length },
      { key: 'meeting', label: 'Meeting booked', count: cohortLeads.filter((f) => f.meetingEver).length },
      { key: 'paid', label: 'Paid', count: cohortLeads.filter((f) => isPaidLead(f.lead) || String(f.lead.status) === 'refunded').length },
    ],
    losses: [
      { key: 'not_interested', label: 'Not interested', count: cohortLeads.filter((f) => NOT_INTERESTED_STATUSES.has(String(f.lead.status)) && String(f.lead.status) !== 'opted_out').length },
      { key: 'wrong_number', label: 'Wrong number', count: cohortLeads.filter((f) => f.wrongNumber.length > 0).length },
      { key: 'opt_out', label: 'Opted out', count: cohortLeads.filter((f) => String(f.lead.status) === 'opted_out' || f.optOut.length > 0).length },
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
      const on = f.contacts.filter((c) => c.channel === ch && !isExcludedUser(ex, c.who));
      if (!on.length) continue;
      const firstAt = on[0].at;
      if (on.some((c) => inP(c.at, p))) attempts += 1;
      if (ch === 'whatsapp') { if (f.humanReplies.some((t) => inP(t, p) && t >= firstAt)) replies += 1; }
      else if (on.some((c) => inP(c.at, p) && CONVERSATION_OUTCOMES.has(String(c.outcome)))) replies += 1;
      if (f.interested && inP(f.interested.at, p) && f.interested.at >= firstAt) interested += 1;
      if (f.meetings.some((m) => inP(m.at, p) && m.at >= firstAt)) meetings += 1;
      const paidAt = paidAtOf.get(f.lead.id);
      if (paidAt !== undefined && inP(paidAt, p) && paidAt >= firstAt) sales += 1;
    }
    return { channel: ch, label: CHANNEL_LABEL[ch], attempts, replies, interested, meetings, sales, enoughData: attempts >= CHANNEL_MIN_ATTEMPTS };
  });

  /* Calls: logged call outcomes only, by who logged them. */
  const callRows = new Map<string, CallRow>();
  const callTotal: CallRow = { userId: 'total', name: 'Everyone', total: 0, byOutcome: {} };
  for (const f of facts) for (const c of f.contacts) {
    if (c.channel !== 'call' || c.kind === 'whatsapp' || !inP(c.at, p) || isExcludedUser(ex, c.who)) continue;
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
  const apiGbp = usdToGbp(periodCost.usd);
  const money: Money = {
    period: periodMoney, week: moneyBlock(ledger, input.week), month: moneyBlock(ledger, input.month),
    bySeller: [...sellerAgg].map(([userId, a]) => ({ userId, name: nameOf(userId), ...a })).sort((a, b) => b.gross - a.gross),
    byRoute,
    payingClients: paidLeads.length,
    activeSubscriptions: paidLeads.filter((l) => LIVE_SUBSCRIPTION.has(String(l.subscription_status))).length,
    pastDue: paidLeads.filter((l) => l.subscription_status === 'past_due').length,
    outsideLedger: { count: outside.length, amount: round2(outside.reduce((s, l) => s + (Number(l.amount_paid) || 0), 0)), names: outside.map((l) => l.business_name ?? 'Client') },
    commission: { totals: input.commissionTotals, periodAdded: commissionPeriod, bySeller: [...commissionBySeller.values()] },
    cost: { period: periodCost, today: costTotal(input.cost.today), week: costTotal(input.cost.week), month: costTotal(input.cost.month) },
    contribution: { revenueNet: periodMoney.net, commission: commissionPeriod, apiGbp, value: round2(periodMoney.net - commissionPeriod - apiGbp) },
  };

  /* Today / yesterday — the same definitions, book-wide. */
  const since = (q: ReportingPeriod, costRows: CostRow[]): SinceBlock => ({
    whatsappSent: facts.reduce((s, f) => s + f.contacts.filter((c) => c.kind === 'whatsapp' && inP(c.at, q) && !isExcludedUser(ex, c.who)).length, 0),
    replies: facts.filter((f) => f.humanReplies.some((t) => inP(t, q)) && !isExcludedUser(ex, f.holder)).length,
    interested: facts.filter((f) => f.interested && inP(f.interested.at, q) && !isExcludedUser(ex, f.interested.who)).length,
    meetings: facts.filter((f) => f.meetings.some((m) => inP(m.at, q) && !isExcludedUser(ex, m.who))).length,
    sales: ledger.filter((r) => r.kind === 'initial' && r.status === 'succeeded' && inPeriod(r.occurred_at, q)).length,
    revenue: moneyBlock(ledger, q).gross,
    commission: round2((input.commissionLines ?? []).filter((l) => l.status !== 'not_commissionable' && inPeriod(l.occurredAt, q)).reduce((s, l) => s + l.commission, 0)),
    apiUsd: costTotal(costRows),
  });
  const todayBlock = since(input.today, input.cost.today);
  const yesterdayBlock = since(input.yesterday, input.cost.yesterday);

  return {
    period: p, team, totals, excludedActivity, funnel, channels,
    calls: { rows: [...callRows.values()].sort((a, b) => b.total - a.total), total: callTotal },
    money, today: todayBlock, yesterday: yesterdayBlock,
    attention: attentionItems(input, facts, ledger, nameOf, todayDay, msgsBy, actBy),
    triage: triageSummary(input, p),
    clients: clientRows(paidLeads.concat(realLeads.filter((l) => String(l.status) === 'refunded' && (Number(l.amount_paid) || 0) > 0)), route, nameOf),
    inventory: {
      leads: input.leads.length,
      active: input.leads.filter((l) => !l.is_archived).length,
      archived: input.leads.filter((l) => !!l.is_archived).length,
      addedByTestAccounts: input.leads.filter((l) => isExcludedUser(ex, l.added_by_user_id)).length,
    },
  };
}

/* ── Needs your attention ───────────────────────────────────────────────────────────────────────── */

/** Kinds that mean a person acted on the lead (a Next Action, a booking, a logged contact, a state move). */
const ACTED_KINDS: ReadonlySet<string> = new Set(['follow_up_set', 'call_booked', 'call_outcome', 'contact_logged', 'state_changed', 'marked_interested', 'stage_changed']);
/** Categories that stay Paul's even when the lead has since moved on (a client, a complaint, money). */
const NEVER_SETTLED: ReadonlySet<string> = new Set(['client_message', 'payment_issue', 'escalation', 'complaint', 'opt_out']);

function attentionItems(
  input: AdminInput, facts: LeadFacts[], ledger: AdminLedgerRow[], nameOf: (u: string | null) => string, todayDay: string,
  msgsBy: Map<string, AdminMessage[]>, actBy: Map<string, AdminActivity[]>,
): AttentionItem[] {
  const out: AttentionItem[] = [];
  out.push(...triageAttention(input, facts, nameOf, msgsBy, actBy));
  const nowMs = input.nowMs;
  const leadById = new Map(input.leads.map((l) => [l.id, l]));
  const factsById = new Map(facts.map((f) => [f.lead.id, f]));
  const biz = (id: string | null) => (id ? leadById.get(id)?.business_name ?? 'Unknown business' : '');
  const stateOf = (l: AdminLead) => salesStateOf({ status: l.status, is_potential_work: l.is_potential_work, amount_paid: l.amount_paid, call_booked_at: l.call_booked_at, whatsapp_sent_at: l.whatsapp_sent_at }, nowMs).label;

  // URGENT — an open dispute on a payment.
  for (const r of ledger) {
    if (r.kind !== 'chargeback' || DISPUTE_RELEASED.has(r.status) || DISPUTE_LOST.has(r.status) || !r.lead_id) continue;
    const l = leadById.get(r.lead_id);
    out.push({ key: `dispute:${r.id}`, group: 'urgent', kind: 'payment_dispute', leadId: r.lead_id, business: biz(r.lead_id),
      why: `A payment dispute of £${Number(r.amount_gbp).toFixed(2)} is open (${r.status.replace(/_/g, ' ')})`,
      owner: nameOf(l?.sold_by_user_id ?? null), sinceIso: r.occurred_at, state: l ? stateOf(l) : 'Client', action: 'Respond to the dispute in Stripe', open: 'client' });
  }
  for (const f of facts) {
    const l = f.lead;
    const paid = isPaidLead(l);
    const live = !l.is_archived && !l.service_terminated_at;
    // URGENT — a recurring payment failed.
    if (paid && live && l.subscription_status === 'past_due') {
      out.push({ key: `past_due:${l.id}`, group: 'urgent', kind: 'payment_failed', leadId: l.id, business: l.business_name ?? 'Client',
        why: 'Their monthly payment failed and the subscription is past due', owner: nameOf(l.sold_by_user_id), sinceIso: null,
        state: stateOf(l), action: 'Check the card with them before Stripe gives up', open: 'client' });
    }
    // TODAY — paid, and setup has not started (no baseline). Refunded leads are not paid (isPaidLead).
    if (paid && live && !l.baseline_audit_id) {
      const since = l.sold_at ?? l.payment_date;
      const days = since ? Math.floor((nowMs - ms(since)) / 86_400_000) : null;
      out.push({ key: `setup:${l.id}`, group: days !== null && days >= SETUP_PROMISE_DAYS ? 'urgent' : 'today', kind: 'setup_not_started', leadId: l.id, business: l.business_name ?? 'Client',
        why: days !== null && days >= SETUP_PROMISE_DAYS ? `Paid ${days} days ago and setup hasn't started — the promise is two working days` : 'Paid and setup has not started yet',
        owner: nameOf(l.sold_by_user_id), sinceIso: since, state: stateOf(l), action: 'Start the baseline', open: 'client' });
    }
    // TODAY — the four-week re-measure is past its date and has not run.
    if (paid && live && l.baseline_audit_id && l.remeasure_due_date && !l.remeasure_audit_id && l.remeasure_due_date.slice(0, 10) < todayDay) {
      out.push({ key: `remeasure:${l.id}`, group: 'today', kind: 'remeasure_overdue', leadId: l.id, business: l.business_name ?? 'Client',
        why: `The four-week re-measure was due ${l.remeasure_due_date.slice(0, 10)} and has not run`, owner: nameOf(l.sold_by_user_id),
        sinceIso: `${l.remeasure_due_date.slice(0, 10)}T09:00:00Z`, state: stateOf(l), action: 'Open the client and run the re-measure', open: 'client' });
    }
    // TODAY — quoted and gone quiet (their court, not ours).
    if (!paid && !l.is_archived && l.status === 'price_given') {
      const waitingOnUs = f.lastInbound !== null && (f.lastOutbound === null || f.lastOutbound < f.lastInbound);
      const clock = f.lastInbound ?? f.lastOutbound;
      const d = clock === null ? null : Math.floor((nowMs - clock) / 86_400_000);
      if (!waitingOnUs && d !== null && d >= QUOTE_QUIET_DAYS) {
        out.push({ key: `quoted:${l.id}`, group: 'today', kind: 'quote_quiet', leadId: l.id, business: l.business_name ?? 'Lead',
          why: `Quoted and quiet for ${d} days`, owner: nameOf(f.holder), sinceIso: new Date(clock!).toISOString(),
          state: stateOf(l), action: 'Follow up on the quote', open: 'lead' });
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
    const d = Math.floor((nowMs - ms(o.created_at)) / 86_400_000);
    if (d < SIGNUP_CHASE_DAYS) continue;
    out.push({ key: `signup:${leadId}`, group: 'today', kind: 'signup_unpaid', leadId, business: l.business_name ?? 'Lead',
      why: `Filled the sign-up ${d === 1 ? 'yesterday' : `${d} days ago`} and hasn't paid`, owner: nameOf(factsById.get(leadId)?.holder ?? null),
      sinceIso: o.created_at, state: stateOf(l), action: 'Chase the sign-up', open: 'lead' });
  }
  // REVIEW — one line: live leads with no trade cannot be sold to.
  const noTrade = facts.filter((f) => !f.lead.is_archived && !isPaidLead(f.lead) && !DEAD_STATUSES.has(String(f.lead.status))
    && !['no_whatsapp', 'no_whatsapp_needs_sms', 'queued'].includes(String(f.lead.status)) && !((f.lead.search_keyword || f.lead.category || '').trim()));
  if (noTrade.length) out.push({ key: 'no_trade', group: 'review', kind: 'no_trade', leadId: null, business: `${noTrade.length} lead${noTrade.length === 1 ? '' : 's'}`,
    why: 'No trade stored — checkout refuses them until it is set', owner: null, sinceIso: null, state: '—', action: 'Set the trade on each lead', open: 'outreach' });

  const order: Record<AttentionGroup, number> = { urgent: 0, today: 1, review: 2, blocked: 3 };
  return out.sort((a, b) => order[a.group] - order[b.group] || (ms(a.sinceIso) || 0) - (ms(b.sinceIso) || 0));
}

/* ── Reply triage on Paul's list (release 2) ─────────────────────────────────────────────────────────
   One item per lead at most — its newest still-open triaged reply. What reaches Paul:
   - urgent_admin → URGENT; admin_action → TODAY; review → REVIEW (with the confidence);
   - rep_action → ONLY a live sale nobody is working: a high-intent reply (or a question) on a lead Paul
     holds or nobody holds; or a high-intent reply a salesperson has left for REP_ESCALATE_HOURS.
   Everything else (no_action, a salesperson's ordinary conversation) never appears — the Inbox has it.
   Open = not answered by a person since, no one acted on the lead since, the lead has not settled, and
   not marked handled (replyTriage.ts triageIsOpen). */
function triageAttention(input: AdminInput, facts: LeadFacts[], nameOf: (u: string | null) => string, msgsBy: Map<string, AdminMessage[]>, actBy: Map<string, AdminActivity[]>): AttentionItem[] {
  if (!input.triage?.length) return [];
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
      const hot = HIGH_INTENT.has(cat);
      if (holderIsRep) {
        if (!hot || hours < REP_ESCALATE_HOURS) continue;
        group = 'today'; why = `${label} — ${nameOf(f.holder)} hasn't answered in ${hours} hours`; action = `Check in with ${nameOf(f.holder)}, or reply yourself`;
      } else {
        if (!hot && cat !== 'question') continue;
        group = 'today'; why = hot ? `${label} — nobody has answered yet` : `Asked a question nobody has answered`; action = 'Reply in the Inbox';
      }
    } else continue;
    out.push({
      key: `triage:${r.id}`, group, kind: `reply_${r.category}`, leadId, business: f.lead.business_name ?? 'Lead',
      why, owner: f.holder ? nameOf(f.holder) : 'Nobody', sinceIso: r.message_at, state: st.label, action, open: 'inbox',
      triageId: r.id, confidence: r.confidence ?? undefined, method: r.method,
    });
  }
  return out;
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
