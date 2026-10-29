/* 🔴 THE PAYMENT PLANS (Paul, 2026-10-29) — the one place the three ways to pay for Findable Build live.

   ONE service (Findable Build), three ways to pay for it. Only the payment style differs:
     · full    — Pay in full: PAY_IN_FULL_GBP once. Hosting included for FULL_PAY_HOSTING_INCLUDED_MONTHS.
     · six     — 6 months: FINDABLE_MONTHLY_GBP × 6 (the sign-up payment is payment 1).
     · twelve  — 12 months: FINDABLE_SETUP_PRICE_GBP now, then REDUCED_MONTHLY_GBP × 11 (12 payments in total).
   Signed on agreement v6 (clientAgreement.ts). And one that is no longer offered to clients:
     · legacy_twelve — the v5 plan, FINDABLE_MONTHLY_GBP × 12, signed on v5. STAFF ONLY, behind "Show the old plan" in
       Quick Close. Every sale made before this module, and every self-service sign-up from findable.live (whose own pages
       still show the v5 offer — separate repo), is on it.

   ⛔ THE PLAN IS NOT THE ROUTE. `ServiceRoute` (findableOffer.ts) is WHAT we deliver (Build); `PaymentPlan` is HOW it is
   paid. A six-payment Build plan has the same payment count as the withdrawn Optimise route — so a payment COUNT never
   decides a plan or a route on its own once a plan is recorded: read `payment_plan` first (Stripe metadata, the
   onboarding row, the lead).

   ⛔ A BLANK PLAN ON A SIGN-UP ROW IS THE v5 OFFER (legacy_twelve) — deliberately, not a fall-through: it is what every
   row made before 2026-10-29 was sold on, and what findable.live's self-service sign-up still shows. Quick Close always
   writes an explicit plan (the plan question must be answered before a link exists).

   ⛔ THE 12-MONTH PLAN NEEDS ITS OWN STRIPE PRICE (£49.99/month, edge secret FINDABLE_REDUCED_MONTHLY_PRICE_ID). Until it
   is set the plan is UNAVAILABLE: Quick Close shows it disabled with PLAN_UNAVAILABLE_TEXT, and findable-checkout refuses
   it before any Stripe session exists — a client can never pay £99 into a schedule that cannot be created.

   Pure and dependency-light: imported by the SPA and by edge functions (relative path, explicit .ts). */
import { FINDABLE_CONTINUING_GBP, FINDABLE_MONTHLY_GBP, FINDABLE_SETUP_PRICE_GBP, MONTHLY_START_V3_WORDS, PAYMENT_PLAN_IDS } from './findableOffer.ts';

export type PaymentPlan = typeof PAYMENT_PLAN_IDS[number];
export const PAYMENT_PLANS: readonly PaymentPlan[] = PAYMENT_PLAN_IDS;
/** The plans a client is offered, in the order they are shown. */
export const CLIENT_PAYMENT_PLANS: readonly PaymentPlan[] = ['full', 'six', 'twelve'];
/** Staff-only: never offered to a client, never shown by default. */
export const STAFF_ONLY_PAYMENT_PLANS: readonly PaymentPlan[] = ['legacy_twelve'];

/** Pay in full, once. */
export const PAY_IN_FULL_GBP = 499;
/** The monthly on the 12-month plan (after the FINDABLE_SETUP_PRICE_GBP sign-up payment). */
export const REDUCED_MONTHLY_GBP = 49.99;
/** Hosting included on Pay in full (v6 clause 9.2: from the date the website first goes live). Paul, 2026-10-29. */
export const FULL_PAY_HOSTING_INCLUDED_MONTHS = 6;

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

/** The agreement each plan is signed on: the old plan stays on v5, the three new plans are v6. */
export function agreementVersionForPlan(p: PaymentPlan): 'v5' | 'v6' {
  return p === 'legacy_twelve' ? 'v5' : 'v6';
}

export function isPaymentPlan(v: unknown): v is PaymentPlan {
  return typeof v === 'string' && (PAYMENT_PLANS as readonly string[]).includes(v);
}
export function isClientPaymentPlan(v: unknown): v is PaymentPlan {
  return typeof v === 'string' && (CLIENT_PAYMENT_PLANS as readonly string[]).includes(v);
}

/* ── AVAILABILITY: a plan whose Stripe price is not set up is not offered (and not charged) ── */
const PRICE_ID_RE = /^price_[A-Za-z0-9_]+$/;
/** The edge secret each plan's MONTHLY needs (null = no monthly Price needed). */
export const PLAN_MONTHLY_PRICE_SECRET: Record<PaymentPlan, string | null> = {
  full: null, six: 'FINDABLE_STANDARD_MONTHLY_PRICE_ID', twelve: 'FINDABLE_REDUCED_MONTHLY_PRICE_ID', legacy_twelve: 'FINDABLE_STANDARD_MONTHLY_PRICE_ID',
};
export const PLAN_UNAVAILABLE_TEXT = 'Not available yet: its monthly payment is not set up in Stripe. Offer Pay in full or 6 months.';
/** Is the plan's Stripe price configured? `env` reads a secret (Deno.env.get on the server). Shape only — the webhook and
 *  the checkout still check the Price's real amount with Stripe before charging. */
export function planAvailable(p: PaymentPlan, env: (name: string) => string | undefined): boolean {
  const secret = PLAN_MONTHLY_PRICE_SECRET[p];
  if (!secret) return true;
  const v = (env(secret) ?? (p === 'six' || p === 'legacy_twelve' ? env('FINDABLE_NEW_SITE_PRICE_ID') : undefined) ?? '').trim();
  return PRICE_ID_RE.test(v);
}
/** The plans that cannot be sold right now, with the reason (empty = all available). */
export function unavailablePlans(env: (name: string) => string | undefined): Partial<Record<PaymentPlan, string>> {
  const out: Partial<Record<PaymentPlan, string>> = {};
  for (const p of PAYMENT_PLANS) if (!planAvailable(p, env)) out[p] = PLAN_UNAVAILABLE_TEXT;
  return out;
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

/** THE PLAN FROM A STORED SIGN-UP ROW. Blank → the v5 plan (see the header: that is what a blank row was sold on).
 *  An unknown value → null (refused, never a guess). */
export function paymentPlanFromRow(row: { payment_plan?: unknown } | null | undefined): PaymentPlan | null {
  const raw = row?.payment_plan;
  if (raw === null || raw === undefined || raw === '') return 'legacy_twelve';
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

/** THE PLAN A PAID CLIENT IS ON (the lead's stamped payment_plan). Blank → the v5 plan: every client paid before plans
 *  existed was sold £99 × 12 (or the route's count — callers that care about Optimise keep reading the route). */
export function clientPaymentPlan(lead: { payment_plan?: unknown } | null | undefined): PaymentPlan {
  return isPaymentPlan(lead?.payment_plan) ? lead!.payment_plan as PaymentPlan : 'legacy_twelve';
}

/** The plan in one short line (a button, a chip). */
export function planShortLine(p: PaymentPlan): string {
  const s = PAYMENT_PLAN_SPEC[p];
  if (p === 'full') return `${gbpWords(s.firstGbp)} once`;
  if (s.firstGbp === s.monthlyGbp) return `${gbpWords(s.monthlyGbp)} × ${s.totalPayments} (${gbpWords(planTotalGbp(p))} in total)`;
  return `${gbpWords(s.firstGbp)} now, then ${gbpWords(s.monthlyGbp)} × ${recurringPaymentsForPlan(p)} (${s.totalPayments} payments, ${gbpWords(planTotalGbp(p))} in total)`;
}

/** The plan as the v6 agreement prints it in the client's details (part of the agreed, hashed text). */
export function planAgreementWords(p: PaymentPlan): string {
  const s = PAYMENT_PLAN_SPEC[p];
  if (p === 'full') return `Pay in full: ${gbpWords(s.firstGbp)}, one payment`;
  if (s.firstGbp === s.monthlyGbp) return `${PAYMENT_PLAN_NAME[p]}: ${gbpWords(s.firstGbp)} initial payment, then ${recurringPaymentsForPlan(p)} monthly payments of ${gbpWords(s.monthlyGbp)} (${s.totalPayments} payments, ${gbpWords(planTotalGbp(p))} in total)`;
  if (p === 'legacy_twelve') return `${gbpWords(s.firstGbp)} initial payment, then ${recurringPaymentsForPlan(p)} monthly payments of ${gbpWords(s.monthlyGbp)} (${s.totalPayments} payments, ${gbpWords(planTotalGbp(p))} in total)`;
  return `${PAYMENT_PLAN_NAME[p]}: ${gbpWords(s.firstGbp)} initial payment, then ${recurringPaymentsForPlan(p)} monthly payments of ${gbpWords(s.monthlyGbp)} (${s.totalPayments} payments, ${gbpWords(planTotalGbp(p))} in total)`;
}

/** What happens to hosting and the website, per plan (v6 clauses 4.3, 9.2, 9A). */
export function planAfterWords(p: PaymentPlan): string {
  const after = `After that, hosting and maintenance is optional at ${gbpWords(FINDABLE_CONTINUING_GBP)} a month, only if you choose it.`;
  if (p === 'full') return `The website transfers to you once your payment has cleared. Hosting is included for ${FULL_PAY_HOSTING_INCLUDED_MONTHS} months from when the website goes live. ${after}`;
  return `The website transfers to you once your final payment clears. Hosting is included while you are paying. ${after}`;
}

/** The v6 money-back sentence (5.4): the headline, then the refund of what they have paid. ⛔ The headline is Paul's
 *  exact words and stays exactly. FINDABLE_GUARANTEE (findableOffer.ts, byte-locked with findable.live) is the v5 text
 *  and is unchanged; this is said only for a v6 plan. */
export const V6_GUARANTEE_HEADLINE = 'We improve AI visibility or you get your money back.';
export const V6_GUARANTEE =
  'We measure how often AI names you before we start, then re-measure after four weeks on the same questions and the same engines. ' +
  'If that number has not gone up, email us within 14 days of your results and we\'ll refund everything you have paid us.';
/** The guarantee sentence for a plan: v6's for the new plans, v5's FINDABLE_GUARANTEE (passed in) for the old one. */
export function guaranteeForPlan(p: PaymentPlan, v5Guarantee: string): string {
  return p === 'legacy_twelve' ? v5Guarantee : V6_GUARANTEE;
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
  return `Findable Build, three ways to pay: ${CLIENT_PAYMENT_PLANS.map((p) => `${PAYMENT_PLAN_NAME[p].toLowerCase()}, ${planShortLine(p)}`).join('; ')}. The website is yours once your final payment clears; hosting is included while you are paying (pay in full: ${FULL_PAY_HOSTING_INCLUDED_MONTHS} months), then optional at ${gbpWords(FINDABLE_CONTINUING_GBP)} a month.`;
}

/** The three ways to pay, said aloud (call scripts, objections, voice notes, reply drafts). Constants only. */
export function threeWaysSpoken(): string {
  const f = PAYMENT_PLAN_SPEC.full, s6 = PAYMENT_PLAN_SPEC.six, t = PAYMENT_PLAN_SPEC.twelve;
  return `${gbpWords(f.firstGbp)} once, or ${gbpWords(s6.monthlyGbp)} a month for ${s6.totalPayments} months, or ${gbpWords(t.firstGbp)} to start then ${gbpWords(t.monthlyGbp)} a month, ${t.totalPayments} payments in total`;
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

/** The monthly a paid client pays (emails: "your monthly payment of £X"). Pay in full has none. */
export const planMonthlyGbp = (p: PaymentPlan): number => PAYMENT_PLAN_SPEC[p].monthlyGbp;
