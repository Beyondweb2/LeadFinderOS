/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE CURRENT FINDABLE OFFER (Paul, 2026-09-23): £99 to start, then £99 a month from six weeks after
   sign-up, for a 12-month minimum term — and nothing charged after it.

   Pinned here, each one a way it has already gone wrong once:
     1. The constants: one monthly figure, one term.
     2. Checkout: the Stripe line item and the card-screen notice say £99/month AND the minimum, and
        the notice no longer offers "cancel before it starts".
     3. Billing: the subscription ENDS after 12 payments (it was open-ended, so month 13 would charge).
     4. Emails / welcome pack / playbook read the same constants; no "stop any time" contradiction.
     5. No £29.99 current-offer wording in active code, and no "not a binding term" in code or rules.
     6. The two Meta templates that still say £29.99 are blocked on every path.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import {
  CARD_SAVED_NOTICE, FINDABLE_CONTRACT_TOTAL_GBP, FINDABLE_MINIMUM_TERM_MONTHS, FINDABLE_MONTHLY_DELAY_DAYS, FINDABLE_MONTHLY_GBP,
  FINDABLE_OFFER_SUMMARY, FINDABLE_RECURRING_PAYMENTS, FINDABLE_TOTAL_PAYMENTS, FINDABLE_SETUP_PRICE_GBP, STALE_OFFER_TEMPLATES, monthlyStartingSoonEmail,
} from '../src/lib/findableOffer.ts';
import { minimumTermCancelAt } from '../supabase/functions/_shared/delayed-subscription.ts';
import { getTemplateSendability } from '../src/lib/whatsappTemplates.ts';
import { templateAwaitingApproval } from '../supabase/functions/_shared/whatsapp-send.ts';
import { buildColdCallPlaybook } from '../src/lib/coldCallPlaybook.ts';

let f = 0;
const ok = (c: unknown, l: string) => { if (!c) f++; console.log((c ? 'PASS ' : 'FAIL ') + l); };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
/** Source with comments removed — the words that can reach a customer or a charge. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('── 1. THE CONSTANTS ──');
ok(FINDABLE_SETUP_PRICE_GBP === 99, 'setup is £99');
ok(FINDABLE_MONTHLY_GBP === 99, 'the monthly is £99 (got ' + FINDABLE_MONTHLY_GBP + ')');
ok(FINDABLE_MINIMUM_TERM_MONTHS === 12, 'the minimum term is 12 months');
ok(FINDABLE_MONTHLY_DELAY_DAYS === 42, 'the monthly starts six weeks after sign-up');
ok(FINDABLE_TOTAL_PAYMENTS === 12, '12 payments in total');
ok(FINDABLE_RECURRING_PAYMENTS === 11, '11 recurring payments after the sign-up one (derived: total - 1)');
ok(FINDABLE_CONTRACT_TOTAL_GBP === 1188 && FINDABLE_SETUP_PRICE_GBP + FINDABLE_RECURRING_PAYMENTS * FINDABLE_MONTHLY_GBP === 12 * 99,
  'nominal contract value is 12 x £99 = £1,188 (got £' + FINDABLE_CONTRACT_TOTAL_GBP + ')');
ok(FINDABLE_OFFER_SUMMARY === '£99 to start, then £99 a month from six weeks after sign-up — 12 payments in total, a 12-month minimum term.',
  'the one-line offer: ' + FINDABLE_OFFER_SUMMARY);
ok(!/FINDABLE_NEW_SITE_|CARD_SAVED_NOTICE_NEW_SITE/.test(read('src/lib/findableOffer.ts')), 'the retired two-tier constants are gone');

console.log('── 2. CHECKOUT ──');
ok(CARD_SAVED_NOTICE.includes('£99 a month') && CARD_SAVED_NOTICE.includes('12-month minimum term'),
  'card-screen notice names £99/month and the 12-month minimum: ' + CARD_SAVED_NOTICE);
ok(!/cancel/i.test(CARD_SAVED_NOTICE), 'and no longer offers "cancel before it starts"');
ok(/12 payments in total, including today's/.test(CARD_SAVED_NOTICE) && /after the 12th/.test(CARD_SAVED_NOTICE),
  'the notice counts today\'s £99 inside the 12 — it cannot be read as £99 plus 12 more');
const checkout = code('supabase/functions/findable-checkout/index.ts');
ok(/custom_text\[submit\]\[message\]", CARD_SAVED_NOTICE\)/.test(checkout), 'checkout shows that notice beside the card field');
ok(/\/month from week six, \$\{FINDABLE_TOTAL_PAYMENTS\} payments in total \(\$\{FINDABLE_MINIMUM_TERM_MONTHS\}-month minimum\)`/.test(checkout),
  'the Stripe line item names the monthly, 12 payments in total and the minimum');
ok(!/29\.99|NEW_SITE/.test(checkout), 'no £29.99 and no new-site tier in checkout code');

console.log('── 3. BILLING: 12 PAYMENTS IN TOTAL, THE SIGN-UP ONE INCLUDED ──');
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
for (const [label, anchor] of CASES) {
  const cancelAt = minimumTermCancelAt(anchor);
  const charges = chargesUntil(anchor, cancelAt);
  ok(charges.length === FINDABLE_RECURRING_PAYMENTS && 1 + charges.length === FINDABLE_TOTAL_PAYMENTS,
    label + ': ' + charges.length + ' recurring (' + iso(charges[0]) + ' … ' + iso(charges[charges.length - 1]) + ') + the sign-up = ' + (1 + charges.length) + ' total, ends ' + iso(cancelAt));
  ok(cancelAt > charges[charges.length - 1], label + ': the end falls after the last charge, so that charge is not cut short');
}
ok(CASES.every(([, a]) => (1 + chargesUntil(a, minimumTermCancelAt(a)).length) * FINDABLE_MONTHLY_GBP === FINDABLE_CONTRACT_TOTAL_GBP),
  'every case totals £' + FINDABLE_CONTRACT_TOTAL_GBP + ' — never a 13th payment');
const t0 = Date.UTC(2026, 10, 4, 9, 30) / 1000;   // first monthly charge 4 Nov 2026
ok(minimumTermCancelAt(t0) === Date.UTC(2027, 9, 4, 9, 30) / 1000, 'first recurring 4 Nov 2026 → ends 4 Oct 2027 (last charge 4 Sep 2027)');
const sub = code('supabase/functions/_shared/delayed-subscription.ts');
ok(/cancel_at: String\(minimumTermCancelAt\(trialEnd\)\)/.test(sub) && /proration_behavior: "none"/.test(sub),
  'the Stripe subscription is created with cancel_at at the term end and no proration');

console.log('── 4. EMAILS, WELCOME PACK, PLAYBOOK ──');
const soon = monthlyStartingSoonEmail({ businessName: 'X', startsOn: '4 Nov 2026', cancelUrl: 'https://billing.example/x' }).paragraphs.join(' ');
ok(soon.includes('£99') && soon.includes('12-month minimum term') && /12 payments in total, counting the £99 you paid at sign-up/.test(soon),
  'the "monthly starts soon" email names the term and counts the sign-up payment inside the 12');
ok(!/nothing is taken|cancel here/i.test(soon), 'and no longer offers a free exit');
const results = read('src/lib/remeasureResults.ts');
ok(!/Cancel any time before then/.test(results), 'four-week results email: "Cancel any time" is gone');
ok(/FINDABLE_MINIMUM_TERM_MONTHS\}-month minimum term/.test(results), '…and it names the term');
const welcome = read('src/lib/welcomePackHtml.ts');
ok(/FINDABLE_TOTAL_PAYMENTS\} payments in total, counting your first/.test(welcome), 'welcome pack: 12 payments in total, counting the first');
ok(!/stop it any time/.test(welcome) && /Six weeks after your first payment/.test(welcome),
  'welcome pack: no "stop it any time", and the start date is the real one (six weeks after paying)');
const pb = buildColdCallPlaybook({
  lead: { id: 'l', business_name: 'Acme Plumbing', phone: '07700900123', website: null },
  reportAudit: null, report: null, runCrawls: [], leadCrawl: null, messages: [], nowMs: Date.now(),
});
ok(pb.offer.lines[0] === FINDABLE_OFFER_SUMMARY, 'Cold Call Playbook quotes the offer from the constant');
ok(/12 months/.test(pb.offer.monthly) && /after the 12th payment \(the sign-up £99 is the first\)/.test(pb.offer.monthly) && !/check current offer/i.test(JSON.stringify(pb)),
  'and names the term and the 12 total payments — no "check current offer"');
/* Nothing customer-facing may describe 12 payments ON TOP of the sign-up. */
for (const [label, text] of [['card notice', CARD_SAVED_NOTICE], ['offer summary', FINDABLE_OFFER_SUMMARY], ['monthly-starts email', soon], ['playbook offer', JSON.stringify(pb.offer)]] as const) {
  ok(!/12 (more|further|monthly) payments|then 12 payments|plus 12|13 payments/i.test(text), label + ': no wording that implies 13 payments');
}
ok(pb.objections.find((o) => o.objection === 'How much is it?')?.answer.startsWith(FINDABLE_OFFER_SUMMARY), '"How much is it?" answers with the current offer');

console.log('── 5. NO STALE CURRENT-OFFER WORDING ──');
const ACTIVE = [
  'src/lib/findableOffer.ts', 'src/lib/coldCallPlaybook.ts', 'src/lib/aiAuditReportHtml.ts', 'src/lib/remeasureResults.ts',
  'src/lib/welcomePackHtml.ts', 'supabase/functions/findable-checkout/index.ts', 'supabase/functions/findable-onboarding/index.ts',
  'supabase/functions/_shared/delayed-subscription.ts', 'supabase/functions/_shared/remeasure-results.ts', 'supabase/functions/stripe-webhook/index.ts',
];
for (const p of ACTIVE) ok(!/29\.99/.test(code(p)), p + ': no £29.99 in code');
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
