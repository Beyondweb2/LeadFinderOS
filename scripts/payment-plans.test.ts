/* THE PAYMENT PLANS (Paul, 2026-10-29) — src/lib/paymentPlans.ts, agreement v6 (src/lib/clientAgreement.ts). The three ways
   to pay for Findable Build plus the staff-only v5 plan: amounts, counts, totals, the plan read off a row and off Stripe
   metadata, the agreement each plan is signed on, the 12-month plan's safe failure, and the v6 text. Pure: nothing
   charges, sends or reads the database. */
import {
  PAYMENT_PLAN_SPEC, PAY_IN_FULL_GBP, REDUCED_MONTHLY_GBP, CLIENT_PAYMENT_PLANS, STAFF_ONLY_PAYMENT_PLANS, FULL_PAY_HOSTING_INCLUDED_MONTHS,
  planTotalGbp, recurringPaymentsForPlan, planHasInstalments, paymentPlanFromRow, paymentPlanFromMeta, agreementVersionForPlan,
  planShortLine, planTermsLines, cardSavedNoticeForPlan, checkoutLineNameForPlan, paymentOptionsSummary, gbpWords, planAvailable,
  unavailablePlans, PLAN_UNAVAILABLE_TEXT, V6_GUARANTEE, V6_GUARANTEE_HEADLINE, guaranteeForPlan, planAgreementWords, threeWaysSpoken,
} from '../src/lib/paymentPlans.ts';
import { FINDABLE_CONTINUING_GBP, FINDABLE_GUARANTEE, FINDABLE_MONTHLY_GBP, FINDABLE_SETUP_PRICE_GBP, serviceRouteForTotal } from '../src/lib/findableOffer.ts';
import { agreementVersion, renderAgreementText, versionTemplateText, V6_CHANGED_CLAUSES, SIGNABLE_VERSIONS } from '../src/lib/clientAgreement.ts';
import { checkoutAgreementGate, webhookV3Verdict } from '../src/lib/signupGate.ts';
import { commercialTermsFor, continuingModeFor, isOptionBTerms } from '../src/lib/clientTimeline.ts';
import { resolveAgreementRoute } from '../src/lib/agreementRoute.ts';
import { readFileSync, existsSync } from 'node:fs';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

console.log('The three options, as Paul set them');
ok(PAY_IN_FULL_GBP === 499 && PAYMENT_PLAN_SPEC.full.totalPayments === 1 && !planHasInstalments('full'), 'pay in full: £499 once, no instalments');
ok(PAYMENT_PLAN_SPEC.six.totalPayments === 6 && PAYMENT_PLAN_SPEC.six.firstGbp === 99 && PAYMENT_PLAN_SPEC.six.monthlyGbp === 99 && recurringPaymentsForPlan('six') === 5, '6 months: £99 × 6 (sign-up + 5)');
ok(PAYMENT_PLAN_SPEC.twelve.totalPayments === 12 && PAYMENT_PLAN_SPEC.twelve.firstGbp === 99 && REDUCED_MONTHLY_GBP === 49.99 && recurringPaymentsForPlan('twelve') === 11, '12 months: £99 now, then £49.99 × 11');
ok(PAYMENT_PLAN_SPEC.legacy_twelve.totalPayments === 12 && PAYMENT_PLAN_SPEC.legacy_twelve.monthlyGbp === FINDABLE_MONTHLY_GBP, 'the old plan is still £99 × 12');
ok(planTotalGbp('full') === 499 && planTotalGbp('six') === 594 && planTotalGbp('twelve') === 648.89 && planTotalGbp('legacy_twelve') === 1188, 'totals: 499 / 594 / 648.89 / 1188 (pence maths)');
ok(FINDABLE_SETUP_PRICE_GBP === 99 && FINDABLE_CONTINUING_GBP === 29.99 && FULL_PAY_HOSTING_INCLUDED_MONTHS === 6, 'sign-up £99, optional £29.99 hosting, pay in full includes 6 months');
ok(!CLIENT_PAYMENT_PLANS.includes('legacy_twelve') && STAFF_ONLY_PAYMENT_PLANS.includes('legacy_twelve'), 'the old plan is staff-only, never a client option');

console.log('Which agreement each plan is signed on');
ok(agreementVersionForPlan('legacy_twelve') === 'v5' && CLIENT_PAYMENT_PLANS.every((p) => agreementVersionForPlan(p) === 'v6'), 'old plan v5, the three new plans v6');
ok(SIGNABLE_VERSIONS.includes('v5') && SIGNABLE_VERSIONS.includes('v6'), 'both v5 and v6 can be signed');
ok(commercialTermsFor('v6') === 'csa_v6_option_b' && isOptionBTerms('csa_v6_option_b') && continuingModeFor('csa_v6_option_b', 'build') === 'optional', 'v6 terms: Option B timing, hosting opt-in after the plan');
ok(paymentPlanFromRow({}) === 'legacy_twelve' && paymentPlanFromRow({ payment_plan: null }) === 'legacy_twelve', 'a blank sign-up row is the v5 offer (rows made before plans; findable.live self-service)');
ok(paymentPlanFromRow({ payment_plan: 'twelve' }) === 'twelve' && paymentPlanFromRow({ payment_plan: 'nonsense' }) === null, 'a stored plan reads positively; junk is refused');

console.log('A count never decides a plan or route once a plan is recorded (6 is also Optimise\'s count)');
ok(paymentPlanFromMeta({ payment_plan: 'six', total_payments: '6' }) === 'six', 'recorded plan wins');
ok(paymentPlanFromMeta({ total_payments: '12' }) === 'legacy_twelve', 'a pre-plans 12-payment record is the v5 plan');
ok(paymentPlanFromMeta({ total_payments: '6' }) === null, 'a bare 6 is NOT the six plan');
ok(serviceRouteForTotal(6, 'six') === 'build' && serviceRouteForTotal(6) === 'optimise' && serviceRouteForTotal(1, 'full') === 'build' && serviceRouteForTotal(1) === null, 'a six-plan or pay-in-full client is Build; an old 6-count client is still Optimise');
ok(resolveAgreementRoute('build', 6, 'six') === 'build', 'the agreement route of a six-plan client is Build');

console.log('The 12-month plan fails safely without its Stripe price');
const env = (m: Record<string, string>) => (n: string) => m[n];
ok(!planAvailable('twelve', env({})) && planAvailable('full', env({})), 'no £49.99 price id → 12 months unavailable; pay in full needs none');
ok(planAvailable('twelve', env({ FINDABLE_REDUCED_MONTHLY_PRICE_ID: 'price_abc123' })), 'a price id → available');
ok(!planAvailable('twelve', env({ FINDABLE_REDUCED_MONTHLY_PRICE_ID: 'prod_abc123' })), 'a PRODUCT id is not a price → unavailable');
ok(unavailablePlans(env({ FINDABLE_STANDARD_MONTHLY_PRICE_ID: 'price_x' })).twelve === PLAN_UNAVAILABLE_TEXT && !unavailablePlans(env({ FINDABLE_STANDARD_MONTHLY_PRICE_ID: 'price_x' })).six, 'Quick Close is told which plan is off and why');
const co = read('supabase/functions/findable-checkout/index.ts');
ok(co.indexOf('planAvailable(plan,') > 0 && co.indexOf('planAvailable(plan,') < co.indexOf('form.set("mode"'), 'the checkout refuses an unavailable plan before any Stripe session is built');

console.log('The words come from the numbers');
ok(planShortLine('full') === '£499 once' && planShortLine('six').includes('£99 × 6') && planShortLine('twelve').includes('£49.99 × 11'), 'short lines');
ok(gbpWords(1188) === '£1,188' && gbpWords(29.99) === '£29.99', 'money formatting');
ok(threeWaysSpoken().includes('£499 once') && threeWaysSpoken().includes('£49.99'), 'spoken: ' + threeWaysSpoken());
for (const p of [...CLIENT_PAYMENT_PLANS, 'legacy_twelve' as const]) {
  const n = cardSavedNoticeForPlan(p);
  ok(!n.includes('—') && n.includes('signed agreement') && n.includes('£29.99'), `${p}: card notice, no em dash, names the agreement and optional hosting`);
  ok(planTermsLines(p).join(' ').includes('transfers to you'), `${p}: the rep's terms say the website transfers`);
  ok(checkoutLineNameForPlan(p).startsWith('Findable Build'), `${p}: Stripe line is Findable Build`);
}
ok(!/cancel any time|no commitment/i.test(paymentOptionsSummary() + CLIENT_PAYMENT_PLANS.map(planTermsLines).flat().join(' ')), 'never "cancel any time" / "no commitment"');

console.log('The guarantee');
ok(V6_GUARANTEE_HEADLINE === 'We improve AI visibility or you get your money back.', 'the headline is exactly Paul\'s words');
ok(/within 14 days of your results/.test(V6_GUARANTEE) && /same questions and the same engines/.test(V6_GUARANTEE) && /refund everything you have paid/.test(V6_GUARANTEE), 'v6: same questions, 14 days, refund everything paid');
ok(guaranteeForPlan('legacy_twelve', FINDABLE_GUARANTEE) === FINDABLE_GUARANTEE && guaranteeForPlan('full', FINDABLE_GUARANTEE) === V6_GUARANTEE, 'old plan keeps the v5 guarantee; new plans the v6 one');
ok(read('src/lib/findableOffer.ts').includes(`"questions and the same engines. If that number has not gone up, email us within 14 days of your " +`), 'FINDABLE_GUARANTEE (byte-locked with findable.live) is unchanged');

console.log('Agreement v6');
const v5 = agreementVersion('v5'), v6 = agreementVersion('v6');
const clause = (v: typeof v5, n: string) => v.body.find((b) => b.kind === 'clause' && b.num === n) as { text: string; lead?: string } | undefined;
ok(clause(v6, '3.1')!.text.includes('£499, one payment') && clause(v6, '3.1')!.text.includes('£594') && clause(v6, '3.1')!.text.includes('£648.89'), '3.1 names all three plans and their totals');
ok(clause(v6, '3.1')!.text.includes(`£${PAY_IN_FULL_GBP}`) && clause(v6, '3.1')!.text.includes(`£${REDUCED_MONTHLY_GBP}`), "3.1's figures are the plan constants");
ok(clause(v6, '5.4')!.text.startsWith(V6_GUARANTEE_HEADLINE) && /all payments you have made/.test(clause(v6, '5.4')!.text) && /14 days after the Results Date/.test(clause(v6, '5.4')!.text), '5.4: the headline, refund of all payments, the 14-day window');
ok(clause(v6, '5.3')!.text === clause(v5, '5.3')!.text, '5.3 (same questions, same engines) is v5 word for word');
ok(clause(v6, '3.5')!.text === clause(v5, '3.5')!.text && clause(v6, '8.6')!.text.includes('final payment has cleared'), 'payments stopping: v5 3.5 kept; 8.6 on the final cleared payment');
ok(/6 months from the date the website we build first goes live/.test(clause(v6, '9.2')!.text), '9.2: pay in full includes 6 months of hosting');
ok(/final payment has cleared/.test(clause(v6, '4.3')!.text), '4.3: ownership on the final cleared payment');
const untouched = v5.body.filter((b) => b.kind === 'clause' && !V6_CHANGED_CLAUSES.includes((b as { num: string }).num));
ok(untouched.every((b) => v6.body.some((c) => c.kind === 'clause' && (c as { num: string }).num === (b as { num: string }).num && (c as { text: string }).text === (b as { text: string }).text)), `every other clause (${untouched.length}) is v5 word for word`);
ok(v6.body.filter((b) => b.kind === 'clause').length === v5.body.filter((b) => b.kind === 'clause').length, 'same clause numbering as v5');
const filled = renderAgreementText({ businessName: 'ZZ QA', route: 'build', paymentPlan: 'twelve' }, 'v6');
ok(filled.includes('Payment plan: ' + planAgreementWords('twelve')) && filled.startsWith('Findable Client Service Agreement (version v6)'), 'the agreed text names the chosen plan');
ok(versionTemplateText('v6').includes('Payment plan: {{payment_plan}}'), 'the template text has a plan placeholder');
ok(!renderAgreementText({ businessName: 'ZZ QA', route: 'build', paymentPlan: 'twelve' }, 'v5').includes('Payment plan'), 'v5 bytes are unchanged (no plan row)');
ok(!/\[CHECK\]/.test(filled), 'no [CHECK] markers in the live agreement');
ok(existsSync(new URL('../docs/agreement-v6.md', import.meta.url)) && read('docs/agreement-v6.md').includes('[CHECK]'), 'docs/agreement-v6.md exists with its [CHECK] marks');

console.log('The gate: a v6 signature pays only for its own plan');
const acc = { id: 'a1', lead_id: 'L', onboarding_id: 'O', agreement_version: 'v6', service_route: 'build', method: 'agree_page', authority_confirmed: true, agreed_text_sha256: 'h', free_to_leave_provider: true, payment_plan: 'six' };
const g = (plan: string | null | undefined, a = acc) => checkoutAgreementGate({ acceptance: a, leadId: 'L', onboardingId: 'O', route: 'build', currentVersion: 'v6', recomputedSha: 'h', paymentPlan: plan });
ok(g('six').ok, 'signed for six, paying six → ok');
ok(!g('twelve').ok && !g('full').ok, 'signed for six, paying another plan → refused (other_plan)');
ok(!g('legacy_twelve').ok, 'a v6 signature never pays the old plan');
ok(!checkoutAgreementGate({ acceptance: { ...acc, agreement_version: 'v5', payment_plan: null }, leadId: 'L', onboardingId: 'O', route: 'build', currentVersion: 'v5', recomputedSha: 'h', paymentPlan: 'six' }).ok, 'a v5 signature never pays a new plan');
ok(checkoutAgreementGate({ acceptance: { ...acc, agreement_version: 'v5', payment_plan: null }, leadId: 'L', onboardingId: 'O', route: 'build', currentVersion: 'v5', recomputedSha: 'h', paymentPlan: 'legacy_twelve' }).ok, 'a v5 signature pays the old plan, as today');
const wv = webhookV3Verdict({ metadata: { commercial_terms: 'csa_v6_option_b', agreement_version: 'v6', agreement_acceptance_id: 'a1', service_route: 'build', payment_plan: 'six' }, acceptance: acc, leadId: 'L', onboardingId: 'O', currentVersion: 'v6', recomputedSha: 'h', expectedTerms: 'csa_v6_option_b' });
ok(wv.ok, 'the webhook backstop accepts a v6 six-plan session');

console.log('Stripe side: the schedule follows the recorded plan');
{
  const ds = await import('../supabase/functions/_shared/delayed-subscription.ts');
  ok(ds.subscriptionTotalPayments({ metadata: { payment_plan: 'six', total_payments: '6', service_route: 'build' } }) === 6, 'a six-plan subscription is 6 payments');
  ok(ds.subscriptionTotalPayments({ metadata: { payment_plan: 'bogus', total_payments: '12' } }) === null, 'an unknown recorded plan is unknown, never 12');
  ok(ds.subscriptionRoute({ metadata: { payment_plan: 'six', total_payments: '6', service_route: 'build' } }) === 'build', 'a six-plan subscription is Build');
  ok(ds.resolvePaidRoute({ service_route: 'build', payment_plan: 'six', total_payments: '6' }, 'build').route === 'build', 'Build + six (count 6) resolves');
  ok(ds.resolvePaidRoute({ service_route: 'build', total_payments: '6' }, 'build').route === null, 'Build with a bare 6 and no plan is refused');
  ok(ds.resolvePaidRoute({ service_route: 'build', payment_plan: 'full', total_payments: '1' }, 'build').route === 'build', 'pay in full (count 1) resolves');
  ok(ds.resolvePaidRoute({ service_route: 'build', payment_plan: 'twelve', total_payments: '6' }, 'build').route === null, 'a plan whose count disagrees is refused');
  const full = await ds.createDelayedSubscription({} as never, { id: 'l1', business_name: null, stripe_customer_id: 'cus_1', stripe_subscription_id: null }, '2026-10-29T10:00:00Z', 'build', 'cs_1', 'legacy', null, 'full');
  ok(full.kind === 'skipped' && /paid in full/.test(full.reason), 'pay in full creates no subscription');
  const end = ds.minimumTermCancelAt(Date.UTC(2026, 11, 10) / 1000, recurringPaymentsForPlan('twelve'));
  ok(new Date(end * 1000).toISOString().startsWith('2027-11-10'), 'the twelve plan stops after its 11th monthly');
}

console.log('Quick Close');
{
  const q = await import('../src/lib/quickClose.ts');
  ok(q.closeFlow({ decision_maker: 'yes', manager: 'owner', domain: 'yes', route: 'build' }).includes('payment_plan'), 'the plan question is asked for Build');
  ok(q.closeTermsLines('build', null)[0] === q.PICK_PLAN_FIRST_LINE && q.closeChipText('build', null) === 'Findable Build', 'no plan yet → no figures');
  ok(q.closeTermsLines('build', 'twelve').join(' ').includes('£49.99'), 'twelve → its own terms');
  ok(q.closeTermsLines('build', 'legacy_twelve').join(' ') === q.routeTermsLines('build').join(' '), 'the old plan → exactly the v5 terms');
  ok(q.onboardingColumnsFor({ route: 'build', payment_plan: 'six' }).payment_plan === 'six', 'the plan is written to the sign-up row');
  const qo = q.QUICK_CLOSE_QUESTIONS.find((x) => x.key === 'payment_plan')!;
  ok(qo.options.filter((o) => !o.legacy).map((o) => o.value).join() === 'full,six,twelve' && qo.options.find((o) => o.value === 'legacy_twelve')?.legacy === true, 'three plans by default; the old plan is hidden (legacy)');
  ok(read('src/components/QuickCloseDialog.tsx').includes('Show the old plan (£99 × 12, staff only)'), '"Show the old plan" reveals it');
}
ok(!existsSync(new URL('../src/lib/priceModel.ts', import.meta.url)) && !/PriceModelSwitch|upfront_499/.test(read('src/components/QuickCloseDialog.tsx') + read('src/pages/SalesDashboard.tsx') + read('src/components/ColdCallPlaybook.tsx')), 'the old "£499 upfront then £99 × 12" model is gone');

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall payment-plan checks passed');
