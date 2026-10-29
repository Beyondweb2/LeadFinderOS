/* 🔴 THE PAYMENT PLANS (Paul, 2026-10-29) — the one place the three ways to pay for Findable Build live.

   ONE service (Findable Build), three ways to pay for it. Only the payment style differs:
     · full    — Pay in full: PAY_IN_FULL_GBP once.
     · six     — 6 months: FINDABLE_MONTHLY_GBP × 6 (the sign-up payment is payment 1).
     · twelve  — 12 months: FINDABLE_SETUP_PRICE_GBP now, then REDUCED_MONTHLY_GBP × 11 (12 payments in total).
   And one that is no longer offered to clients:
     · legacy_twelve — the v5 plan, FINDABLE_MONTHLY_GBP × 12. STAFF ONLY, hidden by default (QcOption.legacy), and
       the plan every sale made before this module existed is on.

   ⛔ THE PLAN IS NOT THE ROUTE. `ServiceRoute` (findableOffer.ts) is WHAT we deliver (Build); `PaymentPlan` is HOW
   it is paid. A six-payment Build plan has the same payment count as the withdrawn Optimise route — so a payment
   COUNT never decides a plan or a route on its own once a plan is recorded: read `payment_plan` first
   (Stripe metadata, the onboarding row, the lead).

   ⛔ NOT ON SALE UNTIL THE AGREEMENT SAYS SO. The signed agreement is authoritative (CLAUDE.md §4) and v5 says
   "12 payments" of £99. Selling any other schedule against it would be a client paying one thing having signed
   another. PAYMENT_OPTIONS_SELLABLE stays false until a new agreement version naming these plans is generated,
   approved by Paul and his solicitor, and live (docs/payment-options-term-changes-draft.md). While it is false
   every path behaves exactly as before: no plan question, a blank plan reads as legacy_twelve, and the checkout
   refuses any other plan on a row.

   Pure and dependency-light: imported by the SPA and by edge functions (relative path, explicit .ts). */
import { FINDABLE_CONTINUING_GBP, FINDABLE_MONTHLY_GBP, FINDABLE_SETUP_PRICE_GBP, MONTHLY_START_V3_WORDS } from './findableOffer.ts';

/** ⛔ Flip ONLY together with the agreement version that names these plans (see the header). */
export const PAYMENT_OPTIONS_SELLABLE = false;

export type PaymentPlan = 'full' | 'six' | 'twelve' | 'legacy_twelve';
export const PAYMENT_PLANS: readonly PaymentPlan[] = ['full', 'six', 'twelve', 'legacy_twelve'];
/** The plans a client is offered, in the order they are shown. */
export const CLIENT_PAYMENT_PLANS: readonly PaymentPlan[] = ['full', 'six', 'twelve'];
/** Staff-only: never offered to a client, never shown by default. */
export const STAFF_ONLY_PAYMENT_PLANS: readonly PaymentPlan[] = ['legacy_twelve'];

/** Pay in full, once. */
export const PAY_IN_FULL_GBP = 499;
/** The monthly on the 12-month plan (after the FINDABLE_SETUP_PRICE_GBP sign-up payment). */
export const REDUCED_MONTHLY_GBP = 49.99;
/** ⚠️ DRAFT DEFAULT, NEEDS PAUL: how long hosting is included for a client who paid in full (they are never
 *  "paying" after sign-up). Used only in words, never in a charge. docs/payment-options-term-changes-draft.md. */
export const FULL_PAY_HOSTING_INCLUDED_MONTHS = 12;

export interface PaymentPlanSpec {
  plan: PaymentPlan;
  /** Payments in total, the sign-up payment included. */
  totalPayments: number;
  /** Taken at checkout. */
  firstGbp: number;
  /** Each recurring payment Stripe takes after the first (0 for pay in full). */
  monthlyGbp: number;
}

export const PAYMENT_PLAN_SPEC: Record<PaymentPlan, PaymentPlanSpec> = {
  full: { plan: 'full', totalPayments: 1, firstGbp: PAY_IN_FULL_GBP, monthlyGbp: 0 },
  six: { plan: 'six', totalPayments: 6, firstGbp: FINDABLE_SETUP_PRICE_GBP, monthlyGbp: FINDABLE_MONTHLY_GBP },
  twelve: { plan: 'twelve', totalPayments: 12, firstGbp: FINDABLE_SETUP_PRICE_GBP, monthlyGbp: REDUCED_MONTHLY_GBP },
  legacy_twelve: { plan: 'legacy_twelve', totalPayments: 12, firstGbp: FINDABLE_SETUP_PRICE_GBP, monthlyGbp: FINDABLE_MONTHLY_GBP },
};

export const PAYMENT_PLAN_NAME: Record<PaymentPlan, string> = {
  full: 'Pay in full',
  six: '6 months',
  twelve: '12 months',
  legacy_twelve: '12 payments of £99 (old plan)',
};

export function isPaymentPlan(v: unknown): v is PaymentPlan {
  return typeof v === 'string' && (PAYMENT_PLANS as readonly string[]).includes(v);
}
export function isClientPaymentPlan(v: unknown): v is PaymentPlan {
  return typeof v === 'string' && (CLIENT_PAYMENT_PLANS as readonly string[]).includes(v);
}
/** May a NEW sale be made on this plan today? legacy_twelve always (staff); the client plans only once sellable. */
export function isSellablePaymentPlan(v: unknown, sellable: boolean = PAYMENT_OPTIONS_SELLABLE): v is PaymentPlan {
  if (v === 'legacy_twelve') return true;
  return sellable && isClientPaymentPlan(v);
}

/** Recurring payments Stripe takes after the sign-up payment. Derived — never write the number. */
export const recurringPaymentsForPlan = (p: PaymentPlan): number => PAYMENT_PLAN_SPEC[p].totalPayments - 1;
/** Does this plan need a Stripe subscription after checkout? */
export const planHasInstalments = (p: PaymentPlan): boolean => recurringPaymentsForPlan(p) > 0;

/** Pence, so a total is never a float sum. */
const pence = (gbp: number): number => Math.round(gbp * 100);
export function planTotalPence(p: PaymentPlan): number {
  const s = PAYMENT_PLAN_SPEC[p];
  return pence(s.firstGbp) + recurringPaymentsForPlan(p) * pence(s.monthlyGbp);
}
export const planTotalGbp = (p: PaymentPlan): number => planTotalPence(p) / 100;

/** £499 / £49.99 / £1,188 — whole pounds print without pence. */
export function gbpWords(n: number): string {
  const whole = Number.isInteger(n);
  return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}

/** THE PLAN FROM A STORED ROW (the onboarding row, the lead). ⛔ POSITIVE ONLY once the options are on sale: a blank
 *  plan is UNDECIDED (null) and the checkout refuses it — never a silent default. While they are NOT on sale, every
 *  sale is the v5 plan, so a blank reads as legacy_twelve (exactly today's behaviour). */
export function paymentPlanFromRow(row: { payment_plan?: unknown } | null | undefined, sellable: boolean = PAYMENT_OPTIONS_SELLABLE): PaymentPlan | null {
  const raw = row?.payment_plan;
  if (raw === null || raw === undefined || raw === '') return sellable ? null : 'legacy_twelve';
  return isPaymentPlan(raw) ? raw : null;
}

/** THE PLAN A STRIPE OBJECT WAS MADE ON (checkout session or subscription metadata). Recorded plan first; a record
 *  made before plans existed carries none and is the v5 plan when its count is 12. Anything else → null. */
export function paymentPlanFromMeta(meta: Record<string, unknown> | null | undefined): PaymentPlan | null {
  const m = meta ?? {};
  if (isPaymentPlan(m.payment_plan)) return m.payment_plan;
  if (m.payment_plan !== undefined && m.payment_plan !== null && m.payment_plan !== '') return null;
  return Number(m.total_payments) === PAYMENT_PLAN_SPEC.legacy_twelve.totalPayments ? 'legacy_twelve' : null;
}

/** The plan in one short line (a button, a chip). */
export function planShortLine(p: PaymentPlan): string {
  const s = PAYMENT_PLAN_SPEC[p];
  if (p === 'full') return `${gbpWords(s.firstGbp)} once`;
  if (s.firstGbp === s.monthlyGbp) return `${gbpWords(s.monthlyGbp)} × ${s.totalPayments} (${gbpWords(planTotalGbp(p))} in total)`;
  return `${gbpWords(s.firstGbp)} now, then ${gbpWords(s.monthlyGbp)} × ${recurringPaymentsForPlan(p)} (${s.totalPayments} payments, ${gbpWords(planTotalGbp(p))} in total)`;
}

/** What happens to hosting and the website, per plan. */
export function planAfterWords(p: PaymentPlan): string {
  const after = `After that, hosting and maintenance is optional at ${gbpWords(FINDABLE_CONTINUING_GBP)} a month, only if you choose it.`;
  if (p === 'full') return `The website transfers to you once your payment has cleared. Hosting is included for the first ${FULL_PAY_HOSTING_INCLUDED_MONTHS} months. ${after}`;
  return `The website transfers to you once your final payment clears. Hosting is included while you are paying. ${after}`;
}

/** The terms a rep reads out before the link (Quick Close), per plan. Built from the constants. */
export function planTermsLines(p: PaymentPlan): string[] {
  const s = PAYMENT_PLAN_SPEC[p];
  if (p === 'full') return [`${gbpWords(s.firstGbp)} today, paid once. Nothing more to pay`, planAfterWords(p)];
  return [
    `${gbpWords(s.firstGbp)} today`,
    `Then ${gbpWords(s.monthlyGbp)} a month, starting ${MONTHLY_START_V3_WORDS}`,
    `${s.totalPayments} payments in total, today's included (${gbpWords(planTotalGbp(p))})`,
    planAfterWords(p),
  ];
}

/** The offer in one line, before a plan is chosen: all three client plans (AI reply facts, the call playbook). */
export function paymentOptionsSummary(): string {
  return `Findable Build, three ways to pay: ${CLIENT_PAYMENT_PLANS.map((p) => `${PAYMENT_PLAN_NAME[p].toLowerCase()}, ${planShortLine(p)}`).join('; ')}. The website is yours once your final payment clears; hosting is included while you are paying, then optional at ${gbpWords(FINDABLE_CONTINUING_GBP)} a month.`;
}

/** The Stripe line-item name for a plan — what the payer sees on the Stripe page and the receipt. */
export function checkoutLineNameForPlan(p: PaymentPlan): string {
  return `Findable Build — AI visibility + a new website we build and manage: ${PAYMENT_PLAN_NAME[p]}, ${planShortLine(p)}`;
}

/** The sentence beside the card field (Stripe's submit message), per plan. No em dash (findable.live's rule). */
export function cardSavedNoticeForPlan(p: PaymentPlan): string {
  const s = PAYMENT_PLAN_SPEC[p];
  if (p === 'full') return `You pay ${gbpWords(s.firstGbp)} today and nothing more for the plan. ${planAfterWords(p)} That is what your signed agreement says.`;
  return `You pay ${gbpWords(s.firstGbp)} today. We save your card. ${gbpWords(s.monthlyGbp)} a month starts ${MONTHLY_START_V3_WORDS}. ${s.totalPayments} payments in total, including today's. ${planAfterWords(p)} That is what your signed agreement says.`;
}
