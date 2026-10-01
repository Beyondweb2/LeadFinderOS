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
   - 20% of each of the NEXT THREE qualifying recurring payments actually received (unchanged).
     Always a percentage of the REAL amount — a £29.99 monthly earns £6.00, a £99 monthly £19.80.
     Never a hard-coded figure.
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
   Pure: ledger rows in, lines and totals out. Read by fn sales-earnings and fn sales-performance.
   The money facts come ONLY from payment_ledger (Stripe); never from a CRM status.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** The flat initial rate every sale earned BEFORE the tiers (and the rate of tier 1). Applied only to a
 *  ledger row with no stamped rate. */
export const COMMISSION_INITIAL_RATE = 0.30;
export const COMMISSION_RECURRING_RATE = 0.20;
export const COMMISSION_RECURRING_COUNT = 3;

/** 🔴 THE MONTHLY TIERS (Paul, 2026-10-01). `upTo` is the last sale number in the month at that rate.
 *  ⛔ MIRRORED by public.monthly_tier_rate() in the database, which is what actually stamps a sale —
 *  scripts/monthly-commission-tiers.test.ts pins the two against each other. */
export const MONTHLY_TIERS: readonly { upTo: number; rate: number }[] = [
  { upTo: 12, rate: 0.30 },
  { upTo: 24, rate: 0.40 },
  { upTo: Infinity, rate: 0.50 },
];
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
}
export interface PayoutRow { user_id: string; period_month: string; amount_gbp: number; paid_at: string }

export type LineKind = 'payment' | 'reversal';
export type LineStatus = 'due' | 'paid' | 'reversed' | 'not_commissionable';
export interface CommissionLine {
  id: string;
  leadId: string;
  sellerId: string | null;
  kind: LineKind;
  /** 1 = the initial payment, 2..4 = recurring month 1..3, 5+ = later (0% — shown for history only). */
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
export const DISPUTE_RELEASED: ReadonlySet<string> = new Set(['won', 'warning_closed']);
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
}

export interface ClientEarnings {
  leadId: string;
  business: string;
  sellerId: string | null;
  payments: number;
  earned: number;
  reversed: number;
  /** Recurring payments still to come that would earn commission (0..3). */
  commissionablePaymentsLeft: number;
  /** Sold by a salesperson (earns commission) — false for the admin's own sales. */
  commissionable: boolean;
}

export function commissionLines(input: CommissionInput): { lines: CommissionLine[]; clients: ClientEarnings[] } {
  const paidMonths = new Set(input.payouts.map((p) => `${p.user_id}|${p.period_month.slice(0, 10)}`));
  const byLead = new Map<string, LedgerRow[]>();
  for (const r of input.ledger) { if (!r.lead_id) continue; const a = byLead.get(r.lead_id); if (a) a.push(r); else byLead.set(r.lead_id, [r]); }
  const lines: CommissionLine[] = [];
  const clients: ClientEarnings[] = [];
  for (const [leadId, rows] of byLead) {
    rows.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id.localeCompare(b.id));
    const payments = rows.filter((r) => (r.kind === 'initial' || r.kind === 'recurring') && r.status === 'succeeded' && r.amount_gbp > 0);
    const seller = payments.find((p) => p.sold_by_user_id)?.sold_by_user_id ?? input.sellerOfLead?.get(leadId) ?? null;
    const earns = input.isCommissionable(seller);
    const business = input.businessName?.get(leadId) ?? 'Client';
    const rateOf = new Map<string, { rate: number; n: number }>(); // payment row id → its rate and number
    let initialSeen = false; let recurringSeen = 0;
    for (const p of payments) {
      let n: number; let rate: number; let label: string;
      let monthStart: string | null = null; let monthSeq: number | null = null; let testSale = false;
      if (p.kind === 'initial' && !initialSeen) {
        initialSeen = true; n = 1;
        /* ⛔ THE STORED RATE, never recomputed here: what the sale earned when it landed. */
        const stamped = p.commission_rate === null || p.commission_rate === undefined || p.commission_rate === '' ? NaN : Number(p.commission_rate);
        rate = Number.isFinite(stamped) ? stamped : COMMISSION_INITIAL_RATE;
        testSale = p.commission_rule === TEST_EXCLUDED_RULE;
        if (testSale) rate = 0;
        monthSeq = p.commission_rule === MONTHLY_TIER_RULE && typeof p.commission_month_seq === 'number' ? p.commission_month_seq : null;
        monthStart = p.commission_month_start ? String(p.commission_month_start).slice(0, 10) : null;
        label = testSale ? 'Initial payment · test sale (not counted)' : monthSeq && monthStart ? `Initial payment · sale ${monthSeq} of ${monthName(monthStart)}` : 'Initial payment';
      }
      else if (p.kind === 'recurring') { recurringSeen += 1; n = 1 + recurringSeen; rate = recurringSeen <= COMMISSION_RECURRING_COUNT ? COMMISSION_RECURRING_RATE : 0; label = `Month ${recurringSeen}`; }
      else { n = 1; rate = 0; label = 'Additional one-off payment'; }
      if (!earns) rate = 0;
      rateOf.set(p.id, { rate, n });
      const day = londonDayOf(p.occurred_at);
      const pm = monthOf(day);
      lines.push({
        id: `pay:${p.id}`, leadId, sellerId: seller, kind: 'payment', paymentNumber: n, label, clientAmount: round2(p.amount_gbp), rate,
        commission: commissionOn(p.amount_gbp, rate), occurredAt: p.occurred_at, periodMonth: pm, payoutDate: payoutDateFor(day),
        status: !earns ? 'not_commissionable' : paidMonths.has(`${seller}|${pm}`) ? 'paid' : 'due',
        ...(monthSeq ? { monthStart, monthSeq } : {}),
        ...(testSale ? { testSale: true } : {}),
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
      const held = r.kind === 'chargeback' && !DISPUTE_LOST.has(r.status); // still open: held, not reversed
      const p = paymentFor(r);
      if (!p) continue; // a refund we cannot tie to a payment reverses nothing we counted
      const pr = rateOf.get(p.id)!;
      const back = Math.min(r.amount_gbp, p.amount_gbp);
      const amount = commissionOn(back, pr.rate);
      const day = londonDayOf(r.occurred_at);
      const pm = monthOf(day);
      if (!held) reversedTotal += amount;
      lines.push({
        id: `rev:${r.id}`, leadId, sellerId: seller, kind: 'reversal', paymentNumber: pr.n,
        label: r.kind === 'refund' ? (back >= p.amount_gbp ? 'Refunded' : 'Partly refunded') : held ? 'Held — dispute open' : 'Chargeback',
        clientAmount: round2(back), rate: pr.rate, commission: -amount, occurredAt: r.occurred_at, periodMonth: pm, payoutDate: payoutDateFor(day),
        status: !earns ? 'not_commissionable' : paidMonths.has(`${seller}|${pm}`) ? 'paid' : 'due',
        ...(held ? { held: true } : {}),
      });
      // The payment line reads Reversed once fully taken back (never for a hold — that may be released).
      const payLine = lines.find((l) => l.id === `pay:${p.id}`);
      if (!held && payLine && back >= p.amount_gbp && payLine.status === 'due') payLine.status = 'reversed';
    }
    const earned = lines.filter((l) => l.leadId === leadId && l.kind === 'payment').reduce((s, l) => s + l.commission, 0);
    /* ⛔ NEVER PROJECT PAST THE CONTRACT (2026-09-29). The commission rule is unchanged (the next
       COMMISSION_RECURRING_COUNT recurring payments); what changed is that a client's contract can be
       shorter, so the recurring payments still to come are also capped by it where it is known. */
    const contractTotal = input.contractTotalOf?.get(leadId) ?? null;
    const contractRecurringLeft = typeof contractTotal === 'number' && contractTotal > 0 ? Math.max(0, contractTotal - 1 - recurringSeen) : Infinity;
    clients.push({
      leadId, business, sellerId: seller, payments: payments.length, earned: round2(earned), reversed: round2(reversedTotal),
      commissionablePaymentsLeft: earns ? Math.max(0, Math.min(COMMISSION_RECURRING_COUNT - Math.min(recurringSeen, COMMISSION_RECURRING_COUNT), contractRecurringLeft)) : 0,
      commissionable: earns,
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
  paidOut: number;
  /** Owed at the next payout: every unpaid line, net. Never negative — see offset. */
  due: number;
  /** A net negative (a reversal after its commission was paid out), taken from future commission. */
  offset: number;
  nextPayoutDate: string;
  projected: number;
}

export interface ProjectionInput { leadId: string; paymentsLeft: number; monthlyGbp: number | null; active: boolean }

export function earningsTotals(lines: CommissionLine[], payouts: PayoutRow[], projections: ProjectionInput[], todayIso: string): EarningsTotals {
  const today = todayIso.slice(0, 10);
  const month = `${today.slice(0, 7)}-01`;
  const counted = lines.filter((l) => l.status !== 'not_commissionable');
  const sum = (ls: CommissionLine[]) => round2(ls.reduce((s, l) => s + l.commission, 0));
  const unpaid = sum(counted.filter((l) => l.status !== 'paid'));
  return {
    earned: sum(counted),
    earnedThisMonth: sum(counted.filter((l) => l.periodMonth === month)),
    earnedToday: sum(counted.filter((l) => londonDayOf(l.occurredAt) === today)),
    reversed: round2(-sum(counted.filter((l) => l.kind === 'reversal' && !l.held))),
    held: round2(-sum(counted.filter((l) => l.held))),
    paidOut: round2(payouts.reduce((s, p) => s + Number(p.amount_gbp), 0)),
    due: Math.max(0, unpaid),
    offset: Math.min(0, unpaid),
    nextPayoutDate: nextPayoutDate(today),
    projected: round2(projections.filter((p) => p.active && p.monthlyGbp && p.paymentsLeft > 0)
      .reduce((s, p) => s + p.paymentsLeft * commissionOn(p.monthlyGbp!, COMMISSION_RECURRING_RATE), 0)),
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
  rate: number;
  /** Commission on the initial payment, net of any reversal of it. */
  commission: number;
  /** False once fully refunded / lost to a chargeback: no longer lifts the next sale. */
  counted: boolean;
}
export interface MonthlyTracker {
  monthStart: string;
  /** Every stamped sale this month, in place order. */
  sales: LadderSale[];
  /** Sales that count (what the next sale's place is built on). */
  counted: number;
  /** Initial-payment commission this month, net of reversals of those payments. */
  earned: number;
  /** The rate the NEXT sale this month will earn. */
  nextSaleRate: number;
  /** The next higher rate, or null at the top tier. */
  nextTierRate: number | null;
  /** Sales still needed BEFORE the next tier applies; 0 = the next sale earns it. */
  salesToNextTier: number | null;
  topTier: boolean;
}

export function monthlyTracker(lines: CommissionLine[], todayIso: string): MonthlyTracker {
  const monthStart = londonMonthStart(todayIso);
  const initials = lines.filter((l) => l.kind === 'payment' && l.paymentNumber === 1 && l.monthStart === monthStart && l.monthSeq && !l.testSale);
  const sales: LadderSale[] = initials.map((l) => {
    const revs = lines.filter((r) => r.kind === 'reversal' && r.paymentNumber === 1 && r.leadId === l.leadId && !r.held);
    const back = revs.reduce((s, r) => s + r.commission, 0);
    /* The database's rule (commission_sale_stuck): fully refunded or lost to a chargeback = no longer counted. */
    const gone = revs.some((r) => r.clientAmount >= l.clientAmount);
    return { leadId: l.leadId, seq: l.monthSeq!, occurredAt: l.occurredAt, rate: l.rate, commission: round2(l.commission + back), counted: !gone };
  }).sort((a, b) => a.seq - b.seq || a.occurredAt.localeCompare(b.occurredAt));
  const counted = sales.filter((s) => s.counted).length;
  const nextSaleRate = monthlyTierRate(counted + 1);
  // The tier of the latest counted sale (tier 1 before the first): its edge is the milestone ahead.
  const tierIdx = MONTHLY_TIERS.findIndex((t) => Math.max(counted, 1) <= t.upTo);
  const next = MONTHLY_TIERS[tierIdx + 1] ?? null;
  return {
    monthStart, sales, counted,
    earned: round2(sales.reduce((s, x) => s + x.commission, 0)),
    nextSaleRate,
    nextTierRate: next ? next.rate : null,
    salesToNextTier: next ? Math.max(0, MONTHLY_TIERS[tierIdx].upTo - counted) : null,
    topTier: !next,
  };
}

/** The ladder's one line of words: "3 more sales to unlock 40%" / "Next sale earns 40%" / "Top rate: every sale earns 50%". */
export function monthlyTrackerNextLine(t: MonthlyTracker): string {
  const pct = (r: number) => `${Math.round(r * 100)}%`;
  if (t.topTier || t.nextTierRate === null) return `Top rate: every sale earns ${pct(t.nextSaleRate)}`;
  if (t.salesToNextTier === 0) return `Next sale earns ${pct(t.nextTierRate)}`;
  return `${t.salesToNextTier} more sale${t.salesToNextTier === 1 ? '' : 's'} to unlock ${pct(t.nextTierRate)}`;
}
