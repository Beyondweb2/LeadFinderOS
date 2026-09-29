/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SALES COMMISSION (Sales Experience, 2026-09-28; Paul's rules, not to be re-asked):
   - 🔴 THE INITIAL PAYMENT IS TIERED BY THE WEEK (Paul, 2026-09-29): per salesperson, Monday–Sunday
     (London), clients 1–3 earn 30%, clients 4–6 40%, client 7 onwards 50% of the initial payment. NOT
     retrospective — each sale keeps the rate of its own place; the sequence resets every Monday; a
     client counts when the successful initial payment lands in the ledger, ordered by payment time
     then payment id. The place and rate are STAMPED on the ledger row by the database (migration
     20260929180000, restamp_weekly_commission) and read from there, so a later rule change never
     rewrites history. A row with no stamped rate (earned before the rule) keeps the flat
     COMMISSION_INITIAL_RATE it was earned under. There is no weekly bonus on top of this.
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

/** The flat initial rate every sale earned BEFORE the weekly tiers (and the rate of tier 1). Applied
 *  only to a ledger row with no stamped rate. */
export const COMMISSION_INITIAL_RATE = 0.30;
export const COMMISSION_RECURRING_RATE = 0.20;
export const COMMISSION_RECURRING_COUNT = 3;

/** 🔴 THE WEEKLY TIERS (Paul, 2026-09-29). `upTo` is the last weekly client number at that rate.
 *  ⛔ MIRRORED by public.weekly_tier_rate() in the database, which is what actually stamps a sale —
 *  scripts/weekly-commission-tiers.test.ts pins the two against each other. */
export const WEEKLY_TIERS: readonly { upTo: number; rate: number }[] = [
  { upTo: 3, rate: 0.30 },
  { upTo: 6, rate: 0.40 },
  { upTo: Infinity, rate: 0.50 },
];
/** The rule name the database stamps; a row on any other rule is never renumbered. */
export const WEEKLY_TIER_RULE = 'weekly_tier_v1';

/** The initial rate for the Nth client of a week (N from 1). */
export function weeklyTierRate(seq: number): number {
  return (WEEKLY_TIERS.find((t) => seq <= t.upTo) ?? WEEKLY_TIERS[WEEKLY_TIERS.length - 1]).rate;
}

/** The Monday (YYYY-MM-DD) of the London week an instant falls in — the same week the database uses. */
export function londonWeekStart(iso: string): string {
  const day = londonDayOf(iso);
  const d = new Date(`${day}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
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
  /** Stamped by the database on an initial payment (weekly tiers). Absent = earned before the rule. */
  commission_rule?: string | null;
  commission_week_start?: string | null;
  commission_week_seq?: number | null;
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
  /** Initial payments on the weekly tiers: the Monday of their week and their place in it (stored). */
  weekStart?: string | null;
  weekSeq?: number | null;
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
      let weekStart: string | null = null; let weekSeq: number | null = null;
      if (p.kind === 'initial' && !initialSeen) {
        initialSeen = true; n = 1;
        /* ⛔ THE STORED RATE, never recomputed here: what the sale earned when it landed. */
        const stamped = p.commission_rate === null || p.commission_rate === undefined || p.commission_rate === '' ? NaN : Number(p.commission_rate);
        rate = Number.isFinite(stamped) ? stamped : COMMISSION_INITIAL_RATE;
        weekSeq = typeof p.commission_week_seq === 'number' ? p.commission_week_seq : null;
        weekStart = p.commission_week_start ? String(p.commission_week_start).slice(0, 10) : null;
        label = weekSeq ? `Initial payment · client ${weekSeq} of the week` : 'Initial payment';
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
        ...(weekSeq ? { weekStart, weekSeq } : {}),
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

/* ══ THE WEEKLY TRACKER (Paul, 2026-09-29) ═════════════════════════════════════════════════════════
   Monday–Sunday (London) for ONE salesperson, from the SAME lines the Earnings page lists — so the
   tracker and the ledger cannot disagree. "Clients closed" = initial payments landed this week (a later
   refund does not un-count one: the sequence never renumbers). "Earned" = the commission on those
   initial payments, net of any reversal of them (a held dispute counts as held, i.e. not earned). */
export interface WeeklyTracker {
  weekStart: string;
  weekEnd: string;
  clients: number;
  /** Initial-payment commission earned this week, net of reversals of those payments. */
  earned: number;
  /** The rate of the latest client (tier 1 before the first). */
  currentRate: number;
  /** The rate the NEXT client this week would earn. */
  nextClientRate: number;
  /** The next higher rate, or null at the top tier. */
  nextTierRate: number | null;
  /** More clients needed (after this one) before the next tier applies; 0 = the next client earns it. */
  clientsToNextTier: number | null;
  topTier: boolean;
}

export function weeklyTracker(lines: CommissionLine[], todayIso: string): WeeklyTracker {
  const weekStart = londonWeekStart(todayIso);
  const end = new Date(`${weekStart}T12:00:00Z`); end.setUTCDate(end.getUTCDate() + 6);
  const initials = lines.filter((l) => l.kind === 'payment' && l.paymentNumber === 1 && l.weekStart === weekStart && l.weekSeq);
  const leads = new Set(initials.map((l) => l.leadId));
  const reversals = lines.filter((l) => l.kind === 'reversal' && l.paymentNumber === 1 && leads.has(l.leadId));
  const clients = initials.length;
  const earned = round2(initials.reduce((s, l) => s + l.commission, 0) + reversals.reduce((s, l) => s + l.commission, 0));
  const tierIdx = WEEKLY_TIERS.findIndex((t) => Math.max(clients, 1) <= t.upTo);
  const tier = WEEKLY_TIERS[tierIdx];
  const next = WEEKLY_TIERS[tierIdx + 1] ?? null;
  return {
    weekStart, weekEnd: end.toISOString().slice(0, 10), clients, earned,
    currentRate: weeklyTierRate(Math.max(clients, 1)),
    nextClientRate: weeklyTierRate(clients + 1),
    nextTierRate: next ? next.rate : null,
    clientsToNextTier: next ? Math.max(0, tier.upTo - clients) : null,
    topTier: !next,
  };
}

/** The tracker's one line of words: "1 more client unlocks 40%" / "Your next client earns 40%" / "Top tier reached". */
export function weeklyTrackerNextLine(t: WeeklyTracker): string {
  const pct = (r: number) => `${Math.round(r * 100)}%`;
  if (t.topTier || t.nextTierRate === null) return 'Top tier reached';
  if (t.clientsToNextTier === 0) return `Your next client earns ${pct(t.nextTierRate)}`;
  return `${t.clientsToNextTier} more client${t.clientsToNextTier === 1 ? '' : 's'} unlocks ${pct(t.nextTierRate)}`;
}
