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
import { addMonthsClamped, serviceEndedOn, subscriptionIsFixedTerm, ukDayAtHourIso } from '../src/lib/clientTimeline.ts';
import { minimumTermCancelAt } from '../supabase/functions/_shared/delayed-subscription.ts';

let f = 0;
const ok = (cond: unknown, msg: string) => { if (cond) console.log('  PASS ' + msg); else { f++; console.log('  FAIL ' + msg); } };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

/** The v4 template's fingerprint. A changed word is a NEW version (v5), never an edit of v4. */
const V4_TEMPLATE_SHA = 'bc0061eae2d95128cfd41dba3a3dea245ea123ce02a0679324c71670fbf22423';
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
  ok(replaced.join() === '2.6,3.1,3.2,4.3,5.5,9.3,9A.1,9A.2,9A.4,15.1', 'replaced clauses: 2.6, 3.1, 3.2, 4.3, 5.5, 9.3, 9A.1, 9A.2, 9A.4, 15.1 (Paul\'s review added 2.6, 4.3, 5.5)');
  const v4Text = new Set(v4.body.map(blockText));
  const untouched = v3.body.filter((b) => !(b.kind === 'clause' && replaced.includes(b.num)) && !(b.kind === 'heading' && b.text.startsWith('9A.')));
  ok(untouched.every((b) => v4Text.has(blockText(b))), 'every other v3 block is in v4 word for word (' + untouched.length + ')');
  ok(v4.body.length === v3.body.length + 4, 'v4 adds exactly four blocks (the 9B heading, 9B.1, 9B.2, 9B.3)');
  ok(v4.body.findIndex((b) => b.kind === 'clause' && b.num === '9B.1') === v4.body.findIndex((b) => b.kind === 'clause' && b.num === '9A.5') + 2, '9B follows 9A.5');
  ok(v4.intro === v3.intro && v4.services.build.description === v3.services.build.description && JSON.stringify(v4.findableDetails) === JSON.stringify(v3.findableDetails), 'intro, Build service box and Findable details unchanged');
  const changedRows = ['Hosting', 'Ongoing monthly work'];
  ok(v4.schedule.rows.length === v3.schedule.rows.length + 1 && v3.schedule.rows.every((r, i) => changedRows.includes(r[0]) || JSON.stringify(v4.schedule.rows[i]) === JSON.stringify(r)), 'Schedule 1: every v3 row kept except Hosting and Ongoing monthly work, plus one new row');

  console.log('── 3. THE v4 WORDS ──');
  const all = renderAgreementText({ businessName: 'Acme', route: 'optimise' }, 'v4');
  ok(v4.services.optimise.description === 'We improve your existing website. £99 initial payment, then £99 a month. 6 payments in total (1 initial + 5 monthly). Your sixth payment is the last: nothing further is charged. We carry on the monthly work for one final month after it, then the service ends (clause 9B).', 'Optimise box: 6 payments, the sixth is the last, one final month of work, then the service ends — no £29.99');
  ok(/12 payments in total \(1 initial \+ 11 monthly\)\. Then £29\.99 a month for hosting and monitoring/.test(v4.services.build.description), 'Build box: 12 payments, then £29.99 for hosting and monitoring');
  ok(/Findable Build continues at £29\.99 a month .*Findable Optimise: your sixth payment is the last; we carry on the monthly work for one final month, then the service ends with nothing further to pay \(clause 9B\)\. We own our work \(and, for Findable Build, the website we build\)/.test(v4.keyPoints!.points[2]), 'key point 3: Build continues; Optimise has one final month then ends; only Build\'s website is ours until paid');
  ok(v4.keyPoints!.points[0].endsWith('Monthly payments normally start the day after your refund window closes (clause 5.6).'), 'key point 1: monthly payments NORMALLY start the day after the refund window (5.6 stays authoritative)');
  ok(/^9A\. CONTINUING SERVICE AFTER THE MINIMUM TERM \(FINDABLE BUILD ONLY\)$/m.test(all) && /^9A\.1 When the minimum term of a Findable Build service ends/m.test(all), '9A is Findable Build only');
  ok(/^9B\.1 Findable Optimise is a fixed term of 6 payments\. Your sixth payment is the final payment: we will not take any further payment, there is no Continuing Service for Findable Optimise, and we will not start any new charge without your separate written agreement\.$/m.test(all), '9B.1: six payments, the sixth is the final payment, no Continuing Service, no new charge');
  ok(!/^9A\.1 When your minimum term ends, your service continues/m.test(all) && !/for Findable Optimise, ongoing AI visibility monitoring and reasonable updates to your website/.test(all), 'v3\'s "both continue" words are not in v4');
  ok(/^After the minimum term \| £29\.99 a month .* \| Nothing further to pay: your sixth payment is the last, we carry on the monthly work for one final month, then the service ends \(clause 9B\)$/m.test(all), 'Schedule 1: what happens after the minimum term, per service');

  console.log('── 3b. PAUL\'S REVIEW: THE FINAL OPTIMISE MONTH, OWNERSHIP, INHERITED WORDING ──');
  ok(/^9B\.2 Your sixth payment also covers one final month of service\. We continue the monthly work in clause 2\.6 until the date one month after your sixth payment is taken, or the last day of that month if that date does not exist in it \(the "Optimise End Date"\)\. On the Optimise End Date this agreement ends automatically, with nothing further to pay\.$/m.test(all), '9B.2: the sixth payment covers one final month; the Optimise End Date is one month later (month-end clamped); the agreement then ends automatically');
  ok(/^2\.6 Monthly work\. Each month during your minimum term \(and, for Findable Optimise, until the Optimise End Date in clause 9B\.2\), we will review/m.test(all), '2.6: the monthly work is owed through the final Optimise month');
  ok(/^9B\.3 Your existing website was always yours \(clause 9\.4\)\. Our Work passes to you under clause 8\.4 when we receive your sixth payment; this does not wait for the Optimise End Date\.$/m.test(all), '9B.3: ownership of Our Work passes on the SIXTH payment, not at the end of the final month');
  ok(/^15\.1 For Findable Build, .* For Findable Optimise, it ends automatically on the Optimise End Date \(clause 9B\.2\)\./m.test(all) && /^9\.3 .*A Findable Optimise service continues for one final month after your sixth payment and then ends under clause 9B\.$/m.test(all), '15.1 and 9.3: Optimise ends automatically on the Optimise End Date');
  ok(/^4\.3 Ownership of Our Work only passes to you .* For Findable Build, Our Work includes the website we built for you\. For Findable Optimise, your existing website was always yours \(clause 9\.4\), and only Our Work passes to you\./m.test(all), '4.3: Build — Our Work includes the website we built; Optimise — only Our Work passes');
  ok(/^5\.5 .*Our Work does not pass to you \(clause 8\.6\): for Findable Build, that includes the website we built; for Findable Optimise, your existing website was always yours and stays yours, and only the pages and content we added are affected\.$/m.test(all), '5.5: a guarantee refund never implies Findable owns an Optimise client\'s existing website');
  const optimiseOnly = [all.match(/^4\.3 .*$/m)![0], all.match(/^5\.5 .*$/m)![0], ...all.split('\n').filter((l) => /^9B/.test(l))].join('\n');
  ok(!/the website (and our work )?(only )?passes? to you|website and our work do not pass/i.test(optimiseOnly), 'no Optimise clause says the client\'s website passes to them from Findable');
  ok(/^Hosting \| Included during the minimum term \(clause 9\.2\), and in the Continuing Service after it \(clause 9A\) \| Not included \(your own hosting\)$/m.test(all), 'Schedule 1 Build hosting cites clause 9.2 for the minimum term and 9A after it');
  ok(/^Ongoing monthly work \| Monthly review and updates \(clause 2\.6\) \| Monthly review and updates \(clause 2\.6\), including one final month after your sixth payment \(clause 9B\)$/m.test(all), 'Schedule 1 Optimise monthly work includes the final month');
  ok(!/seventh|7th payment|7 payments/i.test(all) && !/Optimise[^\n]*£29\.99/.test(all.replace(/^(After the minimum term|- After the minimum term).*$/gm, '')), 'no seventh payment and no Optimise £29.99 anywhere in v4');
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

  console.log('── 7b. THE FINAL OPTIMISE MONTH: BILLING MATCHES THE CONTRACT ──');
  {
    /* Payment Start Date 22 Dec 2026 → monthly payments 22 Dec, 22 Jan, 22 Feb, 22 Mar, 22 Apr = payments 2–6. */
    const startDay = '2026-12-22';
    const trialEndSec = Math.floor(Date.parse(ukDayAtHourIso(startDay)) / 1000);
    const recurring = recurringPaymentsFor('optimise');
    const cancelAt = minimumTermCancelAt(trialEndSec, recurring);
    /* Stripe charges at trial_end and on each monthly boundary strictly BEFORE cancel_at (no proration). The
       boundaries are the same month-clamped arithmetic the subscription uses; list the next 12 and keep those. */
    const boundaries = Array.from({ length: 12 }, (_, k) => (k === 0 ? trialEndSec : minimumTermCancelAt(trialEndSec, k)));
    const charges = boundaries.filter((at) => at < cancelAt).map((at) => new Date(at * 1000).toISOString().slice(0, 10));
    ok(recurring === 5 && charges.length === 5 && charges[4] === '2027-04-22', 'Stripe takes exactly 5 monthly £99 after the sign-up £99 — the sixth payment (22 Apr 2027) is the LAST charge (' + charges.join(', ') + ')');
    ok(!charges.some((d) => d > '2027-04-22'), 'no seventh £99 payment is ever scheduled');
    const sixth = facts(COMMERCIAL_TERMS_V4, 'optimise', 5);
    const mt6 = minimumTerm(sixth);
    ok(mt6.finalPaymentDay === '2027-04-22' && mt6.planComplete && mt6.serviceEndDay === '2027-05-22', 'after the sixth payment: plan complete; Optimise End Date = one month later (22 May 2027)');
    ok(new Date(cancelAt * 1000).toISOString().slice(0, 10) === mt6.serviceEndDay, 'Stripe\'s own end (cancel_at) is the Optimise End Date — the subscription closes itself then, with no charge');
    ok(!serviceEndedOn(sixth, '2027-04-23T09:00:00Z') && !serviceEndedOn(sixth, '2027-05-21T21:00:00Z') && !timelineView(sixth, '2027-05-10T09:00:00Z').serviceEnded, 'the service stays ACTIVE for the final month after payment 6 (monthly work still owed under 2.6)');
    ok(serviceEndedOn(sixth, '2027-05-22T09:00:00Z') && timelineView(sixth, '2027-06-01T09:00:00Z').serviceEnded && timelineActions(sixth, '2027-06-01T09:00:00Z').length === 0, 'on the Optimise End Date the service ends automatically; nothing is asked of Paul after it');
    ok(!serviceEndedOn(facts(COMMERCIAL_TERMS_V4, 'optimise', 4), '2027-12-01T09:00:00Z'), 'an EXPECTED end date never ends a service — only after the sixth payment is actually collected');
    ok(addMonthsClamped('2027-01-31', 1) === '2027-02-28' && minimumTerm({ ...sixth, recurringPaidAt: ['2026-12-31','2027-01-31','2027-02-28','2027-03-31','2027-08-31'].map((d) => d + 'T10:00:00Z') }).serviceEndDay === '2027-09-30', 'month-end handling: 31 Aug → 30 Sep (the payment-date rule, clause 3.1)');
    ok(minimumTerm(facts(COMMERCIAL_TERMS_V4, 'build', 11)).serviceEndDay === null && minimumTerm(facts(COMMERCIAL_TERMS_V3, 'optimise', 5)).serviceEndDay === null, 'only v4 Optimise has an Optimise End Date (Build and v3 continue)');
    ok(subscriptionIsFixedTerm({ payment_timing: OPTION_B_TIMING, commercial_terms: COMMERCIAL_TERMS_V4, service_route: 'optimise' }) && !subscriptionIsFixedTerm({ payment_timing: OPTION_B_TIMING, commercial_terms: COMMERCIAL_TERMS_V4, service_route: 'build' }) && !subscriptionIsFixedTerm({ payment_timing: OPTION_B_TIMING, service_route: 'optimise' }), 'a fixed-term subscription is v4 Optimise only');
    ok(/Payment plan complete · final month of work until/.test(card) && /Service ended/.test(card) && /v\.serviceEnded/.test(card), 'the Paid Client card shows the final month, then "Service ended"');
  }

  console.log('── 8. BILLING AND CLIENT-FACING WORDS ──');
  ok(!/29\.99/.test(cardSavedNoticeFor('optimise')) && /Your 6th payment is the last and nothing more is charged: it covers one final month of work, and then the service ends/.test(cardSavedNoticeFor('optimise')), 'checkout card notice (Optimise): the 6th payment is the last; one final month of work; then it ends');
  ok(/continues at £29\.99 a month for hosting and monitoring/.test(cardSavedNoticeFor('build')), 'checkout card notice (Build): £29.99 for hosting and monitoring');
  ok(/then one final month of work, nothing more charged$/.test(checkoutLineNameFor('optimise')) && /then £29\.99\/month until cancelled$/.test(checkoutLineNameFor('build')), 'the Stripe line item says the same');
  ok(/6 payments in total, a 6-month minimum term, then the payments stop: the 6th payment is the last, we carry on the monthly work for one final month, and then the service ends\.$/.test(offerSummaryFor('optimise')), 'offer summary (Optimise)');
  ok(afterTermWordsFor('build') === `then £${FINDABLE_CONTINUING_GBP} a month for hosting and monitoring until you cancel`, 'after-term words (Build)');
  const signOpt = agreementPageHtml({ mode: 'sign', businessName: 'Acme', route: 'optimise', values: {}, errors: [], signupId: 'OB' });
  ok(/6 payments in total \(the minimum term\), then nothing more is charged: the 6th payment is the last, it covers one final month of work, and then the service ends\./.test(signOpt) && /Agreement version v4\./.test(signOpt), 'the sign-up page: Optimise offer says the payments stop, above the v4 text');
  ok(afterTermKeyPoint('optimise', 'stops') === 'Your 6th payment is the last. Nothing more is charged: we carry on the monthly work for one final month after it, and then the service ends.', 'Welcome Pack (v4 Optimise): the 6th payment is the last; one final month; then it ends');
  ok(/continue at £29\.99 a month/.test(afterTermKeyPoint('build', 'continues') ?? '') && afterTermKeyPoint('optimise', null) === null && afterTermKeyPoint(null, 'stops') === null, 'Welcome Pack: Build continues; no terms → nothing said');
  ok(/from\("client_service_terms"\)[\s\S]{0,200}commercial_terms,service_route/.test(read('supabase/functions/_shared/welcome-pack-render.ts')), 'the Welcome Pack reads THIS client\'s stamped terms (read only)');
  const email = resultsEmailParagraphs({ businessName: 'A', town: 'T', beforeNamed: 1, beforeAnswered: 10, afterNamed: 3, afterAnswered: 10, questions: 20, documentUrl: 'u', wentUp: true, withinNoise: false, monthlyStartsOn: '22 December 2026', totalPayments: totalPaymentsFor('optimise'), v3Terms: true, continuingService: false }).join(' ');
  ok(/Your 6th payment is the last and nothing more is charged: it covers one final month of work, and then the service ends\./.test(email) && !/29\.99/.test(email), 'the four-week results email (v4 Optimise): the 6th payment is the last; one final month; then it ends');
  ok(/continuingServiceApplies\(v3\.facts\.terms, v3\.facts\.route\)/.test(read('supabase/functions/_shared/remeasure-results.ts')), '…decided from the client\'s own terms');
  ok(/All 6 of your payments are complete and your final month of work has finished, so your service has now ended\. Nothing more will be charged\./.test(termCompleteEmail({ siteKind: 'client_owned', totalPayments: 6, finalMonthEnded: true }).paragraphs.join(' ')), 'at the Optimise End Date the client is told the final month has finished and the service has ended');
  ok(/finalMonthEnded: subscriptionIsFixedTerm\(/.test(wh) && /fixedTermFinalMonth: subscriptionIsFixedTerm\(/.test(wh), 'the webhook words both emails from the subscription\'s own terms');
  ok(/if \(termComplete && subscriptionContinuesAfterTerm\(/.test(wh), 'the webhook only raises the manual Continuing Service step where the subscription\'s terms carry one — v4 Optimise gets the term-complete email');
  ok(/isOptionBTerms\(termsRow\.terms\)/.test(read('src/lib/commission.ts')), 'commission treats a v4 sale exactly like a v3 sale (Option B approval)');
}

main().then(() => {
  if (f > 0) { console.log(`\n${f} FAILURE(S)`); process.exit(1); }
  console.log('\nALL PASS');
});
