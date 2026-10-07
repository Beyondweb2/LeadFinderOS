/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHAT HAPPENS AFTER THE PAYMENTS, PER PLAN — the ONE place the sales screens say it (Paul, 2026-10-07,
   docs/pre-sales-certification/sales-close-handoff-australia.md).

     OPTIMISE — six £99 payments in total, the first £99 included. The sixth is the last charge: it covers a
                final month of work and then the plan ends. There is NO automatic £29.99 a month after
                Optimise.
     BUILD    — twelve £99 payments in total, the first included; the site is theirs once they are made.
                After that £29.99 a month applies only if they want Findable to keep hosting and maintaining
                the website (cancel with 30 days' notice).

   ⛔ THESE ARE THE SALES WORDS, NOT THE CONTRACT. Billing already matches (Stripe cancels an Optimise
      subscription after its sixth charge; nothing ever bills £29.99 automatically — delayed-subscription.ts,
      CONTINUING_SERVICE_AUTOMATION). v4 (2026-10-07, Findable_Client_Service_Agreement_v4_clean.docx) is now the
      agreement: Optimise ends after payment 6 and the final service period; Build ends after payment 12 and the
      £29.99 Hosting and Maintenance is a separate OPT-IN (clause 9A). The signed v3 agreement still says a £29.99
      continuation for BOTH routes — that is what those clients signed, and continuingModeFor (clientTimeline.ts)
      keeps it for them. This file never edits legal terms, Stripe or the guarantee.
   ⛔ Every figure is a findableOffer.ts constant; nothing here is a typed price.
   Pure. Edge-reachable (quick-close via quickClose.ts): relative imports, explicit .ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  FINDABLE_CONTINUING_GBP, FINDABLE_MONTHLY_GBP, FINDABLE_SETUP_PRICE_GBP, totalPaymentsFor, type ServiceRoute,
} from './findableOffer.ts';

const ORDINAL: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 6: '6th', 12: '12th' };
export const ordinalOf = (n: number): string => ORDINAL[n] ?? `${n}th`;

/** Does a £29.99 a month option follow the payments on this plan? Build only (and only if the client wants it). */
export function continuingOptionAfter(route: ServiceRoute): boolean {
  return route === 'build';
}

/** What the REP says about the end of the plan (third person, said aloud). */
export function afterTermRepLine(route: ServiceRoute): string {
  const n = totalPaymentsFor(route);
  return route === 'build'
    ? `Once the ${n} payments are made the website is theirs. If they want us to keep hosting and maintaining it after that, it's £${FINDABLE_CONTINUING_GBP} a month for hosting and maintenance, and they can cancel with 30 days' notice.`
    : `The ${ordinalOf(n)} payment is the last one: it covers a final month of work, and then the plan ends. Nothing carries on automatically — there's no monthly charge after Optimise.`;
}

/** The same fact in the CLIENT's words ("you") — the Quick Close message and email. */
export function afterTermClientWords(route: ServiceRoute): string {
  const n = totalPaymentsFor(route);
  return route === 'build'
    ? `Once all ${n} payments are made the website is yours. If you'd like us to keep hosting and maintaining it after that, it's £${FINDABLE_CONTINUING_GBP} a month for hosting and maintenance, and you can cancel with 30 days' notice.`
    : `The ${ordinalOf(n)} payment is the last one: it covers a final month of work, and then the plan ends — nothing more is charged.`;
}

export { afterTermSummaryWords, endOfTermKeyPoint } from './findableOffer.ts';
/* ⛔ The end-of-term words (afterTermSummaryWords, endOfTermKeyPoint) live in findableOffer.ts, the constants module, and are
   re-exported above: findableOffer.ts uses them in its own offer lines, so they cannot be defined here (an import cycle). */

/** One spoken line per plan for "How much is it?" — both plans, each with its own ending. */
export function bothPlansSpoken(): string {
  const o = totalPaymentsFor('optimise');
  const b = totalPaymentsFor('build');
  return `If we work on your current website, it's £${FINDABLE_SETUP_PRICE_GBP} today, then £${FINDABLE_MONTHLY_GBP} a month — ${o} payments in total, today's included, and then it ends. `
    + `If we build you a new website, it's £${FINDABLE_SETUP_PRICE_GBP} today, then £${FINDABLE_MONTHLY_GBP} a month — ${b} payments in total, and then the site's yours; `
    + `then £${FINDABLE_CONTINUING_GBP} a month for hosting and maintenance only if you want us to keep looking after it.`;
}
