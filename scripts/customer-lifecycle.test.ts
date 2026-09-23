/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE CUSTOMER LIFECYCLE, END TO END (2026-09-23) — sign-up → six weeks → 11 monthly → stop.

   Pins what findable-offer-terms.test.ts does not: the four-week results email's billing date (it
   called an undefined `monthlyStartIso` and said the monthly started "that same day" as the claim
   window closed), the end-of-term email (a client who paid all 12 was told "your monthly has been
   cancelled"), and that ownership words reach only a site Findable built.
   Fixtures are real shapes: a 23 Sep sign-up, a month-end sign-up, a leap-day anchor, and a lead
   shaped like a client who signed up before subscriptions moved to sign-up (card saved, none made).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import {
  CARD_SAVED_NOTICE, FINDABLE_CONTRACT_TOTAL_GBP, FINDABLE_MONTHLY_DELAY_DAYS, FINDABLE_MONTHLY_GBP, FINDABLE_OFFER_SUMMARY,
  FINDABLE_RECURRING_PAYMENTS, FINDABLE_SETUP_PRICE_GBP, FINDABLE_TOTAL_PAYMENTS, findableSiteKind, firstRecurringPaymentIso,
  monthlyStartingSoonEmail, paymentFailedEmail, subscriptionEndedEmail, termCompleteEmail, type FindableSiteKind,
  FINDABLE_GUARANTEE, GUARANTEE_PAYMENT_TWO_SENTENCE, REMEASURE_CLAIM_SENTENCE, remeasureWeeksFor,
} from '../src/lib/findableOffer.ts';
import * as results from '../src/lib/remeasureResults.ts';
import { claimWindowCloseIso, currentTermsVerdict, resultsBillingStartIso, resultsDocumentMeaning, resultsEmailParagraphs, resultsEmailSubject } from '../src/lib/remeasureResults.ts';
import { remeasureDueFill } from '../src/lib/remeasureFill.ts';
import { minimumTermCancelAt, subscriptionEndedByTerm } from '../supabase/functions/_shared/delayed-subscription.ts';
import { buildColdCallPlaybook } from '../src/lib/coldCallPlaybook.ts';

let f = 0;
const ok = (c: unknown, l: string) => { if (!c) f++; console.log((c ? 'PASS ' : 'FAIL ') + l); };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const pretty = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/* Stripe's monthly billing from an anchor, clamped to month end, stopped by cancel_at (as in
   findable-offer-terms.test.ts). Returns every recurring charge Stripe would make. */
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

console.log('── 1–5, 8, 12. SIGN-UP → FIRST RECURRING → LAST → NOTHING AFTER, FROM THE ONE DATE FUNCTION ──');
const SIGNUPS: Array<[string, string]> = [
  ['23 Sep 2026 10:00 (today)', '2026-09-23T10:00:00.000Z'],
  ['31 Jan 2027 (six weeks → 14 Mar)', '2027-01-31T16:20:00.000Z'],
  ['18 Jan 2028 (six weeks → 29 Feb, leap day)', '2028-01-18T12:00:00.000Z'],
  ['19 Nov 2026 (six weeks → 31 Dec, then short months)', '2026-11-19T23:59:00.000Z'],
];
for (const [label, signup] of SIGNUPS) {
  const first = firstRecurringPaymentIso(signup)!;
  ok(Date.parse(first) - Date.parse(signup) === FINDABLE_MONTHLY_DELAY_DAYS * 86_400_000, `${label}: first recurring is exactly six weeks after sign-up (${first.slice(0, 10)})`);
  const cancelAt = minimumTermCancelAt(sec(first));
  const charges = recurringCharges(sec(first), cancelAt);
  ok(charges.length === FINDABLE_RECURRING_PAYMENTS, `${label}: ${charges.length} recurring payments follow the sign-up (want ${FINDABLE_RECURRING_PAYMENTS})`);
  ok(1 + charges.length === FINDABLE_TOTAL_PAYMENTS, `${label}: the sign-up £${FINDABLE_SETUP_PRICE_GBP} is payment 1 → ${1 + charges.length} in total`);
  ok(FINDABLE_SETUP_PRICE_GBP + charges.length * FINDABLE_MONTHLY_GBP === 1188 && FINDABLE_CONTRACT_TOTAL_GBP === 1188, `${label}: £1,188 nominal`);
  /* What a 13th payment would be: the next anchor after the last one. It must fall at or after cancel_at. */
  const next = recurringCharges(sec(first), Number.MAX_SAFE_INTEGER)[FINDABLE_RECURRING_PAYMENTS];
  ok(next >= cancelAt, `${label}: the would-be 13th (${new Date(next * 1000).toISOString().slice(0, 10)}) is at or after the end (${new Date(cancelAt * 1000).toISOString().slice(0, 10)}) — never charged`);
}
ok(firstRecurringPaymentIso(null) === null && firstRecurringPaymentIso('junk') === null && firstRecurringPaymentIso('') === null, 'no / unreadable sign-up → no date, never NaN');
const subSrc = code('supabase/functions/_shared/delayed-subscription.ts');
ok(/firstRecurringPaymentIso\(signupAtIso\)/.test(subSrc) && !/FINDABLE_MONTHLY_DELAY_DAYS \*/.test(subSrc), 'the Stripe trial_end comes from firstRecurringPaymentIso — no second copy of the sum');

console.log('── 6, 7. THE FOUR-WEEK RESULTS EMAIL NAMES STRIPE\'S DATE, OR NONE ──');
{
  const signup = '2026-09-23T10:00:00.000Z';
  const renews = firstRecurringPaymentIso(signup)!;          // what createDelayedSubscription stores
  const resultsSent = '2026-10-22T09:30:00.000Z';           // baseline frozen ~24 Sep + 28 days
  const standard = { subscriptionId: 'sub_1Q', subscriptionStatus: 'trialing', subscriptionRenewsAt: renews, nowIso: resultsSent };
  const billing = resultsBillingStartIso(standard);
  ok(billing === renews, `a trialing subscription → its own renewal date (${billing})`);
  ok(billing !== claimWindowCloseIso(resultsSent), `billing (${billing?.slice(0, 10)}) and the claim window close (${claimWindowCloseIso(resultsSent)?.slice(0, 10)}) are two clocks, not one`);
  const base = { businessName: 'MCLocksmiths', town: 'Canterbury', beforeNamed: 4, beforeAnswered: 120, afterNamed: 11, afterAnswered: 120, questions: 20, documentUrl: 'https://findable.live/results/x', withinNoise: false };
  for (const wentUp of [true, false]) {
    const p = resultsEmailParagraphs({ ...base, wentUp, monthlyStartsOn: pretty(billing!) });
    const line = p.find((x) => x.includes('4 November 2026')) ?? '';
    ok(!!line && line.includes(`£${FINDABLE_MONTHLY_GBP}`), `wentUp=${wentUp}: names 4 November 2026 and £${FINDABLE_MONTHLY_GBP}`);
    ok(/payment 2 of 12/.test(line) && /nothing is charged after the 12th/.test(line), `wentUp=${wentUp}: counts it as payment 2 of 12, nothing after the 12th`);
    ok(!p.some((x) => /same day/i.test(x)), `wentUp=${wentUp}: no "that same day" — billing is not tied to the claim window`);
  }
  /* A client like MCLocksmiths: card saved, no subscription (signed up the day before sign-up subscriptions). */
  ok(resultsBillingStartIso({ subscriptionId: null, subscriptionStatus: null, subscriptionRenewsAt: null, nowIso: resultsSent }) === null, 'no subscription → no billing date');
  ok(resultsBillingStartIso({ ...standard, subscriptionStatus: 'active' }) === null, 'already billing (results late) → no "first payment is on" line');
  ok(resultsBillingStartIso({ ...standard, subscriptionRenewsAt: '2026-10-01T00:00:00.000Z' }) === null, 'a renewal date already past → none');
  ok(resultsBillingStartIso({ ...standard, subscriptionRenewsAt: 'junk' }) === null && resultsBillingStartIso({ ...standard, subscriptionRenewsAt: null }) === null, 'unreadable → none, never "Invalid Date"');
  ok(resultsBillingStartIso({ ...standard, subscriptionStatus: null }) === null, 'unknown status → none (positive match on trialing)');
  const none = resultsEmailParagraphs({ ...base, wentUp: true, monthlyStartsOn: null });
  ok(!none.some((x) => /monthly|payment/i.test(x)), 'with no date the email says nothing about billing');

  /* The crash itself: the name is gone, nothing aliases the claim window as a billing date, and the
     words are built BEFORE the send is claimed so no throw can strand a stamp. */
  ok(!('monthlyStartIso' in results), 'remeasureResults.ts no longer exports monthlyStartIso (the claim-window alias)');
  const sender = code('supabase/functions/_shared/remeasure-results.ts');
  ok(!/monthlyStartIso/.test(sender), 'the sender never calls monthlyStartIso');
  /* (Matched on the import's own list, not a regex naming the module path — check-import-graph reads
     such a pattern as an import and fails the gate.) */
  ok(/currentTermsVerdict, resultsBillingStartIso, type CurrentTermsVerdict,\s*\}/.test(read('supabase/functions/_shared/remeasure-results.ts')), 'resultsBillingStartIso is IMPORTED by the sender');
  const built = sender.indexOf('resultsEmailParagraphs(copy)');
  const claim = sender.indexOf('.is("remeasure_results_sent_at", null)');
  ok(built > 0 && claim > 0 && built < claim, 'the email words are built before the once-only claim');
  ok(/subscription_status, subscription_renews_at/.test(sender), 'the bundle reads the subscription status and renewal date');
}

console.log('── 9, 10. NO £29.99, NO FREE EXIT, IN ANY ACTIVE LIFECYCLE TEXT ──');
const KINDS: FindableSiteKind[] = ['findable_built', 'client_owned', 'unknown'];
const texts: Array<[string, string]> = [
  ['card notice', CARD_SAVED_NOTICE],
  ['offer summary', FINDABLE_OFFER_SUMMARY],
  ['monthly-starts reminder', monthlyStartingSoonEmail({ businessName: 'X', startsOn: '4 November 2026', cancelUrl: 'https://billing.stripe.com/p/x' }).paragraphs.join(' ')],
  ['payment failed', paymentFailedEmail({ payUrl: null }).paragraphs.join(' ')],
  ['results (up, with billing)', resultsEmailParagraphs({ businessName: 'X', town: 'T', beforeNamed: 1, beforeAnswered: 10, afterNamed: 5, afterAnswered: 10, questions: 3, wentUp: true, withinNoise: false, documentUrl: 'u', monthlyStartsOn: '4 November 2026' }).join(' ')],
  ['results (not up, with billing)', resultsEmailParagraphs({ businessName: 'X', town: 'T', beforeNamed: 1, beforeAnswered: 10, afterNamed: 1, afterAnswered: 10, questions: 3, wentUp: false, withinNoise: true, documentUrl: 'u', monthlyStartsOn: '4 November 2026' }).join(' ')],
  ['results document', resultsDocumentMeaning({ businessName: 'X', town: 'T', beforeNamed: 1, beforeAnswered: 10, afterNamed: 1, afterAnswered: 10, questions: 3, wentUp: false, withinNoise: false, documentUrl: 'u' }).join(' ')],
  ...KINDS.flatMap((k) => [
    [`ended by card (${k})`, subscriptionEndedEmail({ becauseOfPayment: true, siteKind: k }).paragraphs.join(' ')],
    [`ended on purpose (${k})`, subscriptionEndedEmail({ becauseOfPayment: false, siteKind: k }).paragraphs.join(' ')],
    [`term complete (${k})`, termCompleteEmail({ siteKind: k }).paragraphs.join(' ')],
  ] as Array<[string, string]>),
];
const pb = buildColdCallPlaybook({ lead: { id: 'l', business_name: 'Acme Plumbing', phone: '07700900123', website: null }, reportAudit: null, report: null, runCrawls: [], leadCrawl: null, messages: [], nowMs: Date.now() });
texts.push(['cold call playbook offer', JSON.stringify(pb.offer)]);
for (const [label, t] of texts) {
  ok(!/29\.99/.test(t), `${label}: no £29.99`);
  ok(!/(cancel|stop)( it)?( at)? any ?time|not binding|cancel before (it|week)/i.test(t), `${label}: no "cancel/stop any time", "not binding" or "cancel before it starts"`);
  ok(!/13 payments|12 (more|further) payments|plus 12/i.test(t), `${label}: nothing that implies a 13th payment`);
}

console.log('── 11. OWNERSHIP WORDS ONLY FOR A SITE FINDABLE BUILT ──');
ok(findableSiteKind({ plan_tier: 'new_site' }) === 'findable_built', 'questionnaire new_site → findable_built');
ok(findableSiteKind({ plan_tier: 'keep' }) === 'client_owned', 'questionnaire keep → client_owned');
ok(findableSiteKind({ website_route: 'rebuild_existing' }) === 'findable_built' && findableSiteKind({ website_route: 'new_site' }) === 'findable_built', 'hand-added rebuild / new site → findable_built');
ok(findableSiteKind({ website_route: 'optimise_existing' }) === 'client_owned', 'hand-added optimise → client_owned');
ok(findableSiteKind(null) === 'unknown' && findableSiteKind({}) === 'unknown' && findableSiteKind({ plan_tier: 'mystery' }) === 'unknown', 'blank / unrecognised → unknown');
ok(findableSiteKind({ plan_tier: 'keep', website_route: 'new_site' }) === 'unknown', 'a conflict → unknown, never a guess');
const OWN = /transfers? to you|website build|we built and host|we own|handover/i;
for (const k of KINDS) {
  const term = termCompleteEmail({ siteKind: k }).paragraphs.join(' ');
  ok(k === 'findable_built' ? /website build we made for you now transfers to you/.test(term) : !OWN.test(term), `term complete (${k}): ${k === 'findable_built' ? 'says the build transfers' : 'makes no ownership claim'}`);
  ok(/All 12 of your payments are complete/.test(term) && /nothing more will be charged/.test(term) && !/cancel/i.test(term), `term complete (${k}): all 12 paid, nothing more, not called a cancellation`);
  for (const byCard of [true, false]) {
    const e = subscriptionEndedEmail({ becauseOfPayment: byCard, siteKind: k }).paragraphs.join(' ');
    const stays = /stay exactly where they are/.test(e);
    ok(k === 'client_owned' ? stays : !stays, `ended (${byCard ? 'card' : 'choice'}, ${k}): "pages stay exactly where they are" only for a client-owned site`);
    ok(k === 'findable_built' ? /findable\.live\/terms\//.test(e) : !OWN.test(e), `ended (${byCard ? 'card' : 'choice'}, ${k}): ${k === 'findable_built' ? 'points at the terms' : 'no ownership words'}`);
  }
}
const report = read('src/lib/aiAuditReportHtml.ts');
ok(!/Building it is included in\s+your &pound;99/.test(report) && /no separate build fee: \$\{esc\(FINDABLE_OFFER_SUMMARY\)\}/.test(report), 'report no-website panel: no "included in your £99", names the whole offer');
ok(/If we build the site:/.test(pb.offer.monthly), 'the playbook scopes its ownership line to "If we build the site"');

console.log('── 12. THE END OF THE TERM IS RECOGNISED, AND ONLY THE END ──');
{
  const trialEnd = sec(firstRecurringPaymentIso('2026-09-23T10:00:00.000Z')!);
  const cancelAt = minimumTermCancelAt(trialEnd);
  const done = { cancel_at: cancelAt, trial_end: trialEnd, ended_at: cancelAt };
  ok(subscriptionEndedByTerm(done, false), 'reached our own cancel_at, not in arrears → term complete');
  ok(!subscriptionEndedByTerm(done, true), 'in arrears at the end → NOT complete (not all sums paid)');
  ok(!subscriptionEndedByTerm({ ...done, ended_at: cancelAt - 30 * 86400 }), 'ended a month early (a guarantee exit or a hand cancel) → not complete');
  ok(!subscriptionEndedByTerm({ ...done, cancel_at: cancelAt + 86400, ended_at: cancelAt + 86400 }, false), 'a hand-set cancel_at → not ours, not complete');
  ok(!subscriptionEndedByTerm({ trial_end: trialEnd, ended_at: cancelAt }, false) && !subscriptionEndedByTerm({ cancel_at: cancelAt, ended_at: cancelAt }, false) && !subscriptionEndedByTerm({ cancel_at: cancelAt, trial_end: trialEnd }, false), 'any date absent → not complete');
  const wh = code('supabase/functions/stripe-webhook/index.ts');
  ok(/subscriptionEndedByTerm\(/.test(wh) && /termCompleteEmail\(\{ siteKind \}\)/.test(wh) && /subscriptionEndedEmail\(\{ becauseOfPayment, siteKind \}\)/.test(wh), 'the webhook branches on it and passes the site kind to both endings');
}

console.log('── NEW DOMAINS: RE-MEASURED LATER, NOT EXCLUDED (Paul, 2026-09-23) ──');
{
  const frozen = '2026-09-24T11:00:00.000Z';
  const existing = { plan_tier: 'keep', domain_status: 'existing' };
  const builtExisting = { plan_tier: 'new_site', domain_status: 'existing' };
  const builtNew = { plan_tier: 'new_site', domain_status: 'new' };
  const handBuiltNew = { website_route: 'rebuild_existing', domain_status: 'new' };
  const keepNew = { plan_tier: 'keep', domain_status: 'new' };
  ok(remeasureWeeksFor(existing) === 4 && remeasureDueFill(null, frozen, remeasureWeeksFor(existing)) === '2026-10-22', 'established domain, their own site → four weeks (due 22 Oct)');
  ok(remeasureWeeksFor(builtExisting) === 4, 'a site we build on an EXISTING domain → four weeks');
  ok(remeasureWeeksFor(builtNew) === 8 && remeasureDueFill(null, frozen, remeasureWeeksFor(builtNew)) === '2026-11-19', 'a site we build on a brand-new domain → eight weeks (due 19 Nov)');
  ok(remeasureWeeksFor(handBuiltNew) === 8, 'a hand-added rebuild on a new domain → eight weeks');
  ok(remeasureWeeksFor(keepNew) === 4, 'a client-owned site is never on the new-domain clock');
  ok(remeasureWeeksFor(null) === 4 && remeasureWeeksFor({ plan_tier: 'new_site' }) === 4, 'blank domain answer → the standard four weeks');
  ok(!/excluded|does not apply/i.test(FINDABLE_GUARANTEE) && /four weeks \(eight if we build your site on a brand-new domain\)/.test(FINDABLE_GUARANTEE), 'the contractual guarantee names both clocks and excludes nobody');
  ok(FINDABLE_GUARANTEE.endsWith(REMEASURE_CLAIM_SENTENCE) && /14 days of your results/.test(REMEASURE_CLAIM_SENTENCE), 'the claim window counts from the results, whichever re-measure applies');
  /* The terms gate accepts each clock only for its own client. */
  const facts = { contract: { version: 2 }, amountPaid: 99, baselineFrozenAt: frozen };
  ok(currentTermsVerdict({ ...facts, remeasureDueDate: '2026-11-19', remeasureWeeks: 8 }).current === true, 'new-domain build with its +56 date → current terms');
  ok(currentTermsVerdict({ ...facts, remeasureDueDate: '2026-11-19', remeasureWeeks: 4 }).current === false, '+56 on a four-week client → refused (different clock)');
  ok(currentTermsVerdict({ ...facts, remeasureDueDate: '2026-10-22', remeasureWeeks: 4 }).current === true, 'four-week client on +28 → current');
  const w8 = resultsEmailParagraphs({ businessName: 'X', town: 'T', beforeNamed: 1, beforeAnswered: 10, afterNamed: 1, afterAnswered: 10, questions: 3, wentUp: false, withinNoise: false, documentUrl: 'u', weeks: 8 });
  ok(w8[1].startsWith('Eight weeks ago') && resultsEmailSubject({ businessName: 'X', weeks: 8 } as never) === 'Your eight-week results — X', 'an eight-week client is told "eight weeks", subject included');
  const w4 = resultsEmailParagraphs({ businessName: 'X', town: 'T', beforeNamed: 1, beforeAnswered: 10, afterNamed: 1, afterAnswered: 10, questions: 3, wentUp: false, withinNoise: false, documentUrl: 'u' });
  ok(w4[1].startsWith('Four weeks ago'), 'the standard client still reads "four weeks"');
  const sender = code('supabase/functions/_shared/remeasure-results.ts');
  ok(/remeasureWeeks: weeks/.test(sender) && /weeks: bundle\.weeks/.test(sender), 'the sender passes the clock to the terms gate and the words');
  ok(/remeasureWeeksFor\(obRow/.test(code('supabase/functions/_shared/audit-baseline.ts')), 'the due-date fill reads the clock from the onboarding row');
}

console.log('── A VALID CLAIM AND PAYMENT 2 (Paul, 2026-09-23) ──');
{
  ok(/has not been taken yet, it never is/.test(GUARANTEE_PAYMENT_TWO_SENTENCE) && /already been taken, we refund it as well/.test(GUARANTEE_PAYMENT_TWO_SENTENCE), 'the sentence covers both cases: stopped before it starts, or refunded');
  ok(!/any time|cancel/i.test(GUARANTEE_PAYMENT_TWO_SENTENCE), 'and grants no broader cancellation right');
  const notUp = resultsEmailParagraphs({ businessName: 'X', town: 'T', beforeNamed: 1, beforeAnswered: 10, afterNamed: 1, afterAnswered: 10, questions: 3, wentUp: false, withinNoise: false, documentUrl: 'u' }).join(' ');
  ok(notUp.includes(GUARANTEE_PAYMENT_TWO_SENTENCE) && !/before it begins/.test(notUp), 'the not-gone-up results email carries it; no "before it begins"');
  ok(!resultsEmailParagraphs({ businessName: 'X', town: 'T', beforeNamed: 1, beforeAnswered: 10, afterNamed: 5, afterAnswered: 10, questions: 3, wentUp: true, withinNoise: false, documentUrl: 'u' }).join(' ').includes(GUARANTEE_PAYMENT_TWO_SENTENCE), 'a client whose number went up is not offered it');
  const wh = code('supabase/functions/stripe-webhook/index.ts');
  ok(/REFUND RECORDED — cancel the monthly/.test(wh) && /refund it too/.test(wh), 'a refund on a live subscription alerts Paul to cancel it and refund payment 2 if taken');
}

if (f > 0) { console.log('\n' + f + ' FAILURE' + (f === 1 ? '' : 'S')); process.exit(1); }
console.log('\nALL PASS');
