/* THE PAYMENT PLANS (Paul, 2026-10-29) — src/lib/paymentPlans.ts. The three ways to pay for Findable Build plus the
   staff-only v5 plan: amounts, counts, totals, the plan read off a row and off Stripe metadata, and the gate that keeps
   them off sale until the agreement names them. Pure: nothing charges, sends or reads the database. */
import {
  PAYMENT_OPTIONS_SELLABLE, PAYMENT_PLAN_SPEC, PAY_IN_FULL_GBP, REDUCED_MONTHLY_GBP, CLIENT_PAYMENT_PLANS, STAFF_ONLY_PAYMENT_PLANS,
  planTotalGbp, recurringPaymentsForPlan, planHasInstalments, paymentPlanFromRow, paymentPlanFromMeta, isSellablePaymentPlan,
  planShortLine, planTermsLines, cardSavedNoticeForPlan, checkoutLineNameForPlan, paymentOptionsSummary, gbpWords,
} from '../src/lib/paymentPlans.ts';
import { FINDABLE_CONTINUING_GBP, FINDABLE_MONTHLY_GBP, FINDABLE_SETUP_PRICE_GBP } from '../src/lib/findableOffer.ts';
import { readFileSync } from 'node:fs';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };

console.log('The three options, as Paul set them');
ok(PAY_IN_FULL_GBP === 499 && PAYMENT_PLAN_SPEC.full.totalPayments === 1 && !planHasInstalments('full'), 'pay in full: £499 once, no instalments');
ok(PAYMENT_PLAN_SPEC.six.totalPayments === 6 && PAYMENT_PLAN_SPEC.six.firstGbp === 99 && PAYMENT_PLAN_SPEC.six.monthlyGbp === 99 && recurringPaymentsForPlan('six') === 5, '6 months: £99 × 6 (sign-up + 5)');
ok(PAYMENT_PLAN_SPEC.twelve.totalPayments === 12 && PAYMENT_PLAN_SPEC.twelve.firstGbp === 99 && REDUCED_MONTHLY_GBP === 49.99 && recurringPaymentsForPlan('twelve') === 11, '12 months: £99 now, then £49.99 × 11');
ok(PAYMENT_PLAN_SPEC.legacy_twelve.totalPayments === 12 && PAYMENT_PLAN_SPEC.legacy_twelve.monthlyGbp === FINDABLE_MONTHLY_GBP, 'the old plan is still £99 × 12');
ok(planTotalGbp('full') === 499 && planTotalGbp('six') === 594 && planTotalGbp('twelve') === 648.89 && planTotalGbp('legacy_twelve') === 1188, 'totals: 499 / 594 / 648.89 / 1188 (pence maths, no float drift)');
ok(FINDABLE_SETUP_PRICE_GBP === 99 && FINDABLE_CONTINUING_GBP === 29.99, 'the sign-up £99 and optional £29.99 hosting are the existing constants');
ok(!CLIENT_PAYMENT_PLANS.includes('legacy_twelve') && STAFF_ONLY_PAYMENT_PLANS.includes('legacy_twelve'), 'the old plan is staff-only, never a client option');

console.log('Not on sale until the agreement says so');
ok(PAYMENT_OPTIONS_SELLABLE === false, 'PAYMENT_OPTIONS_SELLABLE is false (v5 says 12 payments of £99)');
ok(!isSellablePaymentPlan('full') && !isSellablePaymentPlan('six') && !isSellablePaymentPlan('twelve') && isSellablePaymentPlan('legacy_twelve'), 'today only the old plan can be sold');
ok(isSellablePaymentPlan('full', true) && isSellablePaymentPlan('twelve', true) && isSellablePaymentPlan('legacy_twelve', true), 'once on sale, all three plus the staff plan');
ok(paymentPlanFromRow({}) === 'legacy_twelve' && paymentPlanFromRow({ payment_plan: null }) === 'legacy_twelve', 'today a blank plan is the v5 plan (behaviour unchanged)');
ok(paymentPlanFromRow({}, true) === null && paymentPlanFromRow({ payment_plan: '' }, true) === null, 'once on sale, a blank plan is UNDECIDED, never a default');
ok(paymentPlanFromRow({ payment_plan: 'twelve' }) === 'twelve' && paymentPlanFromRow({ payment_plan: 'nonsense' }) === null, 'a stored plan reads positively; junk is null');

console.log('A count never decides a plan once one is recorded (6 is also Optimise\'s count)');
ok(paymentPlanFromMeta({ payment_plan: 'six', total_payments: '6' }) === 'six', 'recorded plan wins');
ok(paymentPlanFromMeta({ total_payments: '12' }) === 'legacy_twelve', 'a pre-plans 12-payment record is the v5 plan');
ok(paymentPlanFromMeta({ total_payments: '6' }) === null, 'a bare 6 is NOT read as the six plan (it is the old Optimise)');
ok(paymentPlanFromMeta({ payment_plan: 'bogus', total_payments: '12' }) === null, 'an unknown recorded plan is null, never a fallback');

console.log('The words come from the numbers');
ok(planShortLine('full') === '£499 once', 'full: ' + planShortLine('full'));
ok(planShortLine('six').includes('£99 × 6') && planShortLine('six').includes('£594'), 'six: ' + planShortLine('six'));
ok(planShortLine('twelve').includes('£49.99 × 11') && planShortLine('twelve').includes('£648.89'), 'twelve: ' + planShortLine('twelve'));
ok(gbpWords(1188) === '£1,188' && gbpWords(29.99) === '£29.99', 'money formatting');
for (const p of [...CLIENT_PAYMENT_PLANS, 'legacy_twelve' as const]) {
  const n = cardSavedNoticeForPlan(p);
  ok(!n.includes('—') && n.includes('signed agreement') && n.includes('£29.99'), `${p}: the card notice has no em dash, names the agreement and the optional hosting`);
  ok(planTermsLines(p).join(' ').includes('transfers to you'), `${p}: the rep's terms say the website transfers`);
  ok(checkoutLineNameForPlan(p).startsWith('Findable Build'), `${p}: the Stripe line is Findable Build`);
}
ok(!/cancel any time|no commitment/i.test(paymentOptionsSummary() + CLIENT_PAYMENT_PLANS.map(planTermsLines).flat().join(' ')), 'never "cancel any time" / "no commitment"');

console.log('Stripe side: the schedule follows the recorded plan');
{
  const ds = await import('../supabase/functions/_shared/delayed-subscription.ts');
  ok(ds.subscriptionTotalPayments({ metadata: { payment_plan: 'six', total_payments: '6', service_route: 'build' } }) === 6, 'a six-plan subscription is 6 payments');
  ok(ds.subscriptionTotalPayments({ metadata: { payment_plan: 'twelve', total_payments: '12' } }) === 12, 'a twelve-plan subscription is 12 payments');
  ok(ds.subscriptionTotalPayments({ metadata: { payment_plan: 'bogus', total_payments: '12' } }) === null, 'an unknown recorded plan is unknown, never 12');
  ok(ds.subscriptionTotalPayments({ metadata: { total_payments: '12' } }) === 12, 'a pre-plans subscription still reads its count');
  ok(ds.subscriptionRoute({ metadata: { payment_plan: 'six', total_payments: '6', service_route: 'build' } }) === 'build', 'a six-plan subscription is Build, not Optimise');
  const r6 = ds.resolvePaidRoute({ service_route: 'build', payment_plan: 'six', total_payments: '6' }, 'build');
  ok(r6.route === 'build' && !r6.problem, 'checkout on Build + six (count 6) resolves to Build');
  ok(ds.resolvePaidRoute({ service_route: 'build', total_payments: '6' }, 'build').route === null, 'Build with a bare 6 and no plan is refused (the old rule holds)');
  ok(ds.resolvePaidRoute({ service_route: 'build', payment_plan: 'full', total_payments: '1' }, 'build').route === 'build', 'pay in full (count 1) resolves');
  ok(ds.resolvePaidRoute({ service_route: 'build', payment_plan: 'twelve', total_payments: '6' }, 'build').route === null, 'a plan whose count disagrees is refused');
  ok(ds.resolvePaidRoute({ service_route: 'optimise', payment_plan: 'six', total_payments: '6' }, 'optimise').route === null, 'a payment plan on Optimise is refused (plans are Build only)');
  ok(ds.resolvePaidRoute({ service_route: 'build', total_payments: '12' }, 'build').route === 'build', 'a pre-plans Build checkout resolves exactly as before');
  const full = await ds.createDelayedSubscription({} as never, { id: 'l1', business_name: null, stripe_customer_id: 'cus_1', stripe_subscription_id: null }, '2026-10-29T10:00:00Z', 'build', 'cs_1', 'legacy', null, 'full');
  ok(full.kind === 'skipped' && /paid in full/.test(full.reason), 'pay in full creates no subscription (before any Stripe or database call)');
  const twelveEnd = ds.minimumTermCancelAt(Date.UTC(2026, 11, 10) / 1000, recurringPaymentsForPlan('twelve'));
  ok(new Date(twelveEnd * 1000).toISOString().startsWith('2027-11-10'), 'the twelve plan stops after its 11th monthly (cancel_at 11 months after the first)');
}

console.log('Quick Close never reads out the old plan by default');
{
  const q = await import('../src/lib/quickClose.ts');
  ok(q.closeTermsLines('build', null, true).length === 1 && q.closeTermsLines('build', null, true)[0] === q.PICK_PLAN_FIRST_LINE, 'on sale, no plan yet → "ask how they want to pay first", no figures');
  ok(q.closeChipText('build', null, true) === 'Findable Build', 'on sale, no plan yet → the chip names no count');
  ok(q.closeTermsLines('build', null, false).join(' ').includes('12 payments'), 'off sale → today\'s v5 terms, unchanged');
  ok(q.closeTermsLines('build', 'twelve', true).join(' ').includes('£49.99'), 'twelve → its own terms');
  ok(q.closeTermsLines('build', 'legacy_twelve', true).join(' ') === q.routeTermsLines('build').join(' '), 'the old plan → exactly today\'s v5 terms');
  ok(!q.closeFlow({ decision_maker: 'yes', manager: 'owner', domain: 'yes', route: 'build' }).includes('payment_plan'), 'off sale → the plan question is not asked');
  ok(q.onboardingColumnsFor({ route: 'build', payment_plan: 'legacy_twelve' }).payment_plan === 'legacy_twelve', 'the chosen plan is written to the onboarding row');
  ok(q.cleanAnswers({ route: 'build', payment_plan: 'full' }).payment_plan === undefined, 'off sale → a new-plan answer is not kept');
}

console.log('The guarantee wording is untouched');
const offer = readFileSync(new URL('../src/lib/findableOffer.ts', import.meta.url), 'utf8');
ok(offer.includes(`"questions and the same engines. If that number has not gone up, email us within 14 days of your " +`), 'FINDABLE_GUARANTEE text is as it was');
const qc = readFileSync(new URL('../src/lib/quickClose.ts', import.meta.url), 'utf8');
ok(qc.includes(`QUICK_CLOSE_PROMISE = 'We improve AI visibility or you get your money back.'`), 'the headline is exactly Paul\'s words');

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall payment-plan checks passed');
