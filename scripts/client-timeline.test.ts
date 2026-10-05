/* ============================================================
   CLIENT TIMELINE (v3 Client Service Agreement, Option B, 2026-10-05) — the dates, the fallback, the
   "no recurring charge inside the Refund Window" rule, the minimum term from REAL payments, the
   Continuing Service reminders, the guarantee (+1 counts) and the baseline / access gates.
   Run: npx tsx scripts/client-timeline.test.ts
   ============================================================ */
import {
  ACCESS_DEADLINE_DAYS, CONTINUING_SERVICE_AUTOMATION, CONTINUING_SERVICE_GBP, COMMERCIAL_TERMS_V3, PAYMENT_START_HOLD_DAYS,
  accessReadiness, addMonthsClamped, approvalDay, approvalDayFromResults, baselineMayStart, chargeAllowedOn, fallbackPaymentStartDay,
  guaranteeNumberWentUp, minimumTerm, paymentStart, refundWindowEndDay, timelineActions, timelineView, ukDay, ukDayAtHourIso,
  type TimelineFacts,
} from '../src/lib/clientTimeline.ts';
import { FINDABLE_CONTINUING_GBP } from '../src/lib/findableOffer.ts';

let failures = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) failures++; };

const base: TimelineFacts = {
  terms: COMMERCIAL_TERMS_V3, route: 'build', initialPaidAt: '2026-11-02T15:00:00Z', accessDate: null, resultsSentAt: null, guaranteeCeasedAt: null,
};

console.log('── OPTION B: Results Date → 14-day Refund Window → Approval / Payment Start Date ──');
ok(refundWindowEndDay('2026-12-07') === '2026-12-21', 'the Refund Window ends 14 days after the Results Date (5.4)');
ok(approvalDayFromResults('2026-12-07') === '2026-12-22', 'the Approval Date = Payment Start Date is the next day (5.6)');
{
  const f = { ...base, accessDate: '2026-11-09', resultsSentAt: '2026-12-07T10:30:00Z' };
  const ps = paymentStart(f);
  ok(ps.day === '2026-12-22' && ps.basis === 'results', `results sent 7 Dec → first monthly 22 Dec (got ${ps.day})`);
  ok(approvalDay(f) === '2026-12-22', 'initial commission is approved on the same day');
  ok(!chargeAllowedOn(f, '2026-12-21T23:30:00Z'), 'NO recurring charge on the last day of the Refund Window');
  ok(!chargeAllowedOn(f, '2026-12-08T10:00:00Z'), 'NO recurring charge inside the Refund Window');
  ok(chargeAllowedOn(f, ukDayAtHourIso('2026-12-22')), 'a charge on the Payment Start Date is allowed');
}
ok(paymentStart({ ...base, accessDate: '2026-11-09' }).day === null, 'no Results Date yet → no Payment Start Date (never a guess)');
ok(!chargeAllowedOn({ ...base, accessDate: '2026-11-09' }, '2027-06-01T10:00:00Z'), 'with no Payment Start Date, NO charge is allowed at any time');
ok(paymentStart(base).why.includes('Refund Window'), 'the reason says what it waits for');
{
  /* Results Date in UK time: 23:30 UTC on 30 Mar (BST) is already 31 Mar in the UK. */
  const f = { ...base, resultsSentAt: '2026-03-30T23:30:00Z', initialPaidAt: '2026-02-01T10:00:00Z' };
  ok(ukDay('2026-03-30T23:30:00Z') === '2026-03-31', 'a BST evening instant is the next UK day');
  ok(paymentStart(f).day === '2026-04-15', `the Results Date is the UK day (31 Mar → 15 Apr, got ${paymentStart(f).day})`);
}
ok(ukDayAtHourIso('2026-07-01', 10) === '2026-07-01T09:00:00.000Z', '10:00 UK in summer is 09:00 UTC');
ok(ukDayAtHourIso('2026-12-01', 10) === '2026-12-01T10:00:00.000Z', '10:00 UK in winter is 10:00 UTC');

console.log('\n── THE FALLBACK (5.6 + 5.8): no access within 30 days, or access withdrawn ──');
ok(fallbackPaymentStartDay('2026-11-02') === '2026-12-15', 'the day after six weeks from 2 Nov is 15 Dec (2 Nov + 43 days)');
{
  const f = { ...base, guaranteeCeasedAt: '2026-12-03T09:00:00Z', guaranteeCeasedReason: 'no_access_30_days' };
  ok(paymentStart(f).day === '2026-12-15' && paymentStart(f).basis === 'fallback', 'no access → monthly starts on the six-week fallback');
  ok(approvalDay(f) === '2026-12-15', 'initial commission is approved on the fallback day');
}
{
  /* Access withdrawn late (day 50): the fallback date has passed — never retroactive, the next day. */
  const f = { ...base, guaranteeCeasedAt: '2026-12-22T09:00:00Z' };
  ok(paymentStart(f).day === '2026-12-23', `a passed fallback date starts the day after it was recorded (got ${paymentStart(f).day})`);
}
{
  /* The Refund Window had already run and ends EARLIER than the fallback (checklist: "or earlier if it actually ended earlier"). */
  const f = { ...base, resultsSentAt: '2026-11-20T10:00:00Z', guaranteeCeasedAt: '2026-11-25T10:00:00Z' };
  ok(paymentStart(f).day === '2026-12-05' && paymentStart(f).basis === 'results', 'an earlier real Refund Window end wins over the fallback');
}
{
  const today = '2026-12-05T09:00:00Z'; // 33 days after payment, no Access Date
  const acts = timelineActions(base, today);
  ok(acts.some((a) => a.kind === 'access_deadline' && a.urgent), `${ACCESS_DEADLINE_DAYS} days with no Access Date → an urgent action for Paul`);
  ok(timelineActions(base, '2026-11-05T09:00:00Z').some((a) => a.kind === 'confirm_access'), 'before the deadline → "confirm the Access Date"');
}

console.log('\n── RESULTS DATE ≠ Access Date + 28 ──');
{
  const f = { ...base, accessDate: '2026-11-09' };
  const v = timelineView(f, '2026-12-01T09:00:00Z');
  ok(v.resultsTargetDay === '2026-12-07' && v.resultsDay === null, 'the four-week mark is a TARGET; the Results Date is unset until sent');
  ok(timelineActions(f, '2026-12-01T09:00:00Z').some((a) => a.kind === 'results_due'), 'Paul is reminded as the four weeks approach');
  ok(timelineView({ ...f, resultsSentAt: '2026-12-10T08:00:00Z' }, '2026-12-11T09:00:00Z').resultsDay === '2026-12-10', 'the Results Date is the day the results were actually sent');
}

console.log('\n── STRIPE: nothing is charged until LeadFinder sets the date ──');
ok(PAYMENT_START_HOLD_DAYS >= 180 && PAYMENT_START_HOLD_DAYS <= 730, 'the sign-up hold is far past any Refund Window and inside Stripe\'s two-year trial limit');
{
  const f = { ...base, accessDate: '2026-11-09', resultsSentAt: '2026-12-07T10:30:00Z' };
  ok(timelineActions(f, '2026-12-08T09:00:00Z').some((a) => a.kind === 'payment_start_unscheduled'), 'a Payment Start Date not yet confirmed in Stripe is an action');
  ok(!timelineActions({ ...f, paymentStartScheduledDay: '2026-12-22', paymentStartConfirmedAt: '2026-12-07T10:31:00Z' }, '2026-12-08T09:00:00Z').some((a) => a.kind === 'payment_start_unscheduled'), 'once Stripe agreed, the action goes');
}

console.log('\n── MINIMUM TERM FROM REAL PAYMENTS, AND THE £29.99 CONTINUING SERVICE ──');
ok(CONTINUING_SERVICE_GBP === 29.99 && FINDABLE_CONTINUING_GBP === 29.99, 'the Continuing Service is £29.99 (one constant)');
ok(addMonthsClamped('2027-01-31', 1) === '2027-02-28' && addMonthsClamped('2027-01-31', 2) === '2027-03-31', 'the 31st falls on the last day of a shorter month and returns (3.1)');
{
  /* Optimise: 5 monthly £99 after the sign-up. Results sent 7 Dec → first monthly 22 Dec. */
  const f = { ...base, route: 'optimise' as const, accessDate: '2026-11-09', resultsSentAt: '2026-12-07T10:30:00Z', paymentStartScheduledDay: '2026-12-22', paymentStartConfirmedAt: 'x' };
  const mt = minimumTerm(f);
  ok(mt.recurringNeeded === 5 && mt.finalPaymentDay === '2027-04-22' && mt.continuingStartDay === '2027-05-22', `Optimise: last £99 22 Apr, £29.99 from 22 May (got ${mt.finalPaymentDay} / ${mt.continuingStartDay})`);
  ok(mt.clientReminderDueDay === '2027-04-22', 'the client reminder is due 30 days before the Continuing Service starts (9A.3)');
  ok(mt.paulActionDay === '2027-04-08', 'Paul is told 14 days before the reminder is due');
  const paid = minimumTerm({ ...f, recurringPaidAt: ['2026-12-22T10:00:00Z', '2027-01-22T10:00:00Z', '2027-02-24T10:00:00Z'] });
  ok(paid.recurringPaid === 3 && paid.finalPaymentDay === '2027-04-24', `a late payment moves the expected completion (from REAL payments): ${paid.finalPaymentDay}`);
  const done = minimumTerm({ ...f, recurringPaidAt: ['2026-12-22', '2027-01-22', '2027-02-22', '2027-03-22', '2027-04-22'].map((d) => `${d}T10:00:00Z`) });
  ok(done.finalPaymentActual && done.finalPaymentDay === '2027-04-22', 'all five collected → the minimum term is complete on the real fifth payment');
  ok(timelineActions(f, '2027-04-09T09:00:00Z').some((a) => a.kind === 'continuing_prepare'), 'the minimum term approaching creates "prepare" for Paul');
  ok(timelineActions(f, '2027-04-25T09:00:00Z').some((a) => a.kind === 'continuing_reminder_overdue' && a.urgent), 'a reminder not sent by the due day is urgent');
  ok(timelineActions({ ...f, continuingReminderSentAt: '2027-04-10T09:00:00Z' }, '2027-05-18T09:00:00Z').some((a) => a.kind === 'continuing_decision'), 'once reminded, the decision is asked for before it starts');
  ok(!timelineActions({ ...f, continuingReminderSentAt: 'x', continuingDecision: 'cancel' }, '2027-05-18T09:00:00Z').some((a) => a.kind.startsWith('continuing')), 'a recorded decision clears the Continuing Service actions');
}
{
  const f = { ...base, accessDate: '2026-11-09', resultsSentAt: '2026-12-07T10:30:00Z' };
  const mt = minimumTerm(f);
  ok(mt.recurringNeeded === 11 && mt.finalPaymentDay === '2027-10-22' && mt.continuingStartDay === '2027-11-22', `Build: 11 monthly £99, £29.99 from 22 Nov 2027 (got ${mt.continuingStartDay})`);
}
ok(Object.values(CONTINUING_SERVICE_AUTOMATION).every((v) => v === false), 'every Continuing Service automation is OFF (no automatic £29.99)');

console.log('\n── NOT v3 → NOTHING (Ronnie, MCL, RG, QA clients) ──');
ok(timelineActions({ ...base, terms: null }, '2026-12-05T09:00:00Z').length === 0, 'a client without v3 terms gets no actions');
ok(timelineActions({ ...base, refundedAt: 'x' }, '2026-12-05T09:00:00Z').length === 0, 'a refunded client gets no actions');
ok(baselineMayStart(null) && baselineMayStart({ commercial_terms: null, access_date: null }), 'a legacy client\'s baseline is never held by the Access Date rule');
ok(!baselineMayStart({ commercial_terms: COMMERCIAL_TERMS_V3, access_date: null }), 'a v3 baseline waits for the Access Date (5.2)');
ok(baselineMayStart({ commercial_terms: COMMERCIAL_TERMS_V3, access_date: '2026-11-09' }), 'and runs once it is confirmed');

console.log('\n── ACCESS DATE: route-specific, never from non-null fields alone ──');
{
  const item = (key: string, ok2: boolean, required = true) => ({ key, label: key, ok: ok2, required });
  const buildItems = ['business', 'contact', 'services', 'service_areas', 'domain', 'gbp_access'].map((k) => item(k, true));
  ok(accessReadiness('build', buildItems).ready, 'Build: domain + business facts + GBP in → ready');
  ok(!accessReadiness('optimise', buildItems).ready && accessReadiness('optimise', buildItems).missing.includes('website_access'), 'Optimise needs website access — the Build set is not enough');
  ok(!accessReadiness('build', buildItems.map((i) => i.key === 'domain' ? item('domain', false) : i)).ready, 'Build without the domain → not ready');
  ok(accessReadiness('build', buildItems.map((i) => i.key === 'gbp_access' ? item('gbp_access', false, false) : i)).ready, 'an item the checklist marks not needed counts as satisfied');
  ok(!accessReadiness(null, buildItems).ready, 'no route → never ready');
}

console.log('\n── THE GUARANTEE: ANY increase counts ──');
ok(guaranteeNumberWentUp(39, 40), '39/120 → 40/120 = improvement');
ok(!guaranteeNumberWentUp(39, 39), '39/120 → 39/120 = no improvement');
ok(!guaranteeNumberWentUp(39, 38), '39/120 → 38/120 = no improvement');
ok(guaranteeNumberWentUp(0, 1), '0 → 1 = improvement');
ok(!guaranteeNumberWentUp(NaN, 5), 'an unreadable count is never "gone up"');

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nAll client-timeline checks passed.');
