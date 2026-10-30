/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE PLAN SUMMARY ON THE AGREEMENT STEP — Today / Then / Minimum term / After the term
   (client sign-up redesign, 2026-10-07; docs/pre-sales-certification/client-signup-agreement-flow.md).

   ⛔ EVERY FIGURE IS A CONSTANT (findableOffer.ts), NEVER TYPED. The summary sits directly above the
      signature, so it must say exactly what the agreement being signed says — no more, no less.
   ⛔ IT IS KEYED TO THE AGREEMENT VERSION. The "after the term" row is the one thing that differs between
      versions (v3 clause 9A: £29.99 continuing service on BOTH routes). A version this file does not know
      gets NO summary (null) — the page then shows the agreement's own service wording instead. A summary
      guessed for an unknown version would be a second, unchecked statement of the terms.
   ⚠️ EXPLICIT .ts ON EVERY RELATIVE IMPORT — reached from an edge function (client-agreement).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { afterTermSummaryWords } from './planTerms.ts';
import { COMPLETE_SUMMARY, ESSENTIAL_SUMMARY, MONTHLY_START_V7_WORDS, PAYMENT_PLAN_NAME, PAYMENT_PLAN_SPEC, PLAN_PRODUCT_NAME, gbpWords, planAfterWords, planFullName, planTotalGbp, type PaymentPlan } from './paymentPlans.ts';
import {
  FINDABLE_CONTINUING_GBP, FINDABLE_MONTHLY_GBP, FINDABLE_SETUP_PRICE_GBP, MONTHLY_START_V3_WORDS,
  SERVICE_ROUTE_NAME, totalPaymentsFor, type ServiceRoute,
} from './findableOffer.ts';

export interface PlanSummaryRow { key: 'plan' | 'today' | 'then' | 'term' | 'after'; label: string; value: string }

/** What the continuing service covers per route — the agreement v3's own words (clause 9A.2). */
export const CONTINUING_SCOPE_V3: Record<ServiceRoute, string> = {
  build: 'hosting your website, ongoing AI visibility monitoring and reasonable updates',
  optimise: 'ongoing AI visibility monitoring and reasonable updates to your website',
};

/** What each plan is, in one plain line (the summary's first row). */
export const PLAN_ONE_LINE: Record<ServiceRoute, string> = {
  build: 'A new website built and optimised for AI visibility, hosted and managed by us while your payments run.',
  optimise: 'We improve your existing website and how AI and search read your business. Your website stays yours.',
};

/** The rows, or null for an agreement version without a checked summary. */
export function planSummaryRows(route: ServiceRoute, version: string): PlanSummaryRow[] | null {
  if (version !== 'v3' && version !== 'v4' && version !== 'v5') return null;
  const n = totalPaymentsFor(route);
  /* v4 (clause 9A / 15.1): Optimise ends, Build's £29.99 is optional. v3 signers keep what they signed.
     v5 (clauses 4.3, 9A): Build only; the website transfers after the last payment, then the same optional £29.99. */
  const after = version === 'v5' && route === 'build'
    ? `The website transfers to you after payment ${n}. ${afterTermSummaryWords(route)}`
    : version === 'v4' || version === 'v5'
    ? afterTermSummaryWords(route)
    : `£${FINDABLE_CONTINUING_GBP} a month (${CONTINUING_SCOPE_V3[route]}) until you cancel with 30 days' notice`;
  return [
    { key: 'plan', label: 'Your plan', value: `${SERVICE_ROUTE_NAME[route]}. ${PLAN_ONE_LINE[route]}` },
    { key: 'today', label: 'Today', value: `£${FINDABLE_SETUP_PRICE_GBP} initial payment (payment 1 of ${n})` },
    { key: 'then', label: 'Then', value: `£${FINDABLE_MONTHLY_GBP} a month, starting ${MONTHLY_START_V3_WORDS}` },
    { key: 'term', label: 'Minimum term', value: `${n} payments in total, including today's` },
    { key: 'after', label: 'After the term', value: after },
  ];
}

/** The signing date as the page shows it: the UK calendar day of `iso` (never a stored or report date). */
export function signingDayWords(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
}

/** v6 (2026-10-29): the summary for a PAYMENT PLAN (paymentPlans.ts), worded as v6 says it (3.1, 4.3, 9.2, 9A). */
export function planSummaryRowsForPlan(plan: PaymentPlan): PlanSummaryRow[] {
  const s = PAYMENT_PLAN_SPEC[plan];
  const rows: PlanSummaryRow[] = [
    { key: 'plan', label: 'Your plan', value: plan === 'complete' ? `${PLAN_PRODUCT_NAME.complete}. ${COMPLETE_SUMMARY}` : plan === 'legacy_twelve' ? `${SERVICE_ROUTE_NAME.build}, ${PAYMENT_PLAN_NAME[plan].toLowerCase()}. ${PLAN_ONE_LINE.build}` : `${planFullName(plan)}. ${ESSENTIAL_SUMMARY}` },
  ];
  if (plan === 'full') {
    rows.push({ key: 'today', label: 'Today', value: `${gbpWords(s.firstGbp)}, paid once. Nothing more to pay for the plan` });
  } else {
    rows.push(
      { key: 'today', label: 'Today', value: `${gbpWords(s.firstGbp)} initial payment (payment 1 of ${s.totalPayments})` },
      { key: 'then', label: 'Then', value: `${gbpWords(s.monthlyGbp)} a month, starting ${plan === 'legacy_twelve' ? MONTHLY_START_V3_WORDS : MONTHLY_START_V7_WORDS}` },
      { key: 'term', label: 'Minimum term', value: `${s.totalPayments} payments in total, including today's (${gbpWords(planTotalGbp(plan))})` },
    );
  }
  rows.push({ key: 'after', label: 'After that', value: planAfterWords(plan) });
  return rows;
}
