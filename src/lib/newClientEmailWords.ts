/* WHAT THE NEW-CLIENT EMAIL TELLS PAUL WAS SOLD (fn stripe-webhook, 2026-11-10).
 *
 * The plan's OWN name, price and payment count. The email used to print the route's count and the £99 constants for every
 * sale, so a £499 pay-in-full, a £999 up-front, a 6-month and a £49.99 12-month sale all arrived reading "£99 today, then
 * £99/month (12 payments in total) · this one is payment 1". Internal words for Paul, never client-facing.
 *
 * A file of its own so only stripe-webhook reaches it. Relative imports with explicit .ts: an edge function imports this. */
import { PAYMENT_PLAN_SPEC, gbpWords, planFullName, planShortLine, type PaymentPlan } from './paymentPlans.ts';

/** "Findable Complete, paid up front · £999 once, for 12 months (save £189)" */
export function planSoldLine(p: PaymentPlan): string {
  return `${planFullName(p)} · ${planShortLine(p)}`;
}

/** "FINDABLE ESSENTIAL, PAY IN FULL — one payment, paid in full today. No monthly payments follow." */
export function planPaymentCountLine(p: PaymentPlan): string {
  const s = PAYMENT_PLAN_SPEC[p];
  return `${planFullName(p).toUpperCase()} — ${s.totalPayments === 1
    ? 'one payment, paid in full today. No monthly payments follow.'
    : `${s.totalPayments} payments in total (this one is payment 1), then ${gbpWords(s.monthlyGbp)} a month.`}`;
}
