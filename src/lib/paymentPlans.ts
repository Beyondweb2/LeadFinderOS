/* 🔴 THE PLANS (Paul, 2026-10-30: TWO PLANS) — the one place what we sell and how it is paid live.

   TWO PLANS (docs/two-plans.md), signed on agreement v7 (clientAgreement.ts):
     · FINDABLE COMPLETE (recommended, shown first) — plan id `complete`: FINDABLE_MONTHLY_GBP × COMPLETE_TOTAL_PAYMENTS,
       monthly only (no pay in full). Everything in Essential, plus review replies, Google Business Profile, directories,
       changes within reason (fair use) and monthly audits (COMPLETE_EXTRAS). Hosting included while paying.
     · FINDABLE ESSENTIAL — the three ids below (`full`, `six`, `twelve`), prices and money timing unchanged from v6: an
       AI-optimised website plus a baseline audit and a four-week audit to measure the change. ⛔ Never "just the website".
   `planProduct(p)` says which plan a payment-plan id belongs to. Every Complete and Essential sale is route Build.

   ESSENTIAL (2026-10-29) — the original header follows.

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
/** The plans a client is offered, in the order they are shown: Complete first (recommended), then Essential's three. */
export const CLIENT_PAYMENT_PLANS: readonly PaymentPlan[] = ['complete', 'full', 'six', 'twelve'];
/** Essential's three ways to pay (the v6 plans, unchanged). */
export const ESSENTIAL_PAYMENT_PLANS: readonly PaymentPlan[] = ['full', 'six', 'twelve'];
/** The plan a new close starts on (Paul, 2026-10-30: Complete is the default and recommended). */
export const DEFAULT_PAYMENT_PLAN: PaymentPlan = 'complete';
/** Staff-only: never offered to a client, never shown by default. Kept because findable.live's self-service sign-up still
 *  sells it (a blank plan on a sign-up row is this plan) — removing it would break links that site sends. */
export const STAFF_ONLY_PAYMENT_PLANS: readonly PaymentPlan[] = ['legacy_twelve'];

/* ── THE TWO PLANS ── */
export type PlanProduct = 'complete' | 'essential';
export const PLAN_PRODUCTS: readonly PlanProduct[] = ['complete', 'essential'];
export const PLAN_PRODUCT_NAME: Record<PlanProduct, string> = { complete: 'Findable Complete', essential: 'Findable Essential' };
/** Which plan a payment-plan id is. The old staff-only £99 × 12 is Build under v5, sold before the two plans: Essential's
 *  scope (it never included Complete's extras). */
export function planProduct(p: PaymentPlan): PlanProduct { return p === 'complete' ? 'complete' : 'essential'; }
export const isCompletePlan = (p: unknown): boolean => p === 'complete';
/** What Essential is, in one line. ⛔ Never "just the website" and never framed as lesser. */
export const ESSENTIAL_SUMMARY = 'An AI-optimised website, plus a baseline AI visibility audit and a four-week audit to measure the change.';
/** What Complete adds on top of everything in Essential (the agreement's clause 2.8 and Schedule 1 say the same). */
export const COMPLETE_EXTRAS: readonly string[] = [
  'Replies to your Google reviews',
  'Your Google Business Profile kept up to date',
  'Your business listed and kept accurate on relevant directories',
  'Changes to your website within reason (fair use: small edits, not rebuilds)',
  'A monthly AI visibility audit',
];
export const COMPLETE_SUMMARY = `Everything in Essential, plus: ${COMPLETE_EXTRAS.map((x) => x.charAt(0).toLowerCase() + x.slice(1)).join('; ')}. Hosting is included while you are paying.`;
/** Complete: 12 monthly payments (the sign-up payment is payment 1). */
export const COMPLETE_TOTAL_PAYMENTS = 12;

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
  complete: { plan: 'complete', totalPayments: COMPLETE_TOTAL_PAYMENTS, firstGbp: FINDABLE_MONTHLY_GBP, monthlyGbp: FINDABLE_MONTHLY_GBP },
  full: { plan: 'full', totalPayments: 1, firstGbp: PAY_IN_FULL_GBP, monthlyGbp: 0 },
  six: { plan: 'six', totalPayments: 6, firstGbp: FINDABLE_SETUP_PRICE_GBP, monthlyGbp: FINDABLE_MONTHLY_GBP },
  twelve: { plan: 'twelve', totalPayments: 12, firstGbp: FINDABLE_SETUP_PRICE_GBP, monthlyGbp: REDUCED_MONTHLY_GBP },
  legacy_twelve: { plan: 'legacy_twelve', totalPayments: 12, firstGbp: FINDABLE_SETUP_PRICE_GBP, monthlyGbp: FINDABLE_MONTHLY_GBP },
};

export const PAYMENT_PLAN_NAME: Record<PaymentPlan, string> = {
  complete: 'Findable Complete',
  full: 'Pay in full',
  six: '6 months',
  twelve: '12 months',
  legacy_twelve: '12 payments of £99 (old plan)',
};
/** The plan with its way to pay, for a chip or a line: "Findable Complete" / "Findable Essential, 6 months". */
export function planFullName(p: PaymentPlan): string {
  if (p === 'complete' || p === 'legacy_twelve') return PAYMENT_PLAN_NAME[p];
  return `${PLAN_PRODUCT_NAME.essential}, ${PAYMENT_PLAN_NAME[p].toLowerCase()}`;
}

/** The agreement a NEW signature for each plan is made on: the old plan stays on v5; Complete and Essential's three are v7
 *  (2026-10-30). v6 is archived: still readable and still binding for the clients who signed it, never signed again. */
export function agreementVersionForPlan(p: PaymentPlan): 'v5' | 'v7' {
  return p === 'legacy_twelve' ? 'v5' : 'v7';
}
/** Versions that print the payment plan in Client Details (a signature on one is for ONE plan). */
export const PLAN_PRINTING_VERSIONS: readonly string[] = ['v6', 'v7'];

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
  complete: 'FINDABLE_STANDARD_MONTHLY_PRICE_ID', full: null, six: 'FINDABLE_STANDARD_MONTHLY_PRICE_ID', twelve: 'FINDABLE_REDUCED_MONTHLY_PRICE_ID', legacy_twelve: 'FINDABLE_STANDARD_MONTHLY_PRICE_ID',
};
export const PLAN_UNAVAILABLE_TEXT = 'Not available yet: its monthly payment is not set up in Stripe. Offer another option.';
/** Is the plan's Stripe price configured? `env` reads a secret (Deno.env.get on the server). Shape only — the webhook and
 *  the checkout still check the Price's real amount with Stripe before charging. */
export function planAvailable(p: PaymentPlan, env: (name: string) => string | undefined): boolean {
  const secret = PLAN_MONTHLY_PRICE_SECRET[p];
  if (!secret) return true;
  const v = (env(secret) ?? (p === 'six' || p === 'legacy_twelve' || p === 'complete' ? env('FINDABLE_NEW_SITE_PRICE_ID') : undefined) ?? '').trim();
  return PRICE_ID_RE.test(v);
}
/** The plans that cannot be sold right now, with the reason (empty = all available). */
export function unavailablePlans(env: (name: string) => string | undefined): Partial<Record<PaymentPlan, string>> {
  const out: Partial<Record<PaymentPlan, string>> = {};
  for (const p of PAYMENT_PLANS) if (!planAvailable(p, env)) out[p] = PLAN_UNAVAILABLE_TEXT;
  return out;
}

/* ── findable.live's SELF-SERVICE SIGN-UP (2026-10-29, docs/findable-site-plan-contract.md) ── */
export type SignupPlanRead =
  | { ok: true; plan: PaymentPlan | null }
  | { ok: false; error: 'invalid_payment_plan' | 'plan_unavailable' };
/** The plan a findable.live sign-up sends (fn findable-onboarding `submit`, answers.payment_plan).
 *  Absent / null / '' → plan null: the row is written exactly as before plans (blank = the v5 offer), so links
 *  already sent keep working. Only the CLIENT plans (Complete and Essential's three) are accepted — never legacy_twelve (staff only) or anything
 *  else. A plan whose Stripe price is not set up is refused here, before a row exists (checkout refuses it too). */
export function readSignupPaymentPlan(raw: unknown, env: (name: string) => string | undefined): SignupPlanRead {
  if (raw === undefined || raw === null || raw === '') return { ok: true, plan: null };
  if (!isClientPaymentPlan(raw)) return { ok: false, error: 'invalid_payment_plan' };
  if (!planAvailable(raw, env)) return { ok: false, error: 'plan_unavailable' };
  return { ok: true, plan: raw };
}
/** The PUBLIC list of plans (fn findable-onboarding `plans`): id, name, on sale. Nothing else — no client data, no
 *  price ids, no secrets. The staff-only plan is never listed. */
export function publicPlanCatalogue(env: (name: string) => string | undefined): { plan: PaymentPlan; name: string; product: PlanProduct; recommended: boolean; available: boolean }[] {
  return CLIENT_PAYMENT_PLANS.map((p) => ({ plan: p, name: PAYMENT_PLAN_NAME[p], product: planProduct(p), recommended: p === DEFAULT_PAYMENT_PLAN, available: planAvailable(p, env) }));
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
  if (p === 'complete') return `${gbpWords(s.monthlyGbp)} a month for ${s.totalPayments} months (${gbpWords(planTotalGbp(p))} in total)`;
  if (s.firstGbp === s.monthlyGbp) return `${gbpWords(s.monthlyGbp)} × ${s.totalPayments} (${gbpWords(planTotalGbp(p))} in total)`;
  return `${gbpWords(s.firstGbp)} now, then ${gbpWords(s.monthlyGbp)} × ${recurringPaymentsForPlan(p)} (${s.totalPayments} payments, ${gbpWords(planTotalGbp(p))} in total)`;
}

/** The plan as the v6 agreement prints it in the client's details (part of the agreed, hashed text).
 *  ⛔ v6's output is pinned: signed v6 text was rendered from it. v7 prints planAgreementWordsV7. */
export function planAgreementWords(p: PaymentPlan): string {
  const s = PAYMENT_PLAN_SPEC[p];
  if (p === 'full') return `Pay in full: ${gbpWords(s.firstGbp)}, one payment`;
  if (s.firstGbp === s.monthlyGbp) return `${PAYMENT_PLAN_NAME[p]}: ${gbpWords(s.firstGbp)} initial payment, then ${recurringPaymentsForPlan(p)} monthly payments of ${gbpWords(s.monthlyGbp)} (${s.totalPayments} payments, ${gbpWords(planTotalGbp(p))} in total)`;
  if (p === 'legacy_twelve') return `${gbpWords(s.firstGbp)} initial payment, then ${recurringPaymentsForPlan(p)} monthly payments of ${gbpWords(s.monthlyGbp)} (${s.totalPayments} payments, ${gbpWords(planTotalGbp(p))} in total)`;
  return `${PAYMENT_PLAN_NAME[p]}: ${gbpWords(s.firstGbp)} initial payment, then ${recurringPaymentsForPlan(p)} monthly payments of ${gbpWords(s.monthlyGbp)} (${s.totalPayments} payments, ${gbpWords(planTotalGbp(p))} in total)`;
}
/** v7's "Payment plan" line: the PLAN first (Complete / Essential), then how it is paid. */
export function planAgreementWordsV7(p: PaymentPlan): string {
  if (p === 'complete') return planAgreementWords(p);
  return `${PLAN_PRODUCT_NAME.essential}, ${planAgreementWords(p)}`;
}

/** What happens to hosting and the website, per plan (v6/v7 clauses 4.3, 9.2, 9A). */
export function planAfterWords(p: PaymentPlan): string {
  const after = `After that, hosting and maintenance is optional at ${gbpWords(FINDABLE_CONTINUING_GBP)} a month, only if you choose it.`;
  if (p === 'full') return `The website transfers to you once your payment has cleared. Hosting is included for ${FULL_PAY_HOSTING_INCLUDED_MONTHS} months from when the website goes live. ${after}`;
  return `The website transfers to you once your final payment clears. Hosting is included while you are paying. ${after}`;
}

/** The v6 money-back sentence (5.4): the headline, then the refund of what they have paid. ⛔ The headline is Paul's
 *  exact words and stays exactly. FINDABLE_GUARANTEE (findableOffer.ts, byte-locked with findable.live) is the v5 text
 *  and is unchanged; V6_GUARANTEE is said only to a client who SIGNED v6 (14-day window). */
export const V6_GUARANTEE_HEADLINE = 'We improve AI visibility or you get your money back.';
export const V6_GUARANTEE =
  'We measure how often AI names you before we start, then re-measure after four weeks on the same questions and the same engines. ' +
  'If that number has not gone up, email us within 14 days of your results and we\'ll refund everything you have paid us.';
/** v7 (2026-10-30): the same headline (Paul's exact words, both plans); the claim window is 7 days after the four-week
 *  results, which are due 28 days after the baseline. Said for every NEW Complete or Essential sale. */
export const GUARANTEE_HEADLINE = V6_GUARANTEE_HEADLINE;
export const V7_REFUND_WINDOW_DAYS = 7;
/** v7's claim sentence on its own (5.4, 5.5), the second sentence of V7_GUARANTEE. The quick-check report says it after
 *  "judged on a full measurement, not on this quick check" (2026-10-30). The 7 days run from the date we SEND the
 *  four-week audit results, never from sign-up: worded as findable.live's Guarantee says it (Paul, 2026-10-30). */
export const V7_CLAIM_SENTENCE = `If that number has not gone up, email us within ${V7_REFUND_WINDOW_DAYS} days of the date we send your four-week audit results and we'll refund everything you have paid us.`;
/** findable.live /refunds' own line: when the 7 days start. Said beside the signed guarantee words where those say "Results Date". */
export const V7_WINDOW_START_LINE = `The ${V7_REFUND_WINDOW_DAYS} days start on the date we send you your four-week audit results, not on the day you sign up.`;
export const V7_GUARANTEE =
  'We measure how often AI names you before we start, then re-measure four weeks later on the same questions and the same engines. ' +
  V7_CLAIM_SENTENCE;
/** When the first MONTHLY payment is taken on v7 (clause 5.6): the day after the 7-day window after the day-28 results. */
export const MONTHLY_START_V7_WORDS = `the day after your refund window closes, ${V7_REFUND_WINDOW_DAYS} days after we send your four-week audit results (normally 36 days after your baseline audit)`;
/** The guarantee sentence for a NEW sale on a plan: v7's for Complete and Essential, v5's FINDABLE_GUARANTEE (passed in)
 *  for the old staff-only plan. */
export function guaranteeForPlan(p: PaymentPlan, v5Guarantee: string): string {
  return p === 'legacy_twelve' ? v5Guarantee : V7_GUARANTEE;
}
/** The guarantee sentence for a client by the version they SIGNED (v6 keeps its 14 days; v7 is 7). */
export function guaranteeForSigned(version: string | null | undefined, p: PaymentPlan, v5Guarantee: string): string {
  if (p === 'legacy_twelve') return v5Guarantee;
  return version === 'v6' ? V6_GUARANTEE : V7_GUARANTEE;
}
/** When monthly payments start, by the version signed (v6: 14-day window from the results; v7: 7 days, from the baseline). */
export function monthlyStartWordsFor(version: string | null | undefined): string {
  return version === 'v7' ? MONTHLY_START_V7_WORDS : MONTHLY_START_V3_WORDS;
}

/** The terms a rep reads out before the link (Quick Close), per plan. Built from the constants. New sales are v7. */
export function planTermsLines(p: PaymentPlan): string[] {
  const s = PAYMENT_PLAN_SPEC[p];
  if (p === 'full') return [`${PLAN_PRODUCT_NAME.essential}: ${gbpWords(s.firstGbp)} today, paid once. Nothing more to pay`, planAfterWords(p)];
  const head = `${PLAN_PRODUCT_NAME[planProduct(p)]}: ${gbpWords(s.firstGbp)} today`;
  return [
    head,
    `Then ${gbpWords(s.monthlyGbp)} a month, starting ${MONTHLY_START_V7_WORDS}`,
    `${s.totalPayments} payments in total, today's included (${gbpWords(planTotalGbp(p))})`,
    ...(p === 'complete' ? [`Includes everything in Essential, plus ${COMPLETE_EXTRAS.map((x) => x.charAt(0).toLowerCase() + x.slice(1)).join(', ')}`] : []),
    planAfterWords(p),
  ];
}

/** The offer in one line, before a plan is chosen: both plans (AI reply facts, the call playbook). Complete first. */
export function paymentOptionsSummary(): string {
  return `Two plans. ${PLAN_PRODUCT_NAME.complete} (recommended): ${planShortLine('complete')}. ${COMPLETE_SUMMARY} `
    + `${PLAN_PRODUCT_NAME.essential}: ${ESSENTIAL_SUMMARY} Three ways to pay: ${ESSENTIAL_PAYMENT_PLANS.map((p) => `${PAYMENT_PLAN_NAME[p].toLowerCase()}, ${planShortLine(p)}`).join('; ')}. `
    + `The website is yours once your final payment clears; hosting is included while you are paying (Essential pay in full: ${FULL_PAY_HOSTING_INCLUDED_MONTHS} months), then optional at ${gbpWords(FINDABLE_CONTINUING_GBP)} a month.`;
}

/** Essential's three ways to pay, said aloud. Constants only. */
export function threeWaysSpoken(): string {
  const f = PAYMENT_PLAN_SPEC.full, s6 = PAYMENT_PLAN_SPEC.six, t = PAYMENT_PLAN_SPEC.twelve;
  return `${gbpWords(f.firstGbp)} once, or ${gbpWords(s6.monthlyGbp)} a month for ${s6.totalPayments} months, or ${gbpWords(t.firstGbp)} to start then ${gbpWords(t.monthlyGbp)} a month, ${t.totalPayments} payments in total`;
}
/** Both plans said aloud, Complete first (call scripts, objections, voice notes, reply drafts). Constants only. */
export function plansSpoken(): string {
  const c = PAYMENT_PLAN_SPEC.complete;
  return `Findable Complete at ${gbpWords(c.monthlyGbp)} a month for ${c.totalPayments} months, which adds review replies, your Google profile, directories, changes and a monthly audit; or Findable Essential, a new website built for AI visibility with the before-and-after audits, at ${threeWaysSpoken()}`;
}

/** Both plans in a reply's words (AI reply drafts, the reply playbook). ⛔ The reply checker's rules: the term in PAYMENTS
 *  (never "12 months"), never "monthly" or "monthly audits" (say "regular checks"), short. Constants only. */
export function plansReplyLine(): string {
  const c = PAYMENT_PLAN_SPEC.complete, f = PAYMENT_PLAN_SPEC.full;
  return `Findable Complete at ${gbpWords(c.monthlyGbp)} a month (${c.totalPayments} payments, with reviews, business profile and regular checks) or Findable Essential from ${gbpWords(f.firstGbp)}`;
}

/** Both plans in one short spoken line (voice notes). Constants only. */
export function plansSpokenShort(): string {
  const c = PAYMENT_PLAN_SPEC.complete, f = PAYMENT_PLAN_SPEC.full;
  return `Findable Complete at ${gbpWords(c.monthlyGbp)} a month for ${c.totalPayments} months, or Findable Essential at ${gbpWords(f.firstGbp)} once or spread over payments`;
}

/** The Stripe line-item name for a plan — what the payer sees on the Stripe page and the receipt. */
export function checkoutLineNameForPlan(p: PaymentPlan): string {
  if (p === 'complete') return `${PLAN_PRODUCT_NAME.complete}: AI visibility, a new website we build and manage, review replies, Google profile, directories and monthly audits. ${planShortLine(p)}, payment 1 of ${PAYMENT_PLAN_SPEC[p].totalPayments}`;
  if (p === 'legacy_twelve') return `Findable Build — AI visibility + a new website we build and manage: ${PAYMENT_PLAN_NAME[p]}, ${planShortLine(p)}`;
  return `${PLAN_PRODUCT_NAME.essential}: an AI-optimised website with a baseline and four-week AI visibility audit. ${PAYMENT_PLAN_NAME[p]}, ${planShortLine(p)}`;
}

/** The sentence beside the card field (Stripe's submit message), per plan. No em dash (findable.live's rule). */
export function cardSavedNoticeForPlan(p: PaymentPlan): string {
  const s = PAYMENT_PLAN_SPEC[p];
  if (p === 'full') return `You pay ${gbpWords(s.firstGbp)} today and nothing more for the plan. ${planAfterWords(p)} That is what your signed agreement says.`;
  return `You pay ${gbpWords(s.firstGbp)} today. We save your card. ${gbpWords(s.monthlyGbp)} a month starts ${MONTHLY_START_V7_WORDS}. ${s.totalPayments} payments in total, including today's. ${planAfterWords(p)} That is what your signed agreement says.`;
}

/** The monthly a paid client pays (emails: "your monthly payment of £X"). Pay in full has none. */
export const planMonthlyGbp = (p: PaymentPlan): number => PAYMENT_PLAN_SPEC[p].monthlyGbp;
