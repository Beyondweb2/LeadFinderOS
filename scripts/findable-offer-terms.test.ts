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
  CARD_SAVED_NOTICE, FINDABLE_MINIMUM_TERM_MONTHS, FINDABLE_MONTHLY_DELAY_DAYS, FINDABLE_MONTHLY_GBP,
  FINDABLE_OFFER_SUMMARY, FINDABLE_SETUP_PRICE_GBP, STALE_OFFER_TEMPLATES, monthlyStartingSoonEmail,
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
ok(FINDABLE_OFFER_SUMMARY === '£99 to start, then £99 a month from six weeks after sign-up, for a 12-month minimum term.',
  'the one-line offer: ' + FINDABLE_OFFER_SUMMARY);
ok(!/FINDABLE_NEW_SITE_|CARD_SAVED_NOTICE_NEW_SITE/.test(read('src/lib/findableOffer.ts')), 'the retired two-tier constants are gone');

console.log('── 2. CHECKOUT ──');
ok(CARD_SAVED_NOTICE.includes('£99 a month') && CARD_SAVED_NOTICE.includes('12-month minimum term'),
  'card-screen notice names £99/month and the 12-month minimum: ' + CARD_SAVED_NOTICE);
ok(!/cancel/i.test(CARD_SAVED_NOTICE), 'and no longer offers "cancel before it starts"');
const checkout = code('supabase/functions/findable-checkout/index.ts');
ok(/custom_text\[submit\]\[message\]", CARD_SAVED_NOTICE\)/.test(checkout), 'checkout shows that notice beside the card field');
ok(/\/month from week six, \$\{FINDABLE_MINIMUM_TERM_MONTHS\}-month minimum`/.test(checkout), 'the Stripe line item names the monthly and the minimum');
ok(!/29\.99|NEW_SITE/.test(checkout), 'no £29.99 and no new-site tier in checkout code');

console.log('── 3. BILLING ENDS AFTER 12 PAYMENTS ──');
const t0 = Date.UTC(2026, 10, 4, 9, 30) / 1000;   // first monthly charge 4 Nov 2026
ok(minimumTermCancelAt(t0) === Date.UTC(2027, 10, 4, 9, 30) / 1000, 'ends exactly 12 months after the first charge (4 Nov 2027)');
ok(minimumTermCancelAt(Date.UTC(2028, 1, 29, 12) / 1000) === Date.UTC(2029, 1, 28, 12) / 1000, '29 Feb clamps to 28 Feb — never rolls into a 13th period');
ok(minimumTermCancelAt(Date.UTC(2026, 0, 31) / 1000) === Date.UTC(2027, 0, 31) / 1000, '31 Jan → 31 Jan');
const sub = code('supabase/functions/_shared/delayed-subscription.ts');
ok(/cancel_at: String\(minimumTermCancelAt\(trialEnd\)\)/.test(sub) && /proration_behavior: "none"/.test(sub),
  'the Stripe subscription is created with cancel_at at the term end and no proration');

console.log('── 4. EMAILS, WELCOME PACK, PLAYBOOK ──');
const soon = monthlyStartingSoonEmail({ businessName: 'X', startsOn: '4 Nov 2026', cancelUrl: 'https://billing.example/x' }).paragraphs.join(' ');
ok(soon.includes('£99') && soon.includes('12-month minimum term'), 'the "monthly starts soon" email names £99 and the term');
ok(!/nothing is taken|cancel here/i.test(soon), 'and no longer offers a free exit');
const results = read('src/lib/remeasureResults.ts');
ok(!/Cancel any time before then/.test(results), 'four-week results email: "Cancel any time" is gone');
ok(/FINDABLE_MINIMUM_TERM_MONTHS\}-month minimum term/.test(results), '…and it names the term');
const welcome = read('src/lib/welcomePackHtml.ts');
ok(!/stop it any time/.test(welcome) && /Six weeks after your first payment/.test(welcome),
  'welcome pack: no "stop it any time", and the start date is the real one (six weeks after paying)');
const pb = buildColdCallPlaybook({
  lead: { id: 'l', business_name: 'Acme Plumbing', phone: '07700900123', website: null },
  reportAudit: null, report: null, runCrawls: [], leadCrawl: null, messages: [], nowMs: Date.now(),
});
ok(pb.offer.lines[0] === FINDABLE_OFFER_SUMMARY, 'Cold Call Playbook quotes the offer from the constant');
ok(/12 months/.test(pb.offer.monthly) && !/check current offer/i.test(JSON.stringify(pb)), 'and names the term — no "check current offer"');
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
