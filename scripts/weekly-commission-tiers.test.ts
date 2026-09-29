/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WEEKLY COMMISSION TIERS (Paul, 2026-09-29): per salesperson, Monday–Sunday (London), clients 1–3 earn
   30% of the initial payment, 4–6 40%, 7 onwards 50%. Not retrospective; resets every Monday; refunds
   never renumber; recurring stays 20% × the next 3. The database STAMPS each sale's place and rate
   (migration 20260929180000; its live behaviour is pinned by supabase/tests/weekly-commission-tiers.sql);
   this suite pins the code that READS the stamp, the tracker, and that the two tier tables agree.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync } from 'node:fs';
import {
  COMMISSION_INITIAL_RATE, COMMISSION_RECURRING_RATE, WEEKLY_TIERS, WEEKLY_TIER_RULE, commissionLines, londonWeekStart,
  weeklyTierRate, weeklyTracker, weeklyTrackerNextLine, type LedgerRow,
} from '../src/lib/commission.ts';

let f = 0;
const ok = (c: unknown, l: string) => { if (!c) f++; console.log((c ? 'PASS ' : 'FAIL ') + l); };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const REP = 'rep-1';
let n = 0;
/* A ledger row as the database leaves it: an initial payment, stamped like restamp_weekly_commission. */
const initial = (at: string, seq: number | null, extra: Partial<LedgerRow> = {}): LedgerRow => {
  n += 1;
  return {
    id: `row-${n}`, lead_id: `lead-${n}`, kind: 'initial', status: 'succeeded', amount_gbp: 99, occurred_at: at,
    stripe_object_id: `pi_${n}`, stripe_payment_intent_id: `pi_${n}`, stripe_charge_id: `ch_${n}`, stripe_invoice_id: null, sold_by_user_id: REP,
    ...(seq === null ? {} : { commission_rule: WEEKLY_TIER_RULE, commission_week_start: londonWeekStart(at), commission_week_seq: seq, commission_rate: String(weeklyTierRate(seq)) }),
    ...extra,
  };
};
const linesOf = (ledger: LedgerRow[]) => commissionLines({ ledger, payouts: [], isCommissionable: (u) => u === REP }).lines;
const initLine = (lines: ReturnType<typeof linesOf>, leadId: string) => lines.find((l) => l.kind === 'payment' && l.leadId === leadId)!;

console.log('── 1. THE TIERS ──');
ok([1, 2, 3].every((s) => weeklyTierRate(s) === 0.30), 'clients 1–3 → 30%');
ok([4, 5, 6].every((s) => weeklyTierRate(s) === 0.40), 'clients 4–6 → 40%');
ok([7, 8, 10, 25].every((s) => weeklyTierRate(s) === 0.50), 'client 7 onwards → 50%');
ok(COMMISSION_RECURRING_RATE === 0.20, 'recurring stays 20%');
const sql = read('supabase/migrations/20260929180000_weekly_commission_tiers.sql');
const sqlTiers = /when _seq <= (\d+) then ([\d.]+) when _seq <= (\d+) then ([\d.]+) else ([\d.]+)/.exec(sql);
ok(!!sqlTiers && Number(sqlTiers[1]) === WEEKLY_TIERS[0].upTo && Number(sqlTiers[2]) === WEEKLY_TIERS[0].rate && Number(sqlTiers[3]) === WEEKLY_TIERS[1].upTo
  && Number(sqlTiers[4]) === WEEKLY_TIERS[1].rate && Number(sqlTiers[5]) === WEEKLY_TIERS[2].rate, 'the database tier table (weekly_tier_rate) matches WEEKLY_TIERS');
ok(/order by occurred_at, stripe_object_id, id/.test(sql), 'the database orders a week by payment time, then payment id');
ok(/date_trunc\('week', _at at time zone 'Europe\/London'\)/.test(sql), 'weeks are Monday-start, London time');
ok(/pg_advisory_xact_lock\(hashtext\('commission_week:'/.test(sql), 'one seller-week is numbered under a lock (near-simultaneous payments)');
ok(/commission_rule is null or commission_rule = 'weekly_tier_v1'/.test(sql), 'a row earned under another rule is never renumbered');
ok(/update public\.payment_ledger set commission_rule = 'flat_30_v0', commission_rate = 0\.30\s+where kind = 'initial' and commission_rule is null;/.test(sql), 'rows earned before the tiers keep the flat 30% (prospective only)');

console.log('── 2. BOUNDARIES: 1, 3, 4, 6, 7, 10 CLIENTS IN ONE WEEK (£99 each) ──');
const MON = '2026-10-05T09:00:00.000Z'; // Monday 5 Oct 2026, 10:00 London
const at = (i: number) => new Date(Date.parse(MON) + i * 3_600_000).toISOString();
const week10 = Array.from({ length: 10 }, (_, i) => initial(at(i), i + 1));
const l10 = linesOf(week10);
const expect = [29.7, 29.7, 29.7, 39.6, 39.6, 39.6, 49.5, 49.5, 49.5, 49.5];
week10.forEach((r, i) => ok(initLine(l10, r.lead_id!).commission === expect[i] && initLine(l10, r.lead_id!).weekSeq === i + 1, `client ${i + 1}: £${expect[i].toFixed(2)} (${Math.round(weeklyTierRate(i + 1) * 100)}%)`));
ok(initLine(l10, week10[0].lead_id!).commission === 29.7, 'NOT retrospective: client 1 stays 30% after client 4 lands');
for (const k of [1, 3, 4, 6, 7, 10]) {
  const t = weeklyTracker(linesOf(week10.slice(0, k)), '2026-10-07T12:00:00Z');
  const earned = expect.slice(0, k).reduce((s, x) => s + x, 0);
  ok(t.clients === k && Math.abs(t.earned - earned) < 0.001, `tracker at ${k}: ${t.clients} clients, £${t.earned.toFixed(2)} earned (= the lines)`);
}
const tr = (k: number) => weeklyTracker(linesOf(week10.slice(0, k)), '2026-10-07T12:00:00Z');
ok(weeklyTrackerNextLine(weeklyTracker([], '2026-10-07T12:00:00Z')) === '3 more clients unlocks 40%' && weeklyTracker([], '2026-10-07T12:00:00Z').currentRate === 0.3, '0 clients: tier 30%, 3 more clients unlocks 40%');
ok(tr(2).currentRate === 0.3 && weeklyTrackerNextLine(tr(2)) === '1 more client unlocks 40%', '2 clients: 30%, "1 more client unlocks 40%"');
ok(tr(3).currentRate === 0.3 && weeklyTrackerNextLine(tr(3)) === 'Your next client earns 40%', '3 clients: 30%, "Your next client earns 40%"');
ok(tr(4).currentRate === 0.4 && weeklyTrackerNextLine(tr(4)) === '2 more clients unlocks 50%', '4 clients: 40%, "2 more clients unlocks 50%"');
ok(tr(6).currentRate === 0.4 && weeklyTrackerNextLine(tr(6)) === 'Your next client earns 50%', '6 clients: 40%, "Your next client earns 50%"');
ok(tr(7).currentRate === 0.5 && tr(7).topTier && weeklyTrackerNextLine(tr(7)) === 'Top tier reached', '7 clients: 50%, "Top tier reached"');
ok(tr(10).topTier && tr(10).nextClientRate === 0.5, '10 clients: still the top tier');

console.log('── 3. THE MONDAY RESET ──');
ok(londonWeekStart('2026-10-11T22:30:00Z') === '2026-10-05', 'Sun 11 Oct 23:30 London (BST) is still the week of Mon 5 Oct');
ok(londonWeekStart('2026-10-11T23:30:00Z') === '2026-10-12', 'Mon 12 Oct 00:30 London (BST) starts the next week');
ok(londonWeekStart('2026-11-01T23:59:00Z') === '2026-10-26' && londonWeekStart('2026-11-02T00:00:00Z') === '2026-11-02', 'after the clocks change (GMT): Sun 23:59 vs Mon 00:00');
const nextMonday = initial('2026-10-12T09:00:00.000Z', 1);
const withNext = linesOf([...week10, nextMonday]);
ok(initLine(withNext, nextMonday.lead_id!).commission === 29.7, 'the first client of the next week earns 30% again');
const trNext = weeklyTracker(withNext, '2026-10-12T12:00:00Z');
ok(trNext.clients === 1 && trNext.currentRate === 0.3 && trNext.weekStart === '2026-10-12', 'the tracker counts only the new week (1 client, 30%)');

console.log('── 4. NEAR-SIMULTANEOUS PAYMENTS: THE STORED PLACE DECIDES ──');
/* Two payments stamped by the database as 3 and 4 in the same second: the code must read each one's
   OWN stamp and never re-derive order from arrival or row position. */
const s1 = initial('2026-10-06T10:00:00.000Z', 4, { stripe_object_id: 'pi_B' });
const s2 = initial('2026-10-06T10:00:00.000Z', 3, { stripe_object_id: 'pi_A' });
const ls = linesOf([s1, s2, initial('2026-10-06T09:00:00Z', 1), initial('2026-10-06T09:30:00Z', 2)]);
ok(initLine(ls, s2.lead_id!).commission === 29.7 && initLine(ls, s1.lead_id!).commission === 39.6, 'same timestamp: the stamped 3rd earns 30%, the stamped 4th 40%, whatever order the rows are read in');

console.log('── 5. REFUNDS AND DISPUTES DO NOT RENUMBER ──');
const w = Array.from({ length: 5 }, (_, i) => initial(at(i), i + 1));
const refund2: LedgerRow = { id: 'rf', lead_id: w[1].lead_id, kind: 'refund', status: 'succeeded', amount_gbp: 99, occurred_at: '2026-10-09T10:00:00Z', stripe_object_id: w[1].stripe_charge_id!, stripe_payment_intent_id: w[1].stripe_payment_intent_id, stripe_charge_id: w[1].stripe_charge_id, stripe_invoice_id: null, sold_by_user_id: REP };
const lr = linesOf([...w, refund2]);
ok(initLine(lr, w[3].lead_id!).commission === 39.6 && initLine(lr, w[3].lead_id!).weekSeq === 4, 'client 2 refunds later: client 4 stays a 40% sale, still client 4');
ok(lr.some((l) => l.kind === 'reversal' && l.leadId === w[1].lead_id && l.commission === -29.7), '…and only client 2 is reversed (its own 30%)');
const trR = weeklyTracker(lr, '2026-10-09T12:00:00Z');
ok(trR.clients === 5 && Math.abs(trR.earned - (29.7 * 3 + 39.6 * 2 - 29.7)) < 0.001, 'the tracker still counts 5 clients; earned is net of the reversal');
const dispute = (status: string): LedgerRow => ({ id: 'dp', lead_id: w[4].lead_id, kind: 'chargeback', status, amount_gbp: 99, occurred_at: '2026-10-10T10:00:00Z', stripe_object_id: 'dp_1', stripe_payment_intent_id: w[4].stripe_payment_intent_id, stripe_charge_id: w[4].stripe_charge_id, stripe_invoice_id: null, sold_by_user_id: REP });
const held = linesOf([...w, dispute('needs_response')]).find((l) => l.kind === 'reversal');
ok(held?.held === true && held.commission === -39.6, 'open dispute on client 5 → its 40% is HELD');
ok(!linesOf([...w, dispute('won')]).some((l) => l.kind === 'reversal'), 'dispute won → released (nothing taken)');
ok(linesOf([...w, dispute('lost')]).some((l) => l.kind === 'reversal' && !l.held && l.commission === -39.6), 'dispute lost → reversed at the sale\'s own 40%');
ok(initLine(linesOf([...w, dispute('lost')]), w[3].lead_id!).weekSeq === 4, 'a dispute never renumbers the week either');

console.log('── 6. PROSPECTIVE: A PRE-TIER SALE KEEPS WHAT IT EARNED ──');
const legacy = initial('2026-09-17T13:46:40Z', null, { commission_rule: 'flat_30_v0', commission_rate: '0.3000' });
ok(initLine(linesOf([legacy]), legacy.lead_id!).commission === 29.7 && !initLine(linesOf([legacy]), legacy.lead_id!).weekSeq, 'a flat_30_v0 row earns its stored 30% and has no weekly place');
const unstamped = initial('2026-10-06T10:00:00Z', null);
ok(initLine(linesOf([unstamped]), unstamped.lead_id!).rate === COMMISSION_INITIAL_RATE, 'a row with no stamp falls back to the flat 30% (never a guessed higher tier)');
ok(weeklyTracker(linesOf([legacy, unstamped]), '2026-10-06T12:00:00Z').clients === 0, 'unstamped / legacy rows are never counted in a weekly tracker');

console.log('── 7. RECURRING UNCHANGED, AND SEPARATE FROM THE TIER ──');
const c7 = initial(at(6), 7);
const rec = (i: number): LedgerRow => ({ id: `rc${i}`, lead_id: c7.lead_id, kind: 'recurring', status: 'succeeded', amount_gbp: 99, occurred_at: `2026-11-${10 + i}T10:00:00Z`, stripe_object_id: `in_${i}`, stripe_payment_intent_id: null, stripe_charge_id: null, stripe_invoice_id: `in_${i}`, sold_by_user_id: REP });
const lrec = linesOf([c7, rec(0), rec(1), rec(2), rec(3)]).filter((l) => l.leadId === c7.lead_id && l.kind === 'payment').sort((a, b) => a.paymentNumber - b.paymentNumber);
ok(lrec[0].commission === 49.5 && lrec.slice(1, 4).every((l) => l.commission === 19.8) && lrec[4].commission === 0, 'a 50% client: its monthly payments still earn 20% × the next 3, then nothing');

console.log('── 8. WHERE IT IS READ, AND NO OLD BONUS ──');
ok(/commission_rule, commission_week_start, commission_week_seq, commission_rate/.test(read('supabase/functions/_shared/earnings.ts')), 'the earnings loader reads the stamped columns');
ok(/commission_rule, commission_week_start, commission_week_seq, commission_rate/.test(read('supabase/functions/_shared/payment-ledger.ts')), 'the earned notification reads them too');
ok(/<WeeklyTierTracker lines=\{earn\.data\.lines\} \/>/.test(read('src/pages/SalesDashboard.tsx')), 'the Sales dashboard shows the tracker from the SAME earnings lines');
ok(/function WeeklyAudit/.test(read('src/pages/Earnings.tsx')) && /Week · place/.test(read('src/pages/Earnings.tsx')), 'Earnings: each line shows its week and place; the admin has a per-week audit');
const walk = (d: string): string[] => readdirSync(new URL('../' + d, import.meta.url), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${d}/${e.name}`) : /\.(ts|tsx)$/.test(e.name) ? [`${d}/${e.name}`] : []);
const offenders = [...walk('src'), ...walk('supabase/functions')].filter((p) => /weekly bonus|£30 bonus|bonus of £30|WEEKLY_BONUS/i.test(read(p)) && !/commission\.ts$/.test(p));
ok(offenders.length === 0, 'no £30 / weekly-bonus logic anywhere' + (offenders.length ? ': ' + offenders.join(', ') : ''));

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURE(S)`);
process.exit(f === 0 ? 0 : 1);
