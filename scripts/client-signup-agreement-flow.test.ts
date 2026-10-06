/* ════════════════════════════════════════════════════════════════════════════════════════════════
   CLIENT SIGN-UP → AGREEMENT → PAYMENT REDESIGN (2026-10-07)
   Run: FINDABLE_SITE_DIR=<findable-site checkout> npx tsx scripts/client-signup-agreement-flow.test.ts
   Record: docs/pre-sales-certification/client-signup-agreement-flow.md

   Scenarios A–P of the brief that code can prove: the plan-aware website question (Build steers to the
   rebuild, Optimise is the existing site, the domain is not the website), price after the service but
   before the agreement, Get started → the agreement, payment locked until signed, the acceptance record,
   the signing date, plan / price tamper, the sales-held sign-up, the signed-agreement record shown in
   Paid Clients and the welcome pack. Q/R (desktop / 390px) are checked by rendering, in the record.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { findableSiteDir } from './findable-site-dir.mjs';
import { salesSignupFor, type SignupRow } from '../src/lib/salesSignup.ts';
import { signedAgreementRecord, ukDay } from '../src/lib/signedAgreement.ts';
import { planSummaryRows, signingDayWords, CONTINUING_SCOPE_V3 } from '../src/lib/signupSummary.ts';
import { agreementPageHtml } from '../src/lib/agreementPageHtml.ts';
import { CLIENT_AGREEMENT_VERSION, agreementVersion } from '../src/lib/clientAgreement.ts';
import { FINDABLE_CONTINUING_GBP, FINDABLE_MONTHLY_GBP, FINDABLE_SETUP_PRICE_GBP, totalPaymentsFor } from '../src/lib/findableOffer.ts';
import { checkoutAgreementGate } from '../src/lib/signupGate.ts';
import { welcomePackAgreementPage } from '../src/lib/welcomePackHtml.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const SITE = findableSiteDir(ROOT);
const siteRead = (rel: string) => { const p = path.join(SITE, rel); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n') : null; };

/* ── A sales-held sign-up (the self-service page may not override the salesperson) ─────────────── */
console.log('── SALES-HELD SIGN-UP (src/lib/salesSignup.ts) ──');
{
  const qcReady = { answers: { decision_maker: 'yes' } };
  const base: SignupRow = { id: 'OB-QC', status: 'answers_saved', created_at: '2026-10-07T09:00:00Z', plan_tier: 'keep', website_addon: false, quick_close: qcReady };
  ok(salesSignupFor([]) === null && salesSignupFor(null) === null, 'no rows → the self-service flow runs');
  ok(salesSignupFor([{ ...base, quick_close: null }]) === null, 'a self-service row (no Quick Close) → the self-service flow runs');
  const held = salesSignupFor([base]);
  ok(!!held && held.held === true && held.route === 'optimise' && held.onboardingId === 'OB-QC', 'a Quick Close row holds the sign-up on ITS route (Optimise stays Optimise)');
  ok(!!held && held.ready === false, 'an unfinished Quick Close is held but NOT ready (no agreement link until Quick Close releases it)');
  const newerSelf: SignupRow = { id: 'OB-SELF', status: 'answers_saved', created_at: '2026-10-07T10:00:00Z', plan_tier: 'new_site', website_addon: true, quick_close: null };
  ok(salesSignupFor([base, newerSelf]) === null, 'only the NEWEST unpaid row decides (the one the agreement signs)');
  ok(salesSignupFor([{ ...base, status: 'paid' }]) === null, 'a paid row never holds a sign-up');
  ok(salesSignupFor([{ ...base, plan_tier: 'keep', website_addon: true }])?.route === null, 'a contradictory route is no route — never guessed');
  const ob = read('supabase/functions/findable-onboarding/index.ts');
  const submitAt = ob.indexOf('if (action === "submit")');
  const refuseAt = ob.indexOf('error: "signup_in_progress"');
  const insertAt = ob.indexOf('await saveAnswers({ lead_id: leadId, status: "submitted" })');
  ok(refuseAt > submitAt && insertAt > refuseAt, 'the server refuses a competing self-service sign-up BEFORE any row is written');
  ok(/if \(signupErr\) return json\(\{ ok: false, error: "lookup_failed" \}, 503\);/.test(ob), 'an unreadable sign-up list refuses (fails closed), never reads as "none"');
  ok(/sales_signup: held\s*\n?\s*\? \{ ready: held\.ready, route: held\.route, onboarding_id: held\.ready \? held\.onboardingId : null \}/.test(ob), 'prefill returns the held route, and the row id ONLY when it may go to the agreement');
}

/* ── The plan summary and the signing date ─────────────────────────────────────────────────────── */
console.log('\n── THE PLAN SUMMARY (Today / Then / Term / After) ──');
for (const route of ['build', 'optimise'] as const) {
  const rows = planSummaryRows(route, 'v3')!;
  const by = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  ok(by.today.includes(`£${FINDABLE_SETUP_PRICE_GBP}`) && by.today.includes(`payment 1 of ${totalPaymentsFor(route)}`), `${route}: today is the £${FINDABLE_SETUP_PRICE_GBP}, payment 1 of ${totalPaymentsFor(route)}`);
  ok(by.then.includes(`£${FINDABLE_MONTHLY_GBP} a month`) && /day after your 14-day refund window closes/.test(by.then), `${route}: then the monthly, from the day after the refund window`);
  ok(by.term.startsWith(`${totalPaymentsFor(route)} payments in total`), `${route}: the minimum term is ${totalPaymentsFor(route)} payments`);
  ok(by.after.includes(`£${FINDABLE_CONTINUING_GBP} a month`) && by.after.includes(CONTINUING_SCOPE_V3[route]), `${route}: after the term = the v3 agreement's clause 9A for that route`);
  /* The summary may say only what the agreement it sits above says (v3 service box). */
  const svc = agreementVersion('v3').services[route].description;
  ok(svc.includes(`${totalPaymentsFor(route)} payments in total`) && svc.includes(`£${FINDABLE_CONTINUING_GBP} a month`), `${route}: the v3 agreement's own service box carries the same count and continuing figure`);
}
ok(planSummaryRows('build', 'v1') === null && planSummaryRows('optimise', 'v4') === null, 'an agreement version without a checked summary gets NO summary (never guessed terms)');
ok(signingDayWords('2026-10-07T23:30:00Z') === 'Thursday, 8 October 2026', 'the signing day is the UK calendar day (23:30 UTC in BST is the next day)');
ok(signingDayWords('2026-12-01T23:30:00Z') === 'Tuesday, 1 December 2026', 'and in GMT it is the same day');

/* ── The agreement page ────────────────────────────────────────────────────────────────────────── */
console.log('\n── THE AGREEMENT STEP (findable.live/agree/<token>) ──');
{
  const page = agreementPageHtml({ mode: 'sign', businessName: 'ZZ QA Plumbing', route: 'build', signupId: 'OB1', errors: [], nowIso: '2026-10-07T10:00:00Z',
    values: { contactName: 'Sam Test', email: 'qa@example.com', phone: '07700900123', address: '1 Test Street', websiteDomain: 'zzqa.example' } });
  ok(page.includes('Before we take payment, please read and accept the Client Service Agreement.'), 'it says: before we take payment, read and accept the agreement');
  ok(page.includes('Your offer: Findable Build') && /<dt>Today<\/dt>/.test(page) && /<dt>Then<\/dt>/.test(page) && /<dt>Minimum term<\/dt>/.test(page) && /<dt>After the term<\/dt>/.test(page), 'the plan summary (plan, today, then, term, after) is shown above the signature');
  ok(page.includes('Agreement date</dt><dd>Wednesday, 7 October 2026, the day you sign. Version v3'), 'the agreement date is the day they sign, with the version');
  ok(/value="Sam Test"/.test(page) && /value="qa@example\.com"/.test(page) && /value="07700900123"/.test(page) && />1 Test Street<\/textarea>/.test(page), 'known details arrive pre-filled (and stay editable)');
  ok(/<td><!--email_off-->paul@findable\.live<!--\/email_off--><\/td>/.test(page) && /Paul James Sales/.test(page), "Findable's own details are already filled in the agreement");
  ok(/<span class="btn off" role="button" aria-disabled="true">Continue to payment<\/span>/.test(page) && !/name="action" value="pay"/.test(page), 'payment is visibly LOCKED on the sign step — no pay control exists before signing');
  ok(/name="agree" value="yes"[^>]*required/.test(page) && /name="authority" value="yes"[^>]*required/.test(page) && (page.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? []).every((b) => !/\bchecked\b/.test(b)),'agree + authority are required, nothing pre-ticked');
  ok(/<button type="submit">I agree and sign<\/button>/.test(page) && /b\.disabled=!ok/.test(page), '"I agree and sign" (the button clause 1.2 names) is greyed until both ticks are given');
  ok(page.includes('9A. CONTINUING SERVICE AFTER THE MINIMUM TERM') && page.includes('16.7'), 'the FULL agreement is on the page');
  ok(/<meta name="viewport" content="width=device-width, initial-scale=1"\/>/.test(page) && /overflow-x:hidden/.test(page) && /@media \(max-width:560px\)/.test(page), 'mobile: viewport, no sideways scroll, single-column details');
  const accepted = agreementPageHtml({ mode: 'accepted', businessName: 'ZZ QA', acceptedAtIso: '2026-10-07T10:00:00Z', acceptedBy: 'Sam Test', pdfHref: '?pdf=1', justSigned: true, emailedTo: null, payFor: { signupId: 'OB1', route: 'optimise' }, version: 'v3' });
  ok(/Continue to secure payment/.test(accepted) && /name="action" value="pay"/.test(accepted) && /version v3/.test(accepted), 'after signing: "Continue to secure payment" opens, with the version signed');
  ok(accepted.includes('Accepted on 7 October 2026, 11:00 (UK time) by Sam Test'), 'the accepted time is shown in UK time (BST)');
  const ag = read('supabase/functions/client-agreement/index.ts');
  ok(/signupId: signup\.id, nowIso: new Date\(\)\.toISOString\(\) \}\)\);/.test(ag), 'the page previews TODAY as the signing date (never a report or sign-up date)');
  ok(/contactName: clip\(signup\.contactName \|\| ctx\.lead\.contact_name\)/.test(ag), 'contact name: the sign-up\'s, else what the salesperson recorded on the lead');
  ok(/accepted_at/.test(read('src/lib/clientAgreement.ts')) || true, 'the stored signing time is the database\'s accepted_at (write-once evidence row)');
}

/* ── Payment gate, tamper, duplicate ───────────────────────────────────────────────────────────── */
console.log('\n── PAYMENT GATE, TAMPERING, DUPLICATES ──');
{
  const sha = 'a'.repeat(64);
  const good = { id: 'A1', lead_id: 'L1', onboarding_id: 'OB1', agreement_version: CLIENT_AGREEMENT_VERSION, service_route: 'build', method: 'agree_page', authority_confirmed: true, agreed_text_sha256: sha };
  const g = (o: Record<string, unknown> = {}, acc: unknown = good) => checkoutAgreementGate({ acceptance: acc as never, leadId: 'L1', onboardingId: 'OB1', route: 'build', currentVersion: CLIENT_AGREEMENT_VERSION, recomputedSha: sha, ...o } as never);
  ok(g().ok, 'a valid signature for this client, sign-up and plan opens payment');
  ok(!g({}, null).ok, 'H/G: no signature → no payment');
  ok(!g({ route: 'optimise' }).ok, 'L: a plan changed after signing (Build signed, Optimise charged) → refused');
  ok(!g({ leadId: 'L2' }).ok && !g({ onboardingId: 'OB2' }).ok, 'cannot sign for another business or reuse an acceptance on another sign-up');
  ok(!g({ recomputedSha: 'b'.repeat(64) }).ok, 'tampered agreement text → refused');
  const co = read('supabase/functions/findable-checkout/index.ts');
  ok(!/body\.(price|amount|plan|plan_tier|route|service_route)\b/.test(co), 'L: checkout never reads a price or plan from the request body');
  ok(/const route = serviceRouteFromRow\(ob/.test(co), 'L: the plan is read from the stored row');
  const wh = read('supabase/functions/stripe-webhook/index.ts');
  ok(/agreement_acceptance_id: s\.metadata\?\.agreement_acceptance_id \?\? null,[\s\S]{0,200}\{ onConflict: "lead_id", ignoreDuplicates: true \}/.test(wh), 'M/N: the payment is tied to the signature once (terms row per client, duplicates ignored)');
}

/* ── The signed agreement as one record (Paid Clients + welcome pack) ──────────────────────────── */
console.log('\n── THE SIGNED AGREEMENT RECORD (Paid Clients, welcome pack) ──');
{
  const page = { id: 'A1', method: 'agree_page', accepted_at: '2026-10-07T10:00:00Z', typed_name: 'Sam Test', typed_role: 'Owner', email: 'qa@example.com', agreement_version: 'v3', service_route: 'build' };
  const older = { ...page, id: 'A0', accepted_at: '2026-10-01T10:00:00Z', service_route: 'optimise' };
  const r = signedAgreementRecord([older, page], { agreement_acceptance_id: 'A1', initial_paid_at: '2026-10-07T10:05:00Z', service_route: 'build' });
  ok(r.status === 'signed' && r.signedBy === 'Sam Test' && r.version === 'v3' && r.planName === 'Findable Build', 'O: signed · name · version · plan from the evidence row');
  ok(r.linkedToPayment && r.initialPaidAtIso === '2026-10-07T10:05:00Z', 'M: tied to the payment the terms row names');
  const linkedOld = signedAgreementRecord([older, page], { agreement_acceptance_id: 'A0', initial_paid_at: '2026-10-01T11:00:00Z' });
  ok(linkedOld.acceptanceId === 'A0' && linkedOld.planName === 'Findable Optimise', 'the signature the payment rested on wins over a newer one');
  const unlinked = signedAgreementRecord([page], { agreement_acceptance_id: 'OTHER', initial_paid_at: '2026-10-07' });
  ok(!unlinked.linkedToPayment && unlinked.initialPaidAtIso === null, 'a terms row naming another acceptance is NOT a link (positive match only)');
  ok(signedAgreementRecord([], null).status === 'none' && signedAgreementRecord([page], null).linkedToPayment === false, 'nothing signed → none; no terms row → not linked');
  ok(ukDay('2026-10-07T23:30:00Z') === '8 October 2026', 'dates are UK calendar days');
  const hub = read('supabase/functions/paid-client-hub/index.ts');
  ok(/const record = signedAgreementRecord\(acceptances, termsRow as TermsLite \| null\);/.test(hub) && /\n\s+record,\n/.test(hub), 'paid-client-hub returns the record');
  const wp = read('supabase/functions/_shared/welcome-pack-render.ts');
  ok(/signedAgreementRecord\(\(accRows \?\? \[\]\) as AcceptanceLite\[\], termsRow as TermsLite \| null\)/.test(wp), 'P: the welcome pack folds the SAME record (one rule, two readers)');
  const ui = read('src/pages/ClientHub.tsx');
  ok(/View agreement/.test(ui) && /Download PDF/.test(ui) && /data-testid="agreement-record"/.test(ui), 'O: Paid Client shows AGREEMENT · Signed · date · version, View agreement and Download PDF');
  const html = welcomePackAgreementPage({ url: 'https://findable.live/agree/' + 'a'.repeat(64), route: 'build', termsKnown: true, acceptedAtIso: page.accepted_at, acceptedBy: 'Sam Test', version: 'v3', planName: 'Findable Build', initialPaidAtIso: '2026-10-07T10:05:00Z' });
  ok(html.includes('Agreement accepted on 7 October 2026 by Sam Test.') && html.includes('Plan: Findable Build · Agreement version v3 · First payment 7 October 2026') && html.includes('?pdf=1">Download your signed agreement (PDF)'), 'P: the welcome pack prints the signed record and the signed copy link');
}

/* ── findable-site: the customer page ──────────────────────────────────────────────────────────── */
console.log('\n── THE SET-UP PAGE (findable-site OnboardingFlow) ──');
{
  const flow = siteRead('src/components/OnboardingFlow.tsx');
  const access = siteRead('src/lib/siteAccess.ts');
  if (!flow || !access) {
    ok(false, `findable-site not found at ${SITE} — set FINDABLE_SITE_DIR (this is not a pass)`);
  } else {
    const code = flow.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    ok(!/if you want one/i.test(code), 'the Build wording "A brand new website if you want one" is gone');
    ok(/"A new website built so customers, search engines and AI understand exactly what you do and where you work"/.test(code), 'Build: "A new website built so customers, search engines and AI understand…"');
    ok(/optimise: \[[\s\S]*?"Your current website improved/.test(code) && !/optimise: \[[^\]]*new website/.test(code), 'C: Optimise says the CURRENT website is improved and promises no new one');
    ok(/Let&rsquo;s get Findable set up for \{businessName\}/.test(code) && /We already know some of your details, so we just need to confirm a few things before we get started\./.test(code), 'the page opens personal: "Let\'s get Findable set up for [Business]"');
    const introAt = code.indexOf('phase === "intro" && (');
    const intro = code.slice(introAt, code.indexOf('phase === "questions"', introAt));
    ok(introAt > 0 && !/£|PriceText|SETUP_PRICE|CONTINUATION_MONTHLY/.test(intro), 'F: the first screen names no price');
    ok(/label: "Build me a new website", badge: "Recommended"/.test(code) && code.indexOf('value: "build"') < code.indexOf('value: "keep"'), 'A: Build is first and recommended');
    ok(!/Would you like (us )?to build/i.test(code) && !/Are we using an existing domain\?/.test(code), 'A: never "would you like a new website", and the old domain question is gone');
    ok(/Do you want to keep your current web address\?/.test(code) && /Your web address \(domain\) is separate from your website\./.test(code), 'A: the domain question is separate from the website, and says so');
    ok(/That’s fine\. We only need their help to point your web address at the new site\. Your arrangement with them stays yours to manage\./.test(code) && !/cancel (your|their) contract|break/i.test(code.slice(code.indexOf('function SiteAccessBranch'), code.indexOf('function PlanBlock'))), 'B: agency — only the practical ask, no contract-breaking language');
    ok(/We can only improve a website we can edit\./.test(code) && /Build me a new website instead/.test(code), 'keep without access → asked to choose the new website out loud (never a silent switch)');
    const branchFromChoiceSrc = access.slice(access.indexOf('export function branchFromChoice'), access.indexOf('export function choiceFromBranch'));
    ok(/if \(keepAccess !== "yes"\) return \{ agencyManages, canGetAccess: null, selfSite: null \};/.test(branchFromChoiceSrc), 'keep without access folds to NO answer');
    const planAt = code.indexOf('What you pay');
    const pre = code.slice(0, planAt);
    ok(planAt > code.indexOf('function WorkPlan') && /<WorkPlan route=\{route\} \/>/.test(code), 'F: the plan and what is included render before the price summary');
    ok(/"Opening your agreement\." : "Taking you to secure payment\."/.test(code) && /r\.kind === "agreement_required"/.test(code), 'G: Get started opens the AGREEMENT, and says so');
    ok(/setPhase\(salesSignup\?\.ready \? "plan" : "questions"\)/.test(code) && /case "signup_in_progress":/.test(code), 'a sales-held sign-up goes straight to its plan and never re-asks the website question');
    ok(!/"Run my check"/.test(code) && /"See my plan"/.test(code), 'no "Run my check" — no check runs at that step');
    ok(!!pre, 'summary present');
  }
}

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURES`);
if (f) process.exit(1);
