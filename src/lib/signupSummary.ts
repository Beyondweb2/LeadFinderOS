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
  build: 'We build, host and manage a new website for you, and improve how AI and search read your business.',
  optimise: 'We improve your existing website and how AI and search read your business. Your website stays yours.',
};

/** The rows, or null for an agreement version without a checked summary. */
export function planSummaryRows(route: ServiceRoute, version: string): PlanSummaryRow[] | null {
  if (version !== 'v3') return null;
  const n = totalPaymentsFor(route);
  return [
    { key: 'plan', label: 'Your plan', value: `${SERVICE_ROUTE_NAME[route]}. ${PLAN_ONE_LINE[route]}` },
    { key: 'today', label: 'Today', value: `£${FINDABLE_SETUP_PRICE_GBP} initial payment (payment 1 of ${n})` },
    { key: 'then', label: 'Then', value: `£${FINDABLE_MONTHLY_GBP} a month, starting ${MONTHLY_START_V3_WORDS}` },
    { key: 'term', label: 'Minimum term', value: `${n} payments in total, including today's` },
    { key: 'after', label: 'After the term', value: `£${FINDABLE_CONTINUING_GBP} a month (${CONTINUING_SCOPE_V3[route]}) until you cancel with 30 days' notice` },
  ];
}

/** The signing date as the page shows it: the UK calendar day of `iso` (never a stored or report date). */
export function signingDayWords(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
}
