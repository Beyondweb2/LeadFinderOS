/* findable.live SELF-SERVICE SIGN-UP: THE PAYMENT PLAN HOOKS (2026-10-29, docs/findable-site-plan-contract.md).
   fn findable-onboarding `submit` (answers.payment_plan) and `plans` (public list). A DRY RUN of what checkout and the
   agreement page then do with the row — the same pure functions they call — with no Stripe call and no charge. */
import { readFileSync } from 'node:fs';
import {
  agreementVersionForPlan, paymentPlanFromRow, publicPlanCatalogue, readSignupPaymentPlan, type PaymentPlan,
} from '../src/lib/paymentPlans.ts';
import { offerPrice } from '../supabase/functions/_shared/offer-price.ts';

let fails = 0;
const ok = (c: unknown, label: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${label}`); };

// The edge secrets as they are live today (12-month price NOT set), and once it is.
const today = (n: string) => ({ FINDABLE_NEW_SITE_PRICE_ID: 'price_test_new_site' } as Record<string, string>)[n];
const withTwelve = (n: string) => ({ FINDABLE_NEW_SITE_PRICE_ID: 'price_test_new_site', FINDABLE_REDUCED_MONTHLY_PRICE_ID: 'price_test_reduced' } as Record<string, string>)[n];

console.log('── 1. what submit accepts ──');
for (const raw of [undefined, null, '']) {
  const r = readSignupPaymentPlan(raw, today);
  ok(r.ok && r.plan === null, `no plan (${JSON.stringify(raw)}) → accepted, nothing written: exactly as before`);
}
for (const p of ['full', 'six'] as const) {
  const r = readSignupPaymentPlan(p, today);
  ok(r.ok && r.plan === p, `"${p}" → written to the row`);
}
const t0 = readSignupPaymentPlan('twelve', today);
ok(!t0.ok && t0.error === 'plan_unavailable', '"twelve" while its live price is not set → refused (plan_unavailable)');
const t1 = readSignupPaymentPlan('twelve', withTwelve);
ok(t1.ok && t1.plan === 'twelve', '"twelve" once FINDABLE_REDUCED_MONTHLY_PRICE_ID is set → accepted');
for (const bad of ['legacy_twelve', 'FULL', 'monthly', 6, true, {}]) {
  const r = readSignupPaymentPlan(bad, withTwelve);
  ok(!r.ok && r.error === 'invalid_payment_plan', `${JSON.stringify(bad)} → refused (invalid_payment_plan), never stored`);
}

console.log('── 2. dry run: the row → agreement version + first payment (what client-agreement / findable-checkout do) ──');
const expect: Array<[PaymentPlan | null, 'v5' | 'v6', number, PaymentPlan]> = [
  ['full', 'v6', 499, 'full'],
  ['six', 'v6', 99, 'six'],
  ['twelve', 'v6', 99, 'twelve'],
  [null, 'v5', 99, 'legacy_twelve'],   // the no-plan path: unchanged
];
for (const [sent, version, gbp, planOnRow] of expect) {
  const row = sent ? { payment_plan: sent } : {};          // NEWER_COLS sheds a null: the column is simply absent
  const plan = paymentPlanFromRow(row);
  ok(plan === planOnRow, `${sent ?? 'no plan'}: the row reads as ${planOnRow}`);
  ok(plan && agreementVersionForPlan(plan) === version, `${sent ?? 'no plan'}: signs agreement ${version}`);
  ok(plan && offerPrice(plan).gbp === gbp, `${sent ?? 'no plan'}: first payment £${gbp} (offerPrice, the one the charge uses)`);
}

console.log('── 3. the public plans list ──');
const cat = publicPlanCatalogue(today);
ok(cat.map((c) => c.plan).join() === 'full,six,twelve', 'lists the three client plans, never the staff-only one');
ok(cat.every((c) => Object.keys(c).sort().join() === 'available,name,plan'), 'each entry is plan, name, available — nothing else');
ok(cat.find((c) => c.plan === 'twelve')?.available === false && cat.filter((c) => c.available).length === 2, 'today: 12 months not on sale, the other two are');
ok(publicPlanCatalogue(withTwelve).every((c) => c.available), 'once the price is set: all three on sale');
ok(!/price_|sk_|secret/i.test(JSON.stringify(publicPlanCatalogue(withTwelve))), 'no price id, key or secret in the answer');

console.log('── 4. the function ──');
const fn = readFileSync('supabase/functions/findable-onboarding/index.ts', 'utf8').replace(/\r\n/g, '\n');
const plansBlock = fn.slice(fn.indexOf('if (action === "plans")'), fn.indexOf('// ── prefill'));
ok(plansBlock.length > 0 && !/service\.|await |body\.|leadId/.test(plansBlock), 'plans: no DB read, no request input, nothing awaited');
ok(/Cache-Control": "public, max-age=300"/.test(plansBlock), 'plans: cacheable for 5 minutes');
const submit = fn.slice(fn.indexOf('if (action === "submit")'));
ok(submit.indexOf('readSignupPaymentPlan(a.payment_plan') > 0 && submit.indexOf('readSignupPaymentPlan(a.payment_plan') < submit.indexOf('saveAnswers('), 'submit: the plan is checked before any row is written');
ok(/payment_plan: planRead\.plan,/.test(submit), 'submit: in the answers object');
const lists = [...submit.matchAll(/const (NEWER_COLS|optional) = \[([^\]]*)\]/g)];
ok(lists.length === 2 && lists.every((m) => m[2].includes('"payment_plan"')), 'submit: in NEWER_COLS and optional (all three lists)');
const co = readFileSync('supabase/functions/findable-checkout/index.ts', 'utf8');
ok(/paymentPlanFromRow\(ob/.test(co) && !/body\.payment_plan|payload\.payment_plan/.test(co), 'checkout reads the plan from the ROW, never from the request');

if (fails) { console.log(`\n${fails} FAILURE(S)`); process.exit(1); }
console.log('\nALL PASS');
