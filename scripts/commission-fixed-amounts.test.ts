/* FIXED-AMOUNT COMMISSION (Paul, 2026-11-04, docs/commission-owed.md). Every total to the penny, through the real engine and the real owed view. */
import { readFileSync } from 'node:fs';
import { commissionForecast, commissionLines, earningsTotals, monthlyTracker, monthlyTrackerNextLine, type CommissionLine, type EngagementEvent, type LedgerRow, type SaleClosing } from '../src/lib/commission.ts';
import { BIG_MONTH_BONUS_FROM_SALE, BIG_MONTH_BONUS_GBP, BLANK_PLAN_COMMISSION, FIXED_COMMISSION, PAYOUT_RULE_FIXED_V1_FROM, bigMonthBonusFor, fixedCommissionMax, isLinePaidRule, payoutRuleForPaymentAt } from '../src/lib/commissionConfig.ts';
import { buildOwed, planMarkPaid, saleProgress, type LinePaymentRow } from '../src/lib/commissionOwed.ts';
import { PAYMENT_PLANS } from '../src/lib/paymentPlans.ts';

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
function back(of: LedgerRow, kind: 'refund' | 'chargeback', at: string, amount = of.amount_gbp, status = kind === 'refund' ? 'succeeded' : 'needs_response'): LedgerRow {
  id += 1;
  return { ...of, id: uuid(id), kind, status, amount_gbp: amount, occurred_at: at, stripe_object_id: `re_${id}` };
}
const NOW = '2026-12-20T12:00:00Z';
const run = (ledger: LedgerRow[], nowIso = NOW, extra: { engagement?: Map<string, EngagementEvent[]>; closings?: Map<string, SaleClosing[]>; paidByLine?: Map<string, number>; clientStateOf?: Map<string, { endedAt: string | null; refunded: boolean }> } = {}) =>
  commissionLines({ ledger, payouts: [], isCommissionable: (u) => u === SELLER, nowIso, ...extra });
const owed = (ledger: LedgerRow[], nowIso = NOW, payments: LinePaymentRow[] = []) => {
  const { lines } = run(ledger, nowIso, { paidByLine: new Map(payments.map((p) => [p.line_key, p.amount_gbp])) });
  const planOf = new Map(ledger.filter((r) => r.kind === 'initial').map((r) => [r.lead_id!, r.sale_plan ?? null]));
  return buildOwed({ lines, payments, businessOf: (x) => `Biz ${x}`, planOf: (x) => planOf.get(x) ?? null, today: nowIso.slice(0, 10) });
};
const pays = (ls: CommissionLine[]) => ls.filter((l) => l.kind === 'payment').sort((a, b) => a.paymentNumber - b.paymentNumber);

/* ── The config, one place ── */
ok(FIXED_COMMISSION.complete.perPayment === 25 && fixedCommissionMax('complete') === 150, 'Complete monthly: £25, most £150');
ok(FIXED_COMMISSION.complete_upfront.perPayment === 300 && fixedCommissionMax('complete_upfront') === 300, 'Complete up front: £300 once');
ok(FIXED_COMMISSION.full.perPayment === 150 && fixedCommissionMax('full') === 150, 'Essential in full: £150 once');
ok(FIXED_COMMISSION.six.perPayment === 15 && fixedCommissionMax('six') === 90 && FIXED_COMMISSION.twelve.perPayment === 15 && fixedCommissionMax('twelve') === 90, 'Essential plans: £15, most £90');
ok(PAYMENT_PLANS.every((p) => !!FIXED_COMMISSION[p]), 'every plan we sell has its pounds');
ok(BIG_MONTH_BONUS_GBP === 25 && BIG_MONTH_BONUS_FROM_SALE === 13 && bigMonthBonusFor(12) === 0 && bigMonthBonusFor(13) === 25 && bigMonthBonusFor(null) === 0, 'the bonus: +£25 from sale 13; no number, no bonus');

/* ── Which rows are on these rules ── */
ok(payoutRuleForPaymentAt(PAYOUT_RULE_FIXED_V1_FROM) === 'fixed_v1' && payoutRuleForPaymentAt('2026-11-03T23:00:00Z') === 'plan_v1' && payoutRuleForPaymentAt('2026-10-01T00:00:00Z') === 'legacy', 'old payments stay on their rules, new ones are fixed');
ok(isLinePaidRule('fixed_v1') && isLinePaidRule('plan_v1') && !isLinePaidRule('legacy') && !isLinePaidRule(null), 'line-by-line rules asked positively');
{
  const old = sale({ payout_rule: 'plan_v1', commission_rate: 0.3 });
  const l = run([old]).lines[0];
  ok(l.commission === 29.7 && !l.fixedRules, 'a plan_v1 sale keeps what it earned, never moved to pounds');
  const legacy = sale({ payout_rule: 'legacy', commission_rate: 0.3 });
  ok(run([legacy]).lines[0].commission === 29.7, 'a legacy sale keeps what it earned');
}

/* ── One Complete monthly sale: £50 at window close, then £25 × 4 ── */
{
  const s = sale({ commission_payable_on: '2026-12-10' });
  const m2 = monthly(s, '2026-12-01T10:00:00Z');
  const later = [monthly(s, '2027-01-05T10:00:00Z'), monthly(s, '2027-02-05T10:00:00Z'), monthly(s, '2027-03-05T10:00:00Z'), monthly(s, '2027-04-05T10:00:00Z')];
  const after = [monthly(s, '2027-05-05T10:00:00Z'), monthly(s, '2027-06-05T10:00:00Z')];
  const ledger = [s, m2, ...later, ...after];
  const p = pays(run(ledger, '2027-07-01T12:00:00Z').lines);
  ok(p.slice(0, 6).every((l) => l.commission === 25), 'the first six payments each earn £25');
  ok(p.slice(6).every((l) => l.commission === 0 && l.status === 'not_commissionable'), 'nothing on payments 7 and 8');
  ok(total(p) === 150, 'Complete monthly tops out at exactly £150');
  ok(p[0].payoutDate === '2026-12-10' && p[1].payoutDate === '2026-12-10', 'both payments collected before the window closes are payable at its close');
  ok(p[2].payoutDate === '2027-02-01' && p[5].payoutDate === '2027-05-01', 'a payment after the window is payable on the 1st of the next month');
  const before = owed(ledger.slice(0, 2), '2026-12-09T12:00:00Z');
  ok(before.next.length === 2 && before.next.every((i) => i.bucket === 'soon' && i.payableOn === '2026-12-10') && before.totalOwedNow === 0, 'the day before: nothing owed yet, £50 coming');
  const atClose = owed(ledger.slice(0, 2), '2026-12-10T12:00:00Z');
  ok(atClose.totalOwedNow === 50, 'at window close: exactly £50 owed');
  const allFour = owed(ledger.slice(0, 6), '2027-05-01T12:00:00Z');
  ok(allFour.totalOwedNow === 150, 'then £25 × 4: exactly £150 in all');
  ok(allFour.next.filter((i) => i.amount === 25).length === 6, 'six lines of £25');
  const sp = saleProgress({ lines: run(ledger.slice(0, 2)).lines, businessOf: () => 'B', planOf: () => 'complete' })[0];
  ok(sp.progress === 'Complete monthly · 2 of 6 paid · £50 of £150', `the words: ${sp.progress}`);
}

/* ── Up front, in full, plans ── */
{
  const up = sale({ amount_gbp: 999, sale_plan: 'complete_upfront', commission_payable_on: '2026-12-10' });
  const l = run([up]).lines[0];
  ok(l.commission === 300 && l.status === 'due' && l.payoutDate === '2026-12-10', 'Complete up front: exactly £300 at window close');
  ok(saleProgress({ lines: [l], businessOf: () => 'B', planOf: () => 'complete_upfront' })[0].progress === 'Complete up front · £300', 'Complete up front · £300');
  const upItem = owed([up]).next[0];
  ok(upItem.planWords === 'Complete up front' && upItem.label === 'One payment', 'the owed row names the plan once');
  const hosted = run([up, monthly(up, '2027-12-01T10:00:00Z', 29.99)], '2028-01-05T10:00:00Z').lines;
  ok(total(hosted) === 300, 'nothing on hosting afterwards');

  const full = sale({ amount_gbp: 499, sale_plan: 'full', commission_payable_on: '2026-12-10' });
  ok(run([full]).lines[0].commission === 150 && total(run([full]).lines) === 150, 'Essential in full: exactly £150');
  ok(saleProgress({ lines: run([full]).lines, businessOf: () => 'B', planOf: () => 'full' })[0].progress === 'Essential in full · £150', 'Essential in full · £150');

  for (const [plan, amount] of [['six', 99], ['twelve', 49.99]] as const) {
    const s = sale({ sale_plan: plan, commission_payable_on: '2026-12-10' });
    const rest = [1, 2, 3, 4, 5, 6, 7].map((k) => monthly(s, `2027-0${k}-05T10:00:00Z`, amount));
    const p = pays(run([s, ...rest], '2027-09-01T10:00:00Z').lines);
    ok(p.slice(0, 6).every((l) => l.commission === 15), `Essential ${plan}: £15 on each of the first six`);
    ok(total(p) === 90, `Essential ${plan}: exactly £90, whatever the monthly amount`);
    ok(p.slice(6).every((l) => l.commission === 0), `Essential ${plan}: nothing after six`);
  }
  const old = sale({ sale_plan: 'legacy_twelve', commission_payable_on: '2026-12-10' });
  const oldRest = [1, 2, 3, 4, 5, 6, 7].map((k) => monthly(old, `2027-0${k}-05T10:00:00Z`));
  const oldP = pays(run([old, ...oldRest], '2027-09-01T10:00:00Z').lines);
  ok(FIXED_COMMISSION.legacy_twelve.perPayment === 25 && oldP.slice(0, 6).every((l) => l.commission === 25) && total(oldP) === 150, 'the old £99 × 12: £25 × 6, exactly £150');
  ok(saleProgress({ lines: run([old]).lines, businessOf: () => 'B', planOf: () => 'legacy_twelve' })[0].progress === 'Old plan · 1 of 6 paid · £25 of £150', 'the old plan’s words');
  const blank = sale({ sale_plan: null, commission_payable_on: '2026-12-10' });
  const blankRest = [1, 2, 3, 4, 5, 6, 7].map((k) => monthly(blank, `2027-0${k}-05T10:00:00Z`));
  const blankP = pays(run([blank, ...blankRest], '2027-09-01T10:00:00Z').lines);
  ok(BLANK_PLAN_COMMISSION.perPayment === 15 && blankP.slice(0, 6).every((l) => l.commission === 15) && total(blankP) === 90, 'a blank plan: £15 × 6, exactly £90');
  ok(saleProgress({ lines: run([blank]).lines, businessOf: () => 'B', planOf: () => null })[0].progress === 'Old plan · 1 of 6 paid · £15 of £90', 'a blank plan’s words');
  ok(saleProgress({ lines: run([blank]).lines, businessOf: () => 'B', planOf: () => 'complete' })[0].progress === 'Complete monthly · 1 of 6 paid · £15 of £90', 'the most comes from what the engine paid on, whatever the lead row says');
}

/* ── 14 sales in a month: 13 and 14 get +£25 ── */
{
  const ledger = Array.from({ length: 14 }, (_, k) => sale({ commission_month_seq: k + 1, occurred_at: `2026-11-${String(k + 1).padStart(2, '0')}T10:00:00Z`, commission_payable_on: '2026-12-10' }));
  const lines = run(ledger).lines.filter((l) => l.kind === 'payment');
  const by = (seq: number) => lines.find((l) => l.monthSeq === seq)!;
  ok([1, 12].every((k) => by(k).commission === 25 && !by(k).bonus), 'sales 1 to 12: £25, no bonus');
  ok(by(13).commission === 50 && by(13).bonus === 25 && by(14).commission === 50 && by(14).bonus === 25, 'sales 13 and 14: £25 +£25');
  ok(total(lines) === 400, '14 sales: exactly £400 (14 × £25 + 2 × £25)');
  const v = owed(ledger);
  ok(v.totalOwedNow === 400, 'all owed together at window close');
  ok(v.next.find((i) => i.key === by(13).id)!.label === 'Payment 1 of 6, +£25 big-month bonus', 'the bonus is named on the line');
  ok(v.sales.filter((s) => s.bonusWords === '+£25 big-month bonus').length === 2, 'two sales show +£25 big-month bonus');
  ok(v.sales.find((s) => s.bonusWords)!.progress === 'Complete monthly · 1 of 6 paid · £25 of £150', 'the bonus is not counted in the plan’s £25 of £150');
  const up13 = sale({ amount_gbp: 999, sale_plan: 'complete_upfront', commission_month_seq: 13, commission_payable_on: '2026-12-10' });
  ok(run([up13]).lines[0].commission === 325, 'up front as sale 13: £325');
  const s13 = sale({ commission_month_seq: 13, commission_payable_on: '2026-12-10' });
  const m13 = pays(run([s13, monthly(s13, '2027-01-05T10:00:00Z')], '2027-02-05T10:00:00Z').lines);
  ok(m13[0].commission === 50 && m13[1].commission === 25 && !m13[1].bonus, 'the first payment carries the bonus, once');
  /* The tracker. */
  const t12 = monthlyTracker(lines.filter((l) => (l.monthSeq ?? 0) <= 12), '2026-11-20T10:00:00Z');
  ok(t12.counted === 12 && t12.bonusOn && t12.salesToBonus === 0 && t12.nextSaleNumber === 13, 'at 12 sales the next one earns the bonus');
  ok(monthlyTrackerNextLine(t12) === 'Every sale this month earns +£25', monthlyTrackerNextLine(t12));
  const t10 = monthlyTracker(lines.filter((l) => (l.monthSeq ?? 0) <= 10), '2026-11-20T10:00:00Z');
  ok(t10.salesToBonus === 2 && monthlyTrackerNextLine(t10) === '2 more sales, then every sale earns +£25', monthlyTrackerNextLine(t10));
}
/* ── Pays 3 times then stops: £75. A missed payment recovered later earns as normal ── */
{
  const s = sale({ commission_payable_on: '2026-12-10' });
  const ledger = [s, monthly(s, '2026-12-15T10:00:00Z'), monthly(s, '2027-01-15T10:00:00Z')];
  const p = pays(run(ledger, '2027-06-01T10:00:00Z').lines);
  ok(total(p) === 75 && owed(ledger, '2027-06-01T10:00:00Z').totalOwedNow === 75, 'exactly £75, nothing invented for the missed payments');
  const failed = { ...monthly(s, '2027-02-15T10:00:00Z'), status: 'failed' };
  ok(total(pays(run([...ledger, failed], '2027-06-01T10:00:00Z').lines)) === 75, 'a failed payment is not a payment');
  const recovered = monthly(s, '2027-03-20T10:00:00Z');
  const withIt = pays(run([...ledger, failed, recovered], '2027-06-01T10:00:00Z').lines);
  ok(total(withIt) === 100 && withIt[3].paymentNumber === 4 && withIt[3].payoutDate === '2027-04-01', 'recovered later: earned normally, payable the 1st after it landed');
}

/* ── A dispute on payment 3: that £25 held ── */
{
  const s = sale({ commission_payable_on: '2026-12-10' });
  const m2 = monthly(s, '2026-12-15T10:00:00Z');
  const m3 = monthly(s, '2027-01-15T10:00:00Z');
  const d = back(m3, 'chargeback', '2027-01-25T10:00:00Z');
  const ledger = [s, m2, m3, d];
  const v = owed(ledger, '2027-03-01T10:00:00Z');
  ok(v.totalOwedNow === 50, 'owed: only £50');
  const heldItems = v.quiet.filter((i) => i.bucket === 'held');
  ok(heldItems.length === 1 && heldItems[0].amount === 25 && heldItems[0].key === `pay:${m3.id}`, 'the third payment’s £25 is held');
  ok(v.sales[0].progress === 'Complete monthly · 3 of 6 paid · £75 of £150 · £25 held', v.sales[0].progress);
  const won = owed([s, m2, m3, { ...d, status: 'won' }], '2027-03-01T10:00:00Z');
  ok(won.totalOwedNow === 75, 'won: it comes back');
  const lost = owed([s, m2, m3, { ...d, status: 'lost' }], '2027-03-01T10:00:00Z');
  ok(lost.totalOwedNow === 50 && lost.quiet.length === 0, 'lost: it stays off');
}

/* ── Refunds keep the old behaviour, in pounds ── */
{
  const s = sale({ commission_payable_on: '2026-12-10' });
  const m2 = monthly(s, '2026-12-15T10:00:00Z');
  const partial = back(m2, 'refund', '2026-12-20T10:00:00Z', 33);
  const v = owed([s, m2, partial], '2027-02-01T10:00:00Z');
  ok(v.totalOwedNow === 41.67, `a third of a monthly refunded: £25 + £16.67 (${v.totalOwedNow})`);
  const full = back(m2, 'refund', '2026-12-20T10:00:00Z');
  ok(owed([s, m2, full], '2027-02-01T10:00:00Z').totalOwedNow === 25, 'a monthly refunded before payout: its line is cancelled, the rest stands');
  const payment: LinePaymentRow = { id: 'p', batch_id: 'b', line_key: `pay:${m2.id}`, part: 1, user_id: SELLER, lead_id: m2.lead_id, amount_gbp: 25, business_name: 'B', plan: 'complete', label: 'x', rate: null, client_amount_gbp: 99, collected_at: m2.occurred_at, payable_on: '2027-01-01', paid_at: '2027-01-02T10:00:00Z', paid_by: 'admin' };
  const paidThenBack = owed([s, m2, full], '2027-02-01T10:00:00Z', [payment]);
  ok(paidThenBack.next.some((i) => i.amount === -25 && i.bucket === 'now') && paidThenBack.totalOwedNow === 0, 'refunded after payout: −£25 offsets the £25 owed');
}

/* ── A guarantee claim: nothing paid ── */
{
  const s = sale({ commission_payable_on: '2026-12-10', commission_claim_at: '2026-12-08T10:00:00Z', commission_month_seq: 13 });
  const m2 = monthly(s, '2026-12-01T10:00:00Z');
  const v = owed([s, m2], '2026-12-20T10:00:00Z');
  ok(v.totalOwedNow === 0 && v.next.length === 0 && v.quiet.length === 0, 'marked claim: nothing owed, coming or waiting, bonus included');
  ok(v.sales[0].progress === 'Complete monthly · client claimed · nothing payable' && v.sales[0].claim === 'marked' && !v.sales[0].bonusWords, v.sales[0].progress);
  const trk = monthlyTracker(run([s], '2026-11-20T10:00:00Z').lines, '2026-11-20T10:00:00Z');
  ok(trk.counted === 1 && trk.earned === 0 && trk.sales[0].commission === 0, 'a marked claim: £0 on the month card, still counted as the database counts it until the refund lands');
  const totals = earningsTotals(run([s, m2], '2026-12-20T10:00:00Z').lines, [], [], '2026-12-20');
  ok(totals.due === 0 && totals.pending === 0 && totals.earned === 0, 'the earnings page agrees: £0');
  ok(run([s], '2026-12-20T10:00:00Z').clients[0].commissionablePaymentsLeft === 0, 'nothing projected after a claim');

  const r = sale({ commission_payable_on: '2026-12-10' });
  const r2 = monthly(r, '2026-12-01T10:00:00Z');
  const refund = back(r, 'refund', '2026-12-09T10:00:00Z');
  const rv = owed([r, r2, refund], '2026-12-20T10:00:00Z');
  ok(rv.totalOwedNow === 0 && rv.next.length === 0 && rv.sales[0].claim === 'refunded', 'the first payment refunded inside the window: the whole sale stops, even with no mark');
  const noResults = sale({ commission_payable_on: null });
  ok(owed([noResults, back(noResults, 'refund', '2026-12-09T10:00:00Z')], '2026-12-20T10:00:00Z').quiet.length === 0, 'refunded before results were ever sent: nothing waits');

  const goodwill = sale({ commission_payable_on: '2026-12-10' });
  const g2 = monthly(goodwill, '2026-12-15T10:00:00Z');
  const lateRefund = back(goodwill, 'refund', '2026-12-18T10:00:00Z');
  const gv = owed([goodwill, g2, lateRefund], '2027-02-01T10:00:00Z');
  ok(gv.sales[0].claim === null && gv.totalOwedNow === 25, 'a refund after the window closed is not a claim: that line goes, the later one stands');

  const paidFirst = sale({ commission_payable_on: '2026-12-10', commission_claim_at: '2026-12-12T10:00:00Z' });
  const paidRow: LinePaymentRow = { id: 'q', batch_id: 'b', line_key: `pay:${paidFirst.id}`, part: 1, user_id: SELLER, lead_id: paidFirst.lead_id, amount_gbp: 25, business_name: 'B', plan: 'complete', label: 'x', rate: null, client_amount_gbp: 99, collected_at: paidFirst.occurred_at, payable_on: '2026-12-10', paid_at: '2026-12-11T10:00:00Z', paid_by: 'admin' };
  const pv = owed([paidFirst], '2026-12-20T10:00:00Z', [paidRow]);
  ok(run([paidFirst], '2026-12-20T10:00:00Z', { paidByLine: new Map([[paidRow.line_key, 25]]) }).lines[0].status === 'paid' && pv.totalOwedNow === 0, 'a claim never rewrites a line already paid');
  const pr = owed([paidFirst, back(paidFirst, 'refund', '2026-12-15T10:00:00Z')], '2026-12-20T10:00:00Z', [paidRow]);
  ok(pr.next.some((i) => i.amount === -25), 'when its refund lands, that paid line becomes an offset');
}

/* ── No results sent: waiting, no backstop ── */
{
  const s = sale();
  const m2 = monthly(s, '2026-12-15T10:00:00Z');
  const v = owed([s, m2], '2028-01-01T10:00:00Z');
  ok(v.totalOwedNow === 0 && v.next.length === 0 && v.quiet.filter((i) => i.bucket === 'waiting').length === 2, 'no four-week audit sent: both wait, however long, with no date');
  ok(v.quiet.every((i) => i.payableOn === null), 'no invented date');
}

/* ── The month reset: 31st 23:50 is sale 25 and gets the bonus, 1st 00:10 is sale 1 ── */
{
  const late = sale({ occurred_at: '2026-10-31T23:50:00Z', commission_month_start: '2026-10-01', commission_month_seq: 25, commission_payable_on: '2026-12-10' });
  const early = sale({ occurred_at: '2026-11-01T00:10:00Z', commission_month_start: '2026-11-01', commission_month_seq: 1, commission_payable_on: '2026-12-10' });
  const [a, b] = [run([late]).lines[0], run([early]).lines[0]];
  ok(a.commission === 50 && a.bonus === 25 && /sale 25 of October 2026/.test(a.label), '31st 23:50: sale 25, +£25');
  ok(b.commission === 25 && !b.bonus && /sale 1 of November 2026/.test(b.label), '1st 00:10: sale 1, no bonus');
  const sql = read('supabase/migrations/20261207090000_commission_fixed_amounts.sql');
  ok(/commission_rate = case when r\.payout_rule = 'fixed_v1' then 0/.test(sql), 'the database still numbers fixed sales, storing no rate');
  ok(/public\.commission_month_of\(p\.occurred_at\) = _month/.test(sql), 'numbered by the UK month of the first payment');
}

/* ── A salesperson who has left is still paid on the first 6 as they arrive ── */
{
  const s = sale({ commission_payable_on: '2026-12-10' });
  const ledger = [s, ...[1, 2, 3, 4, 5, 6].map((k) => monthly(s, `2027-0${k}-05T10:00:00Z`))];
  const engagement = new Map<string, EngagementEvent[]>([[SELLER, [{ kind: 'ended', at: '2026-12-20T10:00:00Z' }]]]);
  const p = pays(run(ledger, '2027-08-01T10:00:00Z', { engagement }).lines);
  ok(p.slice(0, 6).every((l) => l.commission === 25 && l.status === 'due') && total(p) === 150, 'left in December: still paid on all six, £150');
  ok(run(ledger.slice(0, 3), '2027-03-01T10:00:00Z', { engagement }).clients[0].commissionablePaymentsLeft === 3, 'and still forecast');
  const noClose = sale({ occurred_at: '2027-01-05T10:00:00Z', commission_payable_on: '2027-03-10' });
  ok(run([noClose], '2027-04-01T10:00:00Z', { engagement }).lines[0].commission === 0, 'a first payment after leaving, not closed before it: nothing');
  const closings = new Map<string, SaleClosing[]>([[noClose.lead_id!, [{ actorUserId: SELLER, at: '2026-12-01T10:00:00Z' }]]]);
  ok(run([noClose], '2027-04-01T10:00:00Z', { engagement, closings }).lines[0].commission === 25, 'closed before leaving: earned');
  const ended = new Map([[s.lead_id!, { endedAt: '2027-01-01T00:00:00Z', refunded: false }]]);
  ok(total(pays(run(ledger, '2027-08-01T10:00:00Z', { clientStateOf: ended }).lines)) === 25, 'after the CLIENT’s service ended: still nothing (only the first payment earned)');
}

/* ── Only a salesperson earns; test sales earn nothing ── */
{
  const admin = sale({ sold_by_user_id: 'admin-1', commission_payable_on: '2026-12-10' });
  ok(run([admin]).lines[0].commission === 0, 'the admin earns £0');
  const t = sale({ commission_rule: 'test_excluded', commission_month_seq: null, commission_payable_on: '2026-12-10' });
  ok(run([t, monthly(t, '2026-12-15T10:00:00Z')]).lines.every((l) => l.commission === 0), 'a test sale and its monthlies earn £0');
  const ex = sale({ commission_payable_on: '2026-12-10' });
  const lines = commissionLines({ ledger: [ex], payouts: [], isCommissionable: (u) => u === SELLER, nowIso: '2026-12-01T10:00:00Z', exclusionsOf: new Map([[ex.lead_id!, '2026-11-20T10:00:00Z']]) }).lines;
  ok(lines[0].status === 'cancelled' && lines[0].commission === 0, 'found to be a test before the window closed: nothing');
}

/* ── Forecast and Mark as paid use the pounds ── */
{
  const s = sale({ commission_payable_on: '2026-12-10' });
  const res = run([s]);
  ok(res.clients[0].fixedPerPayment === 25 && res.clients[0].commissionablePaymentsLeft === 5, 'five more payments at £25 to come');
  const f = commissionForecast(res.lines, [{ leadId: s.lead_id!, business: 'B', nextPaymentAt: '2027-01-05T10:00:00Z', paymentsLeft: 5, monthlyGbp: 99, live: true, fixedPerPayment: 25 }], '2026-12-20T10:00:00Z');
  ok(f.expectedTotal === 125, `forecast: all 5 land in the six months, at £25 each (${f.expectedTotal})`);
  const totals = earningsTotals(res.lines, [], [{ leadId: s.lead_id!, paymentsLeft: 5, monthlyGbp: 99, active: true, fixedPerPayment: 25 }], '2026-12-20');
  ok(totals.projected === 125, 'projected: £125');
  const v = owed([s]);
  const plan = planMarkPaid(v, { person: SELLER, expectedTotal: 25 });
  ok(plan.ok && plan.total === 25, 'Mark as paid agrees to the penny');
  ok(planMarkPaid(v, { person: SELLER, expectedTotal: 29.7 }).ok === false, 'and refuses any other figure');
  const big = sale({ commission_payable_on: '2026-12-10', commission_month_seq: 13 });
  const bp = planMarkPaid(owed([big]), { person: SELLER, expectedTotal: 50 });
  ok(bp.ok && bp.items[0].parts[0].amount === 50, 'the bonus is paid with the first commission, one line');
}

/* ── No percentages on the screens or in the words ── */
for (const f of ['src/components/admin/CommissionOwed.tsx', 'src/components/salesDash/MonthlyLadder.tsx', 'src/components/salesDash/earningsParts.tsx', 'src/components/salesDash/CommissionForecastCard.tsx', 'src/components/admin/teamControl.tsx', 'src/components/QuickCloseDialog.tsx']) {
  const src = read(f);
  ok(!/COMMISSION_RECURRING_RATE|MONTHLY_TIERS|nextSaleRate|\bpct\(l\.rate|\bpct\(r\.rate|\bpct\(sale\.rate/.test(src), `${f}: no rate on the screen`);
  ok(!/\b(20|30|40|50)%/.test(src), `${f}: no percentage wording`);
}
{
  const ledgerSrc = read('supabase/functions/_shared/payment-ledger.ts');
  ok(!/line\.rate/.test(ledgerSrc), 'the salesperson’s notice names no percentage');
  ok(/mode === "set_claim"/.test(read('supabase/functions/sales-earnings/index.ts')) && /commission_claim_at/.test(read('supabase/functions/_shared/earnings.ts')) && /commission_claim_at/.test(ledgerSrc), 'the claim is written by one mode and read by both loaders');
  const fn = read('supabase/functions/sales-earnings/index.ts');
  const adminGate = fn.indexOf('if (actor.role !== "admin") return await adminOnly();');
  ok(adminGate > 0 && adminGate < fn.indexOf('mode === "set_claim"'), 'recording a claim is admin only');
  ok(/\.\.\.owed\.sales\]/.test(fn), 'the belt covers a salesperson’s sale rows too');
}

console.log(`commission-fixed-amounts: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
