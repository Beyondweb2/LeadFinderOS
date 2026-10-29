/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE CLOSE ON THE CALL SCREEN (fix workstream 5, 2026-10-04; Session A A-06, master plan M-009).

   What a salesperson says once the prospect is interested: the offer for the route that fits this lead,
   the guarantee and what happens after they pay (no scripted close line since 2026-10-07). Before this
   the price and guarantee sat inside objection answers 13 and 14 and the close was never on screen.

   ⛔ PURE, AND EVERY FIGURE IS A findableOffer.ts CONSTANT. No £ amount, payment count or term is typed
      here as a number — a price move cannot leave a stale figure on the call screen.
   🔴 ONE PLAN (agreement v5, Paul, 2026-10-16): FINDABLE BUILD, whatever website they have. Findable Optimise is
      WITHDRAWN and is never offered here (routeOffer still describes it, for a pre-v5 client's record only).
      The minimum term is said in PAYMENTS ("12 payments in total"), never as months.
   ⛔ THE GUARANTEE IS THE MEASURED NUMBER OR THE £99 BACK — never a ranking, a citation, a recommendation
      or "AI will name you". GUARANTEE_HEADLINE is findable.live's own line (Guarantee.astro, Pricing.astro);
      the spoken explanation is FINDABLE_GUARANTEE's facts said aloud (four weeks, same questions, 14 days,
      the £99). The rep-facing caution says what must never be promised.
   ⛔ AFTER PAYMENT reads QUICK_CLOSE_AFTER_PAYMENT (quickClose.ts) — the dialog's own list, not a copy.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  FINDABLE_MONTHLY_GBP, FINDABLE_SETUP_PRICE_GBP, MONTHLY_START_V3_WORDS, REMEASURE_WEEKS_STANDARD,
  SALEABLE_ROUTES, SERVICE_ROUTE_NAME, totalPaymentsFor, type ServiceRoute,
} from './findableOffer.ts';
import { QUICK_CLOSE_AFTER_PAYMENT, QUICK_CLOSE_PROMISE } from './quickClose.ts';
import { afterTermRepLine } from './planTerms.ts';
import type { SiteSource } from './leadWebsiteKind.ts';
import { CLIENT_PAYMENT_PLANS, FULL_PAY_HOSTING_INCLUDED_MONTHS, PAYMENT_PLAN_NAME, PAYMENT_PLAN_SPEC, gbpWords, planShortLine, planTotalGbp } from './paymentPlans.ts';
import { FINDABLE_CONTINUING_GBP } from './findableOffer.ts';

/** findable.live's guarantee line, word for word (findable-site Guarantee.astro / Pricing.astro).
 *  ⛔ ONE COPY (wave 1 integration): it IS Quick Close's promise, so the call screen and the payment
 *  link can never word the guarantee differently. */
export const GUARANTEE_HEADLINE = QUICK_CLOSE_PROMISE;

/** The first monthly payment, said aloud. 🔴 v3 (2026-10-05, clause 5.6): the day after the refund window
 *  closes — never "six weeks after today" any more (FINDABLE_MONTHLY_DELAY_DAYS is legacy timing). */
const WEEKS_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
export const MONTHLY_STARTS_SPOKEN = MONTHLY_START_V3_WORDS;
const REMEASURE_SPOKEN = `${WEEKS_WORDS[REMEASURE_WEEKS_STANDARD] ?? REMEASURE_WEEKS_STANDARD} weeks`;

export interface CallRouteOffer {
  route: ServiceRoute;
  name: string;
  /** One line a rep can glance at: "£99 now · £99/month · 12 payments in total". */
  summary: string;
  /** What to say, two or three short spoken sentences. */
  spoken: string[];
  /** What the client gets / keeps, in a few words. */
  site: string;
}

export interface CallClose {
  /** Routes in the order to offer them; the first is the one that fits best. */
  routes: CallRouteOffer[];
  /** Why only one route is shown, when only one is. */
  routeNote: string | null;
  guarantee: { headline: string; spoken: string; caution: string };
  /** What the monthly pays for (Paul, 2026-10-02 — "check", never "audit"). */
  monthly: string;
  /* ⛔ NO CLOSE LINE (Paul, 2026-10-07): "If that sounds good, I'll send you the link now…" was removed and
     NOT replaced — the rep closes in their own words. scripts/call-workspace.test.ts pins it absent. */
  /** After they pay — Quick Close's own list. */
  afterPayment: readonly string[];
}

/** What each route IS, in one spoken sentence — shared by every price model. */
const ROUTE_WHAT: Record<ServiceRoute, string> = {
  build: 'We build you a new website, host it and look after it.',
  optimise: 'You keep your own website and it stays yours. We work on it with your access, and we never take it offline.',
};

export function routeOffer(route: ServiceRoute): CallRouteOffer {
  const total = totalPaymentsFor(route);
  const spokenPrice = `It's £${FINDABLE_SETUP_PRICE_GBP} today, then £${FINDABLE_MONTHLY_GBP} a month starting ${MONTHLY_STARTS_SPOKEN}.`;
  const spokenTerm = `That's ${total} payments in total, the £${FINDABLE_SETUP_PRICE_GBP} today included: that's the minimum term.`;
  /* 🔴 2026-10-29 (paymentPlans.ts, agreement v6): Build is sold three ways. Every figure comes from the plan constants. */
  const full = PAYMENT_PLAN_SPEC.full, six = PAYMENT_PLAN_SPEC.six, twelve = PAYMENT_PLAN_SPEC.twelve;
  return route === 'build'
    ? {
      route, name: SERVICE_ROUTE_NAME.build,
      summary: CLIENT_PAYMENT_PLANS.map((p) => `${PAYMENT_PLAN_NAME[p]} ${planShortLine(p)}`).join(' · '),
      spoken: [
        `${ROUTE_WHAT.build} There are three ways to pay: ${gbpWords(full.firstGbp)} once; or ${gbpWords(six.monthlyGbp)} a month for ${six.totalPayments} months; or ${gbpWords(twelve.firstGbp)} today, then ${gbpWords(twelve.monthlyGbp)} a month, ${twelve.totalPayments} payments in total (${gbpWords(planTotalGbp('twelve'))}). Monthly payments start ${MONTHLY_STARTS_SPOKEN}.`,
        `The website is theirs once the final payment clears. Hosting is included while they pay (${FULL_PAY_HOSTING_INCLUDED_MONTHS} months on pay in full), then optional at ${gbpWords(FINDABLE_CONTINUING_GBP)} a month.`,
      ],
      site: 'A new website built, hosted and managed by Findable — theirs once the term is paid',
    }
    : {
      route, name: SERVICE_ROUTE_NAME.optimise,
      summary: `£${FINDABLE_SETUP_PRICE_GBP} now · £${FINDABLE_MONTHLY_GBP}/month · ${total} payments in total`,
      spoken: [
        `${ROUTE_WHAT.optimise} ${spokenPrice}`,
        `${spokenTerm} ${afterTermRepLine(route)}`,
      ],
      site: 'They keep their existing website and its ownership',
    };
}

/** The routes to offer for this lead's website. 🔴 v5 (Paul, 2026-10-16): FINDABLE BUILD ONLY, whatever site they have
 *  (SALEABLE_ROUTES). A client still tied into a contract with their current provider is not offered anything
 *  (quickClose.offerFit, declined) — that is decided by the call's answers, not by the website on file. */
export function routesFor(source: SiteSource | null | undefined): { routes: ServiceRoute[]; note: string | null } {
  return {
    routes: [...SALEABLE_ROUTES],
    note: source === 'directory_profile' || source === 'social_profile'
      ? 'Only a profile page on file, not a site of their own: Findable Build gives them one.'
      : source === 'own_site' ? null : 'No website on file: Findable Build gives them one.',
  };
}

export function buildCallClose(source: SiteSource | null | undefined): CallClose {
  const { routes, note } = routesFor(source);
  return {
    routes: routes.map(routeOffer),
    routeNote: note,
    guarantee: {
      headline: GUARANTEE_HEADLINE,
      spoken: `We measure how often AI names you before we start, then ask the same questions again after ${REMEASURE_SPOKEN}. If that number hasn't gone up, you email us within 14 days of your results and get back everything you've paid.`,
      caution: 'Never promise a ranking, a recommendation or that AI will name them. The promise is the measured number, or their money back.',
    },
    monthly: `The monthly is a new page every month, a monthly check of what AI says about you, adjustments as we go, and ${routes[0] === 'build' ? 'hosting and looking after the website' : 'keeping your site right'}.`,
    afterPayment: QUICK_CLOSE_AFTER_PAYMENT,
  };
}
