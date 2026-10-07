/* ============================================================
   CLIENT SERVICE AGREEMENT v4 (2026-10-07) — Findable_Client_Service_Agreement_v4_clean.docx VERBATIM.
   Proves: the words are the document's; v4 is the version NEW sign-ups sign and v3 / v1 are untouched; the
   commercial rules (Build 12 payments, Optimise 6, no automatic £29.99 on Optimise, Build's £29.99 only as a
   separate opt-in); the Payment Start Date is the day after the Refund Window; acceptance is the explicit tick
   plus the authority confirmation, before payment; the record is complete and tamper-proof; a v3 client stays
   v3; the plan summary, its fallback, the results email, the welcome pack and the checkout words all say the
   v4 end of term.
   Run: npx tsx scripts/client-agreement-v4.test.ts
   ============================================================ */
import { readFileSync } from 'node:fs';
import {
  acceptanceRowFrom, agreeConsentSentence, agreementVersion, blockText, CLIENT_AGREEMENT_VERSION, renderAgreementText, sha256Hex, versionTemplateText,
  type AgreementFill,
} from '../src/lib/clientAgreement.ts';
import { agreementPageHtml, authoritySentence } from '../src/lib/agreementPageHtml.ts';
import { checkoutAgreementGate, webhookV3Verdict, type GateAcceptance } from '../src/lib/signupGate.ts';
import {
  COMMERCIAL_TERMS_V3, COMMERCIAL_TERMS_V4, commercialTermsFor, continuingModeFor, isOptionBTerms, isV3Terms, termsOfSubscriptionMeta,
  timelineActions, chargeAllowedOn, type TimelineFacts,
} from '../src/lib/clientTimeline.ts';
import { planSummaryRows } from '../src/lib/signupSummary.ts';
import { afterTermSummaryWords, endOfTermKeyPoint, cardSavedNoticeFor, checkoutLineNameFor, FINDABLE_OFFER_SUMMARY, offerSummaryFor, monthlyStartingSoonEmail, termCompleteEmail } from '../src/lib/findableOffer.ts';
import { AGREEMENT_KEY_POINTS, agreementKeyPointsFor, welcomePackAgreementPage } from '../src/lib/welcomePackHtml.ts';
import { signedAgreementRecord } from '../src/lib/signedAgreement.ts';
import { resultsEmailParagraphs } from '../src/lib/remeasureResults.ts';
import { planPaymentStart, OPTION_B_TIMING } from '../supabase/functions/_shared/client-terms.ts';
import { minimumTermCancelAt } from '../supabase/functions/_shared/delayed-subscription.ts';

let failures = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) failures++; };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const fill = (route: 'build' | 'optimise'): AgreementFill => ({
  businessName: 'Acme Plumbing', route, legalName: 'Acme Plumbing Ltd', companyNumber: '01234567', contactName: 'Sam Smith', role: 'Director',
  address: '1 High Street, Leeds', email: 'sam@acme.example', phone: '07700 900123', websiteDomain: 'acme.example',
});

async function main() {
  console.log('── THE WORDS: the v4 .docx, verbatim ──');
  ok(CLIENT_AGREEMENT_VERSION === 'v4', 'v4 is the version a NEW sign-up signs');
  const src = read('scripts/fixtures/client-agreement-v4-source.txt').replace(/^﻿/, '').split('\n').map((l) => l.trim().replace(/ {2,}/g, ' ')).filter(Boolean);
  const start = src.indexOf('1. ABOUT THIS AGREEMENT');
  const end = src.findIndex((l) => l.startsWith('SCHEDULE 1'));
  const clauses = src.slice(start, end);
  const lines = renderAgreementText(fill('build'), 'v4').split('\n');
  let at = 0; let missing = '';
  for (const c of clauses) { const i = lines.indexOf(c, at); if (i < 0) { missing = c; break; } at = i + 1; }
  ok(clauses.length > 90 && !missing, `all ${clauses.length} clause paragraphs of the .docx appear verbatim and in order${missing ? ` - MISSING: "${missing.slice(0, 90)}"` : ''}`);
  ok(agreementVersion('v4').body.map(blockText).join('\n') === clauses.join('\n'), 'the body is exactly the .docx clauses: nothing added, nothing dropped');
  const v = agreementVersion('v4');
  const keyLines = src.filter((l) => l.startsWith('•')).map((l) => l.replace(/^•\s+/, ''));
  ok(keyLines.length === 5 && keyLines.every((k) => v.keyPoints!.points.includes(k)), 'the five KEY POINTS are the .docx\'s');
  ok(src.includes(v.services.build.description) && src.includes(v.services.optimise.description), 'both service boxes are the .docx\'s words');
  ok(src.includes(v.intro), 'the intro is the .docx\'s');
  ok(v.schedule.rows.length === 9, 'Schedule 1 has the .docx\'s nine rows');
  for (const [label, a, b] of v.schedule.rows) ok(src.includes(label) && src.includes(a) && src.includes(b), `Schedule 1 row "${label}" is the .docx's`);

  console.log('\n── THE COMMERCIAL RULES, IN THE AGREED TEXT ──');
  const t = renderAgreementText(fill('optimise'), 'v4');
  ok(t.includes('3.1 You pay a £99 initial payment. Findable Build then has 11 further monthly payments of £99 (12 payments in total, £1,188 in all). Findable Optimise has 5 further monthly payments of £99 (6 payments in total, £594 in all).'), '3.1: Build 12 payments (£1,188), Optimise 6 (£594)');
  ok(t.includes('5.6 Payment Start Date. Your first recurring £99 payment is taken on the day after the Refund Window ends. No recurring £99 payment is taken while the Refund Window is still open.'), '5.6: the first recurring payment is the day after the Refund Window; none while it is open');
  ok(t.includes('There is no automatic £29.99 continuation for Optimise.'), '3.3: no automatic £29.99 for Optimise');
  ok(t.includes('9A.2 Build does not automatically continue after payment 12.') && t.includes('you may separately opt in to our rolling Hosting and Maintenance service at £29.99 a month'), '9A.2: Build\'s £29.99 is a separate opt-in');
  ok(t.includes('15.1 Optimise ends automatically after its sixth payment and final service period.'), '15.1: Optimise ends after payment 6');
  ok(!/Continuing Service/.test(t), 'the term "Continuing Service" (v3) does not appear in v4');
  ok(t.includes('1.2 You accept this agreement by clicking "I have read and agree to the Client Service Agreement" and confirming your authority to bind the business on your agreement page, before payment.'), '1.2: acceptance is the tick plus the authority confirmation, before payment');
  ok(t.includes('[X] Findable Optimise:') && t.includes('[ ] Findable Build:'), 'the selected plan is the one ticked in the agreed text');
  ok(renderAgreementText(fill('build'), 'v4').includes('[X] Findable Build:'), '...and the other plan when Build is selected');
  ok(t.includes('Business name: Acme Plumbing') && t.includes('Legal name / company number: Acme Plumbing Ltd (company number 01234567)') && t.includes('Contact name and role: Sam Smith, Director') && t.includes('Business address: 1 High Street, Leeds') && t.includes('Website domain (if any): acme.example'), 'the client details are filled into the agreed text');

  console.log('\n── VERSIONS ARE IMMUTABLE; v3 AND v1 ARE UNTOUCHED ──');
  ok(await sha256Hex(versionTemplateText('v3')) === '3e1edf3b7ee6ca38704dbfb3dc4fdce67c1c73863b62c689510d304b3c2e6bc2', 'v3 template fingerprint unchanged: a client who signed v3 keeps exactly v3');
  ok(await sha256Hex(versionTemplateText('v1')) === '10b3fd557cc247d445f537255e1472bd851df1f894e229da31e5d18eb87a80ff', 'v1 template fingerprint unchanged');
  ok((await sha256Hex(versionTemplateText('v4'))) === V4_TEMPLATE_SHA, `v4 template fingerprint is pinned (a word changed = publish v5, never edit v4) [${await sha256Hex(versionTemplateText('v4'))}]`);
  ok(renderAgreementText(fill('build'), 'v4') === renderAgreementText(fill('build'), 'v4'), 'rendering is deterministic');
  ok(renderAgreementText(fill('build'), 'v3').includes('9A.1 When your minimum term ends, your service continues on a rolling monthly basis'), 'a v3 render still has its Continuing Service clause 9A.1');

  console.log('\n── TERMS: v4 STAMPS v4, v3 STAYS v3 ──');
  ok(commercialTermsFor('v4') === COMMERCIAL_TERMS_V4 && commercialTermsFor('v3') === COMMERCIAL_TERMS_V3 && commercialTermsFor('v1') === null && commercialTermsFor(null) === null, 'the agreement version decides the terms; v1 / absent decide none');
  ok(isOptionBTerms(COMMERCIAL_TERMS_V3) && isOptionBTerms(COMMERCIAL_TERMS_V4) && !isOptionBTerms('legacy') && !isOptionBTerms(null) && !isOptionBTerms(undefined), 'Option B timing applies to v3 and v4 only; absence is never a yes');
  ok(isV3Terms(COMMERCIAL_TERMS_V3) && !isV3Terms(COMMERCIAL_TERMS_V4), 'isV3Terms stays strictly v3');
  ok(continuingModeFor(COMMERCIAL_TERMS_V4, 'optimise') === 'none', 'v4 Optimise: nothing continues');
  ok(continuingModeFor(COMMERCIAL_TERMS_V4, 'build') === 'optional', 'v4 Build: the £29.99 is optional only');
  ok(continuingModeFor(COMMERCIAL_TERMS_V3, 'optimise') === 'automatic' && continuingModeFor(COMMERCIAL_TERMS_V3, 'build') === 'automatic', 'v3: both plans keep the Continuing Service they signed');
  ok(continuingModeFor(COMMERCIAL_TERMS_V4, null) === 'none' && continuingModeFor('legacy', 'build') === 'none' && continuingModeFor(null, 'build') === 'none' && continuingModeFor(undefined, undefined) === 'none', 'unknown terms or route: do nothing (absent never continues anything)');
  ok(termsOfSubscriptionMeta({ commercial_terms: COMMERCIAL_TERMS_V4, payment_timing: 'option_b' }) === COMMERCIAL_TERMS_V4, 'a subscription carries its own terms (v4)');
  ok(termsOfSubscriptionMeta({ payment_timing: 'option_b' }) === COMMERCIAL_TERMS_V3, 'an Option B subscription with no terms stamp was made under v3');
  ok(termsOfSubscriptionMeta({}) === null && termsOfSubscriptionMeta(null) === null && termsOfSubscriptionMeta({ commercial_terms: 'x' }) === null, 'anything else: no terms');

  console.log('\n── PAYMENT START: THE DAY AFTER THE REFUND WINDOW, NEVER INSIDE IT ──');
  const LEAD = '11111111-1111-4111-8111-111111111111';
  const facts = (terms: string, route: 'build' | 'optimise'): TimelineFacts => ({
    terms, route, initialPaidAt: '2026-11-02T15:00:00Z', accessDate: '2026-11-09', resultsSentAt: '2026-12-07T10:30:00Z', guaranteeCeasedAt: null,
  });
  const sub = { id: 'sub_test', status: 'trialing', trial_end: 1_900_000_000, cancel_at: null, metadata: { lead_id: LEAD, payment_timing: OPTION_B_TIMING } };
  const NOW = '2026-12-07T10:31:00Z';
  for (const terms of [COMMERCIAL_TERMS_V3, COMMERCIAL_TERMS_V4]) {
    const p = planPaymentStart(facts(terms, 'optimise'), LEAD, sub, NOW);
    ok(p.ok && p.day === '2026-12-22', `${terms}: Results Date 7 Dec -> 14-day window ends 21 Dec -> first recurring payment 22 Dec`);
    ok(p.ok && !chargeAllowedOn(facts(terms, 'optimise'), '2026-12-21T12:00:00Z') && chargeAllowedOn(facts(terms, 'optimise'), '2026-12-22T12:00:00Z'), `${terms}: a charge inside the Refund Window is refused, the next day is allowed`);
  }
  {
    const o = planPaymentStart(facts(COMMERCIAL_TERMS_V4, 'optimise'), LEAD, sub, NOW);
    const b = planPaymentStart(facts(COMMERCIAL_TERMS_V4, 'build'), LEAD, sub, NOW);
    ok(o.ok && o.cancelAtSec === minimumTermCancelAt(o.trialEndSec, 5), 'v4 Optimise: the subscription is set to end after 5 recurring payments (+ the £99 = 6 in all), then it STOPS');
    ok(b.ok && b.cancelAtSec === minimumTermCancelAt(b.trialEndSec, 11), 'v4 Build: ends after 11 recurring payments (+ the £99 = 12 in all); no £29.99 is scheduled');
    ok(!planPaymentStart(facts('legacy', 'build'), LEAD, sub, NOW).ok, 'a client on neither v3 nor v4 is never re-ruled');
    ok(!planPaymentStart({ ...facts(COMMERCIAL_TERMS_V4, 'build'), resultsSentAt: null, accessDate: null }, LEAD, sub, NOW).ok, 'no Results Date and no fallback: no date is written');
  }
  const cts = read('supabase/functions/_shared/client-terms.ts');
  ok(!/minimumTermCancelAt\([^)]*29\.99|FINDABLE_CONTINUING_GBP/.test(cts.replace(/\/\/.*$/gm, '')), 'the scheduler never sets or mentions the £29.99 price');

  console.log('\n── WHAT FOLLOWS THE TERM, IN THE PAID-CLIENT TIMELINE ──');
  {
    const lateFacts = (terms: string, route: 'build' | 'optimise'): TimelineFacts => ({
      ...facts(terms, route), accessDate: '2026-11-09', resultsSentAt: '2026-12-07T10:30:00Z', paymentStartScheduledDay: '2026-12-22', paymentStartConfirmedAt: '2026-12-07T10:31:00Z',
      recurringPaidAt: route === 'optimise' ? ['2026-12-22T09:00:00Z', '2027-01-22T09:00:00Z', '2027-02-22T09:00:00Z', '2027-03-22T09:00:00Z'] : undefined,
    });
    const nearEnd = '2027-05-10T09:00:00Z';
    const kinds = (a: ReturnType<typeof timelineActions>) => a.map((x) => x.kind);
    ok(!kinds(timelineActions(lateFacts(COMMERCIAL_TERMS_V4, 'optimise'), nearEnd)).some((k) => k.startsWith('continuing')), 'v4 Optimise: no Continuing Service reminder, decision or set-up action ever appears');
    const v3a = timelineActions(lateFacts(COMMERCIAL_TERMS_V3, 'optimise'), nearEnd);
    ok(kinds(v3a).some((k) => k.startsWith('continuing')) && v3a.some((a) => /Continuing Service/.test(a.text)), 'v3 Optimise: the Continuing Service actions are unchanged');
    const v4b = timelineActions({ ...lateFacts(COMMERCIAL_TERMS_V4, 'build'), recurringPaidAt: ['2026-12-22T09:00:00Z', '2027-01-22T09:00:00Z', '2027-02-22T09:00:00Z', '2027-03-22T09:00:00Z', '2027-04-22T09:00:00Z', '2027-05-22T09:00:00Z', '2027-06-22T09:00:00Z', '2027-07-22T09:00:00Z', '2027-08-22T09:00:00Z', '2027-09-22T09:00:00Z'] }, '2027-10-12T09:00:00Z');
    ok(v4b.some((a) => /does NOT continue automatically|OPTED IN|opt in/i.test(a.text)) && !v4b.some((a) => /Continuing Service/.test(a.text)), 'v4 Build: the action is about the OPTIONAL Hosting and Maintenance, never a Continuing Service');
  }

  console.log('\n── THE AGREEMENT PAGE: PLAN SUMMARY AND ITS FALLBACK ──');
  {
    const row = (route: 'build' | 'optimise', version: string) => planSummaryRows(route, version)!.find((r) => r.key === 'after')!.value;
    ok(!/29\.99|continues|until you cancel/i.test(row('optimise', 'v4')), 'v4 Optimise summary NEVER contains an automatic £29.99 continuation');
    ok(/ends after payment 6 and the final service period/.test(row('optimise', 'v4')) && /no automatic continuing charge/i.test(row('optimise', 'v4')), 'v4 Optimise summary: ends after payment 6, no automatic charge');
    ok(/ends after payment 12/.test(row('build', 'v4')) && /£29\.99 a month Hosting and Maintenance is optional/.test(row('build', 'v4')) && /only starts if you separately choose it/.test(row('build', 'v4')), 'v4 Build summary: ends after payment 12, £29.99 hosting and maintenance is OPTIONAL');
    ok(row('optimise', 'v3').includes('£29.99 a month') && row('build', 'v3').includes('£29.99 a month'), 'a v3 summary is unchanged (its signers keep what they signed)');
    ok(planSummaryRows('optimise', 'v1') === null && planSummaryRows('optimise', 'v9') === null, 'an unknown version gets NO structured summary (the fallback is separately correct, below)');
    const opts = { mode: 'sign' as const, businessName: 'Acme', values: {}, errors: [] as string[], signupId: 's1', nowIso: '2026-12-07T10:00:00Z' };
    /* The fallback (offerHtml with no rows) is reached by a version planSummaryRows does not know — v1 is the one the page can render. */
    const fbOpt = agreementPageHtml({ ...opts, route: 'optimise', version: 'v1' });
    ok(!/29\.99/.test(fbOpt) && /ends after payment 6/.test(fbOpt), 'the fallback offer text for Optimise never shows £29.99 and says it ends after payment 6');
    const fbBuild = agreementPageHtml({ ...opts, route: 'build', version: 'v1' });
    ok(/optional/.test(fbBuild) && /ends after payment 12/.test(fbBuild), 'the fallback offer text for Build says the £29.99 is optional');
    const pageOpt = agreementPageHtml({ ...opts, route: 'optimise', version: 'v4' });
    ok(!/29\.99/.test(pageOpt.slice(0, pageOpt.indexOf('Read the agreement'))), 'the v4 Optimise offer box above the agreement never shows £29.99');
    const sharedOpt = afterTermSummaryWords('optimise');
    ok(pageOpt.includes(sharedOpt.replace(/'/g, '&#39;')) || pageOpt.includes(sharedOpt), 'the page uses the shared end-of-term sentence (one source)');
  }

  console.log('\n── ACCEPTANCE: EXPLICIT, BEFORE PAYMENT, NOTHING PRE-TICKED ──');
  {
    const page = agreementPageHtml({ mode: 'sign', businessName: 'Acme', route: 'build', values: {}, errors: [], signupId: 's1', nowIso: '2026-12-07T10:00:00Z' });
    ok(agreeConsentSentence('Acme', 'v4') === 'I have read and agree to the Client Service Agreement' && page.includes('>I have read and agree to the Client Service Agreement</label>'), 'v4 page: the agree box says exactly "I have read and agree to the Client Service Agreement"');
    ok(page.includes(authoritySentence('Acme')) && /id="authority"[^>]*required/.test(page) && /id="agree"[^>]*required/.test(page), 'both the agree box and the authority confirmation are required');
    ok(!/id="agree"[^>]*checked/.test(page) && !/id="authority"[^>]*checked/.test(page), 'nothing is pre-ticked');
    ok(/Continue to payment/.test(page) && /aria-disabled="true"/.test(page) && /b\.disabled=!ok/.test(page), 'payment stays disabled until the signature exists; the sign button stays off until both ticks');
    ok(/Version 4 of our Client Service Agreement|Version v4 of our Client Service Agreement/.test(page) && /Agreement date/.test(page), 'the page shows the version and the signing date');
    ok(page.includes('Accept the agreement') && !page.includes('I agree and sign'), 'the v4 button is not the v3 wording');
    ok(['contactName', 'role', 'legalName', 'email', 'phone', 'address'].every((n) => page.includes(`name="${n}"`)), 'the client can correct or supply every detail before accepting');
    const v3page = agreementPageHtml({ mode: 'sign', businessName: 'Acme', route: 'build', values: {}, errors: [], signupId: 's1', nowIso: '2026-12-07T10:00:00Z', version: 'v3' });
    ok(v3page.includes('I agree and sign') && /clause 12\.4/.test(v3page), 'a v3 page still reads as v3 (button and clause references)');
    const agent = read('supabase/functions/client-agreement/index.ts');
    ok(/commercialTermsFor\(CLIENT_AGREEMENT_VERSION\)/.test(agent) && !/COMMERCIAL_TERMS_V3/.test(agent), 'the agreement function stamps the terms its version decides');
  }

  console.log('\n── THE RECORD: COMPLETE, BOUND TO ONE SIGN-UP, TAMPER-PROOF ──');
  {
    const f = fill('build');
    const text = renderAgreementText(f, 'v4');
    const sha = await sha256Hex(text);
    const row = acceptanceRowFrom({ leadId: 'L1', fill: f, method: 'agree_page', agreedText: text, sha256: sha, version: 'v4', ip: '1.2.3.4', userAgent: 'UA', v3: { onboardingId: 'S1', authorityConfirmed: true, marketingOptOut: false, commercialTerms: COMMERCIAL_TERMS_V4 } });
    ok(row.agreement_version === 'v4' && row.commercial_terms === COMMERCIAL_TERMS_V4 && row.onboarding_id === 'S1' && row.authority_confirmed === true && row.method === 'agree_page', 'the evidence row: version, terms, sign-up, authority, method');
    ok(row.agreed_text === text && row.agreed_text_sha256 === sha && row.service_route === 'build' && row.typed_name === 'Sam Smith' && row.typed_role === 'Director' && row.legal_business_name === 'Acme Plumbing Ltd' && row.company_number === '01234567', 'the exact text, its fingerprint, the plan, the signer and the business are stored');
    const acc: GateAcceptance = { id: 'A1', lead_id: 'L1', onboarding_id: 'S1', agreement_version: 'v4', service_route: 'build', method: 'agree_page', authority_confirmed: true, agreed_text_sha256: sha };
    const gate = (a: GateAcceptance | null, over: Partial<{ leadId: string; onboardingId: string; route: 'build' | 'optimise'; sha: string | null }> = {}) => checkoutAgreementGate({ acceptance: a, leadId: over.leadId ?? 'L1', onboardingId: over.onboardingId ?? 'S1', route: over.route ?? 'build', currentVersion: CLIENT_AGREEMENT_VERSION, recomputedSha: over.sha === undefined ? sha : over.sha });
    ok(gate(acc).ok, 'a v4 signature opens checkout for ITS sign-up');
    ok(!gate(null).ok, 'payment is blocked until the agreement is accepted');
    ok(!gate({ ...acc, agreement_version: 'v3' }).ok, 'a v3 signature never opens a v4 checkout (re-sign on v4)');
    ok(!gate(acc, { route: 'optimise' }).ok, 'a TAMPERED PLAN is rejected: the Build signature does not pay an Optimise checkout');
    ok(!gate(acc, { onboardingId: 'S2' }).ok && !gate(acc, { leadId: 'L2' }).ok, 'another sign-up\'s or another client\'s signature pays for nothing here');
    ok(!gate({ ...acc, authority_confirmed: false }).ok && !gate({ ...acc, authority_confirmed: null }).ok, 'no authority confirmation, no checkout');
    ok(!gate(acc, { sha: 'f'.repeat(64) }).ok && !gate(acc, { sha: null }).ok, 'altered stored text no longer matches its fingerprint: refused');
    ok(!gate({ ...acc, method: 'checkout' }).ok, 'only an agreement-page acceptance counts');
    const meta = { commercial_terms: COMMERCIAL_TERMS_V4, agreement_version: 'v4', agreement_acceptance_id: 'A1', service_route: 'build' };
    const wv = (m: Record<string, string | undefined>) => webhookV3Verdict({ metadata: m, acceptance: acc, leadId: 'L1', onboardingId: 'S1', currentVersion: 'v4', recomputedSha: sha, expectedTerms: COMMERCIAL_TERMS_V4 });
    ok(wv(meta).ok, 'the webhook accepts a paid session that names the v4 signature');
    ok(!wv({ ...meta, commercial_terms: COMMERCIAL_TERMS_V3 }).ok && !wv({ ...meta, commercial_terms: undefined }).ok, 'a session that names other or no terms is HELD');
    ok(!wv({ ...meta, agreement_version: 'v3' }).ok && !wv({ ...meta, agreement_acceptance_id: undefined }).ok, 'old version / no signature named: HELD');
    ok(!webhookV3Verdict({ metadata: meta, acceptance: acc, leadId: 'L1', onboardingId: 'S1', currentVersion: 'v4', recomputedSha: sha, expectedTerms: null }).ok, 'no expected terms (a version that stamps none): refuse');
    /* Price: the browser never decides money — the checkout reads route and price from the row and the constants. */
    const co = read('supabase/functions/findable-checkout/index.ts');
    ok(/serviceRouteFromRow\(/.test(co) && /unit_amount/.test(co) && !/req\.json\(\)[^;]*price|body\.(price|amount|unit_amount)/.test(co), 'a tampered price or plan in the request is not read: the route comes from the row, the price from the constants');
    ok(/form\.set\("metadata\[commercial_terms\]", commercialTermsFor\(CLIENT_AGREEMENT_VERSION\) \?\? ""\)/.test(co), 'the checkout session carries the terms the CURRENT version decides');
    const hold = read('supabase/functions/_shared/payment-hold.ts');
    ok(/expectedTerms: commercialTermsFor\(CLIENT_AGREEMENT_VERSION\)/.test(hold), 'the webhook backstop checks the same terms');
  }

  console.log('\n── PAID CLIENTS AND THE WELCOME PACK SEE THE SIGNED AGREEMENT ──');
  {
    const rows = [
      { id: 'A-v3', method: 'agree_page', accepted_at: '2026-10-05T10:00:00Z', typed_name: 'Old Client', agreement_version: 'v3', service_route: 'optimise' },
      { id: 'A-v4', method: 'agree_page', accepted_at: '2026-10-07T09:30:00Z', typed_name: 'New Client', typed_role: 'Owner', email: 'n@x.example', agreement_version: 'v4', service_route: 'build' },
    ];
    const v4rec = signedAgreementRecord([rows[1]], { agreement_acceptance_id: 'A-v4', initial_paid_at: '2026-10-07T09:40:00Z', service_route: 'build' });
    ok(v4rec.status === 'signed' && v4rec.version === 'v4' && v4rec.planName === 'Findable Build' && v4rec.signedAtIso === '2026-10-07T09:30:00Z' && v4rec.linkedToPayment, 'Paid Clients: v4, plan, signed date, linked to the payment');
    const v3rec = signedAgreementRecord([rows[0]], { agreement_acceptance_id: 'A-v3', initial_paid_at: '2026-10-05T10:10:00Z', service_route: 'optimise' });
    ok(v3rec.version === 'v3' && v3rec.planName === 'Findable Optimise' && v3rec.signedAtIso === '2026-10-05T10:00:00Z', 'a v3 client\'s record is still v3, with its own date');
    const both = signedAgreementRecord(rows, { agreement_acceptance_id: 'A-v3', initial_paid_at: '2026-10-05T10:10:00Z' });
    ok(both.version === 'v3', 'the signature the payment rested on wins: a later v4 row never rewrites a v3 client');
    const hub = read('supabase/functions/paid-client-hub/index.ts');
    ok(/signedAgreementRecord\(/.test(hub), 'the Paid Client page reads the record through the one fold');
    const wpV4b = welcomePackAgreementPage({ url: 'https://findable.live/agree/x', route: 'build', termsKnown: true, version: 'v4', acceptedAtIso: '2026-10-07T09:30:00Z', acceptedBy: 'New Client' });
    const wpV4o = welcomePackAgreementPage({ url: 'https://findable.live/agree/x', route: 'optimise', termsKnown: true, version: 'v4', acceptedAtIso: '2026-10-07T09:30:00Z', acceptedBy: 'New Client' });
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    ok(wpV4o.includes(esc('Your Optimise plan ends after payment 6 and the final service period. There is no automatic monthly continuation.')), 'welcome pack, v4 Optimise: the end-of-term key point is there, in Paul\'s words');
    ok(wpV4b.includes(esc('Your Build plan ends after payment 12. If you want Findable to keep hosting and maintaining the site afterwards, you can separately choose the £29.99/month Hosting and Maintenance service.')), 'welcome pack, v4 Build: the end-of-term key point is there, in Paul\'s words');
    ok(wpV4o.includes('Agreement version v4') && wpV4o.includes('Agreement accepted on 7 October 2026'), 'the pack shows the signed version and date');
    ok(!wpV4o.includes('29.99'), 'the v4 Optimise pack never mentions £29.99');
    const wpV3 = welcomePackAgreementPage({ url: 'https://findable.live/agree/x', route: 'optimise', termsKnown: true, version: 'v3', acceptedAtIso: '2026-10-05T10:00:00Z', acceptedBy: 'Old Client' });
    ok(agreementKeyPointsFor({ route: 'optimise', version: 'v3' }) === AGREEMENT_KEY_POINTS.optimise && !wpV3.includes('ends after payment 6'), 'a v3 client\'s welcome pack is unchanged');
    ok(agreementKeyPointsFor({ route: 'optimise', version: null }) === AGREEMENT_KEY_POINTS.optimise && agreementKeyPointsFor({ route: null, version: 'v4' }) === AGREEMENT_KEY_POINTS.unknown, 'no version or no route: no end-of-term claim is made');
    ok(endOfTermKeyPoint('optimise') === afterTermSummaryWords('optimise').replace('final service period. There is no automatic continuing charge.', 'final service period. There is no automatic monthly continuation.'), 'one source: the key point and the summary share their wording');
    const wr = read('supabase/functions/_shared/welcome-pack-render.ts');
    ok(/agreement_version/.test(wr) && /version:/.test(wr), 'the welcome pack renderer passes the signed version through');
  }

  console.log('\n── EVERY CLIENT-FACING v4 LINE SAYS THE v4 END OF TERM ──');
  {
    for (const r of ['build', 'optimise'] as const) {
      const checkout = cardSavedNoticeFor(r) + ' ' + checkoutLineNameFor(r) + ' ' + offerSummaryFor(r);
      if (r === 'optimise') ok(!/29\.99|continues at|until you cancel/.test(checkout), 'Optimise checkout text (card notice, line item, offer line): no £29.99, nothing continues');
      else ok(/optional/.test(checkout) && !/continues at|until you cancel/.test(checkout), 'Build checkout text: £29.99 only as an optional extra');
    }
    ok(/Optimise then ends with no continuing charge; after Build, £29\.99 a month hosting and maintenance is optional/.test(FINDABLE_OFFER_SUMMARY), 'the pre-choice offer line names both endings');
    const soon = (route: 'build' | 'optimise', afterTerm?: 'automatic' | 'optional' | 'none') => monthlyStartingSoonEmail({ businessName: 'A', startsOn: '22 December 2026', cancelUrl: null, route, ...(afterTerm ? { afterTerm } : {}) }).paragraphs.join(' ');
    ok(!/29\.99/.test(soon('optimise', 'none')) && /ends after payment 6/.test(soon('optimise', 'none')), 'monthly-starting-soon email, v4 Optimise: ends, no £29.99');
    ok(/optional/.test(soon('build', 'optional')) && !/continues at/.test(soon('build', 'optional')), 'monthly-starting-soon email, v4 Build: optional');
    ok(/continues at £29\.99 a month/.test(soon('build', 'automatic')), 'monthly-starting-soon email, v3: unchanged');
    ok(/then it stops/.test(soon('build')), 'a legacy subscription: unchanged');
    ok(/optional/.test(termCompleteEmail({ siteKind: 'findable_built', totalPayments: 12, hostingOptional: true }).paragraphs.join(' ')) && !/29\.99/.test(termCompleteEmail({ siteKind: 'findable_built', totalPayments: 12 }).paragraphs.join(' ')), 'term-complete email: the optional hosting is named only when it applies');
    const base = { businessName: 'RG', town: 'Huntingdon', beforeNamed: 23, beforeAnswered: 72, afterNamed: 31, afterAnswered: 96, questions: 12, documentUrl: 'https://findable.live/results/x', wentUp: true, withinNoise: false, monthlyStartsOn: '22 December 2026', totalPayments: 6, v3Terms: true };
    const res = (m?: 'automatic' | 'optional' | 'none') => resultsEmailParagraphs({ ...base, ...(m ? { continuingMode: m } : {}) }).join(' ');
    ok(!/29\.99/.test(res('none')) && /ends after payment 6/.test(res('none')), 'results email, v4 Optimise: no £29.99');
    ok(/continues at £29\.99 a month/.test(res()) && /continues at £29\.99 a month/.test(res('automatic')), 'results email, v3: unchanged');
    const wh = read('supabase/functions/stripe-webhook/index.ts');
    ok(/endMode === "automatic"/.test(wh) && /v4_minimum_term_complete/.test(wh) && /hostingOptional: endMode === "optional"/.test(wh), 'the webhook: v3 keeps its manual Continuing Service; v4 ends or records an opt-in');
    ok(/commercial_terms: s\.metadata\?\.commercial_terms as string/.test(wh) && /v3Checkout \? \(s\.metadata\?\.commercial_terms \?\? null\) : null/.test(wh), 'the webhook stamps the terms the session carried, onto the client row and the subscription');
    const ds = read('supabase/functions/_shared/delayed-subscription.ts');
    ok(/"metadata\[commercial_terms\]": terms/.test(ds) && !/continuing|29\.99/i.test(ds.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'the subscription is stamped with its terms and no £29.99 price is ever created');
  }

  console.log('\n── MIGRATION ──');
  {
    const m = read('supabase/migrations/20261015100000_client_agreement_v4.sql');
    ok(/agreement_version not in \('v3', 'v4'\)/.test(m) && /csa_v3_option_b', 'csa_v4_option_b/.test(m), 'the migration widens the v3-only checks to v3 and v4');
    ok(!/\b(update|delete|truncate)\b/i.test(m.replace(/--.*$/gm, '')), 'it only drops and re-adds constraints: no row is rewritten');
  }

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
}
const V4_TEMPLATE_SHA = '5392e62c0dc2ce6db03959cc2bd25cb03e5ba389421a87f1bc8af2c5625173c5';
main();
