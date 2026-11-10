/* 🔴 EVERY COMMISSION NUMBER, IN ONE PLACE (Paul, 2026-11-02, docs/commission-owed.md). Change a rate, a count or a window here
   and nowhere else. Leaf: no imports, read by the commission engine, the Commission owed screen, the edge functions and the tests.
   ⛔ The database cannot read this file. public.monthly_tier_rate() and public.commission_payable_days() MIRROR the two tables
   marked below; scripts/commission-owed.test.ts and scripts/monthly-commission-tiers.test.ts fail when they drift. */

/* ══ THE RULES FOR EVERY NEW SALE: THE SIGNED CONTRACT (Paul, 2026-11-10, docs/commission-owed.md) ═══════════════════════════════
   They replace the fixed pounds of 2026-11-04 (£25 × 6, £15 × 6, a +£25 big-month bonus), which never paid a real sale: those did not
   match the contract the salespeople signed. A sale on payout_rule 'fixed_v1' (every payment since PAYOUT_RULE_FIXED_V1_FROM) is on
   THESE rules. The stored rule name is unchanged on purpose: commission is worked out from the ledger each time, so every such sale
   was recalculated the moment this file changed, and no row had to be rewritten.
     · FIRST PAYMENT of a plan paid over time: pounds by the sale's NUMBER in that salesperson's UK calendar month
       (FIRST_PAYMENT_LADDER). The number is the place the database stamps when the first payment lands. Not backdated; resets on the 1st.
     · A plan paid in ONE payment earns its own fixed pounds instead (ONE_PAYMENT_COMMISSION), whatever its number. It still takes
       its place in the month, so it counts toward the number of that person's other sales.
     · EVERY LATER PLAN PAYMENT actually collected earns LATER_PAYMENT_RATE of it, in whole pounds (laterPaymentPounds: £20 on £99,
       £10 on £49.99), until the plan's last payment. No plan runs past PLAN_COMMISSION_MAX_PAYMENTS.
     · Hosting after the plan, renewals and upsells earn nothing.
   ⚠️ Paul's words were "20% of each later plan payment (e.g. £20 per £99, £10 per £49.99)". Both examples are whole pounds, as the
      first-payment figures are, so the 20% is rounded to the nearest pound. If the contract means pence (£19.80), change
      laterPaymentPounds and nothing else. */

/** First payment, by the sale's number in the month. `upTo` is the last sale number on that step. */
export const FIRST_PAYMENT_LADDER: readonly { upTo: number; pounds: number }[] = [
  { upTo: 12, pounds: 30 },
  { upTo: 24, pounds: 40 },
  { upTo: Infinity, pounds: 50 },
];
/** The first payment's pounds for sale number N of the month. ⛔ No number recorded = the FIRST step, never a higher one. */
export const firstPaymentPoundsFor = (saleNumber: number | null | undefined): number => {
  const n = typeof saleNumber === 'number' && saleNumber >= 1 ? saleNumber : 1;
  return (FIRST_PAYMENT_LADDER.find((t) => n <= t.upTo) ?? FIRST_PAYMENT_LADDER[FIRST_PAYMENT_LADDER.length - 1]).pounds;
};
/** Plans paid in one payment: fixed pounds, once, instead of the ladder. */
export const ONE_PAYMENT_COMMISSION: Readonly<Record<string, number>> = { complete_upfront: 300, full: 150 };
/** The share of each later plan payment. */
export const LATER_PAYMENT_RATE = 0.20;
/** What one later plan payment of this amount earns: the share, to the nearest whole pound. */
export const laterPaymentPounds = (amountGbp: number): number => (amountGbp > 0 ? Math.round(amountGbp * LATER_PAYMENT_RATE + 1e-9) : 0);
/** No plan earns past this many payments in all (the sign-up payment is the first). */
export const PLAN_COMMISSION_MAX_PAYMENTS = 12;
/** The most a sale can earn: its first payment's pounds, then every later plan payment at the plan's monthly price. */
export const saleCommissionMax = (x: { firstPounds: number; laterPayments: number; monthlyGbp: number }): number =>
  x.firstPounds + Math.max(0, x.laterPayments) * laterPaymentPounds(x.monthlyGbp);

/* ══ OLD SALES ONLY. A sale recorded before the fixed rules keeps its numbers; nothing below is ever shown to anyone. ═══════════════ */

/** The first-payment tiers, per salesperson, per UK calendar month. `upTo` is the last sale number at that rate. Not retroactive.
 *  ⛔ MIRRORED by public.monthly_tier_rate(), which still stamps a sale recorded on the old rules. */
export const MONTHLY_TIERS: readonly { upTo: number; rate: number }[] = [
  { upTo: 12, rate: 0.30 },
  { upTo: 24, rate: 0.40 },
  { upTo: Infinity, rate: 0.50 },
];

/** The flat rate a sale earned BEFORE the tiers. Applied only to a ledger row with no stamped rate. */
export const COMMISSION_INITIAL_RATE = 0.30;

/** Findable Complete paid up front always earns this on its first payment, whatever its Sale Number (Paul, 2026-11-03). The sale still
 *  takes its place in the month, so it counts toward the tier of the seller's OTHER sales: the database stamps it as any other sale,
 *  and the engine reads this rate instead of the stamped one. */
export const COMMISSION_UPFRONT_RATE = 0.30;
/** The first-payment rate a plan fixes regardless of the tiers, or null when the tiers decide. */
export const commissionFixedRateForPlan = (plan: unknown): number | null => (plan === 'complete_upfront' ? COMMISSION_UPFRONT_RATE : null);

/** Trailing commission: this share of each of the next COMMISSION_RECURRING_COUNT successful monthly payments. */
export const COMMISSION_RECURRING_RATE = 0.20;
export const COMMISSION_RECURRING_COUNT = 6;
/** The old v3 to v5 terms only, kept so a sale recorded on them keeps its numbers. A plan_v1 sale never reads it. */
export const COMMISSION_RECURRING_COUNT_V3 = 5;

/** The two rule sets a sale can be on, stamped once on its ledger row (payment_ledger.payout_rule). */
export const PAYOUT_RULE_FIXED_V1 = 'fixed_v1';
export const PAYOUT_RULE_PLAN_V1 = 'plan_v1';
export const PAYOUT_RULE_LEGACY = 'legacy';
/** A payment dated before this is history and stays on the old rules, even if a Stripe backfill records it later. */
export const PAYOUT_RULE_PLAN_V1_FROM = '2026-10-29T00:00:00.000Z';
/** A payment dated on or after this is on the fixed rules. On 2026-11-04 the ledger held no real earning sale, so nothing moves. */
export const PAYOUT_RULE_FIXED_V1_FROM = '2026-11-04T00:00:00.000Z';
export const payoutRuleForPaymentAt = (occurredAtIso: string): string =>
  occurredAtIso < PAYOUT_RULE_PLAN_V1_FROM ? PAYOUT_RULE_LEGACY : occurredAtIso < PAYOUT_RULE_FIXED_V1_FROM ? PAYOUT_RULE_PLAN_V1 : PAYOUT_RULE_FIXED_V1;
/** The two rule sets paid line by line, each with a payable date. */
export const isLinePaidRule = (rule: unknown): boolean => rule === PAYOUT_RULE_PLAN_V1 || rule === PAYOUT_RULE_FIXED_V1;

/** The client's own refund window, in days after the four-week results are sent. Commission waiting on the guarantee becomes payable
 *  the day AFTER it (Paul, 2026-11-04), so nobody is paid while the client can still claim. There is NO backstop date.
 *  ⛔ MIRRORED by public.commission_payable_days(). v7 is 7 days (agreement v7 5.4); every older agreement is 14. */
export const COMMISSION_PAYABLE_DAYS_V7 = 7;
export const COMMISSION_PAYABLE_DAYS_OLDER = 14;
const V7_TERMS = 'csa_v7_two_plans';
export const commissionPayableDays = (commercialTerms: string | null | undefined): number =>
  commercialTerms === V7_TERMS ? COMMISSION_PAYABLE_DAYS_V7 : COMMISSION_PAYABLE_DAYS_OLDER;

/** "Undo" on a payment you just marked: the screen offers it for the session, the server allows it for this long. */
export const MARK_PAID_UNDO_HOURS = 24;
