/* ============================================================
   THE NEW-SITE PRICING TIER — the £99/month-for-12-then-£29.99 plan, and the one property that makes
   it safe: it is a Stripe subscription SCHEDULE that drops the price itself, so there is NO month-13
   switcher to fail (Paul's (d), 2026-09-17). The guarantee is unchanged on both tiers.

   Run: npx tsx scripts/new-site-tier.test.ts
   ============================================================ */
import {
  FINDABLE_SETUP_PRICE_GBP, FINDABLE_MONTHLY_GBP, FINDABLE_NEW_SITE_MONTHLY_GBP,
  FINDABLE_NEW_SITE_TERM_MONTHS, CARD_SAVED_NOTICE, CARD_SAVED_NOTICE_NEW_SITE,
  REMEASURE_CLAIM_SENTENCE, FINDABLE_GUARANTEE,
} from '../src/lib/findableOffer.ts';
import { newSiteScheduleFields } from '../supabase/functions/_shared/delayed-subscription.ts';

let f = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) f++; };

console.log('\n── THE NUMBERS ──');
ok(FINDABLE_NEW_SITE_MONTHLY_GBP === 99, `new-site monthly is £99 (got ${FINDABLE_NEW_SITE_MONTHLY_GBP})`);
ok(FINDABLE_NEW_SITE_TERM_MONTHS === 12, `term is 12 months (got ${FINDABLE_NEW_SITE_TERM_MONTHS})`);
ok(FINDABLE_MONTHLY_GBP === 29.99, `the standard monthly is unchanged at £29.99 (got ${FINDABLE_MONTHLY_GBP})`);

console.log('\n── THE CARD NOTICE NAMES EVERY FIGURE, IN ORDER ──');
// Keep tier: £99 today, then £29.99.
ok(CARD_SAVED_NOTICE.includes(`£${FINDABLE_SETUP_PRICE_GBP} today`) && CARD_SAVED_NOTICE.includes(`£${FINDABLE_MONTHLY_GBP} a month`),
  'keep notice names £99 today + £29.99/month');
ok(!CARD_SAVED_NOTICE.includes('12 months'), 'keep notice does NOT mention the 12-month term');
// New-site tier: £99 today, £99/month for 12, then £29.99.
const nn = CARD_SAVED_NOTICE_NEW_SITE;
ok(nn.includes(`£${FINDABLE_SETUP_PRICE_GBP} today`), 'new-site notice names £99 today');
ok(nn.includes(`£${FINDABLE_NEW_SITE_MONTHLY_GBP} a month for ${FINDABLE_NEW_SITE_TERM_MONTHS} months`), 'new-site notice names £99/month for 12 months');
ok(nn.includes(`£${FINDABLE_MONTHLY_GBP} a month after that`), 'new-site notice names the drop to £29.99');
ok(nn.includes('cancel'), 'new-site notice still says they can cancel');

console.log('\n── THE GUARANTEE IS UNCHANGED (byte-lock intact, £99 only) ──');
ok(REMEASURE_CLAIM_SENTENCE === "If that number has not gone up, email us within 14 days of your four week results and we'll refund your £99.",
  'REMEASURE_CLAIM_SENTENCE is byte-for-byte what it was');
ok(FINDABLE_GUARANTEE.endsWith(REMEASURE_CLAIM_SENTENCE), 'the guarantee still ends with the claim sentence');
ok(FINDABLE_GUARANTEE.includes(`£${FINDABLE_SETUP_PRICE_GBP}`) && !FINDABLE_GUARANTEE.includes(`£${FINDABLE_NEW_SITE_MONTHLY_GBP}/`),
  'the guarantee names only the £99 setup — no monthly figure');

console.log('\n── THE SCHEDULE: TWO PAID PHASES, STRIPE DROPS THE PRICE, NO MONTH-13 CODE ──');
const TRIAL_END = 1800000000;
const fields = newSiteScheduleFields({
  customerId: 'cus_X', paymentMethodId: 'pm_X', trialEndUnix: TRIAL_END,
  newSitePriceId: 'price_new99', monthlyPriceId: 'price_std2999',
  termMonths: FINDABLE_NEW_SITE_TERM_MONTHS, leadId: 'lead-1', sentAtIso: '2026-09-17T00:00:00Z',
});
// Phase 0 — the delay is a £0 trial to the claim-window close (nothing inside the refund window).
ok(fields['phases[0][trial]'] === 'true' && fields['phases[0][end_date]'] === String(TRIAL_END),
  'phase 0 is a trial ending at the claim-window close');
// Phase 1 — £99 for exactly the term.
ok(fields['phases[1][items][0][price]'] === 'price_new99' && fields['phases[1][iterations]'] === '12',
  'phase 1 is the £99 price for 12 iterations');
// Phase 2 — the standard price, OPEN-ENDED: no iterations, no end_date → Stripe just keeps billing it.
ok(fields['phases[2][items][0][price]'] === 'price_std2999', 'phase 2 is the £29.99 price');
ok(fields['phases[2][iterations]'] === undefined && fields['phases[2][end_date]'] === undefined,
  'phase 2 is open-ended (no iterations / end_date) — the drop needs no code to sustain it');
// There is NO phase 3 — nothing runs at month 13 that could fail.
ok(fields['phases[3][items][0][price]'] === undefined, 'there is no phase 3 — no month-13 switcher exists to fail');
// The delayed monthly starts anchored on the trial end, same as the keep tier.
ok(fields['start_date'] === 'now' && fields['end_behavior'] === 'release', 'starts now (subscription exists immediately), releases if it ever ends');
ok(fields['metadata[lead_id]'] === 'lead-1' && fields['default_settings[metadata][lead_id]'] === 'lead-1',
  'lead id is on the schedule AND on the subscription it creates (so churn/renewal events trace back)');

console.log(f ? `\n${f} FAILURES` : '\nALL PASS');
if (f) throw new Error(`${f} failures`);
