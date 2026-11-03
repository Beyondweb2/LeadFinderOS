/* COMMISSION OWED (Paul, 2026-11-02, docs/commission-owed.md): the plan rules, the owed view, Mark as paid, and the pieces that must not
   drift. Live proof of the database half: supabase/tests/commission-owed.sql (a rolled-back transaction). */
import { readFileSync } from 'node:fs';
import { commissionLines, firstOfNextMonth, type LedgerRow } from '../src/lib/commission.ts';
import { COMMISSION_UPFRONT_RATE, commissionFixedRateForPlan, COMMISSION_PAYABLE_DAYS_OLDER, COMMISSION_PAYABLE_DAYS_V7, COMMISSION_RECURRING_COUNT, commissionPayableDays, payoutRuleForPaymentAt } from '../src/lib/commissionConfig.ts';
import { REFUND_WINDOW_DAYS, REFUND_WINDOW_DAYS_V7 } from '../src/lib/clientTimeline.ts';
import { buildOwed, countdownWords, paidHistory, planMarkPaid, type LinePaymentRow } from '../src/lib/commissionOwed.ts';
import { monthlyDiffers, salePlanFlagAtPayment, salePlanParts, salePlanWordsOr } from '../src/lib/salePlan.ts';
import { closeInfoMissing } from '../src/lib/salesHandoff.ts';

let f = 0;
const ok = (c: unknown, l: string) => { if (!c) f++; console.log((c ? 'PASS ' : 'FAIL ') + l); };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const REP = 'rep-1'; const REP2 = 'rep-2';
let n = 0;
const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const sale = (extra: Partial<LedgerRow> = {}): LedgerRow => {
  n += 1;
  return {
    id: uuid(n), lead_id: `lead-${n}`, kind: 'initial', status: 'succeeded', amount_gbp: 99, occurred_at: '2026-11-05T10:00:00.000Z', stripe_object_id: `pi_${n}`,
    stripe_payment_intent_id: `pi_${n}`, stripe_charge_id: `ch_${n}`, stripe_invoice_id: null, sold_by_user_id: REP,
    commission_rule: 'monthly_tier_v1', commission_month_start: '2026-11-01', commission_month_seq: 1, commission_rate: 0.3,
    payout_rule: 'plan_v1', sale_plan: 'complete', commission_payable_on: null, ...extra,
  };
};
const monthly = (s: LedgerRow, at: string, amount = 99): LedgerRow => {
  n += 1;
  return { ...s, id: uuid(n), kind: 'recurring', amount_gbp: amount, occurred_at: at, stripe_object_id: `in_${n}`, stripe_invoice_id: `in_${n}`, stripe_payment_intent_id: `pi_r${n}`, stripe_charge_id: `ch_r${n}`, commission_rule: null, commission_rate: null, commission_month_seq: null };
};
const refund = (s: LedgerRow, at: string, amount: number): LedgerRow => {
  n += 1;
  return { ...s, id: uuid(n), kind: 'refund', amount_gbp: amount, occurred_at: at, stripe_object_id: `re_${n}` };
};
const dispute = (s: LedgerRow, at: string, status: string): LedgerRow => {
  n += 1;
  return { ...s, id: uuid(n), kind: 'chargeback', status, amount_gbp: s.amount_gbp, occurred_at: at, stripe_object_id: `dp_${n}` };
};
const run = (ledger: LedgerRow[], now: string, paid: Record<string, number> = {}) =>
  commissionLines({ ledger, payouts: [], isCommissionable: (u) => u === REP || u === REP2, paidByLine: new Map(Object.entries(paid)), nowIso: now }).lines;
const owed = (ledger: LedgerRow[], now: string, payments: LinePaymentRow[] = []) => {
  const paid: Record<string, number> = {};
  for (const p of payments) if (!p.undone_at) paid[p.line_key] = (paid[p.line_key] ?? 0) + p.amount_gbp;
  return buildOwed({ lines: run(ledger, now, paid), payments, businessOf: (id) => `Biz ${id}`, planOf: () => 'complete', today: now.slice(0, 10) });
};
const paidRow = (key: string, amount: number, user = REP, part = 1): LinePaymentRow => ({ id: `p-${key}-${part}`, batch_id: 'b', line_key: key, part, user_id: user, lead_id: null, amount_gbp: amount, business_name: 'Biz', plan: 'complete', label: 'First payment', rate: 0.3, client_amount_gbp: 99, collected_at: null, payable_on: null, paid_at: '2026-12-10T10:00:00.000Z', paid_by: 'admin' });

console.log('── 1. ONE CONFIG, AND IT MATCHES THE AGREEMENTS AND THE DATABASE ──');
ok(COMMISSION_PAYABLE_DAYS_V7 === REFUND_WINDOW_DAYS_V7, 'the v7 payable days are the v7 refund window');
ok(COMMISSION_PAYABLE_DAYS_OLDER === REFUND_WINDOW_DAYS, 'older agreements: the 14-day refund window');
ok(commissionPayableDays('csa_v7_two_plans') === 7 && commissionPayableDays('csa_v5_option_b') === 14 && commissionPayableDays(null) === 14, 'no recorded terms takes the longer window');
const mig = read('supabase/migrations/20261203090000_commission_owed_tracker.sql');
ok(mig.includes("case when _terms = 'csa_v7_two_plans' then 7 else 14 end"), 'public.commission_payable_days mirrors the config');
ok(COMMISSION_RECURRING_COUNT === 6, 'trailing count is 6');
ok(payoutRuleForPaymentAt('2026-10-07T08:00:00Z') === 'legacy' && payoutRuleForPaymentAt('2026-11-05T08:00:00Z') === 'plan_v1', 'a backfilled old payment stays on the old rules');
ok(mig.includes("add column if not exists payout_rule text not null default 'legacy'") && mig.includes("alter column payout_rule set default 'plan_v1'"), 'existing rows become legacy, new rows plan_v1');
const earningsSrc = read('supabase/functions/_shared/earnings.ts'); const ledgerSrc = read('supabase/functions/_shared/payment-ledger.ts');
for (const col of ['payout_rule', 'sale_plan', 'commission_payable_on']) {
  ok(earningsSrc.includes(col) && ledgerSrc.includes(`${col}`), `both ledger reads select ${col} (a missing column would fall back to the old rules)`);
}

console.log('── 2. FIRST PAYMENT ──');
{
  const s = sale();
  const [l] = run([s], '2026-11-06T12:00:00Z');
  ok(l.status === 'pending' && l.waitingForResults && l.payoutDate === '', 'no results sent: pending, waiting, no date');
  ok(l.commission === 29.7, '30% of the £99 collected = £29.70');
  const s2 = sale({ commission_payable_on: '2026-12-10' });
  ok(run([s2], '2026-12-09T12:00:00Z')[0].status === 'pending', 'the day before the payable date: still pending');
  const due = run([s2], '2026-12-10T12:00:00Z')[0];
  ok(due.status === 'due' && due.payoutDate === '2026-12-10', 'on the payable date: due, on that date');
  ok(run([sale({ amount_gbp: 499, sale_plan: 'full', commission_rate: 0.4 })], '2026-11-06T12:00:00Z')[0].commission === 199.6, '40% of the £499 actually collected');
  /* Complete paid up front (Paul, 2026-11-03): always 30% of the whole £999, on the window's date, nothing trailing. */
  const up = (o: Record<string, unknown> = {}) => sale({ amount_gbp: 999, sale_plan: 'complete_upfront', ...o });
  ok(COMMISSION_UPFRONT_RATE === 0.3 && commissionFixedRateForPlan('complete_upfront') === 0.3 && commissionFixedRateForPlan('complete') === null && commissionFixedRateForPlan('full') === null, 'the fixed rate is in the config, for the up-front plan only');
  ok(run([up({ commission_rate: 0.3 })], '2026-11-06T12:00:00Z')[0].commission === 299.7, 'up front, sale 1 to 12: £299.70');
  ok(run([up({ commission_rate: 0.4, commission_month_seq: 13 })], '2026-11-06T12:00:00Z')[0].commission === 299.7, 'up front, sale 13 to 24: still £299.70');
  const upTop = run([up({ commission_rate: 0.5, commission_month_seq: 25 })], '2026-11-06T12:00:00Z')[0];
  ok(upTop.commission === 299.7 && upTop.rate === 0.3, 'up front, sale 25+: still £299.70, at 30%');
  ok(upTop.monthSeq === 25, 'it keeps its place in the month');
  const later = sale({ commission_rate: 0.5, commission_month_seq: 26 });
  ok(run([up({ commission_rate: 0.5, commission_month_seq: 25 }), later], '2026-11-06T12:00:00Z').find((l) => l.leadId === later.lead_id)?.rate === 0.5, 'the next normal sale keeps its tier: the up-front sale counted toward it');
  ok(run([sale({ commission_rate: 0.5, commission_month_seq: 25 })], '2026-11-06T12:00:00Z')[0].rate === 0.5, 'monthly Complete still earns its tier');
  ok(run([sale({ amount_gbp: 499, sale_plan: 'full', commission_rate: 0.5, commission_month_seq: 25 })], '2026-11-06T12:00:00Z')[0].commission === 249.5, 'Essential paid in full still earns its tier');
  ok(run([up({ commission_rule: 'test_excluded', commission_rate: 0 })], '2026-11-06T12:00:00Z')[0].commission === 0, 'a test sale on it still earns nothing');
  const upWaiting = run([up()], '2026-11-06T12:00:00Z')[0];
  ok(upWaiting.status === 'pending' && upWaiting.waitingForResults, 'up front: waits until the results go out');
  const upDue = run([up({ commission_payable_on: '2026-12-10' })], '2026-12-10T12:00:00Z')[0];
  ok(upDue.status === 'due' && upDue.payoutDate === '2026-12-10', 'up front: due the day the guarantee window closes');
  ok(run([sale({ commission_rate: 0.5, commission_month_seq: 25 })], '2026-11-06T12:00:00Z')[0].rate === 0.5, 'reads the stamped rate');
  /* No backstop, however long it has waited. */
  ok(run([sale()], '2029-01-01T12:00:00Z')[0].waitingForResults === true, 'no backstop: still waiting years later');
  const oldRow = sale({ payout_rule: 'legacy', commission_payable_on: null });
  const old = run([oldRow], '2026-11-06T12:00:00Z')[0];
  ok(old.status === 'due' && !old.planRules && old.payoutDate === '2026-12-01', 'an old sale keeps its rules and date');
  const absent = sale(); delete absent.payout_rule;
  ok(run([absent], '2026-11-06T12:00:00Z')[0].planRules === undefined, 'asked positively: only plan_v1 is plan rules');
}

console.log('── 3. REFUNDS ──');
{
  const s = sale();
  const [cancelled] = run([s, refund(s, '2026-12-01T10:00:00Z', 99)], '2026-12-02T12:00:00Z').filter((l) => l.kind === 'payment');
  ok(cancelled.status === 'cancelled', 'full refund before it was paid: never payable');
  const v = owed([s, refund(s, '2026-12-01T10:00:00Z', 99)], '2026-12-02T12:00:00Z');
  ok(v.next.length === 0 && v.quiet.length === 0 && v.totalOwedNow === 0, 'and it is nowhere on the screen');

  const s2 = sale({ commission_payable_on: '2026-12-10' });
  const late = [s2, refund(s2, '2026-12-20T10:00:00Z', 99)];
  const unpaid = owed(late, '2026-12-21T12:00:00Z');
  ok(unpaid.totalOwedNow === 0 && unpaid.next.length === 0, 'refund after the window but before payout: earns nothing');

  const paid = owed(late, '2026-12-21T12:00:00Z', [paidRow(`pay:${s2.id}`, 29.7)]);
  const off = paid.next[0];
  ok(paid.next.length === 1 && off.amount === -29.7 && off.bucket === 'now', 'refund after payout: an offset, due at once');
  ok(paid.totalOwedNow === 0 && paid.people[0].carriedOffset === -29.7, 'never negative: carried to the next commission');

  const s3 = sale({ commission_payable_on: '2026-12-15' });
  const both = owed([...late, s3], '2026-12-21T12:00:00Z', [paidRow(`pay:${s2.id}`, 29.7)]);
  ok(both.totalOwedNow === 0 && both.people[0].carriedOffset === 0, 'an offset equal to the next commission nets to nothing');
  const s4 = sale({ commission_payable_on: '2026-12-15', commission_rate: 0.4, commission_month_seq: 13 });
  const net = owed([...late, s4], '2026-12-21T12:00:00Z', [paidRow(`pay:${s2.id}`, 29.7)]);
  ok(net.totalOwedNow === 9.9, 'a bigger next commission pays the difference: £39.60 − £29.70');

  const s5 = sale({ commission_payable_on: '2026-12-10' });
  const r5 = refund(s5, '2026-12-11T10:00:00Z', 49.5);
  const part = owed([s5, r5], '2026-12-12T12:00:00Z');
  ok(part.next[0].amount === 14.85 && part.next[0].label.includes('part refunded'), 'partial refund before payout comes off the same line');
  const partItem = part.next[0];
  ok(partItem.parts.length === 2 && partItem.parts[1].amount === -14.85, 'and both lines are recorded when it is paid');
  const partPaid = owed([s5, r5], '2026-12-12T12:00:00Z', partItem.parts.map((p) => paidRow(p.lineId, p.amount)));
  ok(partPaid.totalOwedNow === 0 && partPaid.next.length === 0, 'once paid, nothing further is owed');
  const grew = owed([s5, { ...r5, amount_gbp: 99 }], '2026-12-13T12:00:00Z', partItem.parts.map((p) => paidRow(p.lineId, p.amount)));
  ok(grew.next.length === 1 && grew.next[0].amount === -14.85 && grew.next[0].parts[0].part === 2, 'the refund growing later offsets only the new part');
}

console.log('── 4. DISPUTES ──');
{
  const s = sale({ commission_payable_on: '2026-12-10' });
  const open = owed([s, dispute(s, '2026-12-05T10:00:00Z', 'needs_response')], '2026-12-12T12:00:00Z');
  ok(open.quiet.length === 1 && open.quiet[0].bucket === 'held' && open.totalOwedNow === 0, 'open dispute: held, not owed');
  const won = owed([s, dispute(s, '2026-12-05T10:00:00Z', 'won')], '2026-12-12T12:00:00Z');
  ok(won.totalOwedNow === 29.7, 'won: owed again');
  const lost = owed([s, dispute(s, '2026-12-05T10:00:00Z', 'lost')], '2026-12-12T12:00:00Z');
  ok(lost.totalOwedNow === 0 && lost.next.length === 0, 'lost before payout: earns nothing');
  const lostPaid = owed([s, dispute(s, '2026-12-15T10:00:00Z', 'lost')], '2026-12-16T12:00:00Z', [paidRow(`pay:${s.id}`, 29.7)]);
  ok(lostPaid.next[0].amount === -29.7, 'lost after payout: offset');
}

console.log('── 5. TRAILING ──');
{
  const s = sale();
  const ms = ['2027-01-10', '2027-02-10', '2027-03-10', '2027-04-10', '2027-05-10', '2027-06-10', '2027-07-10'].map((d) => monthly(s, `${d}T09:00:00Z`));
  const lines = run([s, ...ms], '2027-08-01T12:00:00Z').filter((l) => l.kind === 'payment' && l.paymentNumber > 1).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  ok(lines.slice(0, 6).every((l) => l.commission === 19.8), 'next 6 monthlies at 20% = £19.80');
  ok(lines[6].commission === 0, 'the 7th earns nothing');
  ok(lines[0].payoutDate === '2027-02-01' && firstOfNextMonth('2026-12-31') === '2027-01-01', 'payable on the 1st of the month after, across a year end');
  const tw = sale({ sale_plan: 'twelve' });
  const twLine = run([tw, monthly(tw, '2027-01-10T09:00:00Z', 49.99)], '2027-03-01T12:00:00Z').find((l) => l.paymentNumber === 2)!;
  ok(twLine.commission === 10 && twLine.status === 'due', '£49.99 monthly earns 20%, not treated as hosting');
  const full = sale({ sale_plan: 'full', amount_gbp: 499 });
  const fullHost = run([full, monthly(full, '2027-01-10T09:00:00Z', 29.99)], '2027-03-01T12:00:00Z').find((l) => l.kind === 'payment' && l.occurredAt.startsWith('2027-01'))!;
  ok(fullHost.commission === 0 && fullHost.status === 'not_commissionable', 'pay in full has no trailing');
  const upfront = sale({ sale_plan: 'complete_upfront', amount_gbp: 999 });
  const upHost = run([upfront, monthly(upfront, '2027-01-10T09:00:00Z', 29.99)], '2027-03-01T12:00:00Z').find((l) => l.kind === 'payment' && l.occurredAt.startsWith('2027-01'))!;
  ok(upHost.commission === 0 && upHost.status === 'not_commissionable', 'Complete paid up front has no trailing');
  const six = sale({ sale_plan: 'six' });
  const sixRows = ['2027-01', '2027-02', '2027-03', '2027-04', '2027-05'].map((m) => monthly(six, `${m}-10T09:00:00Z`));
  const sixHost = monthly(six, '2027-06-10T09:00:00Z', 29.99);
  const sixLines = run([six, ...sixRows, sixHost], '2027-08-01T12:00:00Z');
  ok(sixLines.filter((l) => l.kind === 'payment' && l.paymentNumber > 1 && l.commission > 0).length === 5, '6-month plan: its 5 monthlies earn');
  ok(sixLines.find((l) => l.occurredAt.startsWith('2027-06'))!.commission === 0, 'and hosting after it does not');
  const m1 = monthly(s, '2027-01-10T09:00:00Z');
  const failed: LedgerRow = { ...monthly(s, '2027-02-10T09:00:00Z'), status: 'failed' };
  ok(run([s, m1, failed], '2027-03-01T12:00:00Z').filter((l) => l.kind === 'payment' && l.paymentNumber > 1).length === 1, 'a failed monthly earns nothing');
  const v = owed([s, m1, refund(m1, '2027-01-20T09:00:00Z', 99)], '2027-03-01T12:00:00Z');
  ok(v.next.length === 0, 'a refunded monthly earns nothing');
}

console.log('── 6. THE COUNTDOWN ──');
ok(countdownWords('2026-12-10', '2026-12-10') === 'due today', 'due today');
ok(countdownWords('2026-12-13', '2026-12-10') === 'in 3 days', 'in 3 days');
ok(countdownWords('2026-12-11', '2026-12-10') === 'tomorrow', 'tomorrow');
ok(countdownWords('2026-12-08', '2026-12-10') === '2 days overdue', '2 days overdue');
ok(countdownWords('2026-12-09', '2026-12-10') === '1 day overdue', '1 day overdue');
ok(countdownWords('2027-03-31', '2027-03-27') === 'in 4 days', 'across the clocks changing');
ok(countdownWords(null, '2026-12-10') === 'waiting for four-week audit', 'no date yet');

console.log('── 7. THE VIEW ──');
{
  const a = sale({ commission_payable_on: '2026-12-08' });
  const b = sale({ commission_payable_on: '2026-12-13', sold_by_user_id: REP2 });
  const c = sale({ sold_by_user_id: REP2 });
  const d = sale({ commission_payable_on: '2026-12-10' });
  const v = owed([b, a, c, d], '2026-12-10T12:00:00Z');
  ok(v.totalOwedNow === 59.4, 'the big number is only money due today or overdue');
  ok(v.next.map((i) => i.key).join() === `pay:${a.id},pay:${d.id},pay:${b.id}`, 'next payments are in date order');
  ok(v.quiet.length === 1 && v.quiet[0].bucket === 'waiting', 'waiting sits in the quiet list');
  const me = v.people.find((p) => p.sellerId === REP)!; const two = v.people.find((p) => p.sellerId === REP2)!;
  ok(me.owedNow === 59.4 && me.comingSoon === 0, 'per person: owed now');
  ok(two.owedNow === 0 && two.comingSoon === 29.7 && two.waiting === 29.7, 'per person: coming soon, waiting apart');
  const paid = owed([a], '2026-12-10T12:00:00Z', [paidRow(`pay:${a.id}`, 29.7)]);
  ok(paid.totalOwedNow === 0 && paid.people[0].paidSoFar === 29.7, 'marked paid moves to paid so far');
  const undone = owed([a], '2026-12-10T12:00:00Z', [{ ...paidRow(`pay:${a.id}`, 29.7), undone_at: '2026-12-10T11:00:00Z' }]);
  ok(undone.totalOwedNow === 29.7 && undone.people[0].paidSoFar === 0, 'undo puts it back');
  const adminSale = sale({ sold_by_user_id: 'admin-user', commission_payable_on: '2026-12-01' });
  ok(owed([adminSale], '2026-12-10T12:00:00Z').next.length === 0, 'the admin’s own sale owes nobody');
  const test = sale({ commission_rule: 'test_excluded', commission_rate: 0, commission_payable_on: '2026-12-01' });
  ok(owed([test], '2026-12-10T12:00:00Z').next.length === 0, 'a test sale owes nobody');
  const legacy = sale({ payout_rule: 'legacy', occurred_at: '2026-10-05T10:00:00Z' });
  const lv = owed([legacy], '2026-12-10T12:00:00Z');
  ok(lv.next[0]?.amount === 29.7 && lv.next[0].payableOn === '2026-11-02', 'an old sale shows with its old number and date');
}

console.log('── 8. MARK AS PAID ──');
{
  const a = sale({ commission_payable_on: '2026-12-08' });
  const b = sale({ commission_payable_on: '2026-12-13' });
  const w = sale();
  const v = owed([a, b, w], '2026-12-10T12:00:00Z');
  const person = planMarkPaid(v, { person: REP, expectedTotal: 29.7 });
  ok(person.ok && person.items.length === 1, 'a person: only what is due now');
  ok(!planMarkPaid(v, { person: REP, expectedTotal: 30 }).ok, 'a total that differs from the screen is refused');
  const bad = planMarkPaid(v, { person: REP, expectedTotal: 30 });
  ok(!bad.ok && bad.error === 'changed', 'and says so');
  ok(planMarkPaid(v, { itemKey: `pay:${b.id}`, expectedTotal: 29.7 }).ok, 'one line can be paid a little early');
  const wait = planMarkPaid(v, { itemKey: `pay:${w.id}`, expectedTotal: 29.7 });
  ok(!wait.ok && wait.error === 'not_payable', 'a line waiting for the audit cannot be paid');
  const none = planMarkPaid(v, { person: 'nobody', expectedTotal: 0 });
  ok(!none.ok && none.error === 'nothing_due', 'nothing due');
  const r = sale({ commission_payable_on: '2026-12-01' });
  const off = owed([r, refund(r, '2026-12-05T10:00:00Z', 99)], '2026-12-06T12:00:00Z', [paidRow(`pay:${r.id}`, 29.7)]);
  const offOnly = planMarkPaid(off, { itemKey: off.next[0].key, expectedTotal: -29.7 });
  ok(!offOnly.ok && offOnly.error === 'offset_only', 'an offset cannot be marked on its own');
  const netNeg = planMarkPaid(off, { person: REP, expectedTotal: -29.7 });
  ok(!netNeg.ok && netNeg.error === 'nothing_due', 'a net negative pays nothing');
  const h = paidHistory([paidRow('pay:x', 29.7), { ...paidRow('pay:y', 10), undone_at: '2026-12-01' }]);
  ok(h.length === 1 && h[0].planWords === 'Complete · monthly', 'the history shows live payments, with the plan in words');
  ok(mig.includes('commission_line_payments_one_live') && mig.includes('where undone_at is null'), 'one live payment per line, enforced by the database');
}

console.log('── 9. THE SALE’S PLAN ──');
ok(salePlanFlagAtPayment({ stripePlan: 'complete', pickedPlan: 'complete', amountGbp: 99 }) === null, 'all agree: no flag');
ok(salePlanFlagAtPayment({ stripePlan: 'six', pickedPlan: 'complete', amountGbp: 99 }) === 'plan_differs', 'picked one, Stripe took another: flagged');
ok(salePlanFlagAtPayment({ stripePlan: null, pickedPlan: 'complete', amountGbp: 99 }) === 'plan_differs', 'Stripe has no plan but one was picked: flagged');
ok(salePlanFlagAtPayment({ stripePlan: 'full', pickedPlan: 'full', amountGbp: 99 }) === 'amount_differs', 'the wrong amount for the plan: flagged');
ok(salePlanFlagAtPayment({ stripePlan: null, pickedPlan: null, amountGbp: 99 }) === null, 'self-service, no plan on either side: nothing to compare');
ok(monthlyDiffers('complete', [99, 49.99]) === true && monthlyDiffers('twelve', [49.99]) === false && monthlyDiffers('six', [99, 99, 99, 99, 99, 29.99]) === false, 'a monthly that is not the plan’s is flagged; hosting after the plan is not');
ok(salePlanParts('complete').words === 'Complete · monthly' && salePlanParts('full').words === 'Essential · pay in full' && salePlanParts('six').option === 'six' && salePlanParts('twelve').product === 'essential', 'plan and way to pay, in words');
ok(salePlanParts(null).words === 'Old plan' && salePlanParts('legacy_twelve').option === 'old', 'blank is the old plan');

console.log('── 10. HANDOFF COMPLETE ──');
ok(closeInfoMissing({ handoff: { decision_maker_name: 'Sam' }, manager: 'owner', agencyContract: null, plan: 'complete' }).length === 0, 'an owner-run site needs no agency contract');
ok(closeInfoMissing({ handoff: { decision_maker_name: 'Sam' }, manager: 'agency', agencyContract: null, plan: 'complete' }).join() === 'agency contract', 'an agency-run site does');
ok(closeInfoMissing({ handoff: null, manager: null, agencyContract: null, plan: null }).join() === 'decision maker,who runs the site,plan', 'everything missing is named');

console.log('── 11. SCOPE AND WIRING ──');
{
  const fn = read('supabase/functions/sales-earnings/index.ts');
  ok(/mode === "owed"[\s\S]{0,120}actor\.role === "sales" \? actor\.id : null/.test(fn), 'a salesperson always gets only their own');
  ok(/\[\.\.\.owed\.next, \.\.\.owed\.quiet\]\.some\(\(i\) => i\.sellerId !== actor\.id\)/.test(fn), 'with a belt');
  const ownedAt = fn.indexOf('mode === "owed"'); const gateAt = fn.indexOf('if (actor.role !== "admin") return await adminOnly();');
  ok(ownedAt < gateAt && fn.indexOf('mode === "mark_paid"') > gateAt && fn.indexOf('mode === "undo_paid"') > gateAt, 'Mark as paid and undo are behind the admin gate');
  ok(mig.includes('revoke all on public.commission_line_payments from anon, authenticated'), 'no browser can read or write the payments');
  ok(/commission_record_line_payments[\s\S]*from public, anon, authenticated/.test(mig), 'nor call the writer');
  const dash = read('src/pages/Dashboard.tsx');
  ok(/isAdmin && <CommissionOwedSection/.test(dash) && /isAdmin && <NewPaidClientsSection/.test(dash), 'the sections are admin only on the dashboard');
  ok(read('supabase/functions/stripe-webhook/index.ts').includes('stripe_plan: paymentPlanFromMeta(s.metadata ?? null)'), 'the webhook hands the ledger Stripe’s plan');
  const screen = read('src/components/admin/CommissionOwed.tsx');
  ok(!/stripe\.com|\bpayout\(|transfers/i.test(screen), 'no payment integration on the screen');
}

/* The salesperson's page gives one answer to "when do I get paid?" (Paul, 2026-11-03). */
{
  const all = ['src/components/salesDash/earningsParts.tsx', 'src/components/salesDash/CommissionForecastCard.tsx', 'src/components/salesDash/EarnedCelebration.tsx', 'src/components/admin/CommissionOwed.tsx'].map(read).join('\n');
  ok((all.match(/title="Your payments"/g) ?? []).length === 1, 'only one panel is called Your payments');
  const card = read('src/components/salesDash/CommissionForecastCard.tsx');
  ok(!/due to you on/.test(card) && !/nextPayoutDate/.test(card), 'the top card names no payout date');
  ok(!/COMMISSION_RECURRING_COUNT_V3/.test(card) && !/Approval Date/.test(card), 'the forecast note follows the new rules');
  ok(!/next payout/.test(read('src/components/salesDash/EarnedCelebration.tsx')), 'the pop-up names no next payout');
  ok(salePlanWordsOr('complete', 'Findable Build') === 'Complete · monthly', 'a sale on a plan shows its plan');
  ok(salePlanWordsOr('legacy_twelve', 'Findable Build') === 'Findable Build' && salePlanWordsOr(null, 'Findable Build') === 'Findable Build' && salePlanWordsOr('nonsense', '') === '', 'an old or unknown plan keeps the old name');
}

console.log(f ? `\n${f} FAILED` : '\nALL PASS');
process.exit(f ? 1 : 0);
