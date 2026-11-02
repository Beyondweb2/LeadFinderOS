/* 🔴 EVERY COMMISSION NUMBER, IN ONE PLACE (Paul, 2026-11-02, docs/commission-owed.md). Change a rate, a count or a window here
   and nowhere else. Leaf: no imports, read by the commission engine, the Commission owed screen, the edge functions and the tests.
   ⛔ The database cannot read this file. public.monthly_tier_rate() and public.commission_payable_days() MIRROR the two tables
   marked below; scripts/commission-owed.test.ts and scripts/monthly-commission-tiers.test.ts fail when they drift. */

/** The first-payment tiers, per salesperson, per UK calendar month. `upTo` is the last sale number at that rate. Not retroactive.
 *  ⛔ MIRRORED by public.monthly_tier_rate(), which is what actually stamps a sale. */
export const MONTHLY_TIERS: readonly { upTo: number; rate: number }[] = [
  { upTo: 12, rate: 0.30 },
  { upTo: 24, rate: 0.40 },
  { upTo: Infinity, rate: 0.50 },
];

/** The flat rate a sale earned BEFORE the tiers. Applied only to a ledger row with no stamped rate. */
export const COMMISSION_INITIAL_RATE = 0.30;

/** Trailing commission: this share of each of the next COMMISSION_RECURRING_COUNT successful monthly payments. */
export const COMMISSION_RECURRING_RATE = 0.20;
export const COMMISSION_RECURRING_COUNT = 6;
/** The old v3 to v5 terms only, kept so a sale recorded on them keeps its numbers. A plan_v1 sale never reads it. */
export const COMMISSION_RECURRING_COUNT_V3 = 5;

/** The two rule sets a sale can be on, stamped once on its ledger row (payment_ledger.payout_rule). */
export const PAYOUT_RULE_PLAN_V1 = 'plan_v1';
export const PAYOUT_RULE_LEGACY = 'legacy';
/** A payment dated before this is history and stays on the old rules, even if a Stripe backfill records it later. */
export const PAYOUT_RULE_PLAN_V1_FROM = '2026-10-29T00:00:00.000Z';
export const payoutRuleForPaymentAt = (occurredAtIso: string): string =>
  occurredAtIso < PAYOUT_RULE_PLAN_V1_FROM ? PAYOUT_RULE_LEGACY : PAYOUT_RULE_PLAN_V1;

/** First-payment commission becomes payable this many days after the four-week results are sent: the client's own refund
 *  window, so nobody is paid while the client can still claim. There is NO backstop date.
 *  ⛔ MIRRORED by public.commission_payable_days(). v7 is 7 days (agreement v7 5.4); every older agreement is 14. */
export const COMMISSION_PAYABLE_DAYS_V7 = 7;
export const COMMISSION_PAYABLE_DAYS_OLDER = 14;
const V7_TERMS = 'csa_v7_two_plans';
export const commissionPayableDays = (commercialTerms: string | null | undefined): number =>
  commercialTerms === V7_TERMS ? COMMISSION_PAYABLE_DAYS_V7 : COMMISSION_PAYABLE_DAYS_OLDER;

/** "Undo" on a payment you just marked: the screen offers it for the session, the server allows it for this long. */
export const MARK_PAID_UNDO_HOURS = 24;
