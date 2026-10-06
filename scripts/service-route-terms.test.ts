/* ════════════════════════════════════════════════════════════════════════════════════════════════
   FINDABLE BUILD (12 PAYMENTS) / FINDABLE OPTIMISE (6 PAYMENTS) — Paul, 2026-09-29.
   Same price (£99 at sign-up, then £99 a month from six weeks after sign-up); the LENGTH depends on
   the website route. The sign-up £99 is payment 1 on both. Nothing is charged after the last.
   Pins, in the order of the brief: the two Stripe schedules, Quick Close → schedule, self-service ≡
   Quick Close, the paid-route lock, double-click reuse, the ledger / refund / dispute path, commission
   attribution, no projection past the contract, ownership words per route, historical clients
   untouched. Mobile Quick Close (390px) is checked in a browser, not here.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import {
  FINDABLE_BUILD_TOTAL_PAYMENTS, FINDABLE_MONTHLY_DELAY_DAYS, FINDABLE_MONTHLY_GBP, FINDABLE_OPTIMISE_TOTAL_PAYMENTS, FINDABLE_OFFER_SUMMARY,
  FINDABLE_SETUP_PRICE_GBP, cardSavedNoticeFor, checkoutLineNameFor, contractTotalGbpFor, findableSiteKind, firstRecurringPaymentIso,
  monthlyStartingSoonEmail, offerSummaryFor, planTierForRoute, recurringPaymentsFor, serviceRouteForTotal, serviceRouteFromRow,
  subscriptionEndedEmail, termCompleteEmail, totalPaymentsFor, type ServiceRoute,
} from '../src/lib/findableOffer.ts';
import {
  minimumTermCancelAt, resolvePaidRoute, subscriptionEndedByTerm, subscriptionRoute, subscriptionTotalPayments,
} from '../supabase/functions/_shared/delayed-subscription.ts';
import {
  cleanAnswers, mayGenerateLink, missingQuestions, onboardingColumnsFor, quickCloseGate, quickCloseMessage, quickCloseScript, quickCloseState,
  routeAvailable, routeTermsLines, QUICK_CLOSE_QUESTIONS, type QuickCloseAnswers,
} from '../src/lib/quickClose.ts';
import { commissionLines, earningsTotals, type LedgerRow } from '../src/lib/commission.ts';
import { clientContract } from '../src/lib/clientContract.ts';
import { resultsEmailParagraphs } from '../src/lib/remeasureResults.ts';
import { domainAuthority, domainInputFromRow } from '../src/lib/domainAuthority.ts';

let f = 0;
const ok = (c: unknown, l: string) => { if (!c) f++; console.log((c ? 'PASS ' : 'FAIL ') + l); };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);

/* Stripe's monthly billing from the trial end, clamped to month end, stopped by cancel_at. */
const recurringCharges = (anchorSec: number, cancelAtSec: number): number[] => {
  const a = new Date(anchorSec * 1000);
  const out: number[] = [];
  for (let k = 0; k < 40; k++) {
    const y = a.getUTCFullYear(), m = a.getUTCMonth() + k;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const at = Date.UTC(y, m, Math.min(a.getUTCDate(), last), a.getUTCHours(), a.getUTCMinutes(), a.getUTCSeconds()) / 1000;
    if (at >= cancelAtSec) break;
    out.push(at);
  }
  return out;
};
/* What the subscription builder sends Stripe, from the same functions it calls. */
const schedule = (route: ServiceRoute, signupIso: string) => {
  const first = firstRecurringPaymentIso(signupIso)!;
  const trialEnd = sec(first);
  const cancelAt = minimumTermCancelAt(trialEnd, recurringPaymentsFor(route));
  return { first, trialEnd, cancelAt, charges: recurringCharges(trialEnd, cancelAt) };
};

console.log('── 0. THE CONSTANTS ──');
ok(FINDABLE_BUILD_TOTAL_PAYMENTS === 12 && FINDABLE_OPTIMISE_TOTAL_PAYMENTS === 6, 'Build 12 payments in total, Optimise 6');
ok(recurringPaymentsFor('build') === 11 && recurringPaymentsFor('optimise') === 5, 'recurring after the sign-up: Build 11, Optimise 5 (never 12 / 6 more)');
ok(FINDABLE_SETUP_PRICE_GBP === 99 && FINDABLE_MONTHLY_GBP === 99 && FINDABLE_MONTHLY_DELAY_DAYS === 42, 'the price is unchanged: £99 + £99/month from day 42');
ok(contractTotalGbpFor('build') === 1188 && contractTotalGbpFor('optimise') === 594, 'nominal contract: Build £1,188, Optimise £594');

const SIGNUPS: Array<[string, string]> = [
  ['29 Sep 2026 (today)', '2026-09-29T11:00:00.000Z'],
  ['31 Jan 2027 (six weeks → 14 Mar)', '2027-01-31T16:20:00.000Z'],
  ['18 Jan 2028 (→ 29 Feb, leap day)', '2028-01-18T12:00:00.000Z'],
  ['19 Nov 2026 (→ 31 Dec, then short months)', '2026-11-19T23:59:00.000Z'],
];
for (const [route, n, label] of [['build', 12, '1. BUILD'], ['optimise', 6, '2. OPTIMISE']] as const) {
  console.log(`── ${label}: £99 INITIAL + ${n - 1} MONTHLY = ${n}, FIRST SIX WEEKS LATER, STOPS AFTER ${n} ──`);
  for (const [l, signup] of SIGNUPS) {
    const s = schedule(route, signup);
    ok(Date.parse(s.first) - Date.parse(signup) === 42 * 86_400_000, `${l}: first recurring charge exactly six weeks after sign-up (${s.first.slice(0, 10)})`);
    ok(s.charges.length === n - 1, `${l}: ${s.charges.length} recurring charges (want ${n - 1})`);
    ok(1 + s.charges.length === n, `${l}: with the sign-up £99 as payment 1 → ${1 + s.charges.length} in total`);
    ok(s.charges[0] === s.trialEnd, `${l}: payment 2 is the trial end itself`);
    const wouldBe = recurringCharges(s.trialEnd, Number.MAX_SAFE_INTEGER)[n - 1];
    ok(wouldBe >= s.cancelAt, `${l}: the would-be payment ${n + 1} (${new Date(wouldBe * 1000).toISOString().slice(0, 10)}) is at/after cancel_at — never charged`);
    ok(FINDABLE_SETUP_PRICE_GBP + s.charges.length * FINDABLE_MONTHLY_GBP === contractTotalGbpFor(route), `${l}: £${contractTotalGbpFor(route)} nominal`);
  }
}
ok(minimumTermCancelAt(sec('2026-11-10T11:00:00Z'), 11) === sec('2027-10-10T11:00:00Z') && minimumTermCancelAt(sec('2026-11-10T11:00:00Z'), 5) === sec('2027-04-10T11:00:00Z'),
  'first charge 10 Nov 2026 → Build ends 10 Oct 2027, Optimise ends 10 Apr 2027');
let threw = false; try { minimumTermCancelAt(0, 0); } catch { threw = true; }
ok(threw, 'a zero / bad recurring count throws — never an open-ended or instant-cancel subscription');

console.log('── 1b/2b. WHAT THE SUBSCRIPTION BUILDER SENDS STRIPE ──');
const sub = code('supabase/functions/_shared/delayed-subscription.ts');
ok(/cancel_at: String\(minimumTermCancelAt\(trialEnd, recurring\)\)/.test(sub) && /const recurring = recurringPaymentsFor\(route\)/.test(sub), 'cancel_at is computed from the ROUTE\'s recurring count');
ok(/if \(!isServiceRoute\(route\)\) return \{ kind: "failed"/.test(sub), 'no route → no subscription (a reported failure, never a default 12 or 6)');
ok(/"metadata\[service_route\]": route/.test(sub) && /"metadata\[total_payments\]": String\(totalPaymentsFor\(route\)\)/.test(sub), 'the subscription carries its route and payment count in metadata');
ok(/proration_behavior: "none"/.test(sub) && /trial_end: String\(trialEnd\)/.test(sub), 'the six-week trial and no proration are unchanged');
ok(!/cancel_at_period_end|iterations|subscription_schedules/.test(sub), 'one mechanism (cancel_at), no schedule API, no second system');

console.log('── 3, 4. QUICK CLOSE: THE ROUTE IS REQUIRED AND WRITES THE SCHEDULE\'S INPUT ──');
/* v2: 'Unsure — Findable to recommend' is the approach where the plan is picked explicitly — what these checks drive. */
const base: QuickCloseAnswers = { decision_maker: 'yes', approach: 'unsure', domain: 'yes', manager: 'owner', access: 'yes' };
ok(QUICK_CLOSE_QUESTIONS.some((q) => q.key === 'route' && q.options.map((o) => o.value).join() === 'build,optimise'), 'Quick Close asks the website route: build / optimise');
ok(QUICK_CLOSE_QUESTIONS.find((q) => q.key === 'route')!.options.map((o) => o.label).join(' | ') === 'Findable Build — a new website | Findable Optimise — improve their current site', 'the two plans, named as the offer names them');
ok(missingQuestions(base).includes('route') && !quickCloseGate(base).complete, 'no route → the close is not complete');
ok(!mayGenerateLink('answers_saved', { answers: base }), 'no route → no payment link');
for (const route of ['build', 'optimise'] as const) {
  /* 2026-09-29: Build also needs its three consents confirmed (coverage-found-added.test.ts pins them). */
  const a = cleanAnswers({ ...base, route, ...(route === 'build' ? { build_consents: 'yes' } : {}) });
  ok(quickCloseGate(a).complete && mayGenerateLink('answers_saved', { answers: a }), `${route}: complete and ready for the link`);
  const cols = onboardingColumnsFor(a);
  ok(cols.plan_tier === planTierForRoute(route) && cols.website_addon === (route === 'build'), `${route}: writes plan_tier=${cols.plan_tier}, website_addon=${cols.website_addon}`);
  ok(serviceRouteFromRow(cols) === route, `${route}: the checkout reads ${route} back off those columns`);
  ok(totalPaymentsFor(serviceRouteFromRow(cols)!) === (route === 'build' ? 12 : 6), `${route}: → ${route === 'build' ? 12 : 6} payments`);
  /* 2026-10-04 (M-011 / A-29): the minimum term is on the card. 2026-10-05 (E2E-11): the timing is the v3 Option B
     words, like offerSummaryFor and the script — the card said "six weeks after sign-up", against the agreement. */
  const n = route === 'build' ? 12 : 6;
  ok(routeTermsLines(route).join(' | ') === `£99 today | Then £99 a month, starting the day after your 14-day refund window closes (normally about six weeks after you give us access) | ${n} payments in total, today's included — a ${n}-month minimum term`, `${route}: the screen shows £99 today / £99 a month from the day after the refund window / ${n} payments, a ${n}-month minimum term`);
  ok(!/after sign-?up/i.test(routeTermsLines(route).join(' ')), `${route}: the card never times the monthly from sign-up (E2E-11)`);
  const msg = quickCloseMessage('ABC', 'https://checkout.stripe.com/x', route) + quickCloseScript(route);
  ok(msg.includes(`${route === 'build' ? 12 : 6} payments in total`) && !msg.includes(`${route === 'build' ? 6 : 12} payments`), `${route}: the message and script name ONLY this route's count`);
}
ok(Object.keys(onboardingColumnsFor(base)).every((k) => k !== 'plan_tier' && k !== 'website_addon'), 'no route answered → writes NO route columns (never a default)');
ok(!routeAvailable({ manager: 'no_website' }, 'optimise') && routeAvailable({ manager: 'no_website' }, 'build'), 'no website → only Build is offered');
ok(cleanAnswers({ ...base, manager: 'no_website', route: 'optimise' }).route === undefined, 'a stale Optimise is dropped when the site answer becomes "No website"');
ok(cleanAnswers({ ...base, route: 'forever' }).route === undefined, 'an unknown route value is not an answer');
const qcFn = code('supabase/functions/quick-close/index.ts');
{
  const lib = code('src/lib/quickClose.ts');
  ok(/const answers = mergeAnswers\(prev, rawIncoming\);/.test(lib) && /if \(prev\.route && !answers\.route\) \{ cols\.plan_tier = null; cols\.website_addon = null; \}/.test(lib) && /planQuickCloseSave\(qcNow, rawIncoming/.test(qcFn), 'the server merges the answer OVER the saved set, then re-cleans (mergeAnswers, M-001) and clears a dropped route from the row');
}
ok(!/price|amount|discount|total_payments|cadence/i.test(qcFn.slice(qcFn.indexOf('body: JSON.stringify({ onboarding_id'), qcFn.indexOf('body: JSON.stringify({ onboarding_id') + 80)), 'the checkout call carries only the row and lead ids — the rep cannot set price, count, cadence or discount');
ok(/"route_undecided"|route_undecided:/.test(read('supabase/functions/quick-close/index.ts')), 'a checkout refusal for an undecided route is explained to the rep');

console.log('── Quick Close keeps the existing domain / agency safety ──');
const agencyOpt = cleanAnswers({ decision_maker: 'yes', approach: 'improve', manager: 'agency', access: 'not_sure', authority: 'yes' });
ok(quickCloseGate(agencyOpt).review.includes('optimise_access_unsure') && quickCloseState('answers_saved', { answers: agencyOpt }) === 'needs_review', 'agency-run site + Optimise + access unsure → Paul review (never silently Optimise)');
ok(quickCloseGate(cleanAnswers({ decision_maker: 'yes', approach: 'improve', manager: 'agency', access: 'yes', authority: 'yes' })).review.length === 0, 'agency-run site + Optimise + access confirmed + authority → no review');
/* ⛔ v2 (Paul, 2026-10-05): a domain doubt on a NEW site is a handoff for Paul, never a payment stop. */
ok(quickCloseGate(cleanAnswers({ ...base, domain: 'not_sure', route: 'build' })).review.length === 0 && quickCloseGate(cleanAnswers({ ...base, domain: 'not_sure', route: 'build' })).flags.includes('domain_handoff'), 'Build with domain doubt → a domain-handoff flag for Paul, not a payment stop (v2)');
ok(quickCloseGate(cleanAnswers({ decision_maker: 'yes', approach: 'new_template', domain: 'yes', manager: 'agency', access: 'no', authority: 'not_sure' })).review.length === 0, 'a NEW site is never stopped by who runs (or who can get into) the OLD one (v2)');
ok(quickCloseGate(cleanAnswers({ decision_maker: 'yes', approach: 'improve', manager: 'agency', access: 'yes', authority: 'not_sure' })).review.includes('third_party_authority_unsure'), 'Optimise on an agency site with authority unsure → Paul review, as before');

console.log('── 5. SELF-SERVICE ≡ QUICK CLOSE (one column, one reading) ──');
/* findable-site writes plan_tier = planTierForAnswer(siteAccess) and website_addon = needsNewWebsite(siteAccess)
   from ONE answer (yes_access = keep; anything else = build). Those are the rows it produces: */
const selfServiceRow = (answer: 'yes_access' | 'no_access' | 'want_new' | 'no_website') =>
  ({ plan_tier: answer === 'yes_access' ? 'keep' : 'new_site', website_addon: answer !== 'yes_access' });
ok(serviceRouteFromRow(selfServiceRow('yes_access')) === serviceRouteFromRow(onboardingColumnsFor(cleanAnswers({ ...base, route: 'optimise' }))), 'self-service "yes, you can edit it" ≡ Quick Close Optimise');
for (const a of ['no_access', 'want_new', 'no_website'] as const) ok(serviceRouteFromRow(selfServiceRow(a)) === 'build', `self-service ${a} ≡ Quick Close Build`);
ok(serviceRouteFromRow({ plan_tier: null }) === null && serviceRouteFromRow({}) === null && serviceRouteFromRow({ plan_tier: 'gold' }) === null, 'no / unknown route → null (checkout refuses; no silent 12 or 6)');
ok(serviceRouteFromRow({ plan_tier: 'keep', website_addon: true }) === null && serviceRouteFromRow({ plan_tier: 'new_site', website_addon: false }) === null, 'a row whose route and site answer disagree → null (the old hardcoded-keep rows cannot sell 6 payments)');
ok(serviceRouteFromRow({ plan_tier: 'keep', website_addon: null }) === 'optimise' && serviceRouteFromRow({ plan_tier: 'new_site' }) === 'build', 'a row with no site flag reads its route');
const checkout = code('supabase/functions/findable-checkout/index.ts');
ok(/const route = serviceRouteFromRow\(ob/.test(checkout) && /if \(!route\) \{[\s\S]{0,300}error: "route_undecided"/.test(checkout), 'checkout: route from the ROW; none → 409 route_undecided before any Stripe session');
ok(checkout.indexOf('route_undecided') < checkout.indexOf('checkout/sessions'), 'the route refusal comes before the Stripe call');
ok(/"metadata\[service_route\]", route/.test(checkout) && /"metadata\[total_payments\]", String\(totalPaymentsFor\(route\)\)/.test(checkout), 'checkout: the session carries the route and count to the webhook');
ok(/cardSavedNoticeFor\(route\)/.test(checkout) && /checkoutLineNameFor\(route\)/.test(checkout), 'checkout: the Stripe page names THIS route\'s count (card notice + line name)');
ok(!/body\.(plan_tier|route|service_route|total_payments)/.test(checkout), 'the browser never decides the route (nothing read from the request)');
ok(/line_items\[0\]\[price_data\]\[unit_amount\]", String\(Math\.round\(offer\.gbp \* 100\)\)/.test(checkout), 'the £99 line is unchanged (inline price_data, the guarantee\'s carrier)');
for (const r of ['build', 'optimise'] as const) {
  const n = totalPaymentsFor(r);
  ok(cardSavedNoticeFor(r).includes(`${n} payments in total, including today's`) && (r === 'build' ? /continues at £29\.99 a month for hosting and monitoring until you cancel/.test(cardSavedNoticeFor(r)) : /the payments stop/.test(cardSavedNoticeFor(r))), `card notice (${r}): ${n} payments including today's, then ${r === 'build' ? 'the £29.99 continuing service' : 'the payments stop'} (v4)`);
  ok(checkoutLineNameFor(r).startsWith(r === 'build' ? 'Findable Build' : 'Findable Optimise') && checkoutLineNameFor(r).includes(`${n} payments in total`), `Stripe line name (${r}) names the route and ${n}`);
}

console.log('── 5b. THE QUICK CLOSE DOMAIN GATE STAYS QUICK CLOSE\'S ──');
const qcBuildRow = { ...onboardingColumnsFor(cleanAnswers({ ...base, route: 'build' })), business_website: 'https://x.co.uk' };
ok(domainAuthority(domainInputFromRow(qcBuildRow)).applies && !domainAuthority(domainInputFromRow(qcBuildRow)).ready, 'a Quick Close Build row does not carry the self-service consents (the domain rule alone would refuse it)');
ok(/const quickCloseCleared = mayGenerateLink\(/.test(checkout) && /if \(domain\.applies && !domain\.ready && !quickCloseCleared\)/.test(checkout), 'checkout: a Quick Close that passed ITS gate (or Paul released it) is not refused for the self-service consents');
ok(/quick_close_domain_gate:/.test(checkout), 'and each such session is recorded as having used the Quick Close domain gate');

console.log('── 6. THE ROUTE CANNOT CHANGE AFTER PAYMENT WITHOUT AN ADMIN SQL CHANGE ──');
const mig = read('supabase/migrations/20260929170000_service_route.sql');
ok(/create trigger trg_onboarding_paid_route_lock before update on public\.onboarding_responses/.test(mig), 'a trigger guards the onboarding row');
ok(/old\.status = 'paid'/.test(mig) && /new\.plan_tier is distinct from old\.plan_tier or new\.website_addon is distinct from old\.website_addon/.test(mig) && /in \('anon', 'authenticated', 'service_role'\)/.test(mig), '…refusing a route change on a PAID row from any API role (app, sales, edge functions)');
ok(/create trigger trg_outreach_leads_contract_immutable/.test(mig) && /old\.contract_total_payments is not null/.test(mig), 'the stamped contract on the lead is immutable through the API too');
/* Wave 1 integration: the refusal is judged on the LEAD (money, a paid-or-beyond status, refunded, ended),
   with the row's status as a second signal — a row that reads 'paid' is still refused. */
ok(/const closedRefusal = quickCloseClosedRefusal\(lead as never, row as never\);\s*if \(closedRefusal\) return json\(\{ ok: false, error: closedRefusal\.error/.test(qcFn), 'Quick Close refuses any change once paid (now judged on the lead, the row as a second signal)');
ok(!/update\([^)]*plan_tier/.test(code('supabase/functions/paid-client-hub/index.ts')), 'Paid Clients never writes the route');

console.log('── 7. DOUBLE CLICK → ONE CHECKOUT (unchanged) ──');
/* 2026-10-04: the claim is a rev-conditional write now (quick-close-links.test.ts drives it end to end). */
ok(/if \(step\.kind === "reuse"\)/.test(qcFn) && /link_claimed_at: new Date\(\)\.toISOString\(\), link_claimed_by: actor\.id/.test(qcFn), 'a usable link is reused; a concurrent click waits on the claim');
ok(/if \(changed\.length && cur\?\.link_url\)/.test(code('src/lib/quickClose.ts')) && /reason: "answers_changed"/.test(qcFn), 'changing the route (an answer) invalidates the old link — and expires it at Stripe — so a link always matches its route');

console.log('── 8, 9. THE WEBHOOK: ROUTE FROM THE SESSION, LEDGER AND ATTRIBUTION UNCHANGED ──');
ok(resolvePaidRoute({ service_route: 'build', total_payments: '12' }, 'build').route === 'build', 'session build + row build → build');
ok(resolvePaidRoute({ service_route: 'optimise', total_payments: '6' }, 'optimise').route === 'optimise', 'session optimise + row optimise → optimise');
ok(resolvePaidRoute({ service_route: 'optimise', total_payments: '6' }, undefined).route === 'optimise', 'row unreadable → the session decides');
ok(resolvePaidRoute({ service_route: 'optimise', total_payments: '6' }, 'build').route === null, 'the row changed after the link → NO schedule (Paul told), never a guess');
ok(resolvePaidRoute({ service_route: 'optimise', total_payments: '12' }, 'optimise').route === null, 'a count that does not match the route → no schedule');
ok(resolvePaidRoute({}, 'build').route === null && /created before routes existed/.test(resolvePaidRoute({}, 'build').problem ?? ''), 'a session with no route (pre-change) → no schedule, with the reason');
const wh = code('supabase/functions/stripe-webhook/index.ts');
ok(/const paid = resolvePaidRoute\(s\.metadata \?\? null, rowReadOk \? rowRoute : undefined\)/.test(wh), 'the webhook resolves the route from the session + row');
/* 2026-10-05: + the timing (v3 hold vs legacy six weeks) after the claim key. */
/* 2026-10-06 (v4): + the sale's own commercial terms, so the subscription can say whether a Continuing Service follows. */
ok(/createDelayedSubscription\([\s\S]{0,500}paid\.route,\s*s\.id,\s*v3Checkout && s\.metadata\?\.payment_timing === OPTION_B_TIMING \? OPTION_B_TIMING : "legacy",\s*sessionTerms,\s*\)/.test(wh), 'and creates the subscription for THAT route (claimed by this checkout, pre-sales fix 03)');
ok(/\.update\(\{ contract_total_payments: totalPaymentsFor\(paid\.route\) \}\)[\s\S]{0,80}\.is\("contract_total_payments", null\)/.test(wh), 'the contract is stamped once, only when resolved, never over an existing one');
ok(/NO MONTHLY SCHEDULE WAS CREATED/.test(wh), 'a payment with no schedule says so in Paul\'s PAID email');
ok(/await recordLedger\(service, \{\s*lead_id: findableLeadId, kind: "initial"/.test(wh) && wh.indexOf('kind: "initial"') < wh.indexOf('contract_total_payments: totalPaymentsFor'), 'the initial payment is still written to the ledger first (attribution from sold_by at payment)');
ok(/establishLeadPayment\(service, findableLeadId/.test(wh) && /throw e;/.test(wh), 'the payment itself is still a must-write (conditional since pre-sales fix 03; a missing row still throws)');
ok(/charge\.refunded|refund/.test(wh) && /charge\.dispute/.test(wh), 'refund and dispute handling is still in the webhook');

console.log('── 8b, 9b, 10. COMMISSION: SAME RULE, NEVER PROJECTED PAST THE CONTRACT ──');
const L = (id: string, kind: string, amount: number, at: string, status = 'succeeded', extra: Partial<LedgerRow> = {}): LedgerRow =>
  ({ id, lead_id: 'opt', kind, status, amount_gbp: amount, occurred_at: at, stripe_object_id: id, stripe_payment_intent_id: `pi_${id}`, stripe_charge_id: `ch_${id}`, stripe_invoice_id: null, sold_by_user_id: 'rep', ...extra });
const optLedger = [L('p1', 'initial', 99, '2026-09-29T10:00:00Z'), L('p2', 'recurring', 99, '2026-11-10T10:00:00Z'), L('p3', 'recurring', 99, '2026-12-10T10:00:00Z'), L('p4', 'recurring', 99, '2027-01-10T10:00:00Z')];
const run = (ledger: LedgerRow[], total: number | null) => commissionLines({ ledger, payouts: [], isCommissionable: (u) => u === 'rep', contractTotalOf: new Map([['opt', total]]) });
const c0 = run([optLedger[0]], 6).clients[0];
ok(c0.commissionablePaymentsLeft === 5, 'Optimise after payment 1: 5 commissionable recurring left — the next six, capped by its 5 remaining');
const lines4 = run(optLedger, 6).lines.filter((l) => l.kind === 'payment');
ok(lines4.find((l) => l.paymentNumber === 1)!.commission === 29.7 && lines4.filter((l) => l.paymentNumber > 1).every((l) => l.commission === 19.8), 'commission unchanged: 30% of the initial (£29.70), 20% of each monthly payment (£19.80 each)');
ok(run(optLedger, 6).clients[0].commissionablePaymentsLeft === 2, 'after three recurring: the 2 left in the Optimise contract (not the 3 the six-rule alone would allow)');
/* A hypothetical shorter contract proves the cap is real, not just the six-payment rule. */
ok(run([optLedger[0], optLedger[1]], 3).clients[0].commissionablePaymentsLeft === 1, 'a contract with only 2 recurring payments projects at most what is left of it (cap is the contract)');
ok(run([optLedger[0]], null).clients[0].commissionablePaymentsLeft === 6, 'unknown contract → the rule alone: the next six');
const proj = earningsTotals([], [], [{ leadId: 'opt', paymentsLeft: run([optLedger[0], optLedger[1]], 3).clients[0].commissionablePaymentsLeft, monthlyGbp: 99, active: true }], '2026-10-01');
ok(proj.projected === 19.8, 'the projection counts only payments inside the contract');
const refunded = run([...optLedger.slice(0, 2), L('r1', 'refund', 99, '2026-11-12T10:00:00Z', 'succeeded', { stripe_payment_intent_id: 'pi_p1', stripe_charge_id: 'ch_p1' })], 6);
ok(refunded.lines.some((l) => l.kind === 'reversal' && l.commission === -29.7), 'a guarantee refund still reverses the initial commission');
const disputed = run([...optLedger.slice(0, 2), L('d1', 'chargeback', 99, '2026-11-20T10:00:00Z', 'needs_response', { stripe_payment_intent_id: 'pi_p2', stripe_charge_id: 'ch_p2' })], 6);
ok(disputed.lines.some((l) => l.held && l.commission === -19.8), 'an open dispute still HOLDS the commission on that payment');
ok(run(optLedger, 6).clients[0].sellerId === 'rep', 'attribution: the seller is the ledger snapshot, unchanged');
ok(/contractTotalOf: new Map\(\[\.\.\.leads\]\.map\(\(\[id, l\]\) => \[id, l\.contract_total_payments \?\? null\]\)\)/.test(code('supabase/functions/_shared/earnings.ts')), 'the earnings loader passes each client\'s contract');

console.log('── 11, 12. OWNERSHIP WORDS PER ROUTE ──');
ok(findableSiteKind({ plan_tier: 'new_site' }) === 'findable_built' && findableSiteKind({ plan_tier: 'keep' }) === 'client_owned', 'Build → a site we build; Optimise → the client\'s own site');
const buildEnd = termCompleteEmail({ siteKind: 'findable_built', totalPayments: 12 }).paragraphs.join(' ');
const optEnd = termCompleteEmail({ siteKind: 'client_owned', totalPayments: 6 }).paragraphs.join(' ');
ok(/All 12 of your payments are complete, so your 12-month term/.test(buildEnd) && /transfers to you/.test(buildEnd), 'Build term complete: 12 payments, and the build transfers to them');
ok(/All 6 of your payments are complete, so your 6-month term/.test(optEnd) && !/transfer|ownership|suspend|offline|take.{0,10}down/i.test(optEnd), 'Optimise term complete: 6 payments, NO ownership / transfer / suspension words');
ok(!/\d+ of your payments/.test(termCompleteEmail({ siteKind: 'unknown', totalPayments: null }).paragraphs.join(' ')), 'unknown count → no number');
const optCancel = subscriptionEndedEmail({ becauseOfPayment: false, siteKind: 'client_owned' }).paragraphs.join(' ');
ok(/Your pages stay exactly where they are and nothing has been taken down/.test(optCancel) && !/terms\//.test(optCancel), 'Optimise client leaving: their pages stay, nothing taken down, no build terms');
ok(/website we built and host for you is set out in our terms/.test(subscriptionEndedEmail({ becauseOfPayment: false, siteKind: 'findable_built' }).paragraphs.join(' ')), 'Build client leaving: pointed at the build terms (unchanged)');
for (const r of ['build', 'optimise'] as const) {
  const soon = monthlyStartingSoonEmail({ businessName: 'X', startsOn: '10 November 2026', cancelUrl: null, route: r }).paragraphs.join(' ');
  ok(soon.includes(`${totalPaymentsFor(r)} payments in total`) && !soon.includes(`${totalPaymentsFor(r === 'build' ? 'optimise' : 'build')} payments`), `starting-soon email (${r}): names only its own count`);
  const res = resultsEmailParagraphs({ businessName: 'X', town: 'Y', beforeNamed: 1, beforeAnswered: 20, afterNamed: 5, afterAnswered: 20, questions: 20, wentUp: true, withinNoise: false, documentUrl: 'https://x', monthlyStartsOn: '10 November 2026', totalPayments: totalPaymentsFor(r) }).join(' ');
  ok(res.includes(`payment 2 of ${totalPaymentsFor(r)}`), `four-week results (${r}): payment 2 of ${totalPaymentsFor(r)}`);
}
ok(subscriptionTotalPayments({ metadata: { total_payments: '6' } }) === 6 && subscriptionRoute({ metadata: { service_route: 'optimise', total_payments: '6' } }) === 'optimise', 'a subscription reports its own count / route');
ok(subscriptionTotalPayments({ metadata: { product: 'findable_standard_monthly' } }) === 12, 'a pre-route subscription (our tag, no count) was the one 12-payment plan');
ok(subscriptionTotalPayments({ metadata: {} }) === null, 'anything else → unknown, never a guess');
{
  const t = sec('2026-11-10T11:00:00Z');
  const optDone = { trial_end: t, cancel_at: minimumTermCancelAt(t, 5), ended_at: minimumTermCancelAt(t, 5), metadata: { total_payments: '6' } };
  ok(subscriptionEndedByTerm(optDone, false), 'Optimise reaching its own cancel_at → term complete');
  ok(!subscriptionEndedByTerm({ ...optDone, metadata: { total_payments: '12' } }, false), 'the same dates on a 12-payment subscription → NOT complete (it ended 6 months early)');
  ok(!subscriptionEndedByTerm({ ...optDone, metadata: {} }, false), 'no count → never "complete"');
}

console.log('── 13. HISTORICAL CLIENTS ARE NOT MIGRATED ──');
ok(!/\bupdate\b[^;]*\bset\b/i.test(mig.replace(/--.*$/gm, '')), 'the migration updates no rows');
ok(/add column if not exists contract_total_payments smallint;/.test(mig) && !/contract_total_payments smallint (not null|default)/.test(mig), 'the contract column is nullable with no default (nothing fabricated)');
const hist = clientContract({ lead: { amount_paid: 49.99, contract_total_payments: null }, onboarding: { plan_tier: null, website_route: 'rebuild_existing' }, ledger: [] });
ok(hist.route === null && hist.totalPayments === null && hist.paymentsRemaining === null && /not recorded/.test(hist.note ?? ''), 'a pre-route client shows "term not recorded — Paul to confirm", never a 12 or 6');
ok(hist.work === 'building' && hist.paymentsMade === 1, '…while the work (building) and the sign-up payment are still shown');
ok(clientContract({ lead: { contract_total_payments: null }, onboarding: { plan_tier: 'keep' } }).totalPayments === null, 'an existing website on a historical row does not make it a 6-payment contract');
const opt = clientContract({ lead: { contract_total_payments: 6, amount_paid: 99, stripe_subscription_id: 'sub_1', subscription_status: 'trialing', subscription_renews_at: '2026-11-10T11:00:00Z' }, onboarding: { plan_tier: 'keep' }, ledger: [{ kind: 'initial', status: 'succeeded', amount_gbp: 99 }] });
ok(opt.name === 'Findable Optimise' && opt.totalPayments === 6 && opt.paymentsMade === 1 && opt.paymentsRemaining === 5 && opt.nextPaymentAt === '2026-11-10T11:00:00Z' && opt.work === 'optimising', 'admin record: Findable Optimise · 6 payments · 1 paid · 5 remaining · next 10 Nov · optimising');
ok(clientContract({ lead: { contract_total_payments: 12, amount_paid: 99 }, onboarding: { plan_tier: 'new_site' } }).note?.includes('No live monthly schedule'), 'a contracted client with no live subscription is flagged');

console.log('── WORDING ──');
ok(FINDABLE_OFFER_SUMMARY.includes('12 payments in total if we build you a new website') && FINDABLE_OFFER_SUMMARY.includes('6 payments in total if we optimise the one you have, then the payments stop'), 'the pre-choice summary names both lengths, and that Optimise stops (v4)');
ok(offerSummaryFor('optimise').includes('6 payments in total, a 6-month minimum term') && !offerSummaryFor('optimise').includes('12'), 'a route\'s summary names only its own length');
const allCopy = [FINDABLE_OFFER_SUMMARY, offerSummaryFor('build'), offerSummaryFor('optimise'), cardSavedNoticeFor('build'), cardSavedNoticeFor('optimise'), quickCloseScript('build'), quickCloseScript('optimise'), ...routeTermsLines('optimise')].join(' ');
ok(!/no commitment|cancel any ?time|stop any ?time|no minimum/i.test(allCopy), 'nothing describes either route as "no commitment" or cancel-any-time');
ok(serviceRouteForTotal(12) === 'build' && serviceRouteForTotal(6) === 'optimise' && serviceRouteForTotal(13) === null, 'a count maps back to its route, positively');

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURE(S)`);
process.exit(f === 0 ? 0 : 1);
