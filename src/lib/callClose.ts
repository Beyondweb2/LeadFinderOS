/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE CLOSE ON THE CALL SCREEN (fix workstream 5, 2026-10-04; Session A A-06, master plan M-009).

   What a salesperson says once the prospect is interested: the offer for the route that fits this lead,
   the guarantee, the close ("I'll send you the link now") and what happens after they pay. Before this
   the price and guarantee sat inside objection answers 13 and 14 and the close was never on screen.

   ⛔ PURE, AND EVERY FIGURE IS A findableOffer.ts CONSTANT. No £ amount, payment count or term is typed
      here as a number — a price move cannot leave a stale figure on the call screen.
   ⛔ THE ROUTE THAT FITS, NEVER A GUESS AT THE OTHER: no website (or only a directory / social profile) →
      Findable Build only; Optimise needs a site of their own to work on. Their own website → both, Optimise
      first (they keep it), because the app cannot know whether they want a new one.
   ⛔ THE GUARANTEE IS THE MEASURED NUMBER OR THE £99 BACK — never a ranking, a citation, a recommendation
      or "AI will name you". GUARANTEE_HEADLINE is findable.live's own line (Guarantee.astro, Pricing.astro);
      the spoken explanation is FINDABLE_GUARANTEE's facts said aloud (four weeks, same questions, 14 days,
      the £99). The rep-facing caution says what must never be promised.
   ⛔ AFTER PAYMENT reads QUICK_CLOSE_AFTER_PAYMENT (quickClose.ts) — the dialog's own list, not a copy.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  FINDABLE_CONTINUING_GBP, FINDABLE_MONTHLY_GBP, FINDABLE_SETUP_PRICE_GBP, MONTHLY_START_V3_WORDS,
  SERVICE_ROUTE_NAME, termMonthsFor, totalPaymentsFor, type ServiceRoute,
} from './findableOffer.ts';
import { QUICK_CLOSE_AFTER_PAYMENT, QUICK_CLOSE_PROMISE } from './quickClose.ts';
import type { SiteSource } from './leadWebsiteKind.ts';

/** findable.live's guarantee line, word for word (findable-site Guarantee.astro / Pricing.astro).
 *  ⛔ ONE COPY (wave 1 integration): it IS Quick Close's promise, so the call screen and the payment
 *  link can never word the guarantee differently. */
export const GUARANTEE_HEADLINE = QUICK_CLOSE_PROMISE;

/** The first monthly payment, said aloud. 🔴 v3 (2026-10-05, clause 5.6): the day after the refund window
 *  closes — never "six weeks after today" any more (FINDABLE_MONTHLY_DELAY_DAYS is legacy timing). */
export const MONTHLY_STARTS_SPOKEN = MONTHLY_START_V3_WORDS;

/** The guarantee said on a call (Paul's plain wording, 2026-10-06). ⛔ No noise band, no promise that AI will
 *  name them: the count before and after on the same questions, or the £99 back within the refund window. */
export const GUARANTEE_SPOKEN = `We measure how many of those answers name you before we start, then run the same questions again. If that number hasn't increased, you can claim the initial £${FINDABLE_SETUP_PRICE_GBP} back within the refund window.`;

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
  /** The close itself, said once they are happy. */
  closeLine: string;
  /** After they pay — Quick Close's own list. */
  afterPayment: readonly string[];
}

export function routeOffer(route: ServiceRoute): CallRouteOffer {
  const total = totalPaymentsFor(route);
  const term = termMonthsFor(route);
  const spokenPrice = `It's £${FINDABLE_SETUP_PRICE_GBP} today, then £${FINDABLE_MONTHLY_GBP} a month starting ${MONTHLY_STARTS_SPOKEN}.`;
  const spokenTerm = `That's ${total} payments in total, the £${FINDABLE_SETUP_PRICE_GBP} today included, so a ${term}-month minimum.`;
  return route === 'build'
    ? {
      route, name: SERVICE_ROUTE_NAME.build,
      summary: `£${FINDABLE_SETUP_PRICE_GBP} now · £${FINDABLE_MONTHLY_GBP}/month · ${total} payments in total, then £${FINDABLE_CONTINUING_GBP}/month`,
      spoken: [
        `We build you a new website, host it and look after it. ${spokenPrice}`,
        `${spokenTerm} Once the ${total} payments are done the site is yours, and it carries on at £${FINDABLE_CONTINUING_GBP} a month for hosting and monitoring until you cancel.`,
      ],
      site: 'A new website built, hosted and managed by Findable — theirs once the term is paid',
    }
    : {
      route, name: SERVICE_ROUTE_NAME.optimise,
      summary: `£${FINDABLE_SETUP_PRICE_GBP} now · £${FINDABLE_MONTHLY_GBP}/month · ${total} payments in total, then they stop`,
      spoken: [
        `You keep your own website and it stays yours. We work on it with your access, and we never take it offline. ${spokenPrice}`,
        /* 🔴 v4 (2026-10-06): Optimise is a fixed term — the payments stop, there is no £29.99 after it. */
        `${spokenTerm} After the ${total}th payment the payments stop. There's nothing more to pay.`,
      ],
      site: 'They keep their existing website and its ownership',
    };
}

/** The routes for this lead's website, best fit first. */
export function routesFor(source: SiteSource | null | undefined): { routes: ServiceRoute[]; note: string | null } {
  if (source === 'own_site') return { routes: ['optimise', 'build'], note: null };
  return {
    routes: ['build'],
    note: source === 'directory_profile' || source === 'social_profile'
      ? 'Only a profile page on file, not a site of their own — Optimise needs their own website, so offer Build.'
      : 'No website on file — Optimise needs their own website, so offer Build.',
  };
}

export function buildCallClose(source: SiteSource | null | undefined): CallClose {
  const { routes, note } = routesFor(source);
  return {
    routes: routes.map(routeOffer),
    routeNote: note,
    guarantee: {
      headline: GUARANTEE_HEADLINE,
      spoken: GUARANTEE_SPOKEN,
      caution: 'Never promise a ranking, a recommendation or that AI will name them. The promise is the measured number, or the £' + FINDABLE_SETUP_PRICE_GBP + ' back.',
    },
    monthly: `The monthly is a new page every month, a monthly check of what AI says about you, adjustments as we go, and ${routes[0] === 'build' ? 'hosting and looking after the website' : 'keeping your site right'}.`,
    closeLine: `If that sounds good, I'll send you the link now. It's £${FINDABLE_SETUP_PRICE_GBP} today, and Paul takes it from there.`,
    afterPayment: QUICK_CLOSE_AFTER_PAYMENT,
  };
}
