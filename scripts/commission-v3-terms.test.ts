/* ============================================================
   COMMISSION ON THE v3 COMMERCIAL TERMS (2026-10-05) — and NOTHING changed for sales before them.
   Ladder 30/40/50 by UK month, re-worked until the Approval Date and locked after; trailing 20% on the
   first FIVE £99 recurring payments (Build and Optimise); nothing on payment six onward or on the £29.99
   Continuing Service; initial commission Pending until the Approval Date; refunds in the window cancel /
   reduce it; a refund after it changes nothing.
   Run: npx tsx scripts/commission-v3-terms.test.ts
   ============================================================ */
import {
  COMMISSION_RECURRING_COUNT, COMMISSION_RECURRING_COUNT_V3, MONTHLY_TIER_RULE, commissionForecast, commissionLines, earningsTotals,
  londonMonthStart, monthlyTracker, type LedgerRow,
} from '../src/lib/commission.ts';
import { COMMERCIAL_TERMS_V3 } from '../src/lib/clientTimeline.ts';

let failures = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) failures++; };

const SELLER = 'seller-1';
let n = 0;
const pay = (lead: string, kind: 'initial' | 'recurring', at: string, amount = 99, extra: Partial<LedgerRow> = {}): LedgerRow => {
  n += 1;
  return { id: `row-${String(n).padStart(4, '0')}`, lead_id: lead, kind, status: 'succeeded', amount_gbp: amount, occurred_at: at,
    stripe_object_id: `pi_${n}`, stripe_payment_intent_id: `pi_${n}`, stripe_charge_id: `ch_${n}`, stripe_invoice_id: kind === 'recurring' ? `in_${n}` : null,
    sold_by_user_id: SELLER, ...extra };
};
const refund = (of: LedgerRow, at: string, amount = of.amount_gbp): LedgerRow => {
  n += 1;
  return { id: `row-${String(n).padStart(4, '0')}`, lead_id: of.lead_id, kind: 'refund', status: 'succeeded', amount_gbp: amount, occurred_at: at,
    stripe_object_id: `re_${n}`, stripe_payment_intent_id: of.stripe_payment_intent_id, stripe_charge_id: of.stripe_charge_id, stripe_invoice_id: null, sold_by_user_id: SELLER };
};
const run = (ledger: LedgerRow[], terms: Record<string, string | null>, nowIso: string) => commissionLines({
  ledger, payouts: [], isCommissionable: (u) => u === SELLER,
  termsOf: new Map(Object.entries(terms).map(([lead, approvalDay]) => [lead, { terms: COMMERCIAL_TERMS_V3, approvalDay }])), nowIso,
});

console.log('── PENDING → APPROVED (initial commission) ──');
{
  const init = pay('A', 'initial', '2026-11-02T15:00:00Z');
  const before = run([init], { A: null }, '2026-11-20T10:00:00Z').lines[0];
  ok(before.status === 'pending' && before.commission === 29.7 && before.provisional === true, 'no Approval Date yet → £29.70 PENDING, provisional');
  const t1 = earningsTotals([before], [], [], '2026-11-20');
  ok(t1.pending === 29.7 && t1.due === 0 && t1.earned === 0, 'pending is never in due or earned');
  const waiting = run([init], { A: '2026-12-22' }, '2026-12-21T12:00:00Z').lines[0];
  ok(waiting.status === 'pending' && /pending until 2026-12-22/.test(waiting.label), 'the day before the Approval Date → still pending');
  const approved = run([init], { A: '2026-12-22' }, '2026-12-22T09:00:00Z').lines[0];
  ok(approved.status === 'due' && approved.periodMonth === '2026-12-01' && approved.payoutDate === '2027-01-04', 'on the Approval Date → APPROVED, owed in December, paid on the first working day of January');
  const f = commissionForecast([waiting], [], '2026-12-01T10:00:00Z');
  ok(f.months[0].expected === 29.7 && f.months[0].earnedNewSale === 0, 'the forecast shows pending commission as EXPECTED in its approval month, never earned');
}

console.log('\n── REFUNDS: in the window cancel / reduce, after it change nothing ──');
{
  const init = pay('B', 'initial', '2026-11-02T15:00:00Z');
  const full = run([init, refund(init, '2026-12-15T10:00:00Z')], { B: '2026-12-22' }, '2026-12-23T10:00:00Z').lines;
  ok(full.every((l) => l.status === 'cancelled'), 'a full refund inside the window CANCELS the pending commission (and its reversal)');
  ok(earningsTotals(full, [], [], '2026-12-23').earned === 0 && earningsTotals(full, [], [], '2026-12-23').offset === 0, 'nothing earned, nothing offset');
  const part = run([init, refund(init, '2026-12-15T10:00:00Z', 49.5)], { B: '2026-12-22' }, '2026-12-23T10:00:00Z').lines;
  ok(earningsTotals(part, [], [], '2026-12-23').earned === 14.85, `a partial refund reduces it in proportion (£29.70 − £14.85 = ${earningsTotals(part, [], [], '2026-12-23').earned})`);
  const late = run([init, refund(init, '2027-01-10T10:00:00Z')], { B: '2026-12-22' }, '2027-01-11T10:00:00Z').lines;
  const lateRev = late.find((l) => l.kind === 'reversal')!;
  ok(lateRev.commission === 0 && lateRev.status === 'not_commissionable' && late.find((l) => l.kind === 'payment')!.status === 'due', 'a goodwill refund AFTER the Approval Date leaves the approved commission unchanged');
}

console.log('\n── THE LADDER: 30 / 40 / 50, UK month, re-worked until approval, locked after ──');
{
  /* 12 legacy sales already stamped this month (the database stamps those), then a v3 13th sale. */
  const legacy = Array.from({ length: 12 }, (_, i) => pay(`L${i}`, 'initial', `2026-11-${String(i + 2).padStart(2, '0')}T10:00:00Z`, 99,
    { commission_rule: MONTHLY_TIER_RULE, commission_month_start: '2026-11-01', commission_month_seq: i + 1, commission_rate: 0.3 }));
  const v3 = pay('C', 'initial', '2026-11-20T10:00:00Z');
  const lines = run([...legacy, v3], { C: '2026-12-22' }, '2026-12-23T10:00:00Z').lines;
  const c = lines.find((l) => l.leadId === 'C' && l.kind === 'payment')!;
  ok(c.monthSeq === 13 && c.rate === 0.4 && c.commission === 39.6, `sale 13 of the month earns 40% (got place ${c.monthSeq}, ${c.rate})`);
  ok(lines.filter((l) => l.leadId.startsWith('L')).every((l) => l.rate === 0.3), 'reaching 13 never re-rates sales 1–12');
  /* An earlier sale refunded in full BEFORE C is approved → C moves up to 12 → 30%. */
  const moved = run([...legacy, refund(legacy[0], '2026-12-01T10:00:00Z'), v3], { C: '2026-12-22' }, '2026-12-23T10:00:00Z').lines.find((l) => l.leadId === 'C' && l.kind === 'payment')!;
  ok(moved.monthSeq === 12 && moved.rate === 0.3, 'a refunded earlier sale drops out and the unapproved later sale moves up (5.3)');
  /* The same refund AFTER C was approved → C's rate is locked at 40%. */
  const locked = run([...legacy, refund(legacy[0], '2027-01-05T10:00:00Z'), v3], { C: '2026-12-22' }, '2027-01-06T10:00:00Z').lines.find((l) => l.leadId === 'C' && l.kind === 'payment')!;
  ok(locked.monthSeq === 13 && locked.rate === 0.4, 'after the Approval Date the place and rate are LOCKED — a later refund never re-rates it');
  /* 25th sale → 50%. */
  const many = Array.from({ length: 24 }, (_, i) => pay(`M${i}`, 'initial', `2026-11-${String(Math.floor(i / 2) + 2).padStart(2, '0')}T${String(8 + (i % 2)).padStart(2, '0')}:00:00Z`));
  const v25 = pay('D', 'initial', '2026-11-28T10:00:00Z');
  const d = run([...many, v25], { D: '2026-12-22', ...Object.fromEntries(many.map((m) => [m.lead_id!, '2026-12-22'])) }, '2026-12-23T10:00:00Z').lines.find((l) => l.leadId === 'D' && l.kind === 'payment')!;
  ok(d.monthSeq === 25 && d.rate === 0.5, `sale 25 earns 50% (got ${d.monthSeq}, ${d.rate})`);
  const tracker = monthlyTracker(run([v3], { C: null }, '2026-11-25T10:00:00Z').lines, '2026-11-25T10:00:00Z');
  ok(tracker.sales.length === 1 && tracker.sales[0].provisional === true, 'the month\'s ladder shows an unapproved sale as PROVISIONAL (6.7)');
}
{
  /* UK calendar month: 23:30 UTC on 30 Sep (BST) is 00:30 on 1 Oct in the UK. */
  ok(londonMonthStart('2026-09-30T23:30:00Z') === '2026-10-01', 'a sale at 00:30 UK on 1 October counts in October (UK time, not UTC)');
  ok(londonMonthStart('2026-10-31T23:30:00Z') === '2026-10-01', 'and 23:30 UK on 31 October (GMT) is still October');
}

console.log('\n── TRAILING: first FIVE £99 recurring payments, Build and Optimise; nothing on six+ or £29.99 ──');
ok(COMMISSION_RECURRING_COUNT_V3 === 5 && COMMISSION_RECURRING_COUNT === 6, 'v3 trailing is five; the pre-v3 rule (six) still exists for old sales');
{
  const init = pay('E', 'initial', '2026-11-02T15:00:00Z');
  const recs = Array.from({ length: 7 }, (_, i) => pay('E', 'recurring', `2027-${String(i + 1).padStart(2, '0')}-05T10:00:00Z`));
  const cont = pay('E', 'recurring', '2027-12-05T10:00:00Z', 29.99);
  const lines = run([init, ...recs, cont], { E: '2026-12-22' }, '2028-01-01T10:00:00Z').lines.filter((l) => l.kind === 'payment' && l.paymentNumber > 1);
  const byNo = lines.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  ok(byNo.slice(0, 5).every((l) => l.rate === 0.2 && l.commission === 19.8 && l.status === 'due'), 'recurring 1–5 earn 20% (£19.80), approved when collected');
  ok(byNo.slice(5, 7).every((l) => l.rate === 0 && l.commission === 0), 'recurring payment 6 onward earns nothing');
  const c = byNo[7];
  ok(c.continuingService === true && c.commission === 0 && c.status === 'not_commissionable' && /Continuing Service/.test(c.label), 'the £29.99 Continuing Service earns no commission');
}
{
  /* Same seven payments on a LEGACY sale: six earn — historical commission is untouched. */
  const init = pay('F', 'initial', '2026-10-02T15:00:00Z', 99, { commission_rule: MONTHLY_TIER_RULE, commission_month_start: '2026-10-01', commission_month_seq: 1, commission_rate: 0.3 });
  const recs = Array.from({ length: 7 }, (_, i) => pay('F', 'recurring', ['2026-11-05', '2026-11-20', '2026-12-05', '2026-12-20', '2027-01-05', '2027-01-20', '2027-02-05'][i] + 'T10:00:00Z'));
  const lines = commissionLines({ ledger: [init, ...recs], payouts: [], isCommissionable: (u) => u === SELLER, nowIso: '2027-06-01T10:00:00Z' }).lines;
  ok(lines.filter((l) => l.paymentNumber > 1 && l.rate === 0.2).length === 6, 'a sale made before v3 keeps the next-SIX rule');
  ok(lines.find((l) => l.paymentNumber === 1)!.status === 'due', 'and its initial commission stays earned at payment (never re-held)');
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nAll v3 commission checks passed.');
