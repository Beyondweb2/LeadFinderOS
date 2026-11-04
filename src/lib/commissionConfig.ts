/* 🔴 EVERY COMMISSION NUMBER, IN ONE PLACE (Paul, 2026-11-02, docs/commission-owed.md). Change a rate, a count or a window here
   and nowhere else. Leaf: no imports, read by the commission engine, the Commission owed screen, the edge functions and the tests.
   ⛔ The database cannot read this file. public.monthly_tier_rate() and public.commission_payable_days() MIRROR the two tables
   marked below; scripts/commission-owed.test.ts and scripts/monthly-commission-tiers.test.ts fail when they drift. */

/* ══ THE RULES FOR EVERY NEW SALE: FIXED POUNDS (Paul, 2026-11-04, docs/commission-owed.md) ═══════════════════════════════════════ */

/** What each plan earns: this many pounds on each of the customer's first `payments` Successfully Collected payments. The sign-up payment
 *  counts as the first. Nothing on any payment after them. ⛔ legacy_twelve is the old £99 × 12, and a BLANK plan on a sale is that same old
 *  offer (paymentPlans.ts). It earns as an Essential payment plan (Paul's list does not name it; the safe default, see the record). */
export const FIXED_COMMISSION: Readonly<Record<string, { perPayment: number; payments: number }>> = {
  complete: { perPayment: 25, payments: 6 },
  complete_upfront: { perPayment: 300, payments: 1 },
  full: { perPayment: 150, payments: 1 },
  six: { perPayment: 15, payments: 6 },
  twelve: { perPayment: 15, payments: 6 },
  legacy_twelve: { perPayment: 15, payments: 6 },
};
/** The most a plan can earn, before any bonus. */
export const fixedCommissionMax = (plan: string): number => FIXED_COMMISSION[plan].perPayment * FIXED_COMMISSION[plan].payments;

/** The big-month bonus: sale number BIG_MONTH_BONUS_FROM_SALE or above in a UK calendar month earns this once, on top of its first commission,
 *  and is paid with it. The number is the place the database stamps when the first payment lands. Not backdated; resets on the 1st. */
export const BIG_MONTH_BONUS_GBP = 25;
export const BIG_MONTH_BONUS_FROM_SALE = 13;
export const bigMonthBonusFor = (saleNumber: number | null | undefined): number =>
  typeof saleNumber === 'number' && saleNumber >= BIG_MONTH_BONUS_FROM_SALE ? BIG_MONTH_BONUS_GBP : 0;

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

/** Commission waiting on the guarantee becomes payable this many days after the four-week results are sent: the client's own refund
 *  window, so nobody is paid while the client can still claim. There is NO backstop date.
 *  ⛔ MIRRORED by public.commission_payable_days(). v7 is 7 days (agreement v7 5.4); every older agreement is 14. */
export const COMMISSION_PAYABLE_DAYS_V7 = 7;
export const COMMISSION_PAYABLE_DAYS_OLDER = 14;
const V7_TERMS = 'csa_v7_two_plans';
export const commissionPayableDays = (commercialTerms: string | null | undefined): number =>
  commercialTerms === V7_TERMS ? COMMISSION_PAYABLE_DAYS_V7 : COMMISSION_PAYABLE_DAYS_OLDER;

/** "Undo" on a payment you just marked: the screen offers it for the session, the server allows it for this long. */
export const MARK_PAID_UNDO_HOURS = 24;
