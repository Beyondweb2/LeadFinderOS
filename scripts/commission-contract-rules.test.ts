/* THE CONTRACT'S COMMISSION RULES (Paul, 2026-11-10, docs/commission-owed.md). Every plan, every ladder step, refunds, a failed payment,
   a dispute and a claim, to the pound, through the real engine and the real owed view. They replaced the fixed pounds of 2026-11-04
   (this file replaces commission-fixed-amounts.test.ts) on the same stored rule name, payout_rule 'fixed_v1'. */
import { readFileSync } from 'node:fs';
import { commissionForecast, commissionLines, earningsTotals, monthlyTracker, monthlyTrackerNextLine, type CommissionLine, type EngagementEvent, type LedgerRow, type SaleClosing } from '../src/lib/commission.ts';
import { FIRST_PAYMENT_LADDER, LATER_PAYMENT_RATE, ONE_PAYMENT_COMMISSION, PAYOUT_RULE_FIXED_V1_FROM, PLAN_COMMISSION_MAX_PAYMENTS, firstPaymentPoundsFor, isLinePaidRule, laterPaymentPounds, payoutRuleForPaymentAt, saleCommissionMax } from '../src/lib/commissionConfig.ts';
import { buildOwed, planMarkPaid, saleProgress, type LinePaymentRow } from '../src/lib/commissionOwed.ts';
import { PAYMENT_PLANS, PAYMENT_PLAN_SPEC } from '../src/lib/paymentPlans.ts';

let failed = 0; let passed = 0;
function ok(cond: unknown, label: string) { if (cond) passed += 1; else { failed += 1; console.error(`  ✗ ${label}`); } }
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const total = (ls: readonly { commission: number }[]) => Math.round(ls.reduce((s, l) => s + l.commission, 0) * 100) / 100;

const SELLER = 'seller-1';
let id = 0;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function sale(extra: Partial<LedgerRow> = {}): LedgerRow {
  id += 1;
  return {
    id: uuid(id), lead_id: `lead-${id}`, kind: 'initial', status: 'succeeded', amount_gbp: 99, occurred_at: '2026-11-05T10:00:00Z',
    stripe_object_id: `cs_${id}`, stripe_payment_intent_id: `pi_${id}`, stripe_charge_id: `ch_${id}`, stripe_invoice_id: null, sold_by_user_id: SELLER,
    commission_rule: 'monthly_tier_v1', commission_month_start: '2026-11-01', commission_month_seq: 1, commission_rate: 0,
    payout_rule: 'fixed_v1', sale_plan: 'complete', commission_payable_on: null, ...extra,
  };
}
function monthly(s: LedgerRow, at: string, amount = 99): LedgerRow {
  id += 1;
  return { ...s, id: uuid(id), kind: 'recurring', amount_gbp: amount, occurred_at: at, stripe_object_id: `in_${id}`, stripe_invoice_id: `in_${id}`, stripe_payment_intent_id: `pi_${id}`, stripe_charge_id: `ch_${id}`, commission_rule: null, commission_month_start: null, commission_month_seq: null, commission_rate: null, commission_payable_on: null };
}
/** k monthly payments, one a month from January 2027 (k up to 24). */
const monthlies = (s: LedgerRow, k: number, amount = 99) => Array.from({ length: k }, (_, i) => monthly(s, `${2027 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-05T10:00:00Z`, amount));
function back(of: LedgerRow, kind: 'refund' | 'chargeback', at: string, amount = of.amount_gbp, status = kind === 'refund' ? 'succeeded' : 'needs_response'): LedgerRow {
  id += 1;
  return { ...of, id: uuid(id), kind, status, amount_gbp: amount, occurred_at: at, stripe_object_id: `re_${id}` };
}
const NOW = '2026-12-20T12:00:00Z';
const LATE = '2029-06-01T12:00:00Z';
const run = (ledger: LedgerRow[], nowIso = NOW, extra: { engagement?: Map<string, EngagementEvent[]>; closings?: Map<string, SaleClosing[]>; paidByLine?: Map<string, number>; clientStateOf?: Map<string, { endedAt: string | null; refunded: boolean }> } = {}) =>
  commissionLines({ ledger, payouts: [], isCommissionable: (u) => u === SELLER, nowIso, ...extra });
const owed = (ledger: LedgerRow[], nowIso = NOW, payments: LinePaymentRow[] = []) => {
  const { lines } = run(ledger, nowIso, { paidByLine: new Map(payments.map((p) => [p.line_key, p.amount_gbp])) });
  const planOf = new Map(ledger.filter((r) => r.kind === 'initial').map((r) => [r.lead_id!, r.sale_plan ?? null]));
  return buildOwed({ lines, payments, businessOf: (x) => `Biz ${x}`, planOf: (x) => planOf.get(x) ?? null, today: nowIso.slice(0, 10) });
};
const pays = (ls: CommissionLine[]) => ls.filter((l) => l.kind === 'payment').sort((a, b) => a.paymentNumber - b.paymentNumber || a.occurredAt.localeCompare(b.occurredAt));

/* ── The config, one place ── */
ok(FIRST_PAYMENT_LADDER.map((s) => `${s.upTo}:${s.pounds}`).join() === '12:30,24:40,Infinity:50', 'the ladder: sales 1–12 £30, 13–24 £40, 25+ £50');
ok([1, 12].every((n) => firstPaymentPoundsFor(n) === 30) && [13, 24].every((n) => firstPaymentPoundsFor(n) === 40) && [25, 26, 400].every((n) => firstPaymentPoundsFor(n) === 50), 'each step at both of its edges');
ok(firstPaymentPoundsFor(null) === 30 && firstPaymentPoundsFor(undefined) === 30 && firstPaymentPoundsFor(0) === 30, 'no number recorded: the first step, never a higher one');
ok(LATER_PAYMENT_RATE === 0.2 && laterPaymentPounds(99) === 20 && laterPaymentPounds(49.99) === 10 && laterPaymentPounds(0) === 0, 'a later payment: 20%, in whole pounds (£20 on £99, £10 on £49.99)');
ok(ONE_PAYMENT_COMMISSION.complete_upfront === 300 && ONE_PAYMENT_COMMISSION.full === 150, 'Complete up front £300, Essential in full £150');
ok(PAYMENT_PLANS.filter((p) => PAYMENT_PLAN_SPEC[p].totalPayments === 1).every((p) => typeof ONE_PAYMENT_COMMISSION[p] === 'number') && PAYMENT_PLANS.filter((p) => PAYMENT_PLAN_SPEC[p].totalPayments > 1).every((p) => ONE_PAYMENT_COMMISSION[p] === undefined), 'every one-payment plan has its pounds, and no plan paid over time does');
ok(PAYMENT_PLANS.every((p) => PAYMENT_PLAN_SPEC[p].totalPayments <= PLAN_COMMISSION_MAX_PAYMENTS) && PLAN_COMMISSION_MAX_PAYMENTS === 12, 'no plan runs past 12 payments');
const most = (plan: 'complete' | 'six' | 'twelve' | 'legacy_twelve', first = 30) => saleCommissionMax({ firstPounds: first, laterPayments: PAYMENT_PLAN_SPEC[plan].totalPayments - 1, monthlyGbp: PAYMENT_PLAN_SPEC[plan].monthlyGbp });
ok(most('complete') === 250 && most('six') === 130 && most('twelve') === 140 && most('legacy_twelve') === 250 && most('complete', 50) === 270, 'the most each plan can earn: £250, £130, £140 on the first step');

/* ── Which rows are on these rules ── */
ok(payoutRuleForPaymentAt(PAYOUT_RULE_FIXED_V1_FROM) === 'fixed_v1' && payoutRuleForPaymentAt('2026-11-03T23:00:00Z') === 'plan_v1' && payoutRuleForPaymentAt('2026-10-01T00:00:00Z') === 'legacy', 'payments since 4 November are on the contract rules; older ones stay on theirs');
ok(isLinePaidRule('fixed_v1') && isLinePaidRule('plan_v1') && !isLinePaidRule('legacy') && !isLinePaidRule(null), 'line-by-line rules asked positively');
{
  const old = sale({ payout_rule: 'plan_v1', commission_rate: 0.3 });
  const l = run([old]).lines[0];
  ok(l.commission === 29.7 && !l.fixedRules, 'a plan_v1 sale keeps what it earned');
  const legacy = sale({ payout_rule: 'legacy', commission_rate: 0.3 });
  ok(run([legacy]).lines[0].commission === 29.7, 'a legacy sale keeps what it earned');
}

/* ── COMPLETE MONTHLY: £30, then £20 on each of the 11 later payments. Nothing on hosting after. ── */
{
  const s = sale({ commission_payable_on: '2026-12-10' });
  const m2 = monthly(s, '2026-12-01T10:00:00Z');
  const rest = monthlies(s, 10);
  const hosting = [monthly(s, '2028-01-05T10:00:00Z', 29.99), monthly(s, '2028-02-05T10:00:00Z', 29.99)];
  const ledger = [s, m2, ...rest, ...hosting];
  const p = pays(run(ledger, LATE).lines);
  ok(p[0].commission === 30, 'the first payment earns £30 (sale 1 of the month)');
  ok(p.slice(1, 12).length === 11 && p.slice(1, 12).every((l) => l.commission === 20 && l.status === 'due'), 'each of the 11 later plan payments earns £20');
  ok(p.slice(12).length === 2 && p.slice(12).every((l) => l.commission === 0 && l.status === 'not_commissionable' && /Hosting/.test(l.label)), 'hosting after the plan earns nothing');
  ok(total(p) === 250, 'Complete monthly tops out at exactly £250');
  ok(p[0].payoutDate === '2026-12-10' && p[1].payoutDate === '2026-12-10', 'both payments collected before the window closes are payable at its close');
  ok(p[2].payoutDate === '2027-02-01' && p[11].payoutDate === '2027-11-01', 'a payment after the window is payable on the 1st of the next month');
  ok(p[1].label === 'Payment 2 of 12' && p[11].label === 'Payment 12 of 12', 'each later payment says where it sits in the plan');
  const before = owed(ledger.slice(0, 2), '2026-12-09T12:00:00Z');
  ok(before.next.length === 2 && before.next.every((i) => i.bucket === 'soon' && i.payableOn === '2026-12-10') && before.totalOwedNow === 0, 'the day before: nothing owed yet, £50 coming');
  ok(owed(ledger.slice(0, 2), '2026-12-10T12:00:00Z').totalOwedNow === 50, 'at window close: exactly £50 owed (£30 + £20)');
  ok(owed(ledger, LATE).totalOwedNow === 250, 'the whole plan paid: exactly £250 owed in all');
  const sp = saleProgress({ lines: run(ledger.slice(0, 2)).lines, businessOf: () => 'B', planOf: () => 'complete' })[0];
  ok(sp.progress === 'Complete monthly · 2 of 12 paid · £50 of £250' && sp.bonusWords === null, `the words: ${sp.progress}`);
}

/* ── The payable date is the day AFTER the window (Paul, 2026-11-04). commission_payable_on 10 Dec = the window's last day was 9 Dec. ── */
{
  const s = sale({ commission_payable_on: '2026-12-10' });
  const lastDay = monthly(s, '2026-12-09T10:00:00Z');
  const dayAfter = monthly(s, '2026-12-10T10:00:00Z');
  const p = pays(run([s, lastDay, dayAfter], '2027-02-01T12:00:00Z').lines);
  ok(p[1].payoutDate === '2026-12-10', 'collected on the window\'s last day: payable the day after it');
  ok(p[2].payoutDate === '2027-01-01', 'collected the day after the window: the 1st of the next month');
  ok(owed([s], '2026-12-09T23:00:00Z').totalOwedNow === 0, 'nothing owed on the window\'s last day, while the client can still claim');
  ok(owed([s], '2026-12-10T00:30:00Z').totalOwedNow === 30, 'owed the day after');
  const onLast = sale({ commission_payable_on: '2026-12-10' });
  ok(pays(run([onLast, back(onLast, 'refund', '2026-12-09T22:00:00Z')], '2026-12-20T12:00:00Z').lines)[0].claim === 'refunded', 'refunded on the window\'s last day: a claim');
  const onAfter = sale({ commission_payable_on: '2026-12-10' });
  ok(!pays(run([onAfter, back(onAfter, 'refund', '2026-12-10T10:00:00Z')], '2026-12-20T12:00:00Z').lines)[0].claim, 'refunded the day after the window: not a claim');
  const mig = read('supabase/migrations/20261208090000_commission_payable_day_after_window.sql');
  ok(/commission_payable_days\([\s\S]*\+ 1/.test(mig), 'the database writes the day after the window');
}

/* ── COMPLETE UP FRONT, ESSENTIAL IN FULL, ESSENTIAL 6 AND 12 MONTHS, THE OLD PLAN, NO PLAN ── */
{
  const up = sale({ amount_gbp: 999, sale_plan: 'complete_upfront', commission_payable_on: '2026-12-10' });
  const l = run([up]).lines[0];
  ok(l.commission === 300 && l.status === 'due' && l.payoutDate === '2026-12-10', 'Complete up front: exactly £300 at window close');
  ok(saleProgress({ lines: [l], businessOf: () => 'B', planOf: () => 'complete_upfront' })[0].progress === 'Complete up front · £300', 'Complete up front · £300');
  const upItem = owed([up]).next[0];
  ok(upItem.planWords === 'Complete up front' && upItem.label === 'One payment', 'the owed row names the plan once');
  ok(total(run([up, monthly(up, '2027-12-01T10:00:00Z', 29.99)], '2028-01-05T10:00:00Z').lines) === 300, 'Complete up front: nothing on hosting afterwards');
  for (const n of [13, 25]) ok(run([sale({ amount_gbp: 999, sale_plan: 'complete_upfront', commission_month_seq: n, commission_payable_on: '2026-12-10' })]).lines[0].commission === 300, `Complete up front as sale ${n} of the month: still £300, the ladder does not apply`);

  const full = sale({ amount_gbp: 499, sale_plan: 'full', commission_payable_on: '2026-12-10' });
  ok(run([full]).lines[0].commission === 150 && total(run([full]).lines) === 150, 'Essential in full: exactly £150');
  ok(saleProgress({ lines: run([full]).lines, businessOf: () => 'B', planOf: () => 'full' })[0].progress === 'Essential in full · £150', 'Essential in full · £150');
  ok(run([sale({ amount_gbp: 499, sale_plan: 'full', commission_month_seq: 25, commission_payable_on: '2026-12-10' })]).lines[0].commission === 150, 'Essential in full as sale 25: still £150');
  ok(total(run([full, monthly(full, '2027-08-01T10:00:00Z', 29.99)], '2027-09-05T10:00:00Z').lines) === 150, 'Essential in full: nothing on hosting afterwards');

  const six = sale({ sale_plan: 'six', commission_payable_on: '2026-12-10' });
  const sixP = pays(run([six, ...monthlies(six, 7)], LATE).lines);
  ok(sixP[0].commission === 30 && sixP.slice(1, 6).every((x) => x.commission === 20) && sixP.slice(6).every((x) => x.commission === 0) && total(sixP) === 130, 'Essential 6 months: £30, then £20 × 5 = exactly £130; nothing after the plan');

  const twelve = sale({ sale_plan: 'twelve', commission_payable_on: '2026-12-10' });
  const twP = pays(run([twelve, ...monthlies(twelve, 12, 49.99)], LATE).lines);
  ok(twP[0].commission === 30 && twP.slice(1, 12).every((x) => x.commission === 10) && twP[12].commission === 0 && total(twP) === 140, 'Essential 12 months: £30, then £10 on each £49.99 × 11 = exactly £140; nothing after the plan');

  const old = sale({ sale_plan: 'legacy_twelve', commission_payable_on: '2026-12-10' });
  const oldP = pays(run([old, ...monthlies(old, 12)], LATE).lines);
  ok(oldP[0].commission === 30 && oldP.slice(1, 12).every((x) => x.commission === 20) && oldP[12].commission === 0 && total(oldP) === 250, 'the old £99 × 12: £30 then £20 × 11, exactly £250');
  ok(saleProgress({ lines: run([old]).lines, businessOf: () => 'B', planOf: () => 'legacy_twelve' })[0].progress === 'Old plan · 1 of 12 paid · £30 of £250', 'the old plan’s words');
  const blank = sale({ sale_plan: null, commission_payable_on: '2026-12-10' });
  ok(total(pays(run([blank, ...monthlies(blank, 12)], LATE).lines)) === 250, 'no plan recorded: the old £99 × 12 schedule, exactly £250');
  ok(saleProgress({ lines: run([blank]).lines, businessOf: () => 'B', planOf: () => 'complete' })[0].progress === 'Complete monthly · 1 of 12 paid · £30 of £250', 'the most comes from what the engine paid on');
  /* A later payment earns its share of what was ACTUALLY collected. */
  const odd = sale({ commission_payable_on: '2026-12-10' });
  ok(pays(run([odd, monthly(odd, '2027-01-05T10:00:00Z', 49.99)], LATE).lines)[1].commission === 10, 'a later payment of a different amount earns 20% of what was collected');
}

/* ── THE LADDER: 26 sales in one month. 1–12 £30, 13–24 £40, 25 and 26 £50. ── */
{
  const ledger = Array.from({ length: 26 }, (_, k) => sale({ commission_month_seq: k + 1, occurred_at: `2026-11-${String(k + 1).padStart(2, '0')}T10:00:00Z`, commission_payable_on: '2026-12-10' }));
  const lines = run(ledger).lines.filter((l) => l.kind === 'payment');
  const by = (seq: number) => lines.find((l) => l.monthSeq === seq)!;
  ok([1, 2, 11, 12].every((k) => by(k).commission === 30), 'sales 1 to 12: £30 on the first payment');
  ok([13, 14, 23, 24].every((k) => by(k).commission === 40), 'sales 13 to 24: £40');
  ok([25, 26].every((k) => by(k).commission === 50), 'sales 25 and 26: £50');
  ok(total(lines) === 12 * 30 + 12 * 40 + 2 * 50, '26 sales: exactly £940 on first payments');
  ok(by(12).fixedMax === 250 && by(13).fixedMax === 260 && by(25).fixedMax === 270, 'the most a sale can earn follows its own step');
  const v = owed(ledger);
  ok(v.totalOwedNow === 940, 'all owed together at window close');
  ok(v.next.find((i) => i.key === by(13).id)!.label === 'Payment 1 of 12, sale 13 of the month', 'the owed row says which sale of the month it was');
  ok(v.sales.filter((x) => x.bonusWords).length === 14 && v.sales.find((x) => x.leadId === by(13).leadId)!.bonusWords === 'Sale 13 of the month: £40 first payment', 'a sale above the first step says so');
  ok(v.sales.find((x) => x.leadId === by(13).leadId)!.progress === 'Complete monthly · 1 of 12 paid · £40 of £260', 'its progress counts the higher first payment');
  /* Not backdated: sale 13 landing does not lift sale 1. */
  ok(by(1).commission === 30 && by(12).commission === 30, 'never backdated: earlier sales keep their step');
  const s13 = sale({ commission_month_seq: 13, commission_payable_on: '2026-12-10' });
  const m13 = pays(run([s13, monthly(s13, '2027-01-05T10:00:00Z')], '2027-02-05T10:00:00Z').lines);
  ok(m13[0].commission === 40 && m13[1].commission === 20, 'the step is on the first payment only: later payments are 20% whatever the sale number');
  ok(run([sale({ commission_rule: null, commission_month_seq: null, commission_payable_on: '2026-12-10' })]).lines[0].commission === 30, 'a sale the database never numbered earns the first step');
  /* The tracker. */
  const at = (n: number) => monthlyTracker(lines.filter((l) => (l.monthSeq ?? 0) <= n), '2026-11-28T10:00:00Z');
  const t0 = at(0), t10 = at(10), t12 = at(12), t23 = at(23), t24 = at(24), t26 = at(26);
  ok(t0.counted === 0 && t0.nextSaleNumber === 1 && t0.nextFirstPounds === 30 && t0.salesToNextStep === 12 && t0.nextStepPounds === 40, 'no sales yet: the next one earns £30, 12 to go before £40');
  ok(t10.nextFirstPounds === 30 && t10.salesToNextStep === 2 && monthlyTrackerNextLine(t10) === '2 more sales at £30, then a first payment earns £40', monthlyTrackerNextLine(t10));
  ok(t12.counted === 12 && t12.nextSaleNumber === 13 && t12.nextFirstPounds === 40 && t12.salesToNextStep === 12 && t12.nextStepPounds === 50, 'at 12 sales the next one earns £40');
  ok(t23.nextFirstPounds === 40 && t23.salesToNextStep === 1 && monthlyTrackerNextLine(t23) === '1 more sale at £40, then a first payment earns £50', monthlyTrackerNextLine(t23));
  ok(t24.nextFirstPounds === 50 && t24.salesToNextStep === null && t24.nextStepPounds === null && monthlyTrackerNextLine(t24) === 'Every new sale’s first payment earns £50', monthlyTrackerNextLine(t24));
  ok(t26.counted === 26 && t26.earned === 940 && t26.nextFirstPounds === 50, 'the top step has no end');
}

/* ── A FAILED PAYMENT is not a payment. Pays 3 times then stops: £70. One recovered later earns in its own place. ── */
{
  const s = sale({ commission_payable_on: '2026-12-10' });
  const ledger = [s, monthly(s, '2026-12-15T10:00:00Z'), monthly(s, '2027-01-15T10:00:00Z')];
  const p = pays(run(ledger, '2027-06-01T10:00:00Z').lines);
  ok(total(p) === 70 && owed(ledger, '2027-06-01T10:00:00Z').totalOwedNow === 70, 'exactly £70 (£30 + £20 + £20), nothing invented for the missed payments');
  const failedPay = { ...monthly(s, '2027-02-15T10:00:00Z'), status: 'failed' };
  const withFailed = run([...ledger, failedPay], '2027-06-01T10:00:00Z');
  ok(total(pays(withFailed.lines)) === 70 && pays(withFailed.lines).length === 3, 'a failed payment is not a payment: no line, no commission');
  ok(withFailed.clients[0].commissionablePaymentsLeft === 9, 'and it used none of the plan’s later payments');
  const recovered = monthly(s, '2027-03-20T10:00:00Z');
  const withIt = pays(run([...ledger, failedPay, recovered], '2027-06-01T10:00:00Z').lines);
  ok(total(withIt) === 90 && withIt[3].paymentNumber === 4 && withIt[3].commission === 20 && withIt[3].payoutDate === '2027-04-01', 'recovered later: earns £20 as payment 4, payable the 1st after it landed');
}

/* ── A DISPUTE on payment 3: that £20 held ── */
{
  const s = sale({ commission_payable_on: '2026-12-10' });
  const m2 = monthly(s, '2026-12-15T10:00:00Z');
  const m3 = monthly(s, '2027-01-15T10:00:00Z');
  const d = back(m3, 'chargeback', '2027-01-25T10:00:00Z');
  const v = owed([s, m2, m3, d], '2027-03-01T10:00:00Z');
  ok(v.totalOwedNow === 50, 'owed: only £50');
  const heldItems = v.quiet.filter((i) => i.bucket === 'held');
  ok(heldItems.length === 1 && heldItems[0].amount === 20 && heldItems[0].key === `pay:${m3.id}`, 'the third payment’s £20 is held');
  ok(v.sales[0].progress === 'Complete monthly · 3 of 12 paid · £70 of £250 · £20 held', v.sales[0].progress);
  ok(owed([s, m2, m3, { ...d, status: 'won' }], '2027-03-01T10:00:00Z').totalOwedNow === 70, 'won: it comes back');
  const lost = owed([s, m2, m3, { ...d, status: 'lost' }], '2027-03-01T10:00:00Z');
  ok(lost.totalOwedNow === 50 && lost.quiet.length === 0, 'lost: it stays off');
}

/* ── REFUNDS: a refunded payment earns nothing; part refunded, that share comes off; after payout it is an offset ── */
{
  const s = sale({ commission_payable_on: '2026-12-10' });
  const m2 = monthly(s, '2026-12-15T10:00:00Z');
  const partial = back(m2, 'refund', '2026-12-20T10:00:00Z', 33);
  const v = owed([s, m2, partial], '2027-02-01T10:00:00Z');
  ok(v.totalOwedNow === 43.33, `a third of a later payment refunded: £30 + £13.33 (${v.totalOwedNow})`);
  const full = back(m2, 'refund', '2026-12-20T10:00:00Z');
  ok(owed([s, m2, full], '2027-02-01T10:00:00Z').totalOwedNow === 30, 'a later payment refunded before payout: its line is cancelled, the rest stands');
  const payment: LinePaymentRow = { id: 'p', batch_id: 'b', line_key: `pay:${m2.id}`, part: 1, user_id: SELLER, lead_id: m2.lead_id, amount_gbp: 20, business_name: 'B', plan: 'complete', label: 'x', rate: null, client_amount_gbp: 99, collected_at: m2.occurred_at, payable_on: '2027-01-01', paid_at: '2027-01-02T10:00:00Z', paid_by: 'admin' };
  const paidThenBack = owed([s, m2, full], '2027-02-01T10:00:00Z', [payment]);
  ok(paidThenBack.next.some((i) => i.amount === -20 && i.bucket === 'now') && paidThenBack.totalOwedNow === 10, 'refunded after payout: −£20 comes off the £30 still owed');
  /* The first payment refunded AFTER the window closed: that line goes, later ones stand. */
  const first = sale({ commission_payable_on: '2026-12-10' });
  const f2 = monthly(first, '2026-12-15T10:00:00Z');
  const fv = owed([first, f2, back(first, 'refund', '2026-12-18T10:00:00Z')], '2027-02-01T10:00:00Z');
  ok(fv.sales[0].claim === null && fv.totalOwedNow === 20, 'a first payment refunded after the window is not a claim: its £30 goes, the later £20 stands');
  /* A refunded sale leaves the month's count (the database does the numbering; the month card must agree). */
  const a = sale({ commission_month_seq: 1, commission_payable_on: '2026-12-10' });
  const b = sale({ commission_month_seq: 2, commission_payable_on: '2026-12-10' });
  const trk = monthlyTracker(run([a, b, back(a, 'refund', '2026-11-20T10:00:00Z')], '2026-11-25T10:00:00Z').lines, '2026-11-25T10:00:00Z');
  ok(trk.counted === 1 && trk.nextSaleNumber === 2 && trk.earned === 30, 'a fully refunded sale stops counting towards the next sale’s number');
}

/* ── A GUARANTEE CLAIM: nothing paid ── */
{
  const s = sale({ commission_payable_on: '2026-12-10', commission_claim_at: '2026-12-08T10:00:00Z', commission_month_seq: 13 });
  const m2 = monthly(s, '2026-12-01T10:00:00Z');
  const v = owed([s, m2], '2026-12-20T10:00:00Z');
  ok(v.totalOwedNow === 0 && v.next.length === 0 && v.quiet.length === 0, 'marked claim: nothing owed, coming or waiting');
  ok(v.sales[0].progress === 'Complete monthly · client claimed · nothing payable' && v.sales[0].claim === 'marked' && !v.sales[0].bonusWords, v.sales[0].progress);
  const trk = monthlyTracker(run([s], '2026-11-20T10:00:00Z').lines, '2026-11-20T10:00:00Z');
  ok(trk.counted === 1 && trk.earned === 0 && trk.sales[0].commission === 0, 'a marked claim: £0 on the month card, still counted as the database counts it until the refund lands');
  const totals = earningsTotals(run([s, m2], '2026-12-20T10:00:00Z').lines, [], [], '2026-12-20');
  ok(totals.due === 0 && totals.pending === 0 && totals.earned === 0, 'the earnings page agrees: £0');
  ok(run([s], '2026-12-20T10:00:00Z').clients[0].commissionablePaymentsLeft === 0, 'nothing projected after a claim');

  const r = sale({ commission_payable_on: '2026-12-10' });
  const rv = owed([r, monthly(r, '2026-12-01T10:00:00Z'), back(r, 'refund', '2026-12-09T10:00:00Z')], '2026-12-20T10:00:00Z');
  ok(rv.totalOwedNow === 0 && rv.next.length === 0 && rv.sales[0].claim === 'refunded', 'the first payment refunded inside the window: the whole sale stops, even with no mark');
  const noResults = sale({ commission_payable_on: null });
  ok(owed([noResults, back(noResults, 'refund', '2026-12-09T10:00:00Z')], '2026-12-20T10:00:00Z').quiet.length === 0, 'refunded before results were ever sent: nothing waits');

  const paidFirst = sale({ commission_payable_on: '2026-12-10', commission_claim_at: '2026-12-12T10:00:00Z' });
  const paidRow: LinePaymentRow = { id: 'q', batch_id: 'b', line_key: `pay:${paidFirst.id}`, part: 1, user_id: SELLER, lead_id: paidFirst.lead_id, amount_gbp: 30, business_name: 'B', plan: 'complete', label: 'x', rate: null, client_amount_gbp: 99, collected_at: paidFirst.occurred_at, payable_on: '2026-12-10', paid_at: '2026-12-11T10:00:00Z', paid_by: 'admin' };
  ok(run([paidFirst], '2026-12-20T10:00:00Z', { paidByLine: new Map([[paidRow.line_key, 30]]) }).lines[0].status === 'paid' && owed([paidFirst], '2026-12-20T10:00:00Z', [paidRow]).totalOwedNow === 0, 'a claim never rewrites a line already paid');
  ok(owed([paidFirst, back(paidFirst, 'refund', '2026-12-15T10:00:00Z')], '2026-12-20T10:00:00Z', [paidRow]).next.some((i) => i.amount === -30), 'when its refund lands, that paid line becomes an offset');
}

/* ── No results sent: waiting, no backstop ── */
{
  const s = sale();
  const v = owed([s, monthly(s, '2026-12-15T10:00:00Z')], '2028-01-01T10:00:00Z');
  ok(v.totalOwedNow === 0 && v.next.length === 0 && v.quiet.filter((i) => i.bucket === 'waiting').length === 2, 'no four-week audit sent: both wait, however long, with no date');
  ok(v.quiet.every((i) => i.payableOn === null), 'no invented date');
}

/* ── The month reset: 31st 23:50 is sale 25 of October (£50), 1st 00:10 is sale 1 of November (£30) ── */
{
  const late = sale({ occurred_at: '2026-10-31T23:50:00Z', commission_month_start: '2026-10-01', commission_month_seq: 25, commission_payable_on: '2026-12-10' });
  const early = sale({ occurred_at: '2026-11-01T00:10:00Z', commission_month_start: '2026-11-01', commission_month_seq: 1, commission_payable_on: '2026-12-10' });
  const [a, b] = [run([late]).lines[0], run([early]).lines[0]];
  ok(a.commission === 50 && /sale 25 of October 2026/.test(a.label), '31st 23:50: sale 25, £50');
  ok(b.commission === 30 && /sale 1 of November 2026/.test(b.label), '1st 00:10: sale 1, £30');
  const sql = read('supabase/migrations/20261207090000_commission_fixed_amounts.sql');
  ok(/commission_rate = case when r\.payout_rule = 'fixed_v1' then 0/.test(sql), 'the database still numbers these sales, storing no rate');
  ok(/public\.commission_month_of\(p\.occurred_at\) = _month/.test(sql), 'numbered by the UK month of the first payment');
}

/* ── A salesperson who has left is still paid on the plan's payments as they arrive ── */
{
  const s = sale({ commission_payable_on: '2026-12-10' });
  const ledger = [s, ...monthlies(s, 6)];
  const engagement = new Map<string, EngagementEvent[]>([[SELLER, [{ kind: 'ended', at: '2026-12-20T10:00:00Z' }]]]);
  const p = pays(run(ledger, '2027-08-01T10:00:00Z', { engagement }).lines);
  ok(p[0].commission === 30 && p.slice(1).every((l) => l.commission === 20 && l.status === 'due') && total(p) === 150, 'left in December: still paid on every payment that arrives');
  ok(run(ledger.slice(0, 3), '2027-03-01T10:00:00Z', { engagement }).clients[0].commissionablePaymentsLeft === 9, 'and the rest of the plan is still forecast');
  const noClose = sale({ occurred_at: '2027-01-05T10:00:00Z', commission_payable_on: '2027-03-10' });
  ok(run([noClose], '2027-04-01T10:00:00Z', { engagement }).lines[0].commission === 0, 'a first payment after leaving, not closed before it: nothing');
  const closings = new Map<string, SaleClosing[]>([[noClose.lead_id!, [{ actorUserId: SELLER, at: '2026-12-01T10:00:00Z' }]]]);
  ok(run([noClose], '2027-04-01T10:00:00Z', { engagement, closings }).lines[0].commission === 30, 'closed before leaving: earned');
  const ended = new Map([[s.lead_id!, { endedAt: '2027-01-01T00:00:00Z', refunded: false }]]);
  ok(total(pays(run(ledger, '2027-08-01T10:00:00Z', { clientStateOf: ended }).lines)) === 30, 'after the CLIENT’s service ended: nothing more (only the first payment earned)');
}

/* ── Only a salesperson earns; test sales earn nothing ── */
{
  const admin = sale({ sold_by_user_id: 'admin-1', commission_payable_on: '2026-12-10' });
  ok(run([admin, monthly(admin, '2027-01-05T10:00:00Z')], LATE).lines.every((l) => l.commission === 0), 'the admin earns £0 on every payment');
  const t = sale({ commission_rule: 'test_excluded', commission_month_seq: null, commission_payable_on: '2026-12-10' });
  ok(run([t, monthly(t, '2026-12-15T10:00:00Z')]).lines.every((l) => l.commission === 0), 'a test sale and its later payments earn £0');
  const ex = sale({ commission_payable_on: '2026-12-10' });
  const lines = commissionLines({ ledger: [ex], payouts: [], isCommissionable: (u) => u === SELLER, nowIso: '2026-12-01T10:00:00Z', exclusionsOf: new Map([[ex.lead_id!, '2026-11-20T10:00:00Z']]) }).lines;
  ok(lines[0].status === 'cancelled' && lines[0].commission === 0, 'found to be a test before the window closed: nothing');
}

/* ── Forecast and Mark as paid use the same pounds ── */
{
  const s = sale({ commission_payable_on: '2026-12-10' });
  const res = run([s]);
  ok(res.clients[0].fixedPerPayment === 20 && res.clients[0].commissionablePaymentsLeft === 11, '11 more plan payments at £20 to come');
  const tw = sale({ sale_plan: 'twelve', commission_payable_on: '2026-12-10' });
  ok(run([tw]).clients[0].fixedPerPayment === 10, 'on the 12-month plan each one to come is £10');
  const up = sale({ amount_gbp: 999, sale_plan: 'complete_upfront', commission_payable_on: '2026-12-10' });
  ok(run([up]).clients[0].commissionablePaymentsLeft === 0, 'nothing more to come on a one-payment plan');
  const f = commissionForecast(res.lines, [{ leadId: s.lead_id!, business: 'B', nextPaymentAt: '2027-01-05T10:00:00Z', paymentsLeft: 11, monthlyGbp: 99, live: true, fixedPerPayment: 20 }], '2026-12-20T10:00:00Z');
  ok(f.expectedTotal === 100, `forecast: the 5 that land in the six months, at £20 each (${f.expectedTotal})`);
  const totals = earningsTotals(res.lines, [], [{ leadId: s.lead_id!, paymentsLeft: 11, monthlyGbp: 99, active: true, fixedPerPayment: 20 }], '2026-12-20');
  ok(totals.projected === 220, 'projected: £220');
  const v = owed([s]);
  const plan = planMarkPaid(v, { person: SELLER, expectedTotal: 30 });
  ok(plan.ok && plan.total === 30, 'Mark as paid agrees to the pound');
  ok(planMarkPaid(v, { person: SELLER, expectedTotal: 25 }).ok === false && planMarkPaid(v, { person: SELLER, expectedTotal: 29.7 }).ok === false, 'and refuses the old fixed £25 and the old 30%');
  const big = sale({ commission_payable_on: '2026-12-10', commission_month_seq: 13 });
  const bp = planMarkPaid(owed([big]), { person: SELLER, expectedTotal: 40 });
  ok(bp.ok && bp.items[0].parts[0].amount === 40, 'sale 13’s first payment is one line of £40');
}

/* ── The screens: pounds from the constants, never the old rules ── */
for (const f of ['src/components/admin/CommissionOwed.tsx', 'src/components/salesDash/MonthlyLadder.tsx', 'src/components/salesDash/earningsParts.tsx', 'src/components/salesDash/CommissionForecastCard.tsx', 'src/components/admin/teamControl.tsx', 'src/components/QuickCloseDialog.tsx']) {
  const src = read(f);
  ok(!/COMMISSION_RECURRING_RATE|MONTHLY_TIERS|nextSaleRate|\bpct\(l\.rate|\bpct\(r\.rate|\bpct\(sale\.rate/.test(src), `${f}: no old rate on the screen`);
  ok(!/\b(20|30|40|50)%/.test(src) && !/£(25|15|30|40|50|300|150)\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')), `${f}: no commission figure typed by hand`);
  ok(!/FIXED_COMMISSION|BIG_MONTH_BONUS|big-month bonus|bonusOn|salesToBonus/.test(src), `${f}: nothing of the fixed pounds or the bonus is left`);
}
{
  const ladder = read('src/components/salesDash/MonthlyLadder.tsx'), explain = read('src/components/salesDash/earningsParts.tsx'), owedSrc = read('src/components/admin/CommissionOwed.tsx'), team = read('src/components/admin/teamControl.tsx');
  ok(/FIRST_PAYMENT_LADDER\.map\(/.test(ladder) && /data-testid="ladder-next-pounds"/.test(ladder) && /t\.nextFirstPounds/.test(ladder), 'the month card draws the three steps and the next sale’s pounds from the ladder');
  ok(/FIRST_PAYMENT_LADDER/.test(explain) && /LATER_PAYMENT_RATE/.test(explain) && /ONE_PAYMENT_COMMISSION\.complete_upfront/.test(explain), 'the rules panel is written from the same constants');
  ok(/data-testid="owed-rate-card"/.test(owedSrc) && /FIRST_PAYMENT_LADDER/.test(owedSrc), 'Paul’s Commission owed shows the rate card');
  ok(/m\.nextFirstPounds/.test(team) && /m\.salesToNextStep/.test(team), 'the admin’s team table shows each person’s place on the ladder');
  const ledgerSrc = read('supabase/functions/_shared/payment-ledger.ts');
  ok(!/line\.rate/.test(ledgerSrc), 'the salesperson’s notice names no percentage');
  ok(/mode === "set_claim"/.test(read('supabase/functions/sales-earnings/index.ts')) && /commission_claim_at/.test(read('supabase/functions/_shared/earnings.ts')) && /commission_claim_at/.test(ledgerSrc), 'the claim is written by one mode and read by both loaders');
  const fn = read('supabase/functions/sales-earnings/index.ts');
  const adminGate = fn.indexOf('if (actor.role !== "admin") return await adminOnly();');
  ok(adminGate > 0 && adminGate < fn.indexOf('mode === "set_claim"'), 'recording a claim is admin only');
  ok(/\.\.\.owed\.sales\]/.test(fn), 'the belt covers a salesperson’s sale rows too');
}

console.log(`commission-contract-rules: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
