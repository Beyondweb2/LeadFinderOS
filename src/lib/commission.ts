/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SALES COMMISSION (Sales Experience, 2026-09-28; Paul's rules, not to be re-asked):
   - 🔴 THE INITIAL PAYMENT IS TIERED BY THE CALENDAR MONTH (Paul, 2026-10-01; replaced the weekly
     ladder of 2026-09-29): per salesperson, per London calendar month, sales 1–12 earn 30%, sales 13–24
     40%, sale 25 onwards 50% of the initial payment. NOT retrospective — each sale keeps the rate of its
     own place; the sequence resets on the 1st; a sale counts when the successful initial payment lands
     in the ledger, ordered by payment time then payment id. A sale that was fully refunded or lost to a
     chargeback does not count towards a LATER sale's place; a test account's or test lead's sale never
     counts (stamped 'test_excluded', 0%). The place and rate are STAMPED once on the ledger row by the
     database (migration 20261003100000, stamp_monthly_commission_for) and read from there, so a later
     rule change never rewrites history. A row with no stamped rate (earned before any tier rule) keeps
     the flat COMMISSION_INITIAL_RATE it was earned under; a row stamped under the weekly rule keeps its
     stamped rate. There is no bonus on top of this.
   - 20% of each of the NEXT SIX qualifying recurring payments actually received (Paul, 2026-10-02; was
     three) — the client's monthly payments 1–6, never the initial payment. Payment 7 onwards earns 0%.
     Only a SUCCEEDED payment counts (a failed one is not a payment); a refund or chargeback reverses it.
     No transition rule: on 2026-10-02 the ledger held one payment (an initial, sold by the admin) and no
     recurring payment had ever been received, so no history is re-rated by the change.
     Always a percentage of the REAL amount — a £29.99 monthly earns £6.00, a £99 monthly £19.80.
     Never a hard-coded figure.
   - 🔴 ONLY WHILE ENGAGED (Paul, 2026-10-02): whether a payment earns is decided by ITS OWN time against
     the seller's engagement history (team_engagement_events: append-only, server-timed 'ended' / 'resumed'
     — engagedAt). A MONTHLY payment received while the seller was not engaged earns 0%, permanently: a
     later re-enable appends a 'resumed' event and changes nothing before it. Monthly payments after a
     genuine re-enable earn again inside the next-six limit (the client's payment count runs on regardless).
     The FIRST payment received while not engaged earns its stamped 30/40/50 only if the seller CLOSED the
     sale while engaged: a payment link they generated for that lead (quick_close_events 'link_generated' /
     'link_reused', server-written and server-timed, signed-in roles cannot write it) at a moment they were
     engaged, before the payment. Otherwise 0%. Nothing earned is ever clawed back; the client stays
     attributed. Suspension is not an end.
   - EARNED the moment the payment is received (NOT held for the refund window).
   - DISPUTES (Paul, 2026-09-29): while a dispute / inquiry is OPEN the commission on that money is
     HELD (it comes off what is due, it is not a permanent reversal); WON, or an inquiry that closed with
     no money lost (Stripe 'warning_closed'), RELEASES it; LOST reverses it permanently.
   - A refund / lost chargeback REVERSES the commission on the money that went back (a partial refund
     reverses that share). If the commission was already paid out, the reversal is an OFFSET against
     future commission.
   - PAYOUT: the first working day of the month after the receipt's month (weekends and England &
     Wales bank holidays skipped).
   - PROJECTED is only what future payments WOULD earn — never added to earned.
   - Only a salesperson earns commission. A client sold by the admin earns £0.
   - 🔴 NOTHING AFTER THE CLIENT'S ENGAGEMENT IS OVER (pre-sales fix 03, 2026-10-04; E-16 / E-17): a
     recurring payment received at or after the client's service ended (service_terminated_at) earns 0%
     — a live subscription Paul has not yet cancelled is not a sale — and an ended or refunded client
     projects nothing more. A TEST lead's recurring payments earn 0% like its initial one (the initial
     is stamped test_excluded). Historic commission earned before the end is never touched.
   🔴 v3 COMMERCIAL TERMS (2026-10-05, the Sales Contractor Agreement v2 + Client Service Agreement v3),
   applied ONLY to a sale whose client is stamped COMMERCIAL_TERMS_V3 (client_service_terms) — every sale
   before that keeps exactly the rules above, so no historical commission moves:
   - INITIAL commission is PENDING until the client's Approval Date (the day after the 14-day Refund
     Window that follows the Results Date; or the six-week fallback when the guarantee ceased —
     clientTimeline.approvalDay), then APPROVED and paid on the 1st working day of the month after the
     Approval Date. A full refund inside the window CANCELS it; a partial refund reduces it in proportion;
     a refund after the Approval Date (late goodwill) does not change it (contractor 6.2, 6.4).
   - ITS PLACE IN THE MONTH (30/40/50) is the seller's London-month sale count, with refunded / excluded
     sales removed, re-worked for every sale NOT YET APPROVED and LOCKED at its Approval Date (contractor
     5.3) — derived as of that instant, never stored, so a later refund can never re-rate an approved sale.
   - TRAILING: 20% of the first COMMISSION_RECURRING_COUNT_V3 (five) £99 recurring payments actually
     collected, on Build AND Optimise; payment six onward 0%; the Continuing Service (FINDABLE_CONTINUING_GBP) 0%
     (contractor 5.4, 1.2(c)). Approved the moment each is collected.
   🔴 SALE ATTRIBUTION HOLD (F + H integration, 2026-10-05; src/lib/saleAttribution.ts, the database's
   public.sale_attribution_holds): the seller is the authorised CREATOR of the client's sign-up. When that is
   not clear the database stamps NO seller and opens an attribution review. This engine reads the review
   EXPLICITLY (input.attributionOf) — it does not rely on the missing seller alone:
   - OPEN or NOT CREDITED → no salesperson commission on ANY payment of that client, and the sale is not in
     anybody's 30/40/50 count (it cannot move a seller up the ladder while held).
   - CONFIRMED → the preserved seller follows the normal rules above, with the sale's ORIGINAL dates. It
     joins its month's count only FROM THE MOMENT IT WAS CONFIRMED: a sale whose place was already locked at
     its Approval Date before then keeps that place (never cascaded backwards). Anything it earns is owed no
     earlier than the month it was confirmed in, so it never lands in a payout month already paid.
   🔴 PLAN RULES (Paul, 2026-11-02, docs/commission-owed.md; every number in commissionConfig.ts). A sale whose ledger row is
   payout_rule 'plan_v1' (every sale recorded since) follows these, and every older sale keeps the rules above and its numbers:
   - FIRST PAYMENT: the STAMPED rate on the amount collected. PENDING until commission_payable_on, the date the database writes once
     the four-week results are sent (results + the client's refund window). NO BACKSTOP: no results, no date, still waiting. The six-week
     fallback above is not used.
   - ANY refund or lost chargeback earns nothing. Not yet paid: the line is cancelled. Already paid: an offset, due straight away against
     that person's next commission. The "late goodwill refund changes nothing" rule above does not apply.
   - TRAILING: COMMISSION_RECURRING_RATE of each of the next COMMISSION_RECURRING_COUNT monthly payments the plan actually has, whatever
     the amount (£49.99 on the 12-month plan earns too), payable on the 1st of the month after it is collected. Pay in full has none. A
     payment past the plan's own count is opt-in hosting and earns nothing.
   - PAID comes from commission_line_payments, line by line (input.paidByLine). The monthly commission_payouts still mark old sales paid.
   🔴 FIXED RULES (Paul, 2026-11-04, docs/commission-owed.md; every pound in commissionConfig.ts). A sale whose ledger row is payout_rule
   'fixed_v1' (every sale recorded since) follows these. No percentage touches it, and the older rules above stay only for rows already on them:
   - EACH of the customer's first payments (the plan's FIXED_COMMISSION count, the sign-up is number 1) earns the plan's fixed pounds, whatever
     the amount. Nothing after them. A failed payment is not a payment; one recovered later earns in its own place.
   - SALE 13+ of the UK month (the database's stamped place) adds BIG_MONTH_BONUS_GBP to its FIRST payment's line, paid with it and gone with it.
   - COLLECTED ON OR BEFORE THE WINDOW'S LAST DAY (commission_payable_on, or no date yet): pending until that day, "waiting" with no date until
     results are sent. COLLECTED AFTER: payable on the 1st of the next month.
   - A GUARANTEE CLAIM (commission_claim_at, or the first payment fully refunded or lost inside the window) means nothing on the sale is payable:
     every unpaid line is cancelled. A line already paid stays paid until the refund lands, which makes it an offset.
   - A salesperson who has left is still paid on these payments as they arrive. The first payment still has to be a sale they closed while engaged.
   Pure: ledger rows in, lines and totals out. Read by fn sales-earnings and fn sales-performance.
   The money facts come ONLY from payment_ledger (Stripe); never from a CRM status.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { isOptionBTerms, ukDayAtHourIso } from './clientTimeline.ts';
import { FINDABLE_MONTHLY_GBP } from './findableOffer.ts';
import { isAttributionHeld } from './saleAttribution.ts';
import { BIG_MONTH_BONUS_FROM_SALE, bigMonthBonusFor, commissionFixedRateForPlan, COMMISSION_INITIAL_RATE, COMMISSION_RECURRING_COUNT, COMMISSION_RECURRING_COUNT_V3, COMMISSION_RECURRING_RATE, BLANK_PLAN_COMMISSION, FIXED_COMMISSION, MONTHLY_TIERS, PAYOUT_RULE_FIXED_V1, isLinePaidRule } from './commissionConfig.ts';
import { PAYMENT_PLAN_SPEC, isPaymentPlan } from './paymentPlans.ts';
export { COMMISSION_INITIAL_RATE, COMMISSION_RECURRING_COUNT, COMMISSION_RECURRING_COUNT_V3, COMMISSION_RECURRING_RATE, MONTHLY_TIERS };

/** The rule name a v3 initial sale's derived place is shown under (never stamped in the database). */
export const MONTHLY_TIER_V3_RULE = 'monthly_tier_v3_as_of_approval';

/** The rule name the database stamps on a counted sale. */
export const MONTHLY_TIER_RULE = 'monthly_tier_v1';
/** The rule stamped on a test account's or test lead's sale: 0%, never a place in a month. */
export const TEST_EXCLUDED_RULE = 'test_excluded';

/** The initial rate for the Nth sale of a month (N from 1). */
export function monthlyTierRate(seq: number): number {
  return (MONTHLY_TIERS.find((t) => seq <= t.upTo) ?? MONTHLY_TIERS[MONTHLY_TIERS.length - 1]).rate;
}

/** The 1st (YYYY-MM-01) of the London month an instant falls in — the same month the database uses. */
export function londonMonthStart(iso: string): string {
  return `${londonDayOf(iso).slice(0, 7)}-01`;
}

/** "October 2026" for a YYYY-MM-01. */
export function monthName(monthStart: string): string {
  return new Date(`${monthStart.slice(0, 7)}-15T12:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** England & Wales bank holidays (gov.uk). ⚠️ Extend before 2028 — a missing year only means a payout
 *  date could land on a holiday; it is never a money figure. */
export const UK_BANK_HOLIDAYS: ReadonlySet<string> = new Set([
  '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28',
  '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03', '2027-05-31', '2027-08-30', '2027-12-27', '2027-12-28',
]);

export interface LedgerRow {
  id: string;
  lead_id: string | null;
  kind: 'initial' | 'recurring' | 'refund' | 'chargeback' | string;
  status: string;
  amount_gbp: number;
  occurred_at: string;
  stripe_object_id: string;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  stripe_invoice_id: string | null;
  sold_by_user_id: string | null;
  /** Stamped by the database on an initial payment (the tier rule). Absent = earned before any rule. */
  commission_rule?: string | null;
  commission_month_start?: string | null;
  commission_month_seq?: number | null;
  commission_rate?: number | string | null;
  /** Which rule set the sale is on, stamped once. Absent or 'legacy' = the old rules (never recalculated). */
  payout_rule?: string | null;
  /** The plan on Stripe's session (paymentPlans.ts ids). Blank = the v5 offer. */
  sale_plan?: string | null;
  sale_plan_flag?: string | null;
  /** plan_v1, fixed_v1: the day the guarantee window closes and waiting commission becomes payable. Written only by the database. */
  commission_payable_on?: string | null;
  /** fixed_v1: Paul recorded a guarantee claim on this sale (the claim is an email, so this is how the app knows before the refund lands). */
  commission_claim_at?: string | null;
}
export interface PayoutRow { user_id: string; period_month: string; amount_gbp: number; paid_at: string }

export type LineKind = 'payment' | 'reversal';
/** 'pending' = v3 initial commission waiting for the client's Approval Date (not owed yet, not in due);
 *  'cancelled' = v3 initial commission cancelled by a refund inside the Refund Window. */
export type LineStatus = 'due' | 'paid' | 'reversed' | 'not_commissionable' | 'pending' | 'cancelled';
export interface CommissionLine {
  id: string;
  leadId: string;
  sellerId: string | null;
  kind: LineKind;
  /** 1 = the initial payment, 2..7 = recurring month 1..6, 8+ = later (0% — shown for history only). */
  paymentNumber: number;
  label: string;
  clientAmount: number;
  rate: number;
  commission: number;
  occurredAt: string;
  /** YYYY-MM-01 of the receipt (or the reversal). */
  periodMonth: string;
  payoutDate: string;
  status: LineStatus;
  /** A dispute still open: the commission is held back, not permanently reversed. */
  held?: boolean;
  /** Initial payments on the monthly tiers: the 1st of their month and their place in it (stored). */
  monthStart?: string | null;
  monthSeq?: number | null;
  /** A test account's or test lead's sale: 0%, never counted. */
  testSale?: boolean;
  /** A monthly payment received after the seller's engagement ended: 0%, still listed. */
  afterEngagementEnded?: boolean;
  /** A monthly payment received after the CLIENT's service ended: 0%, still listed. */
  afterClientEnded?: boolean;
  /** v3 terms: the client's Approval Date (UK day) this line waits for / was approved on. */
  approvalDay?: string | null;
  /** v3 terms: a the Continuing Service price Continuing Service payment — never commissionable. */
  continuingService?: boolean;
  /** v3 terms: the place in the month is provisional until the Approval Date (contractor 5.3, 6.7). */
  provisional?: boolean;
  /** The sale is on the plan rules. */
  planRules?: boolean;
  /** A first payment with no payable date yet: the four-week results have not been sent. payoutDate is '' while so. */
  waitingForResults?: boolean;
  /** A reversal: the payment line it takes commission back from. */
  reversesLineId?: string;
  /** What has already been paid on this line (commission_line_payments). Only ever part of it after a refund grew. */
  paidAmount?: number;
  /** The sale is on the fixed rules: `commission` is pounds from the config, `rate` is 0 and means nothing. */
  fixedRules?: boolean;
  /** Fixed rules: how many of the customer's payments earn on this plan, and the pounds on each. */
  fixedCount?: number;
  fixedPerPayment?: number;
  /** Fixed rules: the big-month bonus inside `commission` on the first payment's line. */
  bonus?: number;
  /** Fixed rules: a guarantee claim stopped this sale. 'marked' = Paul recorded it, 'refunded' = the first payment went back inside the window. */
  claim?: 'marked' | 'refunded';
}

const round2 = (n: number) => Math.round(n * 100) / 100;
/** The commission on an amount: pence-exact, half up (£29.99 × 20% = £5.998 → £6.00). */
export const commissionOn = (amount: number, rate: number) => round2(amount * rate + 1e-9);

/** The first working day of the month AFTER the given day (YYYY-MM-DD in, YYYY-MM-DD out). */
export function payoutDateFor(dayIso: string): string {
  const [y, m] = dayIso.slice(0, 10).split('-').map(Number);
  const d = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1));
  for (;;) {
    const s = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6 && !UK_BANK_HOLIDAYS.has(s)) return s;
    d.setUTCDate(d.getUTCDate() + 1);
  }
}
/** The London calendar day of an instant (receipts are dated in UK time). */
export function londonDayOf(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}
const monthOf = (day: string) => `${day.slice(0, 7)}-01`;
/** The 1st of the month after a day: the plan rules' trailing date (a set date, not moved for a weekend). */
export function firstOfNextMonth(dayIso: string): string {
  const [y, m] = dayIso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1)).toISOString().slice(0, 10);
}

/** The next payout on or after today: the first working day of NEXT month, unless this month's first
 *  working day is still ahead. */
export function nextPayoutDate(todayIso: string): string {
  const [y, m] = todayIso.slice(0, 10).split('-').map(Number);
  const prevMonthDay = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}-15`;
  const thisMonths = payoutDateFor(prevMonthDay);
  return thisMonths >= todayIso.slice(0, 10) ? thisMonths : payoutDateFor(todayIso);
}

/** Stripe dispute statuses. RELEASED: the money stayed or came back. LOST: it is gone. Anything else
 *  (warning_needs_response, warning_under_review, needs_response, under_review, or a status we do not
 *  know) is still OPEN — held, never released on a guess. */
/* charge_refunded: Stripe closed the dispute because the charge was refunded. The refund row takes the commission back, once. */
export const DISPUTE_RELEASED: ReadonlySet<string> = new Set(['won', 'warning_closed', 'charge_refunded']);
export const DISPUTE_LOST: ReadonlySet<string> = new Set(['lost']);

export interface CommissionInput {
  ledger: LedgerRow[];
  payouts: PayoutRow[];
  /** Is this user a salesperson (the only role that earns)? */
  isCommissionable: (userId: string | null) => boolean;
  /** Fallback seller when a ledger row has no snapshot (the lead's sold_by_user_id). */
  sellerOfLead?: Map<string, string | null>;
  businessName?: Map<string, string>;
  /** The client's contracted payment count (outreach_leads.contract_total_payments: Build 12,
   *  Optimise 6; null = not recorded). Caps what a projection may count — never adds to it. */
  contractTotalOf?: Map<string, number | null>;
  /** Each seller's engagement history, oldest first. Absent / empty = engaged throughout. */
  engagement?: Map<string, EngagementEvent[]>;
  /** Per lead: the payment links generated for it (who, when) — the proof a sale was closed. */
  closings?: Map<string, SaleClosing[]>;
  /** Per lead: whether the client's engagement is over (outreach_leads.service_terminated_at; status
   *  refunded). Absent = open. Recurring payments at/after endedAt earn 0%; a closed client projects 0. */
  clientStateOf?: Map<string, { endedAt: string | null; refunded: boolean }>;
  /** Per lead: the v3 commercial terms and the client's Approval Date (clientTimeline.approvalDay; null
   *  while not known). Absent = the sale is on the terms before v3 and nothing here changes it. */
  termsOf?: Map<string, { terms: string | null; approvalDay: string | null }>;
  /** Per lead: WHEN the sale was excluded / disqualified (metric_exclusions: the lead, or its seller as a
   *  test account — created_at). v3 only (Paul, 2026-10-05): excluded BEFORE its Approval Date it is not a
   *  qualifying sale (earns nothing, does not count in its month's ladder); excluded AFTER, nothing that was
   *  approved changes. Pre-v3 sales keep the database's stamp exactly as it is. */
  exclusionsOf?: Map<string, string>;
  /** Per lead: its sale-attribution review, if it has one (public.sale_attribution_holds: review_status,
   *  resolved_at). Absent = no review = the stamped seller stands. 'open' / 'not_credited' (or a status
   *  nobody recognises) = HELD: no commission, not in any ladder. 'confirmed' = normal rules, joining the
   *  ladder at resolvedAt (see the header). */
  attributionOf?: Map<string, { status: string; resolvedAt: string | null }>;
  /** Line id → the total marked paid on it (live rows of commission_line_payments). */
  paidByLine?: ReadonlyMap<string, number>;
  /** "Now", for pending vs approved (defaults to the clock). */
  nowIso?: string;
}

/* ══ THE v3 LADDER — derived as of each sale's Approval Date (contractor 5.3) ═══════════════════════
   Every initial sale of a seller in a London month, in collection order. A sale "drops out" of the
   count from the moment it was fully refunded or lost to a chargeback, or always when it is a test sale
   (the same facts the database counts). A v3 sale's place = 1 + the earlier sales still in the count AT
   ITS APPROVAL INSTANT (or now, while pending) — so it is re-worked until approved and frozen after. */
/* joinedAt: a sale held for attribution review and then CONFIRMED is in the count only from its confirmation
   (null = always was). A sale still held has no seller here, so it is in nobody's count. */
interface LadderEntry { id: string; leadId: string; seller: string | null; month: string; at: string; droppedAt: string | null; joinedAt: string | null }
/** v3: was this sale excluded / disqualified BEFORE its commission was approved? `approvedAtIso` null =
 *  not approved yet (any exclusion counts). An exclusion recorded on or after approval changes nothing. */
function v3ExcludedBeforeApproval(excludedAt: string | null, approvedAtIso: string | null): boolean {
  if (!excludedAt) return false;
  return approvedAtIso === null || excludedAt < approvedAtIso;
}
function v3LadderPlace(entries: LadderEntry[], me: LadderEntry, asOfIso: string): number {
  let place = 1;
  for (const e of entries) {
    if (e.id === me.id) continue;
    if (e.seller !== me.seller || e.month !== me.month) continue;
    if (e.at.localeCompare(me.at) > 0 || (e.at === me.at && e.id.localeCompare(me.id) > 0)) continue;
    if (e.droppedAt !== null && e.droppedAt <= asOfIso) continue;
    if (e.joinedAt !== null && e.joinedAt > asOfIso) continue;
    place += 1;
  }
  return place;
}

export interface EngagementEvent { kind: 'ended' | 'resumed'; at: string }
export interface SaleClosing { actorUserId: string | null; at: string }

/** The end instant for an ended seller whose date was not recorded: fails closed (not engaged at any
 *  time). The app always writes the date with the status, so this is a guard, not a path. */
export const ENGAGEMENT_END_UNKNOWN = '1970-01-01T00:00:00.000Z';

/** Was the seller engaged at this instant? The newest event at or before it decides; none = engaged.
 *  ⛔ An unreadable instant or event time fails closed (not engaged). */
export function engagedAt(events: readonly EngagementEvent[] | null | undefined, iso: string): boolean {
  if (!events || events.length === 0) return true;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  let engaged = true;
  for (const e of events) {
    const at = Date.parse(e.at);
    if (!Number.isFinite(at)) return false;
    if (at <= t) engaged = e.kind !== 'ended';
  }
  return engaged;
}
/** Is the seller's engagement ended now (the newest event is an end)? */
export function engagementEndedNow(events: readonly EngagementEvent[] | null | undefined): boolean {
  return !!events && events.length > 0 && events[events.length - 1].kind === 'ended';
}
/** WHAT COUNTS AS "THE SELLER CLOSED THIS SALE" (the evidence closedWhileEngaged reads) — server-written quick_close_events only:
 *  · 'link_generated' / 'link_reused' — the Agreement & Payment link (phone close), and the sign-up row a client's own page
 *    creates from a Full Setup send (setup-link-creator);
 *  · 'link_shared' with data.variant 'setup' — the moment the salesperson SENT the Full Setup link. 🔴 FULL SETUP's other event is
 *    timed by the CLIENT's submit, which can fall after the seller's engagement ended; the send is the seller's own act, timed
 *    then. Any other 'link_shared' (a copy / email / WhatsApp of the agreement link) is not closing evidence on its own. */
export function isSaleClosingEvent(e: { kind?: unknown; data?: { variant?: unknown } | null } | null | undefined): boolean {
  if (!e) return false;
  if (e.kind === 'link_generated' || e.kind === 'link_reused') return true;
  return e.kind === 'link_shared' && e.data?.variant === 'setup';
}
/** Did this seller close this sale while engaged, before the payment? (A payment link they generated, or a Full Setup link they sent.) */
export function closedWhileEngaged(closings: readonly SaleClosing[] | null | undefined, seller: string, events: readonly EngagementEvent[] | null | undefined, paymentAt: string): boolean {
  const pay = Date.parse(paymentAt);
  return (closings ?? []).some((c) => c.actorUserId === seller && Date.parse(c.at) < pay && engagedAt(events, c.at));
}

export interface ClientEarnings {
  leadId: string;
  business: string;
  sellerId: string | null;
  payments: number;
  earned: number;
  reversed: number;
  /** Recurring payments still to come that would earn commission (0..COMMISSION_RECURRING_COUNT). */
  commissionablePaymentsLeft: number;
  /** Sold by a salesperson (earns commission) — false for the admin's own sales. */
  commissionable: boolean;
  /** The seller's engagement has ended: nothing more is earned or projected on this client. */
  engagementEnded?: boolean;
  /** The CLIENT's engagement is over (ended or refunded): nothing more is projected. */
  clientClosed?: boolean;
  /** Fixed rules: what each payment still to come earns. Absent = an old sale, worked out from its monthly amount. */
  fixedPerPayment?: number;
}

export function commissionLines(input: CommissionInput): { lines: CommissionLine[]; clients: ClientEarnings[] } {
  const paidMonths = new Set(input.payouts.map((p) => `${p.user_id}|${p.period_month.slice(0, 10)}`));
  const byLead = new Map<string, LedgerRow[]>();
  for (const r of input.ledger) { if (!r.lead_id) continue; const a = byLead.get(r.lead_id); if (a) a.push(r); else byLead.set(r.lead_id, [r]); }
  const lines: CommissionLine[] = [];
  const clients: ClientEarnings[] = [];
  const nowIso = input.nowIso ?? new Date().toISOString();
  const todayDay = londonDayOf(nowIso);
  /* The v3 ladder's inputs: every lead's first initial payment, and when (if ever) it dropped out. */
  const ladder: LadderEntry[] = [];
  for (const [leadId, rows0] of byLead) {
    const rows = [...rows0].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id.localeCompare(b.id));
    const init = rows.find((r) => r.kind === 'initial' && r.status === 'succeeded' && r.amount_gbp > 0);
    if (!init) continue;
    /* When the sale stopped being a qualifying sale: a test sale never was (stamped at insert); otherwise the
       EARLIEST of a full refund, a lost chargeback, or an exclusion recorded later (the time it became known —
       so a sale approved before that moment keeps the place it was approved at). */
    let dropped: string | null = init.commission_rule === TEST_EXCLUDED_RULE ? '0000' : null;
    const earliest = (at: string) => { if (dropped === null || at < dropped) dropped = at; };
    let refunded = 0;
    for (const r of rows) {
      const tied = (r.stripe_payment_intent_id && r.stripe_payment_intent_id === init.stripe_payment_intent_id) || (r.stripe_charge_id && r.stripe_charge_id === init.stripe_charge_id);
      if (!tied) continue;
      if (r.kind === 'refund') { refunded = Math.max(refunded, r.amount_gbp); if (refunded >= init.amount_gbp) earliest(r.occurred_at); }
      if (r.kind === 'chargeback' && DISPUTE_LOST.has(r.status)) earliest(r.occurred_at);
    }
    const excludedAt = input.exclusionsOf?.get(leadId);
    if (excludedAt) earliest(excludedAt);
    const att = input.attributionOf?.get(leadId) ?? null;
    const attHeld = !!att && isAttributionHeld(att.status);
    ladder.push({
      id: init.id, leadId, seller: attHeld ? null : init.sold_by_user_id ?? input.sellerOfLead?.get(leadId) ?? null,
      month: londonMonthStart(init.occurred_at), at: init.occurred_at, droppedAt: dropped,
      /* Confirmed with no recorded time: fails closed (counts for nobody's locked place before "now"). */
      joinedAt: att && !attHeld ? (att.resolvedAt ?? nowIso) : null,
    });
  }
  for (const [leadId, rows] of byLead) {
    const termsRow = input.termsOf?.get(leadId) ?? null;
    /* ⛔ The sale's own stamp decides, asked positively. Anything else keeps the rules it was recorded under. */
    const saleRow = [...rows].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id.localeCompare(b.id)).find((r) => r.kind === 'initial' && r.status === 'succeeded' && r.amount_gbp > 0) ?? null;
    const planRules = isLinePaidRule(saleRow?.payout_rule);
    const fixedRules = saleRow?.payout_rule === PAYOUT_RULE_FIXED_V1;
    /* A blank plan is the v5 offer (paymentPlans.ts), never "no limit". */
    const salePlanId = isPaymentPlan(saleRow?.sale_plan) ? saleRow.sale_plan : 'legacy_twelve';
    const planSpec = PAYMENT_PLAN_SPEC[salePlanId];
    const planMonthlyCount = Math.max(0, planSpec.totalPayments - 1);
    const fixed = isPaymentPlan(saleRow?.sale_plan) ? FIXED_COMMISSION[saleRow.sale_plan] : BLANK_PLAN_COMMISSION;
    const payableOn = planRules && saleRow?.commission_payable_on ? String(saleRow.commission_payable_on).slice(0, 10) : null;
    const payableNow = !!payableOn && todayDay >= payableOn;
    const paidOf = (lineId: string) => input.paidByLine?.get(lineId) ?? 0;
    const v3 = !planRules && !!termsRow && isOptionBTerms(termsRow.terms);
    const approvalDay = v3 ? termsRow!.approvalDay : null;
    /* The instant the initial commission is approved: 00:00 UK on the Approval Date. */
    const approvalIso = approvalDay ? ukDayAtHourIso(approvalDay, 0) : null;
    const approvedNow = !!approvalDay && todayDay >= approvalDay;
    /* Fixed rules: the sign-up payment is the first that earns, so the monthlies that earn are the rest of the plan's count. */
    const trailingCount = fixedRules ? Math.min(fixed.payments - 1, planMonthlyCount) : planRules ? Math.min(COMMISSION_RECURRING_COUNT, planMonthlyCount) : v3 ? COMMISSION_RECURRING_COUNT_V3 : COMMISSION_RECURRING_COUNT;
    rows.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id.localeCompare(b.id));
    const payments = rows.filter((r) => (r.kind === 'initial' || r.kind === 'recurring') && r.status === 'succeeded' && r.amount_gbp > 0);
    /* ⛔ THE ATTRIBUTION HOLD, read explicitly: a held sale has no seller for commission, whatever a row says. */
    const att = input.attributionOf?.get(leadId) ?? null;
    const attHeld = !!att && isAttributionHeld(att.status);
    const confirmedAt = att && !attHeld ? (att.resolvedAt ?? nowIso) : null;
    const confirmedDay = confirmedAt ? londonDayOf(confirmedAt) : null;
    /* A confirmed sale's money is owed no earlier than the day it was confirmed (never into a paid month). */
    const notBeforeConfirmed = (day: string) => (confirmedDay && confirmedDay > day ? confirmedDay : day);
    const seller = attHeld ? null : payments.find((p) => p.sold_by_user_id)?.sold_by_user_id ?? input.sellerOfLead?.get(leadId) ?? null;
    const earns = !attHeld && input.isCommissionable(seller);
    const events = seller ? input.engagement?.get(seller) ?? null : null;
    const business = input.businessName?.get(leadId) ?? 'Client';
    const rateOf = new Map<string, { rate: number; n: number; commission: number }>(); // payment row id → its rate, number and commission
    const clientState = input.clientStateOf?.get(leadId) ?? null;
    const clientEndMs = clientState?.endedAt ? Date.parse(clientState.endedAt) : NaN;
    /* A test lead: its initial payment is stamped test_excluded, and so are all of its monthlies. */
    const testLead = payments.some((p) => p.kind === 'initial' && p.commission_rule === TEST_EXCLUDED_RULE);
    /* 🔴 FIXED RULES: a guarantee claim. The app knows from Paul's mark, or from the first payment going back while the client could still claim. */
    let claim: 'marked' | 'refunded' | null = null;
    if (fixedRules && saleRow) {
      if (saleRow.commission_claim_at) claim = 'marked';
      else if (rows.some((r) => {
        const tied = (r.stripe_payment_intent_id && r.stripe_payment_intent_id === saleRow.stripe_payment_intent_id) || (r.stripe_charge_id && r.stripe_charge_id === saleRow.stripe_charge_id);
        const gone = (r.kind === 'refund' && r.amount_gbp >= saleRow.amount_gbp) || (r.kind === 'chargeback' && DISPUTE_LOST.has(r.status));
        return tied && gone && (!payableOn || londonDayOf(r.occurred_at) <= payableOn);
      })) claim = 'refunded';
    }
    /* Fixed rules: found to be a test before the window closed, the whole sale earns nothing. */
    const fixedExcluded = fixedRules && !testLead && v3ExcludedBeforeApproval(input.exclusionsOf?.get(leadId) ?? null, payableNow && payableOn ? ukDayAtHourIso(payableOn, 0) : null);
    let initialSeen = false; let recurringSeen = 0;
    for (const p of payments) {
      let n: number; let rate: number; let label: string;
      let monthStart: string | null = null; let monthSeq: number | null = null; let testSale = false; let afterEnd = false; let afterClientEnd = false;
      /* Fixed rules: the pounds on this line (a line past the plan's count has none), and the bonus inside them. */
      let fixedPounds: number | null = null; let bonus = 0; let pastCount = false;
      if (fixedRules && p.kind === 'initial' && !initialSeen) {
        initialSeen = true; n = 1; rate = 0;
        testSale = p.commission_rule === TEST_EXCLUDED_RULE;
        monthSeq = p.commission_rule === MONTHLY_TIER_RULE && typeof p.commission_month_seq === 'number' ? p.commission_month_seq : null;
        monthStart = p.commission_month_start ? String(p.commission_month_start).slice(0, 10) : null;
        if (fixedExcluded) monthSeq = null;
        const closedOk = !earns || testSale || !seller || engagedAt(events, p.occurred_at) || closedWhileEngaged(input.closings?.get(leadId), seller, events, p.occurred_at);
        if (!closedOk) afterEnd = true;
        bonus = testSale || fixedExcluded || afterEnd ? 0 : bigMonthBonusFor(monthSeq);
        fixedPounds = testSale || fixedExcluded || afterEnd ? 0 : fixed.perPayment + bonus;
        label = testSale ? 'First payment · test sale (not counted)' : fixedExcluded ? 'First payment · not a qualifying sale' : afterEnd ? 'First payment · after the engagement ended, not closed before it' : monthSeq && monthStart ? `First payment · sale ${monthSeq} of ${monthName(monthStart)}` : 'First payment';
        if (attHeld) label += att!.status === 'not_credited' ? ' · not credited to a salesperson (attribution review)' : ' · held: attribution review open';
        else if (confirmedDay) label += ` · seller confirmed after review ${confirmedDay}`;
      }
      else if (fixedRules && p.kind === 'recurring' && recurringSeen >= planMonthlyCount) {
        n = 1 + recurringSeen + 1; rate = 0; fixedPounds = 0; pastCount = true; label = 'Hosting, after the plan · no commission';
      }
      else if (fixedRules && p.kind === 'recurring') {
        recurringSeen += 1; n = 1 + recurringSeen; rate = 0;
        /* ⛔ Received at or after the CLIENT's service ended: nothing, permanently (an unreadable time fails closed). The seller leaving changes nothing. */
        afterClientEnd = !!clientState?.endedAt && (!Number.isFinite(clientEndMs) || !(Date.parse(p.occurred_at) < clientEndMs));
        testSale = testLead;
        pastCount = recurringSeen > trailingCount;
        fixedPounds = pastCount || afterClientEnd || testSale || fixedExcluded ? 0 : fixed.perPayment;
        label = afterClientEnd ? `Payment ${n} · after the client's service ended` : testSale ? `Payment ${n} · test sale (not counted)` : pastCount ? `Payment ${n} · no commission` : `Payment ${n} of ${fixed.payments}`;
      }
      else if (p.kind === 'initial' && !initialSeen) {
        initialSeen = true; n = 1;
        /* ⛔ THE STORED RATE, never recomputed here: what the sale earned when it landed. */
        const stamped = p.commission_rate === null || p.commission_rate === undefined || p.commission_rate === '' ? NaN : Number(p.commission_rate);
        rate = Number.isFinite(stamped) ? stamped : COMMISSION_INITIAL_RATE;
        testSale = p.commission_rule === TEST_EXCLUDED_RULE;
        if (testSale) rate = 0;
        monthSeq = p.commission_rule === MONTHLY_TIER_RULE && typeof p.commission_month_seq === 'number' ? p.commission_month_seq : null;
        monthStart = p.commission_month_start ? String(p.commission_month_start).slice(0, 10) : null;
        /* 🔴 v3: the place is re-worked (refunds and exclusions removed) until the Approval Date, then frozen. */
        const v3Excluded = v3 && !testSale && v3ExcludedBeforeApproval(input.exclusionsOf?.get(leadId) ?? null, approvedNow ? approvalIso : null);
        if (v3 && !testSale && !v3Excluded) {
          const me = ladder.find((e) => e.id === p.id);
          if (me) {
            monthSeq = v3LadderPlace(ladder, me, approvedNow && approvalIso ? approvalIso : nowIso);
            monthStart = me.month;
            rate = monthlyTierRate(monthSeq);
          }
        }
        if (v3Excluded) { rate = 0; monthSeq = null; }
        /* A plan with its own fixed rate (Complete paid up front): the place stands and still counts in the month, only this sale's rate differs. */
        const fixedRate = commissionFixedRateForPlan(p.sale_plan);
        if (fixedRate !== null && !testSale && !v3Excluded) rate = fixedRate;
        /* Plan rules: the stamped place and rate stand. A sale found to be a test before it became payable earns nothing. */
        const planExcluded = planRules && !testSale && v3ExcludedBeforeApproval(input.exclusionsOf?.get(leadId) ?? null, payableNow && payableOn ? ukDayAtHourIso(payableOn, 0) : null);
        if (planExcluded) { rate = 0; monthSeq = null; }
        label = testSale ? 'Initial payment · test sale (not counted)' : v3Excluded ? 'Initial payment · excluded before approval (not a qualifying sale)' : monthSeq && monthStart ? `Initial payment · sale ${monthSeq} of ${monthName(monthStart)}` : 'Initial payment';
        if (planRules && !testSale && !planExcluded) label += payableOn ? ` · payable ${payableOn}` : ' · waiting for four-week audit';
        if (planExcluded) label += ' · not a qualifying sale';
        if (v3 && !testSale && !v3Excluded) label += approvedNow ? ` · approved ${approvalDay}` : approvalDay ? ` · pending until ${approvalDay}` : ' · pending until the Approval Date';
        if (attHeld) label += att!.status === 'not_credited' ? ' · not credited to a salesperson (attribution review)' : ' · held: attribution review open';
        else if (confirmedDay) label += ` · seller confirmed after review ${confirmedDay}`;
        /* Received while the seller was not engaged: earns only if they closed it while engaged. */
        if (earns && !testSale && seller && !engagedAt(events, p.occurred_at)) {
          if (closedWhileEngaged(input.closings?.get(leadId), seller, events, p.occurred_at)) label += ' · closed before the engagement ended';
          else { afterEnd = true; rate = 0; label += ' · after the engagement ended, not closed before it'; }
        }
      }
      else if (p.kind === 'recurring' && planRules && recurringSeen >= planMonthlyCount) {
        /* Past the plan's own count (every monthly on Pay in full): opt-in hosting, never commissionable. */
        n = 1 + recurringSeen + 1; rate = 0; label = 'Hosting, after the plan · no commission';
      }
      else if (p.kind === 'recurring' && v3 && p.amount_gbp < FINDABLE_MONTHLY_GBP - 0.005) {
        /* 🔴 v3: a payment below the £99 monthly is the Continuing Service (FINDABLE_CONTINUING_GBP) (clause 9A) — never
           commissionable (contractor 1.2(c)) and not one of the five trailing payments. */
        n = 1 + recurringSeen + 1; rate = 0; label = 'Continuing Service · no commission';
      }
      else if (p.kind === 'recurring') {
        recurringSeen += 1; n = 1 + recurringSeen;
        /* It still takes its place in the count (month 4 is month 4 whoever it pays). */
        afterEnd = earns && recurringSeen <= trailingCount && !engagedAt(events, p.occurred_at);
        /* ⛔ Received at or after the CLIENT's service ended: 0%, permanently (an unreadable time fails closed). */
        afterClientEnd = !!clientState?.endedAt && (!Number.isFinite(clientEndMs) || !(Date.parse(p.occurred_at) < clientEndMs));
        testSale = testLead;
        rate = recurringSeen <= trailingCount && !afterEnd && !afterClientEnd && !testSale ? COMMISSION_RECURRING_RATE : 0;
        label = afterClientEnd ? `Month ${recurringSeen} · after the client's service ended`
          : testSale ? `Month ${recurringSeen} · test sale (not counted)`
          : afterEnd ? `Month ${recurringSeen} · after the engagement ended` : `Month ${recurringSeen}`;
      }
      else { n = 1; rate = 0; label = 'Additional one-off payment'; }
      if (!earns) { rate = 0; if (fixedPounds !== null) { fixedPounds = 0; bonus = 0; } }
      const lineCommission = fixedPounds ?? commissionOn(p.amount_gbp, rate);
      rateOf.set(p.id, { rate, n, commission: lineCommission });
      const continuing = (v3 && p.kind === 'recurring' && p.amount_gbp < FINDABLE_MONTHLY_GBP - 0.005)
        || (planRules && p.kind === 'recurring' && rate === 0 && label.startsWith('Hosting'))
        || (fixedRules && pastCount);
      const v3Initial = v3 && n === 1 && p.kind === 'initial' && !testSale;
      /* Waits for the guarantee window. Plan rules: the first payment. Fixed rules: any payment collected on or before the window's last day. */
      const planInitial = fixedRules ? !testSale && (!payableOn || londonDayOf(p.occurred_at) <= payableOn) : planRules && n === 1 && p.kind === 'initial' && !testSale;
      const planExcludedNow = fixedRules ? fixedExcluded : planInitial && v3ExcludedBeforeApproval(input.exclusionsOf?.get(leadId) ?? null, payableNow && payableOn ? ukDayAtHourIso(payableOn, 0) : null);
      /* v3 initial: owed in the month of its Approval Date, paid on the first working day after it. */
      const day = notBeforeConfirmed(v3Initial && approvalDay ? approvalDay : planInitial && payableOn ? payableOn : londonDayOf(p.occurred_at));
      const pm = monthOf(day);
      const lineId = `pay:${p.id}`;
      /* Plan rules are paid line by line only. An old sale can also be marked paid by the month's payout. */
      const paidLine = paidOf(lineId) !== 0 || (!planRules && paidMonths.has(`${seller}|${pm}`));
      const baseStatus: LineStatus = !earns || afterEnd || afterClientEnd || continuing || (testSale && p.kind === 'recurring') ? 'not_commissionable' : paidLine ? 'paid' : 'due';
      lines.push({
        id: lineId, leadId, sellerId: seller, kind: 'payment', paymentNumber: n, label, clientAmount: round2(p.amount_gbp), rate,
        commission: lineCommission, occurredAt: p.occurred_at, periodMonth: pm,
        payoutDate: planInitial ? (payableOn ? notBeforeConfirmed(payableOn) : '') : planRules ? firstOfNextMonth(day) : payoutDateFor(day),
        status: (v3Initial && v3ExcludedBeforeApproval(input.exclusionsOf?.get(leadId) ?? null, approvedNow ? approvalIso : null)) || planExcludedNow ? 'cancelled'
          : (v3Initial && baseStatus === 'due' && !approvedNow) || (planInitial && baseStatus === 'due' && !payableNow) ? 'pending' : baseStatus,
        ...(paidOf(lineId) !== 0 ? { paidAmount: round2(paidOf(lineId)) } : {}),
        ...(planRules ? { planRules: true } : {}),
        ...(fixedRules ? { fixedRules: true, fixedCount: fixed.payments, fixedPerPayment: fixed.perPayment } : {}),
        ...(bonus > 0 ? { bonus } : {}),
        ...(claim ? { claim } : {}),
        ...(planInitial && !payableOn ? { waitingForResults: true } : {}),
        ...(planInitial ? { approvalDay: payableOn } : {}),
        ...(v3Initial ? { approvalDay, provisional: !approvedNow } : {}),
        ...(continuing ? { continuingService: true } : {}),
        ...(monthSeq ? { monthStart, monthSeq } : {}),
        ...(testSale ? { testSale: true } : {}),
        ...(afterEnd ? { afterEngagementEnded: true } : {}),
        ...(afterClientEnd ? { afterClientEnded: true } : {}),
      });
    }
    // Reversals: a refunded charge or a lost/open chargeback takes back the commission on that money.
    const paymentFor = (r: LedgerRow) => payments.find((p) =>
      (r.stripe_payment_intent_id && p.stripe_payment_intent_id === r.stripe_payment_intent_id)
      || (r.stripe_charge_id && p.stripe_charge_id === r.stripe_charge_id)
      || (r.stripe_invoice_id && p.stripe_invoice_id === r.stripe_invoice_id));
    let reversedTotal = 0;
    for (const r of rows) {
      if (r.kind !== 'refund' && r.kind !== 'chargeback') continue;
      if (r.kind === 'chargeback' && DISPUTE_RELEASED.has(r.status)) continue; // won / inquiry closed: released, nothing taken
      if (r.kind === 'refund' && r.amount_gbp <= 0) continue; // the daily check found the refund failed: nothing left to take back
      const held = r.kind === 'chargeback' && !DISPUTE_LOST.has(r.status); // still open: held, not reversed
      const p = paymentFor(r);
      if (!p) continue; // a refund we cannot tie to a payment reverses nothing we counted
      const pr = rateOf.get(p.id)!;
      const back = Math.min(r.amount_gbp, p.amount_gbp);
      /* 🔴 PLAN RULES: a refund or lost chargeback earns nothing at any time. Not paid yet → it comes off that same payment and
         a full one cancels it. Already paid → an offset, due from the day it happened. An open dispute is only held. */
      if (planRules) {
        const payLine = lines.find((l) => l.id === `pay:${p.id}`);
        /* Fixed rules: the same share of the line's pounds as the share of the payment that went back. */
        const amount = fixedRules ? round2(pr.commission * Math.min(1, back / p.amount_gbp) + 1e-9) : commissionOn(back, pr.rate);
        const revId = `rev:${r.id}`;
        const revDay = notBeforeConfirmed(londonDayOf(r.occurred_at));
        const payPaid = payLine?.status === 'paid';
        const revPaid = paidOf(revId);
        const settled = revPaid !== 0 && Math.abs(revPaid + amount) < 0.005;
        const full = !held && back >= p.amount_gbp;
        if (!held) reversedTotal += amount;
        lines.push({
          id: revId, leadId, sellerId: seller, kind: 'reversal', paymentNumber: pr.n, planRules: true, reversesLineId: `pay:${p.id}`,
          label: r.kind === 'refund' ? (full ? 'Refunded' : 'Partly refunded') : held ? 'Held — dispute open' : 'Chargeback',
          clientAmount: round2(back), rate: pr.rate, commission: -amount, occurredAt: r.occurred_at, periodMonth: monthOf(revDay),
          payoutDate: payPaid || !payLine ? revDay : payLine.payoutDate,
          status: !earns || payLine?.status === 'not_commissionable' ? 'not_commissionable' : settled ? 'paid' : (full && !payPaid) || payLine?.status === 'cancelled' ? 'cancelled' : payLine?.status === 'pending' ? 'pending' : 'due',
          ...(revPaid !== 0 ? { paidAmount: round2(revPaid) } : {}),
          ...(held ? { held: true } : {}),
        });
        if (full && payLine && !payPaid && payLine.status !== 'not_commissionable') { payLine.status = 'cancelled'; delete payLine.waitingForResults; }
        continue;
      }
      const v3Init = v3 && pr.n === 1 && p.kind === 'initial';
      /* 🔴 v3 (contractor 6.2 / 6.4): a refund ON or AFTER the Approval Date is a late goodwill refund and
         does not change Approved commission — listed, taking nothing back. */
      if (v3Init && approvalIso && r.kind === 'refund' && r.occurred_at >= approvalIso) {
        lines.push({
          id: `rev:${r.id}`, leadId, sellerId: seller, kind: 'reversal', paymentNumber: pr.n, label: 'Refunded after the Approval Date — commission unchanged',
          clientAmount: round2(back), rate: pr.rate, commission: 0, occurredAt: r.occurred_at, periodMonth: monthOf(londonDayOf(r.occurred_at)), payoutDate: payoutDateFor(londonDayOf(r.occurred_at)),
          status: 'not_commissionable',
        });
        continue;
      }
      const amount = commissionOn(back, pr.rate);
      /* v3: a refund inside the window comes off the commission in the Approval month (it was never owed earlier). */
      const day = notBeforeConfirmed(v3Init && approvalDay ? approvalDay : londonDayOf(r.occurred_at));
      const pm = monthOf(day);
      if (!held) reversedTotal += amount;
      lines.push({
        id: `rev:${r.id}`, leadId, sellerId: seller, kind: 'reversal', paymentNumber: pr.n,
        label: r.kind === 'refund' ? (back >= p.amount_gbp ? 'Refunded' : 'Partly refunded') : held ? 'Held — dispute open' : 'Chargeback',
        clientAmount: round2(back), rate: pr.rate, commission: -amount, occurredAt: r.occurred_at, periodMonth: pm, payoutDate: payoutDateFor(day),
        reversesLineId: `pay:${p.id}`,
        ...(paidOf(`rev:${r.id}`) !== 0 ? { paidAmount: round2(paidOf(`rev:${r.id}`)) } : {}),
        status: !earns ? 'not_commissionable' : v3Init && !approvedNow ? 'pending' : paidMonths.has(`${seller}|${pm}`) || (paidOf(`rev:${r.id}`) !== 0 && Math.abs(paidOf(`rev:${r.id}`) + amount) < 0.005) ? 'paid' : 'due',
        ...(held ? { held: true } : {}),
      });
      // The payment line reads Reversed once fully taken back (never for a hold — that may be released).
      const payLine = lines.find((l) => l.id === `pay:${p.id}`);
      if (!held && payLine && back >= p.amount_gbp && payLine.status === 'due') payLine.status = 'reversed';
      /* v3: fully refunded inside the window → the pending commission is CANCELLED, and so is its reversal
         (nothing was ever owed, so nothing is offset). */
      if (!held && payLine && payLine.status !== 'paid' && back >= p.amount_gbp && v3Init && r.kind === 'refund' && (!approvalIso || r.occurred_at < approvalIso)) {
        payLine.status = 'cancelled';
        const revLine = lines[lines.length - 1];
        if (revLine.id === `rev:${r.id}`) revLine.status = 'cancelled';
      }
    }
    /* 🔴 FIXED RULES: a claim leaves nothing payable on the sale. A line already paid stays paid until its refund lands (the reversal above makes the offset). */
    if (claim) for (const l of lines) {
      if (l.leadId !== leadId || l.status === 'paid' || l.status === 'not_commissionable') continue;
      if (l.kind === 'reversal' && l.reversesLineId && lines.find((x) => x.id === l.reversesLineId)?.status === 'paid') continue;
      l.status = 'cancelled'; delete l.waitingForResults;
    }
    const earned = lines.filter((l) => l.leadId === leadId && l.kind === 'payment').reduce((s, l) => s + l.commission, 0);
    /* ⛔ NEVER PROJECT PAST THE CONTRACT (2026-09-29). The commission rule is unchanged (the next
       COMMISSION_RECURRING_COUNT recurring payments); what changed is that a client's contract can be
       shorter, so the recurring payments still to come are also capped by it where it is known. */
    const contractTotal = input.contractTotalOf?.get(leadId) ?? null;
    const contractRecurringLeft = typeof contractTotal === 'number' && contractTotal > 0 ? Math.max(0, contractTotal - 1 - recurringSeen) : Infinity;
    /* Ended NOW: every payment still to come lands while not engaged, so none is projected. */
    /* Fixed rules: a salesperson who has left is still paid as the payments arrive, so ending projects nothing away. */
    const ended = !fixedRules && engagementEndedNow(events);
    /* The CLIENT closed (ended / refunded) or a test lead: no future revenue is expected from it. */
    const clientClosed = !!clientState && (!!clientState.endedAt || clientState.refunded);
    clients.push({
      leadId, business, sellerId: seller, payments: payments.length, earned: round2(earned), reversed: round2(reversedTotal),
      commissionablePaymentsLeft: earns && !ended && !clientClosed && !testLead && !claim && !fixedExcluded ? Math.max(0, Math.min(trailingCount - Math.min(recurringSeen, trailingCount), contractRecurringLeft)) : 0,
      commissionable: earns,
      ...(fixedRules ? { fixedPerPayment: fixed.perPayment } : {}),
      ...(ended ? { engagementEnded: true } : {}),
      ...(clientClosed ? { clientClosed: true } : {}),
    });
  }
  lines.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return { lines, clients };
}

export interface EarningsTotals {
  /** Net commission earned (payments minus reversals), all time. Projected is never in here. */
  earned: number;
  /** Earned since the first of this month (London). */
  earnedThisMonth: number;
  earnedToday: number;
  reversed: number;
  /** Commission held back by disputes still open (included in due / offset, NOT in reversed). */
  held: number;
  /** v3: initial commission waiting for its Approval Date — never in earned, due or offset. */
  pending: number;
  paidOut: number;
  /** Owed at the next payout: every unpaid line, net. Never negative — see offset. */
  due: number;
  /** A net negative (a reversal after its commission was paid out), taken from future commission. */
  offset: number;
  nextPayoutDate: string;
  projected: number;
}

/** fixedPerPayment: a fixed-rules sale's pounds per payment. Absent = an old sale, worked out from its monthly amount. */
export interface ProjectionInput { leadId: string; paymentsLeft: number; monthlyGbp: number | null; active: boolean; fixedPerPayment?: number }

export function earningsTotals(lines: CommissionLine[], payouts: PayoutRow[], projections: ProjectionInput[], todayIso: string): EarningsTotals {
  const today = todayIso.slice(0, 10);
  const month = `${today.slice(0, 7)}-01`;
  const counted = lines.filter((l) => l.status !== 'not_commissionable' && l.status !== 'pending' && l.status !== 'cancelled');
  const sum = (ls: CommissionLine[]) => round2(ls.reduce((s, l) => s + l.commission, 0));
  /* A line part-settled by an earlier offset owes only what is left. */
  const unpaid = round2(counted.filter((l) => l.status !== 'paid').reduce((s, l) => s + l.commission - (l.paidAmount ?? 0), 0));
  return {
    earned: sum(counted),
    earnedThisMonth: sum(counted.filter((l) => l.periodMonth === month)),
    earnedToday: sum(counted.filter((l) => londonDayOf(l.occurredAt) === today)),
    reversed: round2(-sum(counted.filter((l) => l.kind === 'reversal' && !l.held))),
    held: round2(-sum(counted.filter((l) => l.held))),
    pending: sum(lines.filter((l) => l.status === 'pending')),
    paidOut: round2(payouts.reduce((s, p) => s + Number(p.amount_gbp), 0)),
    due: Math.max(0, unpaid),
    offset: Math.min(0, unpaid),
    nextPayoutDate: nextPayoutDate(today),
    projected: round2(projections.filter((p) => p.active && p.monthlyGbp && p.paymentsLeft > 0)
      .reduce((s, p) => s + p.paymentsLeft * (p.fixedPerPayment ?? commissionOn(p.monthlyGbp!, COMMISSION_RECURRING_RATE)), 0)),
  };
}

/* ══ THE MONTHLY LADDER (Paul, 2026-10-01) ═════════════════════════════════════════════════════════
   One salesperson's London calendar month, from the SAME lines the payments table lists — so the
   ladder and the ledger cannot disagree. A sale = an initial payment stamped with a place this month.
   "Counted" = it still counts towards the next sale's place (not fully refunded, not lost to a
   chargeback — exactly what the database counts). Every sale keeps its own stamped rate either way. */
export interface LadderSale {
  leadId: string;
  /** Its stamped place in the month. */
  seq: number;
  occurredAt: string;
  /** Commission on the initial payment, net of any reversal of it. */
  commission: number;
  /** False once fully refunded / lost to a chargeback: no longer lifts the next sale. */
  counted: boolean;
  /** v3: the place and rate are provisional until the Approval Date (contractor 5.3, 6.7). */
  provisional?: boolean;
}
export interface MonthlyTracker {
  monthStart: string;
  /** Every stamped sale this month, in place order. */
  sales: LadderSale[];
  /** Sales that count (what the next sale's place is built on). */
  counted: number;
  /** Initial-payment commission this month, net of reversals of those payments. */
  earned: number;
  /** The number the NEXT sale this month will take. */
  nextSaleNumber: number;
  /** Does the next sale earn the big-month bonus? */
  bonusOn: boolean;
  /** Sales still to make before the bonus is on (0 once it is). */
  salesToBonus: number;
}

export function monthlyTracker(lines: CommissionLine[], todayIso: string): MonthlyTracker {
  const monthStart = londonMonthStart(todayIso);
  const initials = lines.filter((l) => l.kind === 'payment' && l.paymentNumber === 1 && l.monthStart === monthStart && l.monthSeq && !l.testSale && !l.afterEngagementEnded);
  const sales: LadderSale[] = initials.map((l) => {
    const revs = lines.filter((r) => r.kind === 'reversal' && r.paymentNumber === 1 && r.leadId === l.leadId && !r.held);
    const back = revs.reduce((s, r) => s + r.commission, 0);
    /* The database's rule (commission_sale_stuck): fully refunded or lost to a chargeback = no longer counted. */
    const gone = revs.some((r) => r.clientAmount >= l.clientAmount);
    /* A claim Paul marked pays nothing, but the database counts the sale until its refund lands, so the next number here must too. */
    return { leadId: l.leadId, seq: l.monthSeq!, occurredAt: l.occurredAt, commission: l.status === 'cancelled' ? 0 : round2(l.commission + back), counted: !gone && (l.status !== 'cancelled' || l.claim === 'marked'), ...(l.provisional ? { provisional: true } : {}) };
  }).sort((a, b) => a.seq - b.seq || a.occurredAt.localeCompare(b.occurredAt));
  const counted = sales.filter((s) => s.counted).length;
  const nextSaleNumber = counted + 1;
  const bonusOn = nextSaleNumber >= BIG_MONTH_BONUS_FROM_SALE;
  return {
    monthStart, sales, counted,
    earned: round2(sales.reduce((s, x) => s + x.commission, 0)),
    nextSaleNumber, bonusOn,
    salesToBonus: bonusOn ? 0 : BIG_MONTH_BONUS_FROM_SALE - nextSaleNumber,
  };
}

/** The month card's one line of words: "3 more sales, then every sale earns +£25" → "Every sale this month earns +£25". */
export function monthlyTrackerNextLine(t: MonthlyTracker): string {
  const bonus = `+£${bigMonthBonusFor(BIG_MONTH_BONUS_FROM_SALE)}`;
  if (t.bonusOn) return `Every sale this month earns ${bonus}`;
  return `${t.salesToBonus} more sale${t.salesToBonus === 1 ? '' : 's'}, then every sale earns ${bonus}`;
}
/* ══ THE NEXT SIX MONTHS (Paul, 2026-10-02) ═════════════════════════════════════════════════════════
   Commission from clients ALREADY sold, by London calendar month: this month and the next five.
   ⛔ Never a sale that has not happened, never a target, never a growth guess.
   - EARNED (collected): what the payments table already holds for the month — first-payment and monthly
     commission, net of refunds and chargebacks. The SAME lines, so the two can never disagree.
   - EXPECTED: each live subscription's remaining commission-earning monthly payments
     (commissionablePaymentsLeft: the next-six rule, capped by the contract, 0 once the seller's
     engagement has ended), dated from Stripe's next billing date and a month apart, at 20% of the
     client's monthly amount. A billing date already passed with no payment is NOT expected (it would be
     in the ledger had it been collected); a subscription that is not active or trialing (past due,
     cancelled) expects nothing. So a failed or refunded payment drops out by itself.
   Expected is never added to earned. */
export interface ForecastClient { leadId: string; business: string; nextPaymentAt: string | null; paymentsLeft: number; monthlyGbp: number | null; live: boolean; fixedPerPayment?: number }
/** kind 'reversal' = a refund or chargeback taken back this month (a negative amount, net in the month's figures). */
export interface ForecastItem { leadId: string; business: string; amount: number; at: string | null; kind: 'new_sale' | 'recurring' | 'reversal'; state: 'earned' | 'expected' }
export interface ForecastMonth { monthStart: string; earnedNewSale: number; earnedRecurring: number; expected: number; total: number; items: ForecastItem[] }
export interface CommissionForecast {
  months: ForecastMonth[];
  /** Expected (not yet collected) across the visible months. */
  expectedTotal: number;
  /** Everything in the visible months: earned so far + all expected. Equals the sum of the months. */
  periodTotal: number;
  /** Expected payments whose date Stripe has not set yet — counted in no month, listed so nothing is hidden. */
  undated: ForecastItem[];
}

const addMonths = (monthStart: string, n: number) => {
  const [y, m] = monthStart.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
};
/** The same day of the month, n months on (clamped to the month's last day), keeping the time. */
const monthsAfter = (iso: string, n: number) => {
  const d = new Date(iso);
  const day = d.getUTCDate();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return t.toISOString();
};

export const FORECAST_MONTHS = 6;

export function commissionForecast(lines: CommissionLine[], clients: ForecastClient[], todayIso: string, monthCount = FORECAST_MONTHS): CommissionForecast {
  const first = londonMonthStart(todayIso);
  const pendingUndated: ForecastItem[] = [];
  const months: ForecastMonth[] = Array.from({ length: monthCount }, (_, i) => ({ monthStart: addMonths(first, i), earnedNewSale: 0, earnedRecurring: 0, expected: 0, total: 0, items: [] }));
  const at = (ms: string) => months.find((m) => m.monthStart === ms);
  const businessOf = new Map(clients.map((c) => [c.leadId, c.business]));
  // Earned: the month's own lines (later months have none yet).
  for (const l of lines) {
    if (l.status === 'not_commissionable' || l.status === 'cancelled' || l.commission === 0) continue;
    if (l.status === 'pending') {
      /* v3: not earned until the Approval Date — shown as expected in that month, or undated. */
      const pm = l.approvalDay ? londonMonthStart(`${l.approvalDay}T12:00:00Z`) : null;
      const mm = pm ? at(pm) : null;
      const item: ForecastItem = { leadId: l.leadId, business: businessOf.get(l.leadId) ?? 'Client', amount: l.commission, at: l.approvalDay ? `${l.approvalDay}T12:00:00Z` : null, kind: l.kind === 'reversal' ? 'reversal' : 'new_sale', state: 'expected' };
      if (mm) { mm.expected += l.commission; mm.items.push(item); } else if (!pm) pendingUndated.push(item);
      continue;
    }
    const m = at(l.periodMonth); if (!m) continue;
    // Net: a reversal comes off the bucket of the payment it reverses, and is listed as itself.
    if (l.paymentNumber === 1) m.earnedNewSale += l.commission; else m.earnedRecurring += l.commission;
    const kind: ForecastItem['kind'] = l.kind === 'reversal' ? 'reversal' : l.paymentNumber === 1 ? 'new_sale' : 'recurring';
    m.items.push({ leadId: l.leadId, business: businessOf.get(l.leadId) ?? 'Client', amount: l.commission, at: l.occurredAt, kind, state: 'earned' });
  }
  // Expected: live subscriptions' remaining commission-earning payments.
  const undated: ForecastItem[] = [...pendingUndated];
  const now = Date.parse(todayIso);
  for (const c of clients) {
    if (!c.live || c.paymentsLeft <= 0 || !c.monthlyGbp || c.monthlyGbp <= 0) continue;
    const amount = c.fixedPerPayment ?? commissionOn(c.monthlyGbp, COMMISSION_RECURRING_RATE);
    if (!c.nextPaymentAt || !Number.isFinite(Date.parse(c.nextPaymentAt))) {
      undated.push({ leadId: c.leadId, business: c.business, amount: round2(amount * c.paymentsLeft), at: null, kind: 'recurring', state: 'expected' });
      continue;
    }
    for (let k = 0; k < c.paymentsLeft; k++) {
      const when = monthsAfter(c.nextPaymentAt, k);
      if (Date.parse(when) < now) continue; // passed with no payment: not expected
      const m = at(londonMonthStart(when)); if (!m) continue;
      m.expected += amount;
      m.items.push({ leadId: c.leadId, business: c.business, amount, at: when, kind: 'recurring', state: 'expected' });
    }
  }
  for (const m of months) {
    m.earnedNewSale = round2(m.earnedNewSale); m.earnedRecurring = round2(m.earnedRecurring); m.expected = round2(m.expected);
    m.total = round2(m.earnedNewSale + m.earnedRecurring + m.expected);
    // Collected first, then expected; each by date.
    m.items.sort((a, b) => (a.state === b.state ? (a.at ?? '').localeCompare(b.at ?? '') : a.state === 'earned' ? -1 : 1));
  }
  return {
    months,
    expectedTotal: round2(months.reduce((s, m) => s + m.expected, 0)),
    periodTotal: round2(months.reduce((s, m) => s + m.total, 0)),
    undated,
  };
}
