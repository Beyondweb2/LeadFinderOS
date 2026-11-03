/* FINDABLE COMPLETE PAID UP FRONT (Paul, 2026-11-03; docs/two-plans.md, docs/agreement-v7.1.md).
   Every promise of the plan, against the code that keeps it: the figures, one charge and no subscription, the sale's words,
   the commission on the whole amount with no trailing, the agreement (v7 untouched, v7.1 new), the site transferring at the END
   of the 12 months, and the DB accepting it. Monthly Complete must not move.
   Run: npx tsx scripts/complete-upfront.test.ts */
import { readFileSync } from 'node:fs';
import * as P from '../src/lib/paymentPlans.ts';
import { agreementVersion, renderAgreementText, SIGNABLE_VERSIONS, PUBLIC_AGREEMENT_VERSION, V7_1_CHANGED_CLAUSES, versionTemplateText, sha256Hex } from '../src/lib/clientAgreement.ts';
import { salePlanFlagAtPayment, salePlanParts, monthlyDiffers } from '../src/lib/salePlan.ts';
import { commercialTermsFor, COMMERCIAL_TERMS_V7 } from '../src/lib/clientTimeline.ts';
import { commissionPayableDays } from '../src/lib/commissionConfig.ts';
import { planPeriodEnd, planPeriodReminderEmail, PLAN_PERIOD_REMINDER_PLANS } from '../src/lib/planPeriodReminder.ts';
import { planSummaryRowsForPlan } from '../src/lib/signupSummary.ts';
import { checkoutAgreementGate, webhookV3Verdict } from '../src/lib/signupGate.ts';

let failed = 0;
const ok = (c: unknown, m: string) => { if (c) console.log(`  PASS ${m}`); else { failed++; console.error(`  FAIL ${m}`); } };
const read = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const U = 'complete_upfront' as const;

(async () => {
  console.log('1. the figures');
  const s = P.PAYMENT_PLAN_SPEC[U];
  ok(s.firstGbp === 999 && s.monthlyGbp === 0 && s.totalPayments === 1, '£999, one payment, no monthly');
  ok(P.completeUpfrontSavingGbp() === 189, 'saves £189 against £99 × 12');
  ok(P.planTotalGbp(U) === 999, 'the total is the £999');
  ok(P.planProduct(U) === 'complete' && P.isCompletePlan(U) && P.isCompletePlan('complete') && !P.isCompletePlan('full'), 'it is Findable Complete');
  ok(P.CLIENT_PAYMENT_PLANS.join() === 'complete,complete_upfront,full,six,twelve', 'monthly first, then up front, then Essential');
  ok(P.DEFAULT_PAYMENT_PLAN === 'complete', 'monthly stays the default');
  ok(P.guaranteeForPlan(U, 'x') === P.V7_GUARANTEE, 'the same guarantee as Complete (refund = everything paid)');
  ok(/save £189/.test(P.planShortLine(U)) && /£999 once/.test(P.planShortLine(U)), 'the short line says the price and the saving');

  console.log('2. monthly Complete has not moved');
  const c = P.PAYMENT_PLAN_SPEC.complete;
  ok(c.firstGbp === 99 && c.monthlyGbp === 99 && c.totalPayments === 12 && P.planTotalGbp('complete') === 1188, 'still £99 × 12');
  ok(P.planShortLine('complete') === '£99 a month for 12 months (£1,188 in total)', 'its line is unchanged');
  ok(/once your final payment clears/.test(P.planAfterWords('complete')), 'it still transfers on the final payment');
  ok(P.planHasInstalments('complete'), 'it still has its subscription');

  console.log('3. one charge, nothing recurring, no Stripe Price needed');
  ok(!P.planHasInstalments(U) && P.recurringPaymentsForPlan(U) === 0, 'no subscription is created (createDelayedSubscription skips a plan with none)');
  ok(P.PLAN_MONTHLY_PRICE_SECRET[U] === null && P.planAvailable(U, () => undefined), 'always on sale: it needs no monthly Price');
  ok(P.readSignupPaymentPlan(U, () => undefined).ok, 'findable.live can submit it');
  ok(P.publicPlanCatalogue(() => 'price_x').find((p) => p.plan === U)?.product === 'complete', 'the public list names it, as Complete');
  ok(P.publicPlanCatalogue(() => 'price_x').find((p) => p.plan === U)?.recommended === false, 'only monthly carries "recommended"');
  const co = read('supabase/functions/findable-checkout/index.ts');
  ok(/if \(planHasInstalments\(plan\)\) form\.set\("payment_intent_data\[setup_future_usage\]"/.test(co), 'the card is not saved when nothing recurs');
  ok(/const priceId = legacyPlan \?/.test(co), 'the amount is inline from the plan: only the old plan uses a dashboard Price');
  ok(/You pay £999 today, one payment, and nothing more/.test(P.cardSavedNoticeForPlan(U)), 'the card notice says one payment');
  ok(!/card is saved|We save your card/i.test(P.cardSavedNoticeForPlan(U)), 'the card notice never says we keep the card');
  ok(P.checkoutLineNameForPlan(U).startsWith('Findable Complete, paid up front') && /£999 once/.test(P.checkoutLineNameForPlan(U)), 'the Stripe line names it');

  console.log('4. the sale records plan complete, pay option upfront');
  const parts = salePlanParts(U);
  ok(parts.product === 'complete' && parts.option === 'upfront' && parts.words === 'Complete · paid up front', parts.words);
  ok(salePlanParts('complete').option === 'monthly' && salePlanParts('complete').words === 'Complete · monthly', 'monthly Complete keeps its words');
  ok(salePlanFlagAtPayment({ stripePlan: U, pickedPlan: U, amountGbp: 999 }) === null, 'a clean £999 sale has no flag');
  ok(salePlanFlagAtPayment({ stripePlan: U, pickedPlan: U, amountGbp: 99 }) === 'amount_differs', 'a £99 charge on it is flagged');
  ok(salePlanFlagAtPayment({ stripePlan: 'complete', pickedPlan: U, amountGbp: 99 }) === 'plan_differs', 'Stripe on a different plan is flagged');
  ok(!monthlyDiffers(U, [29.99]), 'a later opt-in hosting payment is not a monthly mismatch');

  console.log('5. commission: the ladder rate on £999, payable when the window closes, no trailing');
  ok(commissionPayableDays(commercialTermsFor('v7.1')) === 7, 'a v7.1 sale waits for the 7-day window');
  ok(commercialTermsFor('v7.1') === COMMERCIAL_TERMS_V7, 'v7.1 stamps the same terms, so the DB trigger gives the same date without a change');
  ok(/complete_upfront/.test(read('scripts/commission-owed.test.ts')), 'the money itself is proved in commission-owed.test.ts: rate on £999, due date, no trailing');

  console.log('6. the agreement: v7 untouched, v7.1 is what new signers sign');
  ok(P.agreementVersionForPlan(U) === 'v7.1' && P.agreementVersionForPlan('complete') === 'v7.1' && P.agreementVersionForPlan('six') === 'v7.1', 'every new Complete or Essential signature is v7.1');
  ok(P.agreementVersionForPlan('legacy_twelve') === 'v5', 'the old staff-only plan stays on v5');
  ok(SIGNABLE_VERSIONS.join() === 'v5,v7.1' && PUBLIC_AGREEMENT_VERSION === 'v7.1', 'v7 can no longer be signed');
  ok(await sha256Hex(versionTemplateText('v7')) === '77702a369863f18b02872bc9308fa9088fac3ad197248f7058636edab2b0a5f0', 'v7 has not changed by a word (the fingerprint main had before v7.1)');
  const v71 = agreementVersion('v7.1'), v7 = agreementVersion('v7');
  const num = (v: typeof v7, n: string) => (v.body.find((b) => b.kind === 'clause' && (b as { num?: string }).num === n) as { text?: string } | undefined)?.text ?? '';
  ok(/paid up front: £999, one payment, for a 12-month Plan Period/.test(num(v71, '3.1')), '3.1 sells it');
  ok(/£99 initial payment, then 11 further monthly payments of £99/.test(num(v71, '3.1')) && /£499, one payment/.test(num(v71, '3.1')), '3.1 keeps every other price');
  ok(/until 12 months after the date your payment cleared/.test(num(v71, '2.6')), '2.6 defines the 12-month Plan Period');
  ok(/at the end of the Plan Period/.test(num(v71, '8.4')) && /unless it ends under clause 5\.5/.test(num(v71, '8.4')), '8.4 transfers at the end, never on a guarantee claim');
  ok(/for the 12-month Plan Period/.test(num(v71, '9.2')), '9.2 includes hosting for the 12 months');
  ok(num(v71, '5.4') === num(v7, '5.4') && num(v71, '5.5') === num(v7, '5.5'), 'the guarantee clauses are v7 word for word (refund = all payments made)');
  ok(num(v71, '5.2') === num(v7, '5.2') && num(v71, '5.3') === num(v7, '5.3'), 'the guarantee clock is v7 word for word');
  const changed = v71.body.filter((b, i) => JSON.stringify(b) !== JSON.stringify(v7.body[i])).map((b) => (b as { num?: string }).num);
  ok(changed.join() === V7_1_CHANGED_CLAUSES.join() && v71.body.length === v7.body.length, `only the listed clauses differ: ${changed.join(', ')}`);
  ok(v71.schedule.rows.length === v7.schedule.rows.length, 'Schedule 1 keeps its rows');
  const signed = renderAgreementText({ businessName: 'ZZ QA', route: 'build', paymentPlan: U }, 'v7.1');
  ok(/Payment plan: Findable Complete, paid up front: £999, one payment, for 12 months/.test(signed), 'the signed text prints the plan');
  const rows = planSummaryRowsForPlan(U);
  ok(rows.find((r) => r.key === 'today')?.value.includes('£999') && !rows.some((r) => r.key === 'then'), 'the page before signing shows £999 and no monthly');

  console.log('7. the payment gate');
  const acc = { id: 'a1', lead_id: 'l', onboarding_id: 'o', agreement_version: 'v7.1', service_route: 'build', method: 'agree_page', authority_confirmed: true, agreed_text_sha256: 's', free_to_leave_provider: true, payment_plan: U };
  const gate = (a: Record<string, unknown>, plan: string, currentVersion = 'v7.1') => checkoutAgreementGate({ acceptance: a as never, leadId: 'l', onboardingId: 'o', route: 'build', currentVersion, recomputedSha: 's', paymentPlan: plan });
  ok(gate(acc, U).ok, 'a v7.1 signature for it can pay');
  ok(!gate({ ...acc, payment_plan: 'complete' }, U).ok, 'a signature for monthly Complete never pays the £999');
  ok(!gate(acc, 'complete').ok, 'a signature for the £999 never pays monthly');
  ok(!gate({ ...acc, agreement_version: 'v7', payment_plan: 'complete' }, 'complete').ok, 'an unpaid v7 signature re-signs on v7.1 for a new checkout');
  const meta = { commercial_terms: COMMERCIAL_TERMS_V7, agreement_version: 'v7', agreement_acceptance_id: 'a1', service_route: 'build', payment_plan: 'complete' };
  ok(webhookV3Verdict({ metadata: meta, acceptance: { ...acc, agreement_version: 'v7', payment_plan: 'complete' } as never, leadId: 'l', onboardingId: 'o', currentVersion: 'v7', recomputedSha: 's', expectedTerms: COMMERCIAL_TERMS_V7 }).ok, 'a session already open on v7 when v7.1 ships is not held');
  const hold = read('supabase/functions/_shared/payment-hold.ts');
  ok(/const v7Session = s\.metadata\?\.agreement_version === "v7" && \(plan === "complete" \|\| plan === "full" \|\| plan === "six" \|\| plan === "twelve"\)/.test(hold), 'payment-hold pins a v7 session to v7, never the up-front plan');

  console.log('8. the website transfers at the END of the 12 months');
  ok(P.planTransfersAtPayment('full') && !P.planTransfersAtPayment(U) && !P.planTransfersAtPayment('complete'), 'only Essential paid in full transfers on its one payment');
  const wh = read('supabase/functions/stripe-webhook/index.ts');
  ok(/if \(planTransfersAtPayment\(paidPlan\)\) \{/.test(wh) && !/PAYMENT_PLAN_SPEC\[paidPlan\]\.totalPayments === 1\) \{/.test(wh), 'the webhook does not stamp paid_in_full_at (eligible to transfer) on it');
  ok(/at the end of the 12 months/.test(P.planAfterWords(U)) && /for the 12 months/.test(P.planAfterWords(U)), 'the client is told so, and that hosting runs for the 12 months');
  ok(PLAN_PERIOD_REMINDER_PLANS.includes(U), 'the Plan Period reminder covers it');
  const facts = { initialPaidAt: '2026-11-10T10:00:00Z' } as never;
  const end = planPeriodEnd(U, facts, null);
  ok(end?.endDay === '2027-11-10' && end.ended === false, `the Plan Period ends 12 months after payment (${end?.endDay})`);
  ok(planPeriodEnd(U, { initialPaidAt: null } as never, null) === null, 'no payment date: unknown, never guessed');
  const em = planPeriodReminderEmail({ businessName: 'ZZ QA', plan: U, endDay: '2027-11-10' }).text;
  ok(/up front/.test(em) && /At the end of your Plan Period, the website we built for you transfers/.test(em) && !/final payment/.test(em), 'the reminder email says the right thing');

  console.log('9. the database accepts it, additively');
  const mig = read('supabase/migrations/20261205090000_complete_upfront_agreement_v7_1.sql');
  for (const t of ['onboarding_responses_payment_plan_check', 'outreach_leads_payment_plan_check', 'client_agreement_acceptances_payment_plan_check', 'plan_period_reminders_payment_plan_check']) ok(mig.includes(`add constraint ${t}`), `${t} is widened`);
  ok(/array\['v3', 'v4', 'v5', 'v6', 'v7', 'v7\.1'\]/.test(mig) && /agreement_version <> 'v7\.1' or payment_plan in \('complete', 'complete_upfront'/.test(mig), 'a v7.1 signature is agreement-first and must name a plan');
  ok(/agreement_version <> 'v7' or payment_plan in \('complete', 'full', 'six', 'twelve'\)/.test(mig), 'a v7 signature still cannot name the up-front plan');
  ok(!/\b(delete|truncate|update public)\b/i.test(mig.replace(/^--.*$/gm, '')), 'nothing is updated or deleted');

  console.log('10. Quick Close and the Inbox menu');
  const qc = read('src/components/QuickCloseDialog.tsx');
  ok(/COMPLETE_PAYMENT_PLANS\.map/.test(qc) && /or pay up front, save \$\{gbpWords\(completeUpfrontSavingGbp\(\)\)\}/.test(qc), 'Complete shows both ways to pay, with the saving from the constants');
  ok(qc.indexOf('qc-plan-complete-card') < qc.indexOf('qc-plan-essential'), 'Complete is above Essential in the source order');
  ok(P.COMPLETE_PAYMENT_PLANS[0] === 'complete', 'monthly is first');
  ok(/CLIENT_PAYMENT_PLANS\.map\(\(p\) => \(\s*<DropdownMenuItem key=\{p\} onSelect=\{\(\) => void copySignupLink\(p\)\}/.test(read('src/pages/Inbox.tsx')), 'the Inbox menu lists every client plan, so it gets the up-front link');

  if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
  console.log('\nAll passed.');
})();
