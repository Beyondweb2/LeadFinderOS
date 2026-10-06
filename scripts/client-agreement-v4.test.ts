/* ════════════════════════════════════════════════════════════════════════════════════════════════
   CLIENT SERVICE AGREEMENT v4 + THE OPTIMISE FIXED TERM (Paul, 2026-10-06).

     OPTIMISE = 6 × £99 in total (the sign-up included), then the payments STOP — no £29.99, no
                continuation state, reminder, question or charge.
     BUILD    = 12 × £99 in total, the site is theirs, then £29.99 a month until cancelled.

   Pinned here: v4 is v3 plus the listed amendments and nothing else; v3 (and v1) still render and verify
   against the exact text that was signed; the payment gate, the webhook, the timeline, the hub, the
   Welcome Pack, the emails and the checkout all follow the CLIENT'S OWN terms; the migration exists.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import {
  AGREEMENT_FIRST_TERMS, CLIENT_AGREEMENT_VERSION, V4_AMENDMENTS, acceptanceRowFrom, agreementVersion, blockText, isAgreementFirstVersion,
  renderAgreementText, sha256Hex, versionTemplateText, type AgreementFill,
} from '../src/lib/clientAgreement.ts';
import {
  COMMERCIAL_TERMS_CURRENT, COMMERCIAL_TERMS_V3, COMMERCIAL_TERMS_V4, OPTION_B_TIMING, continuingServiceApplies, isOptionBTerms, isV3Terms,
  minimumTerm, subscriptionContinuesAfterTerm, timelineActions, timelineView, type TimelineFacts,
} from '../src/lib/clientTimeline.ts';
import {
  FINDABLE_CONTINUING_GBP, afterTermWordsFor, cardSavedNoticeFor, checkoutLineNameFor, continuingServiceAfterTerm, offerSummaryFor,
  recurringPaymentsFor, termCompleteEmail, totalPaymentsFor,
} from '../src/lib/findableOffer.ts';
import { checkoutAgreementGate, webhookV3Verdict, type GateAcceptance } from '../src/lib/signupGate.ts';
import { agreementPageHtml } from '../src/lib/agreementPageHtml.ts';
import { afterTermKeyPoint } from '../src/lib/welcomePackHtml.ts';
import { resultsEmailParagraphs } from '../src/lib/remeasureResults.ts';

let f = 0;
const ok = (cond: unknown, msg: string) => { if (cond) console.log('  PASS ' + msg); else { f++; console.log('  FAIL ' + msg); } };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

/** The v4 template's fingerprint. A changed word is a NEW version (v5), never an edit of v4. */
const V4_TEMPLATE_SHA = '2d81cebd76727238153884042d8dc2f2d0a2184ec790c3a003263629ce894eab';
const V3_TEMPLATE_SHA = '3e1edf3b7ee6ca38704dbfb3dc4fdce67c1c73863b62c689510d304b3c2e6bc2';

async function main() {
  console.log('── 1. v4 IS CURRENT; v1 AND v3 STAY READABLE AND UNCHANGED ──');
  ok(CLIENT_AGREEMENT_VERSION === 'v4', 'new sign-ups sign v4');
  ok(['v1', 'v3', 'v4'].every((v) => agreementVersion(v).version === v), 'v1, v3 and v4 all render');
  ok(await sha256Hex(versionTemplateText('v3')) === V3_TEMPLATE_SHA, 'v3\'s template fingerprint is unchanged (no v3 word moved)');
  const v4sha = await sha256Hex(versionTemplateText('v4'));
  ok(v4sha === V4_TEMPLATE_SHA, 'v4 template fingerprint is pinned (got ' + v4sha + ')');
  ok(isAgreementFirstVersion('v3') && isAgreementFirstVersion('v4') && !isAgreementFirstVersion('v1') && !isAgreementFirstVersion('toString'), 'agreement-first versions: v3 and v4 only');
  ok(AGREEMENT_FIRST_TERMS.v3 === COMMERCIAL_TERMS_V3 && AGREEMENT_FIRST_TERMS.v4 === COMMERCIAL_TERMS_V4 && COMMERCIAL_TERMS_CURRENT === COMMERCIAL_TERMS_V4, 'each version names its own commercial terms (one value each)');

  console.log('── 2. v4 = v3 + THE LISTED AMENDMENTS, NOTHING ELSE ──');
  const v3 = agreementVersion('v3'); const v4 = agreementVersion('v4');
  const replaced = V4_AMENDMENTS.filter((a) => a.op === 'replace').map((a) => (a as { num: string }).num);
  ok(replaced.join() === '3.1,3.2,9.3,9A.1,9A.2,9A.4,15.1', 'replaced clauses: 3.1, 3.2, 9.3, 9A.1, 9A.2, 9A.4, 15.1');
  const v4Text = new Set(v4.body.map(blockText));
  const untouched = v3.body.filter((b) => !(b.kind === 'clause' && replaced.includes(b.num)) && !(b.kind === 'heading' && b.text.startsWith('9A.')));
  ok(untouched.every((b) => v4Text.has(blockText(b))), 'every other v3 block is in v4 word for word (' + untouched.length + ')');
  ok(v4.body.length === v3.body.length + 3, 'v4 adds exactly three blocks (the 9B heading, 9B.1, 9B.2)');
  ok(v4.body.findIndex((b) => b.kind === 'clause' && b.num === '9B.1') === v4.body.findIndex((b) => b.kind === 'clause' && b.num === '9A.5') + 2, '9B follows 9A.5');
  ok(v4.intro === v3.intro && v4.services.build.description === v3.services.build.description && JSON.stringify(v4.findableDetails) === JSON.stringify(v3.findableDetails), 'intro, Build service box and Findable details unchanged');
  ok(v4.schedule.rows.length === v3.schedule.rows.length + 1 && JSON.stringify(v4.schedule.rows.slice(0, -1)) === JSON.stringify(v3.schedule.rows), 'Schedule 1 keeps every v3 row and adds one');

  console.log('── 3. THE v4 WORDS ──');
  const all = renderAgreementText({ businessName: 'Acme', route: 'optimise' }, 'v4');
  ok(/6 payments in total \(1 initial \+ 5 monthly\)\. Then the payments stop: nothing further is charged \(clause 9B\)\./.test(v4.services.optimise.description) && !/29\.99/.test(v4.services.optimise.description), 'Optimise box: 6 payments, then the payments stop — no £29.99');
  ok(/12 payments in total \(1 initial \+ 11 monthly\)\. Then £29\.99 a month for hosting and monitoring/.test(v4.services.build.description), 'Build box: 12 payments, then £29.99 for hosting and monitoring');
  ok(/Findable Build continues at £29\.99 a month .*Findable Optimise ends with your sixth payment and nothing further is charged \(clause 9B\)/.test(v4.keyPoints!.points[2]), 'key point: Build continues, Optimise ends');
  ok(/^9A\. CONTINUING SERVICE AFTER THE MINIMUM TERM \(FINDABLE BUILD ONLY\)$/m.test(all) && /^9A\.1 When the minimum term of a Findable Build service ends/m.test(all), '9A is Findable Build only');
  ok(/^9B\.1 Findable Optimise is a fixed term\. When we receive your sixth payment .*we will not take any further payment\. There is no Continuing Service for Findable Optimise/m.test(all), '9B.1: the fixed term, no further payment, no Continuing Service');
  ok(!/^9A\.1 When your minimum term ends, your service continues/m.test(all) && !/for Findable Optimise, ongoing AI visibility monitoring and reasonable updates to your website/.test(all), 'v3\'s "both continue" words are not in v4');
  ok(/^After the minimum term \| £29\.99 a month .* \| Nothing further to pay: the payment plan is complete \(clause 9B\)$/m.test(all), 'Schedule 1: what happens after the minimum term, per service');
  ok(/^5\.6 Payment Start Date\. Your first monthly payment is taken on the day after your Refund Window ends/m.test(all) && /^5\.8 The guarantee does not apply if: \(a\) you have not given us the access/m.test(all), 'the v3 timing (5.6) and the no-access fallback (5.8) are kept, separately');

  console.log('── 4. HISTORICAL SIGNATURES STILL VALIDATE AGAINST THEIR OWN TEXT ──');
  const fill: AgreementFill = { businessName: 'Acme Plumbing', route: 'optimise', legalName: 'Acme Ltd', contactName: 'Jo', role: 'Owner', address: '1 St', email: 'jo@acme.test', phone: '07700 900000' };
  const v3Text = renderAgreementText(fill, 'v3');
  const v3Row = acceptanceRowFrom({ leadId: 'L', fill, method: 'agree_page', agreedText: v3Text, sha256: await sha256Hex(v3Text), version: 'v3', v3: { onboardingId: 'OB', authorityConfirmed: true, marketingOptOut: false, commercialTerms: COMMERCIAL_TERMS_V3 } });
  ok(await sha256Hex(renderAgreementText(fill, v3Row.agreement_version)) === v3Row.agreed_text_sha256, 'a v3 signature re-renders from its record to the SAME fingerprint');
  ok(await sha256Hex(renderAgreementText(fill, 'v4')) !== v3Row.agreed_text_sha256, '…and never matches the v4 text (the versions are distinct)');
  ok(/Then £29\.99 a month for monitoring, until you cancel \(clause 9A\)/.test(v3Text), 'a v3 Optimise signer keeps the words they signed (their Continuing Service)');
  ok(/version: row\.agreement_version/.test(read('supabase/functions/_shared/client-agreement.ts')) && /agreementVersion\(acc\.version\)/.test(read('src/lib/agreementPdf.ts')), 'the PDF of a stored signature is built from ITS version, never the current one');
  ok(/ensureAgreementVersion\(service, row\.agreement_version\)/.test(read('supabase/functions/_shared/client-agreement.ts')), 'the version registry row is written for the signature\'s own version');

  console.log('── 5. THE PAYMENT GATE AND THE WEBHOOK ──');
  const sha = 'h';
  const acc = (version: string): GateAcceptance => ({ id: 'A', lead_id: 'L', onboarding_id: 'OB', agreement_version: version, service_route: 'optimise', method: 'agree_page', authority_confirmed: true, agreed_text_sha256: sha });
  const gate = (a: GateAcceptance) => checkoutAgreementGate({ acceptance: a, leadId: 'L', onboardingId: 'OB', route: 'optimise', currentVersion: CLIENT_AGREEMENT_VERSION, recomputedSha: sha });
  ok(gate(acc('v4')).ok, 'a v4 signature opens a new checkout');
  ok(!gate(acc('v3')).ok, 'a v3 signature does NOT open a new checkout after the cutover — the client signs v4 first');
  const verdict = (meta: Record<string, string>, a: GateAcceptance) => webhookV3Verdict({ metadata: meta, acceptance: a, leadId: 'L', onboardingId: 'OB', recomputedSha: sha, termsByVersion: AGREEMENT_FIRST_TERMS });
  const meta = (version: string, terms: string) => ({ commercial_terms: terms, agreement_version: version, agreement_acceptance_id: 'A', service_route: 'optimise' });
  ok(verdict(meta('v4', COMMERCIAL_TERMS_V4), acc('v4')).ok, 'webhook: a v4 session on v4 terms is a sale');
  ok(verdict(meta('v3', COMMERCIAL_TERMS_V3), acc('v3')).ok, 'webhook: a v3 session opened before the cutover and paid after it is still a valid sale ON v3 TERMS');
  ok(!verdict(meta('v4', COMMERCIAL_TERMS_V3), acc('v4')).ok && !verdict(meta('v3', COMMERCIAL_TERMS_V4), acc('v3')).ok, 'webhook: terms that do not match the signed version → HELD');
  ok(!verdict(meta('v4', COMMERCIAL_TERMS_V4), acc('v3')).ok, 'webhook: a session naming v4 on a v3 signature → HELD');
  const co = read('supabase/functions/findable-checkout/index.ts');
  ok(/form\.set\("metadata\[commercial_terms\]", COMMERCIAL_TERMS_CURRENT\)/.test(co) && /\.eq\("agreement_version", CLIENT_AGREEMENT_VERSION\)/.test(co), 'checkout: new sessions carry the current terms and require the current version');
  ok(/commercialTerms: COMMERCIAL_TERMS_CURRENT/.test(read('supabase/functions/client-agreement/index.ts')), 'the agreement page stamps a new signature with the current terms');
  const wh = read('supabase/functions/stripe-webhook/index.ts');
  ok(/const sessionTerms = isOptionBTerms\(s\.metadata\?\.commercial_terms\)/.test(wh) && /commercial_terms: sessionTerms,/.test(wh) && !/COMMERCIAL_TERMS_V3/.test(wh), 'the webhook stamps the client with the SESSION\'s own terms — never a hard-coded v3');

  console.log('── 6. WHO HAS A CONTINUING SERVICE — ONE RULE ──');
  ok(continuingServiceAfterTerm('build') && !continuingServiceAfterTerm('optimise'), 'current offer: Build continues, Optimise stops');
  ok(continuingServiceApplies(COMMERCIAL_TERMS_V4, 'build') && !continuingServiceApplies(COMMERCIAL_TERMS_V4, 'optimise'), 'v4: Build yes, Optimise no');
  ok(continuingServiceApplies(COMMERCIAL_TERMS_V3, 'build') && continuingServiceApplies(COMMERCIAL_TERMS_V3, 'optimise'), 'v3: both, as signed — never re-ruled');
  ok(!continuingServiceApplies(null, 'build') && !continuingServiceApplies(COMMERCIAL_TERMS_V4, null) && !continuingServiceApplies('csa_v9', 'build'), 'no terms, no route, unknown terms → no (absence never means yes)');
  ok(isOptionBTerms(COMMERCIAL_TERMS_V3) && isOptionBTerms(COMMERCIAL_TERMS_V4) && !isOptionBTerms(null) && isV3Terms(COMMERCIAL_TERMS_V3) && !isV3Terms(COMMERCIAL_TERMS_V4), 'v3 and v4 share the Option B timing; only v3 is "v3"');
  ok(subscriptionContinuesAfterTerm({ payment_timing: OPTION_B_TIMING, commercial_terms: COMMERCIAL_TERMS_V4, service_route: 'optimise' }) === false, 'subscription: v4 Optimise → no continuation');
  ok(subscriptionContinuesAfterTerm({ payment_timing: OPTION_B_TIMING, commercial_terms: COMMERCIAL_TERMS_V4, service_route: 'build' }) === true, 'subscription: v4 Build → continuation');
  ok(subscriptionContinuesAfterTerm({ payment_timing: OPTION_B_TIMING, service_route: 'optimise' }) === true, 'subscription: option_b with no terms marker = made before v4 = v3 → continuation as signed');
  ok(subscriptionContinuesAfterTerm({ service_route: 'build' }) === false && subscriptionContinuesAfterTerm(null) === false, 'subscription: legacy → none');
  ok(/"metadata\[commercial_terms\]": commercialTerms/.test(read('supabase/functions/_shared/delayed-subscription.ts')), 'new subscriptions carry their terms, so the webhook can tell');

  console.log('── 7. THE TIMELINE: NO £29.99 STATE, REMINDER OR QUESTION FOR v4 OPTIMISE ──');
  const facts = (terms: string, route: 'build' | 'optimise', recurring: number): TimelineFacts => {
    const paid: string[] = []; for (let i = 0; i < recurring; i++) paid.push(new Date(Date.UTC(2026, 11 + i, 22, 10)).toISOString());
    return { terms, route, initialPaidAt: '2026-11-02T15:00:00Z', accessDate: '2026-11-09', resultsSentAt: '2026-12-07T10:00:00Z', guaranteeCeasedAt: null, paymentStartScheduledDay: '2026-12-22', paymentStartConfirmedAt: '2026-12-08T10:00:00Z', recurringPaidAt: paid };
  };
  const optMid = facts(COMMERCIAL_TERMS_V4, 'optimise', 4);
  const mt = minimumTerm(optMid);
  ok(!mt.continuingApplies && mt.continuingStartDay === null && mt.clientReminderDueDay === null && mt.paulActionDay === null && mt.finalPaymentDay !== null, 'v4 Optimise: the final payment day is known; no Continuing Service day, reminder or action day');
  const days = ['2027-02-01', '2027-03-15', '2027-04-22', '2027-06-01', '2027-12-01'];
  ok(days.every((d) => !timelineActions(optMid, d + 'T09:00:00Z').some((a) => a.kind.startsWith('continuing'))), 'v4 Optimise: no continuation action on any day');
  ok(timelineView(optMid, '2027-03-01T09:00:00Z').continuingGbp === null, 'v4 Optimise: the client card is never given a £29.99 figure');
  const optDone = facts(COMMERCIAL_TERMS_V4, 'optimise', recurringPaymentsFor('optimise'));
  ok(minimumTerm(optDone).planComplete && minimumTerm(optDone).finalPaymentActual, 'v4 Optimise after the 6th actual payment: the fixed-term plan is COMPLETE');
  ok(!minimumTerm(facts(COMMERCIAL_TERMS_V4, 'optimise', 4)).planComplete, '…and not before it');
  const bld = facts(COMMERCIAL_TERMS_V4, 'build', 9);
  const bmt = minimumTerm(bld);
  ok(bmt.continuingApplies && !!bmt.continuingStartDay && !!bmt.clientReminderDueDay && !bmt.planComplete, 'v4 Build: the Continuing Service architecture is kept (start day, reminder due)');
  ok(timelineActions(bld, bmt.paulActionDay! + 'T09:00:00Z').some((a) => a.kind === 'continuing_prepare'), 'v4 Build: Paul is asked to prepare the 30-day reminder, as before');
  ok(minimumTerm(facts(COMMERCIAL_TERMS_V3, 'optimise', 4)).continuingApplies, 'a v3 Optimise client keeps the Continuing Service they signed');
  const hub = read('supabase/functions/paid-client-hub/index.ts');
  ok(/&& !continuingServiceApplies\(facts\.terms, facts\.route\)\) \{\s*return json\(\{ ok: false, error: "no_continuing_service"/.test(hub), 'the hub refuses Prepare / Reminder / Continue-or-cancel for a client with no Continuing Service');
  const card = read('src/components/ClientTimelineCard.tsx');
  ok(/data-testid="fixed-term-plan"/.test(card) && /\{mt\.continuingApplies && <div[^>]*data-testid="continuing-service"/.test(card) && /Payment plan complete/.test(card), 'the Paid Client card shows the fixed term / "Payment plan complete" and hides the Continuing Service buttons');
  const mig = read('supabase/migrations/20261012090000_client_agreement_v4_optimise_fixed_term.sql');
  ok(/check \(commercial_terms in \('csa_v3_option_b', 'csa_v4_option_b'\)\)/.test(mig), 'migration: the terms column accepts v4');
  ok(/not \(commercial_terms = 'csa_v4_option_b' and service_route = 'optimise'\)\s*or \(continuing_prepared_at is null and continuing_reminder_sent_at is null and continuing_decision is null\)/.test(mig), 'migration: the database itself refuses a Continuing Service state on v4 Optimise');
  ok(/v4_acceptance_is_complete/.test(mig) && /agreement_first_terms_match_version/.test(mig) && !/\b(drop table|delete from|truncate|update public)\b/i.test(mig.replace(/--[^\n]*/g, '')), 'migration: a v4 signature is as complete as v3 and names its own terms; additive only');

  console.log('── 8. BILLING AND CLIENT-FACING WORDS ──');
  ok(!/29\.99/.test(cardSavedNoticeFor('optimise')) && /After your 6th payment the payments stop and nothing more is charged/.test(cardSavedNoticeFor('optimise')), 'checkout card notice (Optimise): the payments stop');
  ok(/continues at £29\.99 a month for hosting and monitoring/.test(cardSavedNoticeFor('build')), 'checkout card notice (Build): £29.99 for hosting and monitoring');
  ok(/then nothing more$/.test(checkoutLineNameFor('optimise')) && /then £29\.99\/month until cancelled$/.test(checkoutLineNameFor('build')), 'the Stripe line item says the same');
  ok(/6 payments in total, a 6-month minimum term, then the payments stop and nothing more is charged\.$/.test(offerSummaryFor('optimise')), 'offer summary (Optimise)');
  ok(afterTermWordsFor('build') === `then £${FINDABLE_CONTINUING_GBP} a month for hosting and monitoring until you cancel`, 'after-term words (Build)');
  const signOpt = agreementPageHtml({ mode: 'sign', businessName: 'Acme', route: 'optimise', values: {}, errors: [], signupId: 'OB' });
  ok(/6 payments in total \(the minimum term\), then the payments stop and nothing more is charged\./.test(signOpt) && /Agreement version v4\./.test(signOpt), 'the sign-up page: Optimise offer says the payments stop, above the v4 text');
  ok(afterTermKeyPoint('optimise', 'stops') === 'After your 6th payment the payments stop. Nothing more is charged.', 'Welcome Pack (v4 Optimise): the payments stop');
  ok(/continue at £29\.99 a month/.test(afterTermKeyPoint('build', 'continues') ?? '') && afterTermKeyPoint('optimise', null) === null && afterTermKeyPoint(null, 'stops') === null, 'Welcome Pack: Build continues; no terms → nothing said');
  ok(/from\("client_service_terms"\)[\s\S]{0,200}commercial_terms,service_route/.test(read('supabase/functions/_shared/welcome-pack-render.ts')), 'the Welcome Pack reads THIS client\'s stamped terms (read only)');
  const email = resultsEmailParagraphs({ businessName: 'A', town: 'T', beforeNamed: 1, beforeAnswered: 10, afterNamed: 3, afterAnswered: 10, questions: 20, documentUrl: 'u', wentUp: true, withinNoise: false, monthlyStartsOn: '22 December 2026', totalPayments: totalPaymentsFor('optimise'), v3Terms: true, continuingService: false }).join(' ');
  ok(/After your 6th payment the payments stop and nothing more is charged\./.test(email) && !/29\.99/.test(email), 'the four-week results email (v4 Optimise): the payments stop');
  ok(/continuingServiceApplies\(v3\.facts\.terms, v3\.facts\.route\)/.test(read('supabase/functions/_shared/remeasure-results.ts')), '…decided from the client\'s own terms');
  ok(/All 6 of your payments are complete/.test(termCompleteEmail({ siteKind: 'client_owned', totalPayments: 6 }).paragraphs.join(' ')), 'after the 6th Optimise payment the client is told the payments are complete');
  ok(/if \(termComplete && subscriptionContinuesAfterTerm\(/.test(wh), 'the webhook only raises the manual Continuing Service step where the subscription\'s terms carry one — v4 Optimise gets the term-complete email');
  ok(/isOptionBTerms\(termsRow\.terms\)/.test(read('src/lib/commission.ts')), 'commission treats a v4 sale exactly like a v3 sale (Option B approval)');
}

main().then(() => {
  if (f > 0) { console.log(`\n${f} FAILURE(S)`); process.exit(1); }
  console.log('\nALL PASS');
});
