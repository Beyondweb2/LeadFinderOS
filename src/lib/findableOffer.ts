// THE FINDABLE OFFER — the one place the price and the guarantee wording live.
//
// Imported by BOTH the SPA and edge functions (findable-checkout, stripe-webhook),
// so this file must stay dependency-free and edge functions must import it with a
// RELATIVE path and an explicit .ts extension (like reportSlug.ts) — never the @/
// alias, which Deno's bundler rejects outright (see CLAUDE.md §4).
//
// ⚠️ CROSS-REPO SEAM: findable-site is a separate repo and cannot import this.
// Its copy lives in findable-site/src/lib/site.ts (GUARANTEE) and the price is
// displayed in its OnboardingFlow.tsx. Changing either value here means a matching
// pass there.
// ⛔ THE COMMENT USED TO SAY IT WAS "the only guard", AND IT FAILED. The guarantee
// drifted and nobody noticed for weeks. There is now a real check in each repo:
//   node scripts/check-guarantee-sync.mjs
// It reads the other repo off disk and exits non-zero on any byte difference. The
// PRICE is still guarded by nothing but this comment.

/** 🔴 THE ONE PRICE EVERYONE PAYS, in GBP. One-off, not recurring.
 *
 *  History: £49.99 → £99 (2026-08-04) → £49.99 flat (2026-09-03) → **£99 flat (2026-09-12)**.
 *
 *  ⛔ THERE IS NO SECOND PRICE. One flat figure, whether they arrive from their report, the
 *  homepage, or a cold link. The founder/full split was removed on 2026-09-03 and must not come
 *  back: the ?lead= tag decides IDENTITY, never money, which is what lets a lead-less visitor buy.
 *
 *  ⛔ £99 NOW INCLUDES THE WEBSITE BUILD (Paul, 2026-09-12). Until today a customer who ticked
 *  "build my site" was charged a SEPARATE £49.99 build line from a Stripe Price object. That line
 *  is gone from findable-checkout entirely — the tick now adds only the £9.99/month hosting
 *  subscription. So this number is the whole one-off charge in both shapes of the sale, which is
 *  exactly why it may not be quietly raised without pricing the build work into it.
 *
 *  ⚠️ THIS FIGURE APPEARS INSIDE THE GUARANTEE SENTENCE BELOW, as the amount refunded. Those two
 *  cannot be allowed to disagree, and a comment will not stop them — scripts/check-cross-repo-sync.mjs
 *  asserts that the guarantee text contains this number. Change one, the check fails until you
 *  change the other. */
export const FINDABLE_SETUP_PRICE_GBP = 99;

/** 🔴 THE MONTHLY: £99 A MONTH, FOR A 12-MONTH MINIMUM TERM (Paul, 2026-09-23).
 *  The offer is £99 to start, then £99 a month. There is ONE plan and ONE monthly figure — the
 *  £29.99 "keep your site" tier and the £99-then-£29.99 "new site" schedule are both gone (billing was
 *  simplified to a single £99 plan on 2026-09-18, commit 3a49d5e9; the words caught up 2026-09-23).
 *
 *  It starts FINDABLE_MONTHLY_DELAY_DAYS after the £99 signup payment (Stripe holds it as a trial —
 *  _shared/delayed-subscription.ts). The £99 at sign-up IS payment 1 of totalPaymentsFor(route); Stripe
 *  then bills recurringPaymentsFor(route) more and stops (see the TWO ROUTES note below).
 *  🔴 v3 (2026-10-05): AFTER THE MINIMUM TERM THE CONTINUING SERVICE FOLLOWS (clause 9A,
 *  FINDABLE_CONTINUING_GBP a month until cancelled) — manual in Stripe for now. Sales before v3 stop at
 *  their last payment (cancel_at), as they were sold.
 *
 *  ⚠️ DECLARED HERE, NEAR THE TOP, AND THAT IS STRUCTURAL. The offer strings below interpolate
 *  this one, and a const referenced before its declaration throws ReferenceError at module load —
 *  which in this file would take down the checkout, not a screen. It used to live at the bottom. */
export const FINDABLE_MONTHLY_GBP = 99;

/** ⚠️ LEGACY TIMING ONLY (sales made before the v3 Client Service Agreement): the first recurring
 *  payment six weeks after the £99. Under v3 (Paul, 2026-10-05, "Option B") the first monthly payment is
 *  the day after the 14-day Refund Window that follows the Results Date — src/lib/clientTimeline.ts. */
export const FINDABLE_MONTHLY_DELAY_DAYS = 42;

/** 🔴 THE CONTINUING SERVICE (v3 clause 9A): after the minimum term, FINDABLE_CONTINUING_GBP a month on the same date
 *  until the client cancels on 30 days' notice — Build (hosting + monitoring + reasonable updates) and
 *  Optimise (monitoring + reasonable updates) alike. ⛔ NOT charged automatically yet (Paul, 2026-10-05:
 *  manual control first — clientTimeline.ts CONTINUING_SERVICE_AUTOMATION). No salesperson commission. */
export const FINDABLE_CONTINUING_GBP = 29.99;

/** When the first £99 monthly payment is taken under the v3 agreement, in words (clauses 5.6, 3.1). */
export const MONTHLY_START_V3_WORDS = 'the day after your 14-day refund window closes (normally about six weeks after you give us access)';

/* 🔴 TWO ROUTES, ONE PRICE, TWO LENGTHS (Paul, 2026-09-29). The price never changes — £99 at sign-up,
   then £99 a month from six weeks after sign-up — but the NUMBER of payments depends on the website
   route the client takes:
     · FINDABLE BUILD — Findable builds, hosts and manages a new website: 12 payments in total.
     · FINDABLE OPTIMISE — the client keeps their own website and gives us access: 6 payments in total.
   ⛔ THE SIGN-UP £99 IS PAYMENT 1 ON BOTH ROUTES. Build = sign-up + 11 monthly; Optimise = sign-up + 5
   monthly. Never "£99 plus 12 more" / "£99 plus 6 more" — the recurring counts are DERIVED below.
   ⛔ STRIPE STOPS AT THE LAST MINIMUM-TERM PAYMENT on either route (cancel_at, _shared/delayed-
   subscription.ts). 🔴 Under v3 the Continuing Service (FINDABLE_CONTINUING_GBP, clause 9A) follows —
   set up by hand until CONTINUING_SERVICE_AUTOMATION.stripeSwitch is on; never an open-ended £99.
   ⛔ THE ROUTE IS STORED ON THE ONBOARDING ROW as `plan_tier` ('new_site' = Build, 'keep' = Optimise),
   written by the self-service questionnaire and by Quick Close, read by findable-checkout. A row with no
   route is UNDECIDED and is never sold a schedule — never a silent 12 or 6 (serviceRouteFromRow).
   ⛔ OWNERSHIP (Paul, 2026-09-23, unchanged): for a site Findable BUILDS we build, host and manage it in
   the term and own the build; it transfers once the term is complete and paid; an overdue term may see
   the hosted site suspended after reasonable written notice. ⛔ NONE OF THAT APPLIES TO OPTIMISE: the
   client's existing website stays theirs, and we never take it over or disable it because the service
   ends. The guarantee applies on top on both routes: a valid claim is an exit under its own terms.
   ⛔ DO NOT INVENT penalties, early-exit charges or cancellation rights beyond the above.
   ⚠️ findable-site carries its own copies (site.ts BUILD_TOTAL_PAYMENTS / OPTIMISE_TOTAL_PAYMENTS);
   scripts/check-cross-repo-sync.mjs fails on drift. */
export type ServiceRoute = 'build' | 'optimise';
export const SERVICE_ROUTES: readonly ServiceRoute[] = ['build', 'optimise'];
/** Payments in total on the Build route, the sign-up £99 included. */
export const FINDABLE_BUILD_TOTAL_PAYMENTS = 12;
/** Payments in total on the Optimise route, the sign-up £99 included. */
export const FINDABLE_OPTIMISE_TOTAL_PAYMENTS = 6;

export const SERVICE_ROUTE_NAME: Record<ServiceRoute, string> = { build: 'Findable Build', optimise: 'Findable Optimise' };
/** What the route means, in a few plain words (operator + customer surfaces). */
export const SERVICE_ROUTE_MEANING: Record<ServiceRoute, string> = {
  build: 'we build and manage a new website',
  optimise: 'we optimise your existing website',
};

/** Payments in total for a route, the sign-up payment included. */
export function totalPaymentsFor(route: ServiceRoute): number {
  return route === 'build' ? FINDABLE_BUILD_TOTAL_PAYMENTS : FINDABLE_OPTIMISE_TOTAL_PAYMENTS;
}
/** Monthly charges Stripe makes after the sign-up payment. Derived — never write the number. */
export function recurringPaymentsFor(route: ServiceRoute): number {
  return totalPaymentsFor(route) - 1;
}
/** The minimum term in months: one payment a month, so it equals the payment count. */
export function termMonthsFor(route: ServiceRoute): number {
  return totalPaymentsFor(route);
}
/** The nominal value of the whole commitment: the sign-up payment plus every recurring one. */
export function contractTotalGbpFor(route: ServiceRoute): number {
  return FINDABLE_SETUP_PRICE_GBP + recurringPaymentsFor(route) * FINDABLE_MONTHLY_GBP;
}
/** A payment count Stripe metadata / the lead carries → the route it belongs to (positive match only). */
export function serviceRouteForTotal(total: unknown): ServiceRoute | null {
  const n = Number(total);
  if (n === FINDABLE_BUILD_TOTAL_PAYMENTS) return 'build';
  if (n === FINDABLE_OPTIMISE_TOTAL_PAYMENTS) return 'optimise';
  return null;
}
export function isServiceRoute(v: unknown): v is ServiceRoute {
  return v === 'build' || v === 'optimise';
}
/** The onboarding column value for a route. */
export function planTierForRoute(route: ServiceRoute): 'new_site' | 'keep' {
  return route === 'build' ? 'new_site' : 'keep';
}
/** THE ROUTE A SALE IS MADE ON, from the onboarding row. ⛔ POSITIVE ONLY: `plan_tier` 'new_site' →
 *  build, 'keep' → optimise; blank or unknown → null (UNDECIDED — the checkout refuses it). Both sale
 *  paths write `website_addon` from the SAME decision (true = we build); a row where the two disagree
 *  is also null, never a guess — a stale row that says keep while the site answer said build must not
 *  be sold six payments. */
export function serviceRouteFromRow(row: { plan_tier?: unknown; website_addon?: unknown } | null | undefined): ServiceRoute | null {
  const tier = String(row?.plan_tier ?? '').trim();
  const route: ServiceRoute | null = tier === 'new_site' ? 'build' : tier === 'keep' ? 'optimise' : null;
  if (!route) return null;
  const addon = row?.website_addon;
  if (route === 'optimise' && addon === true) return null;
  if (route === 'build' && addon === false) return null;
  return route;
}

/** The term in words for one route: "12 payments in total, including the sign-up payment (a 12-month minimum term)". */
export function termLineFor(route: ServiceRoute): string {
  return `${totalPaymentsFor(route)} payments in total, including the £${FINDABLE_SETUP_PRICE_GBP} at sign-up (a ${termMonthsFor(route)}-month minimum term)`;
}

/** 🔴 THE ONE CALCULATION OF WHEN THE FIRST RECURRING PAYMENT IS: FINDABLE_MONTHLY_DELAY_DAYS after
 *  the successful sign-up payment. _shared/delayed-subscription.ts sets Stripe's trial_end from
 *  this, so the date a customer is told and the date Stripe charges cannot be two sums.
 *  ⛔ IT IS NOT THE CLAIM WINDOW. Until 2026-09-23 the results sender derived billing from the
 *  results stamp + 14 days (`monthlyStartIso = claimWindowCloseIso`), a model retired on 2026-09-18
 *  when the subscription moved to sign-up — and the sender still called that name without
 *  importing it. Billing counts from sign-up; the claim window counts from the results. */
export function firstRecurringPaymentIso(signupIso: string | null | undefined): string | null {
  if (!signupIso) return null;
  const t = new Date(signupIso).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + FINDABLE_MONTHLY_DELAY_DAYS * 86_400_000).toISOString();
}

/** Which kind of website this client has with us — it decides whether ownership words may be used.
 *  ⛔ POSITIVE MATCHES ONLY, and a conflict or a blank is `unknown`, which gets NEITHER set of words:
 *  telling a client whose site we built that "your pages stay exactly where they are" contradicts
 *  /refunds and /terms, and telling an optimise-only client a build "transfers to you" claims an
 *  ownership we never had. The build terms (the TWO ROUTES note above) apply only to
 *  `findable_built`. Reads the onboarding row: `plan_tier` from the questionnaire, `website_route`
 *  from a hand-added client (PaidClients). */
export type FindableSiteKind = 'findable_built' | 'client_owned' | 'unknown';
export function findableSiteKind(row: { plan_tier?: unknown; website_route?: unknown } | null | undefined): FindableSiteKind {
  const tier = String(row?.plan_tier ?? '').trim();
  const route = String(row?.website_route ?? '').trim();
  const built = tier === 'new_site' || route === 'new_site' || route === 'rebuild_existing';
  const owned = tier === 'keep' || route === 'optimise_existing';
  if (built && !owned) return 'findable_built';
  if (owned && !built) return 'client_owned';
  return 'unknown';
}

/* 🔴 THE RE-MEASURE CLOCK — FOUR WEEKS FOR EVERY NEW CLIENT (Paul, 2026-10-02). The brand-new-domain
   eight-week exception (2026-09-23) is dropped everywhere: the guarantee, findable.live, the Stripe
   receipt and the Welcome Pack. Checked the day it changed: no onboarding row had ever answered
   domain_status 'new', so no client's clock moved.
   ⛔ A STORED remeasure_due_date ALWAYS WINS (RG 6 Oct and Ronnie 13 Oct stay as recorded, 56 days).
   The signature keeps the row so every caller stays as it is. */
export const REMEASURE_WEEKS_STANDARD = 4;
export function remeasureWeeksFor(_row?: { plan_tier?: unknown; website_route?: unknown; domain_status?: unknown } | null): number {
  return REMEASURE_WEEKS_STANDARD;
}

/** The offer in one line, BEFORE a route is chosen (the Cold Call Playbook, a prospect's report): it
 *  names both lengths. Built from the constants so a price move cannot leave a stale figure in a call
 *  script. ⛔ Where the route is known, use offerSummaryFor(route) — never both options to a client who
 *  has already chosen one. */
/* 🔴 v3 TERMS (Paul, 2026-10-05): the monthly starts the day after the refund window, not at a fixed six
   weeks; after the minimum term the service continues at FINDABLE_CONTINUING_GBP a month until cancelled (clause 9A).
   Salespeople quote ONLY these (contractor checklist Part 2, "Prices and terms"). */
export const FINDABLE_OFFER_SUMMARY =
  `£${FINDABLE_SETUP_PRICE_GBP} to start, then £${FINDABLE_MONTHLY_GBP} a month from ${MONTHLY_START_V3_WORDS} — ${FINDABLE_BUILD_TOTAL_PAYMENTS} payments in total if we build you a new website, ${FINDABLE_OPTIMISE_TOTAL_PAYMENTS} if we optimise the one you have. After that, £${FINDABLE_CONTINUING_GBP} a month until you cancel.`;

/** The offer in one line for ONE route. */
export function offerSummaryFor(route: ServiceRoute): string {
  return `${SERVICE_ROUTE_NAME[route]}: £${FINDABLE_SETUP_PRICE_GBP} to start, then £${FINDABLE_MONTHLY_GBP} a month from ${MONTHLY_START_V3_WORDS} — ${totalPaymentsFor(route)} payments in total, a ${termMonthsFor(route)}-month minimum term, then £${FINDABLE_CONTINUING_GBP} a month until you cancel.`;
}

/** 🔴 WhatsApp templates whose META-REGISTERED body quotes an offer we no longer sell ("After that
 *  £29.99 a month … Stop any time"). Code cannot change what Meta sends, so they are BLOCKED on every
 *  path (picker + server claim + queue settings) until Paul submits corrected versions at Meta and a
 *  new name is registered here. Their mirrors in templateBodies.ts / whatsapp-send.ts keep the
 *  registered words, because those render what four prospects actually read. */
export const STALE_OFFER_TEMPLATES: ReadonlySet<string> = new Set(['explain_offer', 'explain_offer_v2']);

/* The guarantee, WORK-based: we promise the audit, the work and the re-measurement, never the
   outcome. Anywhere this sentence is shown to a client must render it from this constant, not a
   local copy — three hardcoded copies drifted apart once already.

   ⛔ BYTE-IDENTICAL TO findable-site's GUARANTEE, and asserted by scripts/check-guarantee-sync.mjs
   in BOTH repos. It is the sentence the Stripe line item charges against, the sentence the audit
   report prints, the sentence the client request sheet prints, and the sentence on the marketing
   site. A customer must not agree to one wording at checkout and read a different one on the page
   that sold it to them.
   ⚠️ THEY HAD DRIFTED. This copy ended at "We do not promise you will be named."; the site's carried
   a further sentence — "The engines decide that, and anyone who promises it is guessing" — which is
   the strongest line in it. Restored here 2026-08-06, longer version wins. */
/* ⛔ ONE CONSTANT AGAIN (2026-09-13). There used to be two — FINDABLE_GUARANTEE (contractual: the
   Stripe line item, the report, the client sheet) and FINDABLE_GUARANTEE_FULL (the site's copy, the
   contractual one plus a claim-window sentence), with the sync script asserting the short one was a
   strict prefix of the long one. Paul folded the claim window INTO the refund sentence and cut the
   tail ("we will show you both sets of numbers" — they already hold both sets; that is what the
   four-week results ARE), which left the two constants identical, so the split went. The site's
   GUARANTEE is byte-locked to THIS constant now, and the prefix assertion is gone from both scripts.
   ⛔ IT IS THE SENTENCE A CUSTOMER AGREES TO AT STRIPE CHECKOUT. Every rendering of the promise —
   the Stripe description, the report, the welcome pack, the site, /refunds — must say exactly this.
   A summary elsewhere may be SHORTER; it may never DIFFER. */
/* 🔴 THE PROMISE CHANGED SHAPE ON 2026-09-12, AND THIS IS THE ONE NOTE TO READ BEFORE EDITING IT.
   It used to guarantee the WORK — "the audit, the work, and the re-measurement ... or a full refund"
   — and explicitly disclaimed the outcome ("We do not promise you will be named. The engines decide
   that, and anyone who promises it is guessing").

   It is now conditional on the MEASUREMENT MOVING. Paul's instruction, confirmed on the record:
   if the number has not gone up at four weeks, the customer can claim the setup fee back. That is a
   change to what we OWE, not a change of wording, and it has three consequences somebody will
   otherwise rediscover the hard way:
     · The refund is now triggered by something we do not control, so the four-week re-measurement
       has to actually happen on the SAME questions and engines or the claim cannot be adjudicated.
       audit-baseline.ts's stored question set is what makes that checkable — do not loosen it.
     · Every hedge that used to sit beside this sentence was deleted in the same pass. Re-adding one
       ("we can't promise", "the engines decide") next to a conditional refund reads as walking it
       back, which is worse than either wording alone.
     · findable.live/refunds is the customer-facing statement of this and must not contradict it.
       If this sentence changes, that page changes in the same commit.
   ⚠️ £99 IS WRITTEN INTO THE TEXT because a customer reading a refund promise needs the amount in
   it. check-cross-repo-sync.mjs asserts the number here matches FINDABLE_SETUP_PRICE_GBP.
   ⚠️ LENGTH: 236 characters (2026-09-13). Stripe documents no limit for the line-item description;
   the longest string PROVEN to render untruncated on the hosted page is 222 (2026-08-06, read off a
   real Checkout Session). This is 14 over that proof, so the first real Checkout Session after this
   change is what proves it — read the hosted page's text, not the HTML shell. */
/* 🔴 2026-10-02 (Paul): four weeks for every new client — the "(eight if we build your site on a
   brand-new domain)" clause is gone, here and in findable-site's GUARANTEE (byte-locked). */
export const FINDABLE_GUARANTEE =
  "We measure how often AI names you before we start, then re-measure after four weeks on the same " +
  "questions and the same engines. If that number has not gone up, email us within 14 days of your " +
  "results and we'll refund your £99.";

/* 🔴 A VALID CLAIM AND PAYMENT 2 (Paul, 2026-09-23). Billing stays six weeks from sign-up, so payment 2
   can fall inside the claim window. A valid claim then refunds it too and ends the plan; if it has not
   been taken, it never is. No broader cancellation right. BYTE-LOCKED to findable-site's
   GUARANTEE_PAYMENT_TWO_LINE by scripts/check-cross-repo-sync.mjs. One literal, one line. */
export const GUARANTEE_PAYMENT_TWO_SENTENCE = "A valid claim also ends your monthly payments: if the first one has not been taken yet, it never is, and if it has already been taken, we refund it as well.";

/* ⛔ WHERE A PROSPECT'S REPORT LIVES. findable.live/report/<auditId> — a Cloudflare Pages Function in
   the findable-site repo (functions/report/[id].ts) that proxies the render-audit-report edge
   function and FORCES text/html, because the Supabase gateway serves that function as text/plain
   with nosniff and a sandbox CSP. The upstream function URL must never be given to a human.
   Deliberately NOT PUBLIC_SITE_ORIGIN: that is the barber product's yoursites.uk, and coupling the
   AI-visibility report to it is what left the share link pointing at a dead route.
   ⚠️ The edge functions cannot import this file's SPA-side siblings, so render-audit-report and
   _shared/audit-reply hold their own copy of this origin. Three places, one value — change together. */
export const REPORT_PUBLIC_ORIGIN = "https://findable.live";

/** The URL a prospect is given for their report. */
export const reportPublicUrl = (auditId: string) => `${REPORT_PUBLIC_ORIGIN}/report/${auditId}`;

/* ⛔ THE GOOGLE ACCOUNT A CLIENT ADDS AS A MANAGER. One value, and it is the OWNER-ADDS-US flow:
   they open their profile, Users, Add, type this address, choose Manager. Google then emails US the
   invite and we accept it.
   ⛔ NOT THE REQUEST-ACCESS FLOW, and the reason is the deciding one: Google's request-access path
   emails whoever claimed the profile — very often an old address at a web company nobody has spoken
   to in years — and runs a 3-7 day timer that can end in an ownership transfer nobody asked for.
   That is not something to build a week-one step on. Owner-adds-us lands in our inbox in seconds and
   we know it worked because we are the one accepting.
   ⚠️ IT MUST BE A GOOGLE ACCOUNT. Google will not accept a manager address that is not one.
   ⚠️ THE QUESTIONNAIRE (findable-site, separate repo) MUST SHOW THE SAME ADDRESS. Two documents
   describing one mechanism was the whole point of standardising; two documents naming different
   addresses would be worse than the inconsistency it replaced. */
export const GBP_MANAGER_EMAIL = "paul@findable.live";

/* 🔴 THIS CONSTANT HAD ZERO CONSUMERS UNTIL 2026-09-14, and its own comment said "Both documents
   render this rather than describing it twice". Neither document rendered it: the welcome pack
   described the profile work without ever naming the address, and the questionnaire asked for
   PERMISSION and never told anybody what to do. A customer agreed to something nobody then
   explained — Ronnie paid in August and it has still not happened.
   ⛔ THE WORDING IS THE ONE PAUL APPROVED ON 2026-09-14, and the path is Google's current one:
   "Users" has been "People and access" under Business Profile settings for some time, so the old
   text would have sent somebody hunting for a menu that no longer exists. */
/* ⚠️ ONE LITERAL, ON ONE LINE, NOT A CONCATENATION. check-cross-repo-sync parses a string
   constant and REFUSES anything it cannot read as a literal — which it did twice for these, first
   for being a concatenation and then for being SINGLE-quoted. Both refusals were correct: a guard
   that cannot parse its input must fail rather than quietly cover nothing. Double quotes, one
   line, matching FINDABLE_CONTACT_EMAIL beside it. */
export const GBP_ADD_STEPS = "Go to your profile → Business Profile settings → People and access → Add → paste that address → choose Manager → Invite.";

/** What they are asked to do, naming the address. */
export const GBP_ACCESS_ASK = `Add ${GBP_MANAGER_EMAIL} as a manager on your Google Business Profile.`;

/** Why it matters, and it stays low-key on purpose. */
export const GBP_ACCESS_REASSURANCE = "It takes about two minutes and you stay the owner.";

/* ⛔ IT SAYS WHAT THEY LOSE, NOT WHAT WE REFUSE (Paul's wording, 2026-09-14). Drafted as "we cannot
   complete your profile until it is done", which reads as a condition on the service — a threat to
   withhold work they have paid for. This states a fact about the work instead: the MEASUREMENT is
   unaffected, the fixing is what stalls. Same consequence, no ultimatum, and it is true. */
export const GBP_ACCESS_CONSEQUENCE = "Until that lands we can measure you, but we cannot fix what Google shows about you.";

/* ⛔ THE CLAIM SENTENCE, ON ITS OWN (2026-09-13). It is the second sentence of FINDABLE_GUARANTEE and
   the sentence /refunds states; the four-week results email and document say it verbatim when the
   number has not gone up. BYTE-LOCKED to findable-site's REFUND_CLAIM_SENTENCE by
   scripts/check-cross-repo-sync.mjs in both repos, and client-copy-claims.test.ts asserts the
   guarantee still ends with it — so the promise a client is measured against, the page that states
   the policy and the email that starts the 14-day clock cannot say three different things. */
/* ⛔ THE HUMAN'S NUMBER, NOT THE SENDING NUMBER. This is where a prospect or a client goes when a
   document invites them to start a conversation: the report's "WhatsApp me" button, and
   findable.live's founder contact block, which reads the same value as site.ts's WHATSAPP_NUMBER
   and is byte-locked to this one by scripts/check-cross-repo-sync.mjs in both repos.

   ⛔ IT IS NOT THE BUSINESS API NUMBER AND MUST NEVER BE SET TO ONE. Templates go out through the
   Business API and that is unchanged; this is the number a HUMAN answers. Until 2026-09-13 the
   report pointed at 447347041545, the Business API line, so every prospect who pressed the one
   button on the document asking them to talk to a person reached the automated sender instead.
   The site had always pointed at the personal number, so the two documents disagreed about how to
   reach the same company — and each held its own copy, which is why they could.

   E.164 digits only: wa.me rejects "+", spaces and dashes, so the digits ARE the link format.
   ⚠️ Anything that DISPLAYS the number to a person must format it; never print this string raw. */
/** The contact number as a person should SEE it: "+44 7943 262742". The stored constant is wa.me's
 *  format (digits only), which is unreadable on a printed page, and hand-formatting it at each call
 *  site is how a document ends up displaying one number and linking to another. UK mobiles only;
 *  anything else is returned with a "+" and left alone rather than mangled into a wrong shape. */
export function findableContactPhoneDisplay(): string {
  const d = FINDABLE_CONTACT_WHATSAPP;
  const m = /^44(7\d{3})(\d{6})$/.exec(d);
  return m ? `+44 ${m[1]} ${m[2]}` : `+${d}`;
}

/* ⛔ THE PAYMENT FAILED, AND THEY ARE STILL A CLIENT (2026-09-13, Paul's wording). Sent from
   invoice.payment_failed. Stripe is still retrying at this point — Smart Retries runs for days —
   so the one thing this must not do is read like a cancellation. "Nothing changes in the meantime"
   is the load-bearing sentence: without it, somebody whose card bounced assumes they have left and
   is then charged four days later when a retry succeeds. */
export function paymentFailedEmail(i: { payUrl: string | null }): { subject: string; paragraphs: string[] } {
  return {
    subject: "Your Findable payment didn't go through",
    paragraphs: [
      `Hi,`,
      `Your monthly payment of £${FINDABLE_MONTHLY_GBP} didn't go through — usually the card has expired or the bank wanted a check.`,
      `We'll try again over the next few days. Nothing changes in the meantime and you're still a client.`,
      i.payUrl
        ? `If it keeps failing you can update your card here: ${i.payUrl}`
        : `If it keeps failing, reply to this email and I'll send you a new payment link.`,
      `Paul, findable`,
    ],
  };
}

/* ⛔ AND WHEN IT FINALLY STOPS, THEY ARE TOLD. Paul's rule, 2026-09-13: nobody should find out they
   stopped being a customer by noticing that nothing happened.
   ⛔ TWO REASONS REACH THIS EVENT AND THEY ARE NOT THE SAME MESSAGE. `customer.subscription.deleted`
   fires both when the retries give up and when the client cancels on purpose. Telling someone who
   chose to leave that "your payments stopped working" is insulting; telling someone whose card died
   that "you asked to cancel" is a lie. Stripe says which in cancellation_details.reason. */
/* ⛔ THE PAGES SENTENCE DEPENDS ON WHOSE SITE IT IS (2026-09-23). "Your pages stay exactly where they
   are" is true of pages we wrote on a site the client owns; for a site we BUILT and host, /refunds
   and /terms say the build stays with us on an early exit and the hosted site may come down — so
   that client is pointed at the terms instead, and a client whose kind is unknown gets neither. */
function pagesOnEnding(kind: FindableSiteKind): string {
  if (kind === 'client_owned') return `Your pages stay exactly where they are and nothing has been taken down. What stops is the weekly work and the measuring.`;
  if (kind === 'findable_built') return `Nothing has been taken down. What stops is the weekly work and the measuring. What happens to the website we built and host for you is set out in our terms: ${REPORT_PUBLIC_ORIGIN}/terms/`;
  return `Nothing has been taken down. What stops is the weekly work and the measuring.`;
}

export function subscriptionEndedEmail(i: { becauseOfPayment: boolean; siteKind: FindableSiteKind }): { subject: string; paragraphs: string[] } {
  const pages = pagesOnEnding(i.siteKind);
  return i.becauseOfPayment
    ? {
      subject: "Your Findable monthly has stopped",
      paragraphs: [
        `Hi,`,
        `We tried your card a few times over the last week and it didn't go through, so your monthly has stopped and you won't be charged again.`,
        pages,
        `If that wasn't what you wanted, reply to this email and we'll start it again — no need to explain anything.`,
        `Paul, findable`,
      ],
    }
    : {
      subject: "Your Findable monthly has been cancelled",
      paragraphs: [
        `Hi,`,
        `Your monthly is cancelled and you won't be charged again.`,
        pages,
        `If you ever want it back, reply to this email and we'll pick it up where we left off.`,
        `Paul, findable`,
      ],
    };
}

/* ⛔ THE TERM ENDED BECAUSE IT WAS COMPLETE — A THIRD ENDING, NOT A CANCELLATION (2026-09-23).
   Stripe fires customer.subscription.deleted when `cancel_at` is reached after the last recurring
   payment, with reason `cancellation_requested` — so before this, a client who had paid all
   of their payments was told "Your monthly is cancelled … If you ever want it back".
   ⛔ The transfer sentence is for `findable_built` ONLY (findableSiteKind); anyone else is told the
   payments are complete and nothing more, because we never owned their site. */
/* 🔴 ROUTE-AWARE (2026-09-29): the count comes from the subscription's own record (its metadata
   total_payments, written when it was created), so a 6-payment Optimise client is never told twelve.
   An unknown count names no number at all. */
export function termCompleteEmail(i: { siteKind: FindableSiteKind; totalPayments: number | null }): { subject: string; paragraphs: string[] } {
  const route = serviceRouteForTotal(i.totalPayments);
  return {
    subject: "Your Findable payments are complete",
    paragraphs: [
      `Hi,`,
      route
        ? `All ${totalPaymentsFor(route)} of your payments are complete, so your ${termMonthsFor(route)}-month term has finished and nothing more will be charged.`
        : `All of your payments are complete, so your term has finished and nothing more will be charged.`,
      ...(i.siteKind === 'findable_built'
        ? [`As set out in our terms, the website build we made for you now transfers to you. Reply to this email and we'll arrange the handover.`]
        : []),
      `Thank you for being a Findable client. Any questions, just reply to this email.`,
      `Paul, findable`,
    ],
  };
}

/* ⛔ THE THREE-DAY NOTICE, AND WHY IT IS THE SECOND ONE AND NOT THE ONLY ONE (2026-09-13).
   Stripe's `customer.subscription.trial_will_end` fires exactly three days before and the interval
   cannot be changed. Three days' warning of a first charge forty-two days after paying is too
   late on its own — so the four-week results email carries the date and the amount (about two
   weeks ahead on the standard timeline), and this is the reminder, not the announcement.
   ⚠️ Rendered by the webhook. Plain, no selling, and the date and amount are in the first line. */
/* ⛔ NO "cancel before that date and nothing is taken" (Paul, 2026-09-23): the monthly is a
   minimum term now, so offering a free exit here would contradict what was sold. `cancelUrl` stays in
   the signature for the caller and is deliberately not printed.
   🔴 ROUTE-AWARE (2026-09-29): `route` is the subscription's own (its metadata); null names no count. */
export function monthlyStartingSoonEmail(i: { businessName: string; startsOn: string; cancelUrl: string | null; route: ServiceRoute | null; continuingService?: boolean }): { subject: string; paragraphs: string[] } {
  /* 🔴 v3 (clause 9A): the minimum term is followed by the Continuing Service (FINDABLE_CONTINUING_GBP), so "then it stops"
     is only true for a legacy subscription. The caller says which (the subscription's own marker). */
  const after = i.continuingService
    ? `After that your service continues at £${FINDABLE_CONTINUING_GBP} a month until you cancel with 30 days' notice, and we will remind you at least 30 days before it starts.`
    : 'then it stops.';
  return {
    subject: `Your Findable monthly starts on ${i.startsOn}`,
    paragraphs: [
      `Hi,`,
      `Your monthly payment of £${FINDABLE_MONTHLY_GBP} starts on ${i.startsOn}.`,
      `It covers the work we keep doing every week to add another way for people to find you: pages improved on what the newer data shows, new pages where there is something worth going after, and an eye on who else is being named.`,
      i.route
        ? `It runs for your ${termMonthsFor(i.route)}-month minimum term: ${totalPaymentsFor(i.route)} payments in total, counting the £${FINDABLE_SETUP_PRICE_GBP} you paid at sign-up${i.continuingService ? '. ' : ', '}${after}`
        : `It runs until your agreed payments are complete, counting the £${FINDABLE_SETUP_PRICE_GBP} you paid at sign-up${i.continuingService ? '. ' : ', '}${after}`,
      `Any questions, just reply to this email.`,
      `Paul, findable`,
    ],
  };
}

/* ⛔ THE HUMAN'S INBOX, LOCKED THE SAME WAY AND FOR THE SAME REASON. findable.live's CONTACT_EMAIL
   held the same value with nothing enforcing it, one line above the WhatsApp number that had
   already drifted. Locked 2026-09-13 before it could.
   ⚠️ It is a personal address because findable.live has no mailbox yet. Swap it HERE and the site
   fails its own check until it is swapped there too, which is the point. */
/* ⛔ WHAT THE CUSTOMER IS TOLD ON THE PAGE WHERE THEY ENTER THEIR CARD (2026-09-13). The checkout
   retains the card so the monthly can start after the four-week results; saying so beside the card
   field is the condition on doing that at all. Rendered by Stripe as the submit message, and by
   findable.live on its own pre-pay screen, so the two cannot describe different arrangements.
   ⚠️ IT NAMES WHAT IS TAKEN TODAY AND WHAT IS NOT. "Nothing else is taken until after you have seen
   your four-week results" is the whole promise; a vaguer line ("we may charge you later") would be
   true and useless. ⛔ Do not add the word "maintain" to this or anything downstream of it. */
/* 🔴 IT NAMES BOTH FIGURES NOW (2026-09-14). It said "You pay £99 today" and then described the
   monthly without ever pricing it, on the one screen where somebody enters a card — so the only
   number in front of them at the moment they pay was the smaller half of what they owe. */
/* 🔴 12-MONTH MINIMUM (Paul, 2026-09-23). "You can cancel before it starts" came out: the monthly is a
   minimum term (termMonthsFor), and the only exit is the guarantee, which the Stripe line
   item's description carries verbatim (FINDABLE_GUARANTEE). ⚠️ findable.live's pre-pay screen shows
   its own copy of this sentence and must be changed to match (separate repo, deployed by hand). */
/* 🔴 PER ROUTE (2026-09-29): the checkout reads the route off the row and shows THAT route's count —
   the Stripe page a customer pays on names exactly the schedule the webhook then creates. */
/* 🔴 v3 (2026-10-05): the agreement's own timing and the Continuing Service — "Nothing is charged after
   the Nth" stopped being true when clause 9A was signed. Every v3 sale is checked out under these words. */
export function cardSavedNoticeFor(route: ServiceRoute): string {
  const n = totalPaymentsFor(route);
  return `You pay £${FINDABLE_SETUP_PRICE_GBP} today. We save your card. £${FINDABLE_MONTHLY_GBP} a month starts ${MONTHLY_START_V3_WORDS}, for a ${termMonthsFor(route)}-month minimum term — ${n} payments in total, including today's. After that your service continues at £${FINDABLE_CONTINUING_GBP} a month until you cancel with 30 days' notice, as your signed agreement says.`;
}
/** The Stripe line-item name for a route — what the payer sees on the Stripe page and the receipt. */
export function checkoutLineNameFor(route: ServiceRoute): string {
  const what = route === 'build' ? 'AI visibility + a new website we build and manage' : 'AI visibility on your existing website';
  return `${SERVICE_ROUTE_NAME[route]} — ${what}: £${FINDABLE_SETUP_PRICE_GBP} today, then £${FINDABLE_MONTHLY_GBP}/month from the day after your refund window, ${totalPaymentsFor(route)} payments in total (${termMonthsFor(route)}-month minimum), then £${FINDABLE_CONTINUING_GBP}/month until cancelled`;
}

export const FINDABLE_CONTACT_EMAIL = "paul@findable.live";

export const FINDABLE_CONTACT_WHATSAPP = "447943262742";

export const REMEASURE_CLAIM_SENTENCE = "If that number has not gone up, email us within 14 days of your results and we'll refund your £99.";
