/* ════════════════════════════════════════════════════════════════════════════════════════════════
   MONTHLY COMMISSION TIERS (Paul, 2026-10-01; replaced the weekly ladder): per salesperson, per London
   calendar month, sales 1–12 earn 30% of the initial payment, 13–24 40%, 25 onwards 50%. Not
   retrospective; resets on the 1st; a refunded sale stops lifting later sales; test sales never count;
   recurring stays 20% × the next 3. The database STAMPS each sale's place and rate once (migration
   20261003100000; proved live in a rolled-back transaction, supabase/tests/monthly-commission-tiers.sql);
   this suite pins the code that READS the stamp, the ladder and its words, that the two tier tables
   agree, and the Sales page that draws it.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, existsSync } from 'node:fs';
import {
  COMMISSION_INITIAL_RATE, COMMISSION_RECURRING_RATE, MONTHLY_TIERS, MONTHLY_TIER_RULE, TEST_EXCLUDED_RULE, commissionLines,
  londonMonthStart, monthlyTierRate, monthlyTracker, monthlyTrackerNextLine, type LedgerRow,
} from '../src/lib/commission.ts';

let f = 0;
const ok = (c: unknown, l: string) => { if (!c) f++; console.log((c ? 'PASS ' : 'FAIL ') + l); };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const REP = 'rep-1';
let n = 0;
/* A ledger row as the database leaves it: an initial payment, stamped like stamp_monthly_commission_for. */
const initial = (at: string, seq: number | null, extra: Partial<LedgerRow> = {}): LedgerRow => {
  n += 1;
  return {
    id: `row-${n}`, lead_id: `lead-${n}`, kind: 'initial', status: 'succeeded', amount_gbp: 99, occurred_at: at,
    stripe_object_id: `pi_${n}`, stripe_payment_intent_id: `pi_${n}`, stripe_charge_id: `ch_${n}`, stripe_invoice_id: null, sold_by_user_id: REP,
    ...(seq === null ? {} : { commission_rule: MONTHLY_TIER_RULE, commission_month_start: londonMonthStart(at), commission_month_seq: seq, commission_rate: String(monthlyTierRate(seq)) }),
    ...extra,
  };
};
const linesOf = (ledger: LedgerRow[]) => commissionLines({ ledger, payouts: [], isCommissionable: (u) => u === REP }).lines;
const initLine = (lines: ReturnType<typeof linesOf>, leadId: string) => lines.find((l) => l.kind === 'payment' && l.leadId === leadId)!;
const OCT = (i: number) => new Date(Date.parse('2026-10-02T09:00:00.000Z') + i * 3_600_000).toISOString();
const TODAY = '2026-10-20T12:00:00Z';

console.log('── 1. THE TIERS ──');
ok([1, 12].every((s) => monthlyTierRate(s) === 0.30), 'sale 1 = 30%, sale 12 = 30%');
ok([13, 24].every((s) => monthlyTierRate(s) === 0.40), 'sale 13 = 40%, sale 24 = 40%');
ok([25, 30, 60].every((s) => monthlyTierRate(s) === 0.50), 'sale 25 onwards = 50%');
ok(COMMISSION_RECURRING_RATE === 0.20, 'recurring stays 20%');
const sql = read('supabase/migrations/20261003100000_monthly_commission_tiers.sql');
const t = /when _seq <= (\d+) then ([\d.]+) when _seq <= (\d+) then ([\d.]+) else ([\d.]+)/.exec(sql);
ok(!!t && Number(t[1]) === MONTHLY_TIERS[0].upTo && Number(t[2]) === MONTHLY_TIERS[0].rate && Number(t[3]) === MONTHLY_TIERS[1].upTo && Number(t[4]) === MONTHLY_TIERS[1].rate && Number(t[5]) === MONTHLY_TIERS[2].rate, 'the database tier table (monthly_tier_rate) matches MONTHLY_TIERS');
ok(/date_trunc\('month', _at at time zone 'Europe\/London'\)/.test(sql), 'months are calendar months, London time');
ok(/order by p\.occurred_at, p\.stripe_object_id, p\.id/.test(sql), 'a month is numbered by payment time, then payment id');
ok(/pg_advisory_xact_lock\(hashtext\('commission_month:'/.test(sql), "one seller's month is numbered under a lock (near-simultaneous payments)");
ok(/p\.sold_by_user_id = _seller and p\.commission_rule is null/.test(sql), 'only an UNSTAMPED row is ever stamped — a sale is never renumbered or re-rated');
ok(/e\.kind = 'user' and e\.value = _seller::text\) or \(e\.kind = 'lead' and e\.value = r\.lead_id::text\)/.test(sql) && /commission_rule = 'test_excluded', commission_rate = 0/.test(sql), 'a test account or test lead is stamped test_excluded at 0% (metric_exclusions)');
ok(/public\.commission_sale_stuck\(q\)/.test(sql) && /r\.kind = 'refund' and r\.amount_gbp >= _p\.amount_gbp\) or \(r\.kind = 'chargeback' and r\.status = 'lost'\)/.test(sql), 'a fully refunded / lost sale does not count towards a later sale’s place');
ok(/drop trigger if exists trg_payment_ledger_weekly_commission/.test(sql) && /create trigger trg_payment_ledger_monthly_commission/.test(sql), 'the weekly trigger is replaced by the monthly one');
ok(!existsSync(new URL('../scripts/weekly-commission-tiers.test.ts', import.meta.url)), 'the weekly suite is gone with the weekly rule');

console.log('── 2. SALES 1, 12, 13, 24, 25 IN ONE MONTH (£99 each) ──');
const month = Array.from({ length: 26 }, (_, i) => initial(OCT(i), i + 1));
const lm = linesOf(month);
for (const [k, rate] of [[1, 0.3], [12, 0.3], [13, 0.4], [24, 0.4], [25, 0.5], [26, 0.5]] as const) {
  const l = initLine(lm, month[k - 1].lead_id!);
  ok(l.rate === rate && l.commission === Math.round(99 * rate * 100) / 100 && l.monthSeq === k, `sale ${k}: ${Math.round(rate * 100)}% = £${(99 * rate).toFixed(2)}`);
}
ok(initLine(lm, month[0].lead_id!).commission === 29.7, 'NOT retrospective: sale 1 stays 30% after sale 13 and 25 land');
ok(/sale 13 of October 2026/.test(initLine(lm, month[12].lead_id!).label), 'the line says which sale of which month ("sale 13 of October 2026")');

console.log('── 3. THE LADDER AND ITS WORDS ──');
const tr = (k: number) => monthlyTracker(linesOf(month.slice(0, k)), TODAY);
const words: [number, number, string][] = [
  [0, 0.3, '12 more sales to unlock 40%'], [9, 0.3, '3 more sales to unlock 40%'], [11, 0.3, '1 more sale to unlock 40%'],
  [12, 0.4, '40% unlocked · 12 more sales to unlock 50%'], [13, 0.4, '40% unlocked · 11 more sales to unlock 50%'], [23, 0.4, '40% unlocked · 1 more sale to unlock 50%'],
  [24, 0.5, '50% unlocked · every sale earns 50%'], [25, 0.5, '50% unlocked · every sale earns 50%'],
];
for (const [k, next, line] of words) {
  const x = k === 0 ? monthlyTracker([], TODAY) : tr(k);
  ok(x.counted === k && x.nextSaleRate === next && monthlyTrackerNextLine(x) === line, `${k} sales: next sale earns ${Math.round(next * 100)}%, "${line}"`);
}
ok(tr(9).earned === Math.round(9 * 29.7 * 100) / 100 && tr(13).sales.length === 13, 'the ladder counts the same lines the payments table lists');

console.log('── 4. THE 1ST RESETS IT ──');
ok(londonMonthStart('2026-10-31T23:30:00Z') === '2026-10-01' && londonMonthStart('2026-11-01T00:30:00Z') === '2026-11-01', 'GMT: 31 Oct 23:30 is October, 1 Nov 00:30 is November');
ok(londonMonthStart('2026-09-30T23:30:00Z') === '2026-10-01', 'BST: 30 Sep 23:30 UTC is already 1 Oct in London');
const nov1 = initial('2026-11-01T10:00:00Z', 1);
const withNov = linesOf([...month, nov1]);
ok(initLine(withNov, nov1.lead_id!).rate === 0.3, "the first sale of November earns 30% again (after October's 26)");
const tNov = monthlyTracker(withNov, '2026-11-03T12:00:00Z');
ok(tNov.counted === 1 && tNov.nextSaleRate === 0.3 && tNov.monthStart === '2026-11-01', 'the November ladder counts only November');

console.log('── 5. REFUNDS, TEST SALES, OLDER RULES ──');
const w = Array.from({ length: 13 }, (_, i) => initial(OCT(i), i + 1));
const refund = (r: LedgerRow): LedgerRow => ({ id: `rf-${r.id}`, lead_id: r.lead_id, kind: 'refund', status: 'succeeded', amount_gbp: 99, occurred_at: '2026-10-15T10:00:00Z', stripe_object_id: r.stripe_charge_id!, stripe_payment_intent_id: r.stripe_payment_intent_id, stripe_charge_id: r.stripe_charge_id, stripe_invoice_id: null, sold_by_user_id: REP });
const lr = linesOf([...w, refund(w[2])]);
ok(initLine(lr, w[12].lead_id!).rate === 0.4, 'sale 13 keeps its 40% after an earlier sale is refunded (never re-rated)');
ok(lr.some((l) => l.kind === 'reversal' && l.leadId === w[2].lead_id && l.commission === -29.7), '…and only the refunded sale is reversed, at its own 30%');
const trR = monthlyTracker(lr, TODAY);
ok(trR.counted === 12 && trR.sales.filter((s) => !s.counted).length === 1 && trR.nextSaleRate === 0.4, 'the refunded sale no longer counts: 12 counted, the next sale earns 40% (what the database will stamp)');
const testSale = initial(OCT(30), null, { commission_rule: TEST_EXCLUDED_RULE, commission_rate: '0' });
const lt = linesOf([...w.slice(0, 3), testSale]);
ok(initLine(lt, testSale.lead_id!).commission === 0 && initLine(lt, testSale.lead_id!).testSale === true, 'a test sale earns 0% and says so');
ok(monthlyTracker(lt, TODAY).counted === 3, '…and never moves the ladder');
const legacy = initial('2026-09-17T13:46:40Z', null, { commission_rule: 'flat_30_v0', commission_rate: '0.3000' });
const weekly = initial('2026-09-30T10:00:00Z', null, { commission_rule: 'weekly_tier_v1', commission_rate: '0.4000' });
ok(initLine(linesOf([legacy]), legacy.lead_id!).commission === 29.7 && initLine(linesOf([weekly]), weekly.lead_id!).commission === 39.6, 'a sale stamped under an older rule keeps exactly what it earned');
const unstamped = initial(OCT(1), null);
ok(initLine(linesOf([unstamped]), unstamped.lead_id!).rate === COMMISSION_INITIAL_RATE && monthlyTracker(linesOf([unstamped]), TODAY).counted === 0, 'an unstamped row falls back to the flat 30% and is never counted on the ladder');

console.log('── 6. TRAILING COMMISSION: 20% × THE NEXT SIX, WHATEVER THE TIER ──');
const c25 = month[24];
const rec = (i: number): LedgerRow => ({ id: `rc${i}`, lead_id: c25.lead_id, kind: 'recurring', status: 'succeeded', amount_gbp: 29.99, occurred_at: `2026-11-${10 + i}T10:00:00Z`, stripe_object_id: `in_${i}`, stripe_payment_intent_id: null, stripe_charge_id: null, stripe_invoice_id: `in_${i}`, sold_by_user_id: REP });
const lrec = linesOf([c25, rec(0), rec(1), rec(2), rec(3), rec(4), rec(5), rec(6)]).filter((l) => l.leadId === c25.lead_id && l.kind === 'payment').sort((a, b) => a.paymentNumber - b.paymentNumber);
ok(lrec[0].commission === 49.5 && lrec.slice(1, 7).every((l) => l.commission === 6) && lrec[7].commission === 0, 'a 50% sale: its monthly payments still earn 20% × the next 6 (£29.99 → £6.00), then nothing');

console.log('── 7. WHERE IT IS READ, AND THE SALES PAGE ──');
ok(/commission_rule, commission_month_start, commission_month_seq, commission_rate/.test(read('supabase/functions/_shared/earnings.ts')), 'the earnings loader reads the stamped columns');
ok(/commission_rule, commission_month_start, commission_month_seq, commission_rate/.test(read('supabase/functions/_shared/payment-ledger.ts')), 'the earned notification reads them too');
const page = read('src/pages/SalesDashboard.tsx');
const ladder = read('src/components/salesDash/MonthlyLadder.tsx');
ok((page.match(/<MonthlyLadder /g) ?? []).length === 1 && /monthlyTracker\(lines, todayIso\)/.test(ladder) && /MONTHLY_TIERS\.map/.test(ladder), 'one ladder, built from the same lines and the one tier table');
ok(/lg:grid-cols-\[12fr_12fr_5fr\]/.test(ladder) && !/grid-cols-\[12fr/.test(ladder.replace(/lg:grid-cols-\[12fr_12fr_5fr\]/, '')), 'the tiers sit side by side from lg and stack on a phone (no squeezed line)');
ok(/data-testid="ladder-sale"/.test(ladder) && /PopoverContent/.test(ladder) && /client\?\.package/.test(ladder) && /remainingPotential/.test(ladder), 'each sale dot opens the client, date, package, commission and what monthly payments may still earn');
const labels = [...page.matchAll(/<KpiCard label="([^"]+)"/g)].map((m) => m[1]);
ok(JSON.stringify(labels) === JSON.stringify(['Calls made', 'People reached', 'Contacted → sale']), `three work numbers, none repeating the ladder (got ${labels.join(', ')})`);
ok(!/Commission earned|WeeklyTierTracker|TodayStrip|PipelineStrip|TrendsPanel|MilestonesPanel|RecapPanel|TargetsPanel/.test(page), 'the duplicate and decorative cards are gone from the page');
ok((page + ladder).match(/earnedThisMonth/g)?.length === 1, 'earned this month is drawn once (on the ladder)');
ok(!existsSync(new URL('../src/pages/Earnings.tsx', import.meta.url)) && !existsSync(new URL('../src/components/salesDash/WeeklyTracker.tsx', import.meta.url)), 'the Earnings page and the weekly tracker are deleted');
ok(!/Pipeline efficiency|Sales velocity|MRR|disposition/i.test(page + ladder + read('src/components/salesDash/earningsParts.tsx')), 'no jargon on the Sales page');

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURE(S)`);
process.exit(f === 0 ? 0 : 1);
