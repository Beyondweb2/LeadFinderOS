/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE CURRENT FINDABLE OFFER: £99 to start, then £99 a month from six weeks after sign-up — and since
   2026-09-29 (Paul) TWO LENGTHS: Findable Build 12 payments in total, Findable Optimise 6. Nothing is
   charged after the last. (scripts/service-route-terms.test.ts pins the route mechanics in depth.)

   Pinned here, each one a way it has already gone wrong once:
     1. The constants: one monthly figure, two payment counts, the sign-up counted inside both.
     2. Checkout: the Stripe line item and the card-screen notice name the route's count and minimum,
        and never offer "cancel before it starts".
     3. Billing: the subscription ENDS after the route's count (it was open-ended once, so month 13 charged).
     4. Emails / welcome pack / playbook read the same constants; no "stop any time" contradiction.
     5. No £29.99 current-offer wording in active code, and no "not a binding term" in code or rules.
     6. The two Meta templates that still say £29.99 are blocked on every path.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { afterTermSummaryWords } from '../src/lib/findableOffer.ts';
import { readFileSync } from 'node:fs';
import {
  FINDABLE_BUILD_TOTAL_PAYMENTS, FINDABLE_MONTHLY_DELAY_DAYS, FINDABLE_MONTHLY_GBP, FINDABLE_OPTIMISE_TOTAL_PAYMENTS,
  FINDABLE_OFFER_SUMMARY, FINDABLE_SETUP_PRICE_GBP, STALE_OFFER_TEMPLATES, cardSavedNoticeFor, checkoutLineNameFor, contractTotalGbpFor,
  monthlyStartingSoonEmail, recurringPaymentsFor, termMonthsFor, totalPaymentsFor, SERVICE_ROUTES,
} from '../src/lib/findableOffer.ts';
import { minimumTermCancelAt } from '../supabase/functions/_shared/delayed-subscription.ts';
import { getTemplateSendability } from '../src/lib/whatsappTemplates.ts';
import { templateAwaitingApproval } from '../supabase/functions/_shared/whatsapp-send.ts';
import { buildColdCallPlaybook } from '../src/lib/coldCallPlaybook.ts';
import { planSpoken } from '../src/lib/planTerms.ts';
import { PAYMENT_PLAN_SPEC, gbpWords, threeWaysSpoken } from '../src/lib/paymentPlans.ts';

let f = 0;
const ok = (c: unknown, l: string) => { if (!c) f++; console.log((c ? 'PASS ' : 'FAIL ') + l); };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
/** Source with comments removed — the words that can reach a customer or a charge. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('── 1. THE CONSTANTS ──');
ok(FINDABLE_SETUP_PRICE_GBP === 99, 'setup is £99');
ok(FINDABLE_MONTHLY_GBP === 99, 'the monthly is £99 (got ' + FINDABLE_MONTHLY_GBP + ')');
ok(FINDABLE_MONTHLY_DELAY_DAYS === 42, 'the monthly starts six weeks after sign-up');
ok(FINDABLE_BUILD_TOTAL_PAYMENTS === 12 && termMonthsFor('build') === 12, 'Build: 12 payments in total, a 12-month minimum');
ok(FINDABLE_OPTIMISE_TOTAL_PAYMENTS === 6 && termMonthsFor('optimise') === 6, 'Optimise: 6 payments in total, a 6-month minimum');
ok(recurringPaymentsFor('build') === 11 && recurringPaymentsFor('optimise') === 5, 'recurring after the sign-up: 11 / 5 (derived: total - 1)');
ok(contractTotalGbpFor('build') === 1188 && contractTotalGbpFor('optimise') === 594, 'nominal contract value: £1,188 / £594');
/* 2026-10-05 (v3 Client Service Agreement): the monthly starts the day after the refund window (5.6), and the
   Continuing Service follows the minimum term (9A). */
/* v5 (2026-10-16): ONE plan. */
ok(FINDABLE_OFFER_SUMMARY === '£99 to start, then £99 a month from the day after your 14-day refund window closes (normally about six weeks after you give us access): we build, host and manage a new website for you, 12 payments in total. After payment 12 the website is yours, and £29.99 a month hosting and maintenance is optional.',
  'the one-line (pre-choice) offer: ' + FINDABLE_OFFER_SUMMARY);
ok(!/FINDABLE_NEW_SITE_|CARD_SAVED_NOTICE_NEW_SITE|export const FINDABLE_TOTAL_PAYMENTS|export const CARD_SAVED_NOTICE\b/.test(read('src/lib/findableOffer.ts')), 'the retired constants (two-tier and single-plan) are gone');

console.log('── 2. CHECKOUT ──');
for (const r of SERVICE_ROUTES) {
  const n = totalPaymentsFor(r), notice = cardSavedNoticeFor(r);
  /* v5 (clause 4.1): the minimum term is counted in PAYMENTS, never "an N-month minimum". */
  ok(notice.includes('£99 a month') && notice.includes(`Your minimum term is ${n} payments in total`) && !/month minimum/.test(notice), `card notice (${r}) names £99/month and the minimum term in payments`);
  ok(!/cancel (before|any ?time)|stop any ?time/i.test(notice), `card notice (${r}) offers no "cancel before it starts"`);
  ok(notice.includes(`${n} payments in total, including today's`) && notice.includes(afterTermSummaryWords(r)) && !/continues at £29\.99/.test(notice) && !/six weeks from today/.test(notice), `card notice (${r}) counts today's £99 inside the ${n}, then names the v4 end of term`);
  ok(checkoutLineNameFor(r).includes(`/month from the day after your refund window, ${n} payments in total (the minimum term)`), `Stripe line item (${r}) names the monthly, ${n} payments and the minimum`);
}
const checkout = code('supabase/functions/findable-checkout/index.ts');
/* 2026-10-29: the v5 plan keeps the route's words; the new payment plans use their own (paymentPlans.ts). */
ok(/custom_text\[submit\]\[message\]", legacyPlan \? cardSavedNoticeFor\(route\) : cardSavedNoticeForPlan\(plan\)\)/.test(checkout), 'checkout shows the route\'s (or plan\'s) notice beside the card field');
ok(/product_data\]\[name\]", legacyPlan \? checkoutLineNameFor\(route\) : checkoutLineNameForPlan\(plan\)\)/.test(checkout), 'checkout names the route (or plan) on the line item');
ok(!/29\.99|NEW_SITE/.test(checkout), 'no £29.99 and no new-site tier in checkout code');

console.log('── 3. BILLING: THE ROUTE\'S COUNT, THE SIGN-UP ONE INCLUDED ──');
/* A model of how Stripe bills a monthly subscription from its anchor (the trial end): a charge on the
   anchor's day-of-month each month, clamped to the month's last day (31 Jan → 28 Feb → 31 Mar), at the
   anchor's time. cancel_at ends it: a period that would START at or after cancel_at is never billed. */
const chargesUntil = (anchorSec: number, cancelAtSec: number): number[] => {
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
const iso = (s: number) => new Date(s * 1000).toISOString().slice(0, 10);
const CASES: Array<[string, number]> = [
  ['sign-up 23 Sep 2026 + six weeks (4 Nov 2026)', Date.parse('2026-09-23T10:00:00Z') / 1000 + FINDABLE_MONTHLY_DELAY_DAYS * 86400],
  ['month-end start, 31 Jan 2026 (short months follow)', Date.UTC(2026, 0, 31, 9) / 1000],
  ['29 Feb 2028 start (leap day)', Date.UTC(2028, 1, 29, 12) / 1000],
  ['31 Mar 2026 start (the 12th month would be Feb)', Date.UTC(2026, 2, 31, 8) / 1000],
  ['30 Apr 2026 start', Date.UTC(2026, 3, 30) / 1000],
  ['31 Dec 2026 start (crosses a year)', Date.UTC(2026, 11, 31, 23, 59) / 1000],
  ['sign-up 18 Jan 2028 + six weeks lands on 29 Feb 2028', Date.UTC(2028, 0, 18, 12) / 1000 + FINDABLE_MONTHLY_DELAY_DAYS * 86400],
];
for (const r of SERVICE_ROUTES) {
  for (const [label, anchor] of CASES) {
    const cancelAt = minimumTermCancelAt(anchor, recurringPaymentsFor(r));
    const charges = chargesUntil(anchor, cancelAt);
    ok(charges.length === recurringPaymentsFor(r) && 1 + charges.length === totalPaymentsFor(r),
      `${r} · ${label}: ${charges.length} recurring (${iso(charges[0])} … ${iso(charges[charges.length - 1])}) + the sign-up = ${1 + charges.length} total, ends ${iso(cancelAt)}`);
    ok(cancelAt > charges[charges.length - 1], `${r} · ${label}: the end falls after the last charge, so that charge is not cut short`);
  }
  ok(CASES.every(([, a]) => (1 + chargesUntil(a, minimumTermCancelAt(a, recurringPaymentsFor(r))).length) * FINDABLE_MONTHLY_GBP === contractTotalGbpFor(r)),
    `${r}: every case totals £${contractTotalGbpFor(r)} — never an extra payment`);
}
const t0 = Date.UTC(2026, 10, 4, 9, 30) / 1000;   // first monthly charge 4 Nov 2026
ok(minimumTermCancelAt(t0, 11) === Date.UTC(2027, 9, 4, 9, 30) / 1000, 'Build: first recurring 4 Nov 2026 → ends 4 Oct 2027 (last charge 4 Sep 2027)');
ok(minimumTermCancelAt(t0, 5) === Date.UTC(2027, 3, 4, 9, 30) / 1000, 'Optimise: first recurring 4 Nov 2026 → ends 4 Apr 2027 (last charge 4 Mar 2027)');
const sub = code('supabase/functions/_shared/delayed-subscription.ts');
ok(/cancel_at: String\(minimumTermCancelAt\(trialEnd, recurring\)\)/.test(sub) && /proration_behavior: "none"/.test(sub),
  'the Stripe subscription is created with cancel_at at the route\'s term end and no proration');

console.log('── 4. EMAILS, WELCOME PACK, PLAYBOOK ──');
for (const r of SERVICE_ROUTES) {
  const soon = monthlyStartingSoonEmail({ businessName: 'X', startsOn: '4 Nov 2026', cancelUrl: 'https://billing.example/x', route: r }).paragraphs.join(' ');
  ok(soon.includes('£99') && soon.includes('your minimum term') && !/month minimum/.test(soon) && soon.includes(`${totalPaymentsFor(r)} payments in total, counting the £99 you paid at sign-up`),
    `"monthly starts soon" (${r}): names the term and counts the sign-up payment inside the ${totalPaymentsFor(r)}`);
  ok(!/nothing is taken|cancel here/i.test(soon), `"monthly starts soon" (${r}): no free exit`);
}
const results = read('src/lib/remeasureResults.ts');
ok(!/Cancel any time before then/.test(results), 'four-week results email: "Cancel any time" is gone');
ok(/termMonthsFor\(route\)\}-month minimum term/.test(results), '…and it names the client\'s own term');
const welcome = read('src/lib/welcomePackHtml.ts');
ok(/totalPaymentsFor\(route\)\} payments in total, counting your first/.test(welcome), 'welcome pack: the client\'s own count, counting the first');
ok(!/stop it any time/.test(welcome) && !/Six weeks after your first payment/i.test(welcome) && /MONTHLY_START_V3_WORDS/.test(welcome),
  'welcome pack: no "stop it any time", and the start date is the v3 one (the day after the refund window)');
const pb = buildColdCallPlaybook({
  lead: { id: 'l', business_name: 'Acme Plumbing', phone: '07700900123', website: null },
  reportAudit: null, report: null, runCrawls: [], leadCrawl: null, messages: [], nowMs: Date.now(),
});
/* v5 (2026-10-16): the sales offer is planTerms.ts — ONE plan, Findable Build (Optimise is withdrawn). */
ok(pb.offer.lines[0] === planSpoken(), 'Cold Call Playbook quotes the offer from the one sales source (planTerms.ts)');
/* 2026-10-29 (v6): three ways to pay (threeWaysSpoken). The 12-month plan's count is in payments, the £99 start counted
   ("… to start then … a month, 12 payments in total"); "6 months" is a plan's name, never a minimum term in months. */
ok(pb.offer.monthly.includes(threeWaysSpoken()) && pb.offer.monthly.includes(`${gbpWords(PAYMENT_PLAN_SPEC.twelve.firstGbp)} to start then ${gbpWords(PAYMENT_PLAN_SPEC.twelve.monthlyGbp)} a month, ${PAYMENT_PLAN_SPEC.twelve.totalPayments} payments in total`)
  && !/optimise|minimum term of \d+ months|-month minimum/i.test(pb.offer.monthly) && !/check current offer/i.test(JSON.stringify(pb)),
  'and names Build\'s three ways to pay, the 12-month count in payments with the sign-up counted — no Optimise, no months-as-term, no "check current offer"');
/* Nothing customer-facing may describe the count ON TOP of the sign-up. */
for (const [label, text] of [['card notice (build)', cardSavedNoticeFor('build')], ['card notice (optimise)', cardSavedNoticeFor('optimise')], ['offer summary', FINDABLE_OFFER_SUMMARY], ['playbook offer', JSON.stringify(pb.offer)]] as const) {
  ok(!/(12|6) (more|further|monthly) payments|then (12|6) payments|plus (12|6)\b|13 payments|7 payments/i.test(text), label + ': no wording that implies an extra payment');
}
ok(pb.objections.find((o) => o.objection === 'How much is it?')?.answer === planSpoken(), '"How much is it?" answers with the current offer (planTerms.ts)');

console.log('── 5. NO STALE CURRENT-OFFER WORDING ──');
const ACTIVE = [
  'src/lib/findableOffer.ts', 'src/lib/coldCallPlaybook.ts', 'src/lib/aiAuditReportHtml.ts', 'src/lib/remeasureResults.ts',
  'src/lib/welcomePackHtml.ts', 'supabase/functions/findable-checkout/index.ts', 'supabase/functions/findable-onboarding/index.ts',
  'supabase/functions/_shared/delayed-subscription.ts', 'supabase/functions/_shared/remeasure-results.ts', 'supabase/functions/stripe-webhook/index.ts',
];
/* 2026-10-05: £29.99 exists in code exactly ONCE — the Continuing Service constant (clause 9A). Everything else names it. */
for (const p of ACTIVE) ok(!/29\.99/.test(code(p).replace('export const FINDABLE_CONTINUING_GBP = 29.99;', '')), p + ': no £29.99 in code (beyond the one constant)');
for (const p of [...ACTIVE, 'CLAUDE.md', 'docs/business-and-offer.md']) ok(!/not a binding term/i.test(read(p)), p + ': no "not a binding term"');
const rules = read('CLAUDE.md');
ok(!/29\.99/.test(rules.slice(rules.indexOf('## 1.'), rules.indexOf('## 2.'))), 'CLAUDE.md §1 (the offer rules) carries no £29.99');

console.log('── 6. THE STALE META TEMPLATES ARE BLOCKED ──');
for (const t of ['explain_offer', 'explain_offer_v2']) {
  ok(STALE_OFFER_TEMPLATES.has(t) && templateAwaitingApproval(t), t + ': refused by the server claim (every send path)');
  ok(!getTemplateSendability(t, null, null).ok, t + ': unselectable in the picker');
}
ok(!templateAwaitingApproval('competitor_hook') && !/29\.99/.test(getTemplateSendability('competitor_hook', null, null).reason ?? ''),
  'an unrelated approved template is not caught by the block');

if (f > 0) { console.log('\n' + f + ' FAILURE' + (f === 1 ? '' : 'S')); process.exit(1); }
console.log('\nALL PASS');
