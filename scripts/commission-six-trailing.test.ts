/* ════════════════════════════════════════════════════════════════════════════════════════════════
   COMMISSION: SIX TRAILING PAYMENTS, THE ENGAGEMENT END, THE SIX-MONTH FORECAST, AND THE NEXT ACTION
   IN PLACE OF FIND EMAIL (Paul, 2026-10-02). Pins src/lib/commission.ts, the loader
   (supabase/functions/_shared/earnings.ts), the Disable action (fn admin-users) and the Sales / Inbox UI.
   The monthly ladder (30 / 40 / 50) is unchanged — its own suite is monthly-commission-tiers.test.ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import {
  commissionForecast, commissionLines, earningsTotals, londonMonthStart, monthlyTierRate, monthlyTracker, monthlyTrackerNextLine,
  receivedAfterEngagement, COMMISSION_RECURRING_COUNT, COMMISSION_RECURRING_RATE, ENGAGEMENT_END_UNKNOWN, MONTHLY_TIER_RULE,
  type CommissionLine, type ForecastClient, type LedgerRow,
} from '../src/lib/commission.ts';
import { engagementEnds } from '../supabase/functions/_shared/earnings.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const root = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const r2 = (n: number) => Math.round(n * 100) / 100;

const REP = 'rep-1', OTHER = 'rep-2', ADMIN = 'admin-1';
let n = 0;
const row = (lead: string, kind: string, amount: number, at: string, extra: Partial<LedgerRow> = {}): LedgerRow => ({
  id: `r${String(++n).padStart(6, '0')}`, lead_id: lead, kind, status: 'succeeded', amount_gbp: amount, occurred_at: at, stripe_object_id: `obj${n}`,
  stripe_payment_intent_id: `pi${n}`, stripe_charge_id: `ch${n}`, stripe_invoice_id: kind === 'recurring' ? `in${n}` : null, sold_by_user_id: REP, ...extra,
});
/** An initial payment as the database stamps it: its place in its London month and that place's rate. */
const sale = (lead: string, at: string, seq: number, extra: Partial<LedgerRow> = {}) => row(lead, 'initial', 99, at, {
  commission_rule: MONTHLY_TIER_RULE, commission_month_start: londonMonthStart(at), commission_month_seq: seq, commission_rate: String(monthlyTierRate(seq)), ...extra,
});
const run = (ledger: LedgerRow[], ended?: Map<string, string>, sellers = new Set([REP, OTHER])) =>
  commissionLines({ ledger, payouts: [], isCommissionable: (u) => !!u && sellers.has(u), engagementEndedAt: ended });
const paysOf = (lines: CommissionLine[], lead: string) => lines.filter((l) => l.leadId === lead && l.kind === 'payment').sort((a, b) => a.paymentNumber - b.paymentNumber);
/** Monthly payment k (1-based) of a client first paid in `y-m`, on the 10th of each later month. */
const monthly = (lead: string, y: number, m: number, k: number, extra: Partial<LedgerRow> = {}) => {
  const d = new Date(Date.UTC(y, m - 1 + k, 10, 10));
  return row(lead, 'recurring', 99, d.toISOString(), extra);
};

console.log('── 1. THE MONTHLY LADDER STAYS: 30 / 40 / 50, NOT RETROACTIVE, RESETS IN UK TIME ──');
ok([1, 12].every((s) => monthlyTierRate(s) === 0.30) && [13, 24].every((s) => monthlyTierRate(s) === 0.40) && [25, 60].every((s) => monthlyTierRate(s) === 0.50), 'sales 1–12 = 30%, 13–24 = 40%, 25+ = 50%');
{
  const oct = Array.from({ length: 25 }, (_, i) => sale(`o${i + 1}`, `2026-10-${String(2 + Math.floor(i / 2)).padStart(2, '0')}T1${i % 2}:00:00Z`, i + 1));
  const lines = run(oct).lines;
  const first = (lead: string) => paysOf(lines, lead)[0];
  ok(first('o1').commission === 29.7 && first('o12').commission === 29.7, 'sales 1 and 12 earn £29.70 (30% of £99)');
  ok(first('o13').commission === 39.6 && first('o24').commission === 39.6, 'sales 13 and 24 earn £39.60 (40%)');
  ok(first('o25').commission === 49.5, 'sale 25 earns £49.50 (50%)');
  ok(oct.slice(0, 12).every((s) => first(s.lead_id!).rate === 0.3), 'NOT retroactive: sales 1–12 stay stamped at 30% after sale 13 and 25 land');
  const t11 = monthlyTracker(run(oct.slice(0, 11)).lines, '2026-10-20');
  const t12 = monthlyTracker(run(oct.slice(0, 12)).lines, '2026-10-20');
  ok(t11.counted === 11 && monthlyTrackerNextLine(t11) === '1 more sale to unlock 40%', '11 sales this month: "1 more sale to unlock 40%"');
  ok(t12.unlockedRate === 0.4 && monthlyTrackerNextLine(t12) === '40% unlocked · 12 more sales to unlock 50%', 'after unlocking: "40% unlocked · 12 more sales to unlock 50%"');
}
ok(londonMonthStart('2026-10-31T23:30:00Z') === '2026-10-01' && londonMonthStart('2026-11-01T00:30:00Z') === '2026-11-01', 'GMT: 31 Oct 23:30 UTC is October, 1 Nov 00:30 UTC is November');
ok(londonMonthStart('2026-09-30T23:30:00Z') === '2026-10-01' && londonMonthStart('2026-03-31T23:30:00Z') === '2026-04-01', 'BST: 23:30 UTC on the last day is already the 1st in London');
{
  const lines = run([sale('m1', '2026-10-30T10:00:00Z', 12), sale('m2', '2026-11-01T00:30:00Z', 1)]).lines;
  const nov = monthlyTracker(lines, '2026-11-05');
  ok(nov.counted === 1 && nov.nextSaleRate === 0.3, 'the count starts again on the 1st (UK time)');
}

console.log('── 2. TRAILING: 20% OF THE NEXT SIX SUCCESSFUL MONTHLY PAYMENTS ──');
ok(COMMISSION_RECURRING_COUNT === 6 && COMMISSION_RECURRING_RATE === 0.2, 'the rule: 20% × the next 6');
{
  const L = [sale('a', '2026-10-05T10:00:00Z', 1), ...Array.from({ length: 8 }, (_, i) => monthly('a', 2026, 10, i + 1))];
  const p = paysOf(run(L).lines, 'a');
  ok(p[0].paymentNumber === 1 && p[0].rate === 0.3, 'the initial payment is the first-payment commission, not one of the six');
  ok(p.slice(1, 7).every((l) => l.rate === 0.2 && l.commission === 19.8), 'monthly payments 1–6 each earn 20% (£19.80 on £99)');
  ok(p[7].rate === 0 && p[7].commission === 0 && p[7].label === 'Month 7', 'monthly payment 7 earns nothing');
  ok(p[8].commission === 0, '…nor does payment 8');
  ok(run(L).clients[0].commissionablePaymentsLeft === 0, 'nothing left to earn after six');
  ok(run(L.slice(0, 3)).clients[0].commissionablePaymentsLeft === 4, 'after two monthly payments, four are still to earn');
}
{
  const failed = monthly('b', 2026, 10, 1, { status: 'failed' });
  const L = [sale('b', '2026-10-05T10:00:00Z', 1), failed, monthly('b', 2026, 10, 2)];
  const p = paysOf(run(L).lines, 'b');
  ok(p.length === 2 && !p.some((l) => l.id === `pay:${failed.id}`), 'a failed payment earns nothing and is not listed as a payment');
  ok(p[1].label === 'Month 1' && p[1].commission === 19.8, '…and does not use up one of the six (the next successful one is month 1)');
}
{
  const m1 = monthly('c', 2026, 10, 1); const m2 = monthly('c', 2026, 10, 2);
  const refund = row('c', 'refund', 99, '2026-12-20T10:00:00Z', { stripe_payment_intent_id: m1.stripe_payment_intent_id, stripe_charge_id: m1.stripe_charge_id, stripe_invoice_id: null });
  const cb = row('c', 'chargeback', 99, '2026-12-21T10:00:00Z', { status: 'lost', stripe_payment_intent_id: m2.stripe_payment_intent_id, stripe_charge_id: m2.stripe_charge_id, stripe_invoice_id: null });
  const lines = run([sale('c', '2026-10-05T10:00:00Z', 1), m1, m2, refund, cb]).lines;
  const rev = lines.filter((l) => l.kind === 'reversal');
  const net = r2(lines.filter((l) => l.paymentNumber >= 2).reduce((s, l) => s + l.commission, 0));
  ok(rev.length === 2 && rev.every((l) => l.commission === -19.8), 'a refund and a lost chargeback each take back the £19.80');
  ok(net === 0, '…so refunded / charged-back monthly payments net to £0 commission');
  const s2 = sale('c2', '2026-10-05T10:00:00Z', 1);
  const open = row('c2', 'chargeback', 99, '2026-12-21T10:00:00Z', { status: 'needs_response', stripe_payment_intent_id: s2.stripe_payment_intent_id, stripe_charge_id: s2.stripe_charge_id });
  ok(run([s2, open]).lines.some((l) => l.held), 'an OPEN dispute holds the commission (released if won)');
}
ok(/No transition rule: on 2026-10-02 the ledger held one payment/.test(read('src/lib/commission.ts')), 'no transition rule — the live ledger had no recurring payment to re-rate (recorded in the rule)');

console.log('── 3. THE ENGAGEMENT END ──');
{
  const END = '2027-01-01T00:00:00.000Z';
  const L = [sale('e', '2026-10-05T10:00:00Z', 1), ...Array.from({ length: 6 }, (_, i) => monthly('e', 2026, 10, i + 1))]; // monthly 10 Nov … 10 Apr
  const ended = new Map([[REP, END]]);
  const before = run(L).lines; const after = run(L, ended).lines;
  const p = paysOf(after, 'e');
  ok(p[0].commission === 29.7 && p[1].commission === 19.8 && p[2].commission === 19.8, 'commission earned BEFORE the end stays (first payment, Nov and Dec monthly)');
  ok(p.slice(3).every((l) => l.commission === 0 && l.afterEngagementEnded && l.status === 'not_commissionable'), 'monthly payments received after the end earn nothing (shown as No commission)');
  ok(/after the engagement ended/.test(p[3].label), '…and say why on the payments table');
  ok(after.every((l) => l.sellerId === REP), 'attribution stays: every line is still theirs');
  const tB = earningsTotals(before.filter((l) => l.occurredAt < END), [], [], '2027-05-01');
  const tA = earningsTotals(after, [], [], '2027-05-01');
  ok(tA.earned === tB.earned && tA.earned === r2(29.7 + 2 * 19.8), 'total earned after the end = exactly what was earned before it (nothing clawed back)');
  const c = run(L.slice(0, 3), ended).clients[0];
  ok(c.commissionablePaymentsLeft === 0 && c.engagementEnded === true && c.sellerId === REP, 'nothing more projected for an ended seller; the client stays attributed');
  ok(paysOf(run(L, new Map([[OTHER, END]])).lines, 'e').slice(1).every((l) => l.commission === 19.8), "another seller's end changes nothing for this one");
  ok(!receivedAfterEngagement('2026-12-31T23:59:59Z', END) && receivedAfterEngagement(END, END) && !receivedAfterEngagement(END, null), 'the boundary: before the end earns, at/after does not; no end = engaged');
  ok(receivedAfterEngagement('2026-12-01T00:00:00Z', 'not a date'), 'an unreadable end date fails closed');
  const late = run([sale('e2', '2027-02-01T10:00:00Z', 1)], ended).lines[0];
  ok(late.commission === 29.7, 'a first payment is not affected by the end date (the rule is trailing commission only)');
}
{
  const team = [
    { user_id: 'a', status: 'active', disabled_at: null, is_book_owner: false },
    { user_id: 'b', status: 'disabled', disabled_at: '2027-01-01T00:00:00Z', is_book_owner: false },
    { user_id: 'c', status: 'disabled', disabled_at: null, is_book_owner: false },
    { user_id: 'd', status: 'disabled', disabled_at: '2027-01-01T00:00:00Z', is_book_owner: true },
    { user_id: 'e', status: null, disabled_at: null, is_book_owner: false },
  ];
  const ends = engagementEnds(team);
  ok(!ends.has('a') && !ends.has('e'), 'ACTIVE (and an unknown status) is engaged');
  ok(ends.get('b') === '2027-01-01T00:00:00Z', 'ENDED = status disabled; the end is disabled_at');
  ok(ends.get('c') === ENGAGEMENT_END_UNKNOWN, 'disabled with no date fails closed (no new trailing commission at all)');
  ok(!ends.has('d'), 'the book owner never has an engagement end (and never earns)');
}
{
  const loader = read('supabase/functions/_shared/earnings.ts');
  ok(/from\("team_members"\)\.select\("user_id, status, disabled_at, is_book_owner"\)/.test(loader) && /engagementEndedAt: ended/.test(loader), 'the loader reads the team status and passes the end dates');
  ok(/const sales = new Set\(\[\.\.\.roles\.filter\(\(r\) => r\.role === "sales"\)\.map\(\(r\) => r\.user_id\), \.\.\.ended\.keys\(\)\]\)/.test(loader), 'an ended salesperson (role removed by Disable) still counts as commissionable — their earned commission is not zeroed');
  ok(/for \(const a of admins\) sales\.delete\(a\)/.test(loader), 'the admin never earns');
  const users = read('supabase/functions/admin-users/index.ts');
  const dis = users.slice(users.indexOf("if (action === 'team_disable') {"), users.indexOf("const { error: iErr }"));
  ok(dis.indexOf("update({ status: 'disabled', disabled_at") > -1 && dis.indexOf("update({ status: 'disabled', disabled_at") < dis.indexOf("from('user_roles').delete()"), 'Disable writes the end BEFORE removing the role');
  ok(/if \(tErr\) return jsonResponse/.test(dis) && /cur\?\.status === 'disabled' && cur\?\.disabled_at/.test(dis), '…checks that write, and a second Disable keeps the first end date');
  ok(!/suspended_at/.test(loader), 'suspension is not an end (the loader never reads it)');
  const page = read('src/pages/SalesDashboard.tsx');
  ok(/m\.status === 'active' \|\| m\.status === 'disabled'/.test(page) && /\(ended\)/.test(page), 'the admin can still pick an ended salesperson on Sales');
}

console.log('── 4. THE SIX-MONTH FORECAST ──');
{
  const TODAY = '2026-12-05';
  const L = [sale('f1', '2026-10-05T10:00:00Z', 1), monthly('f1', 2026, 10, 1), sale('f2', '2026-12-02T10:00:00Z', 1)];
  const { lines, clients } = run(L);
  const fc = (over: Partial<ForecastClient> & { leadId: string }): ForecastClient => {
    const c = clients.find((x) => x.leadId === over.leadId)!;
    return { business: over.leadId, nextPaymentAt: null, paymentsLeft: c.commissionablePaymentsLeft, monthlyGbp: 99, live: true, ...over };
  };
  const F = commissionForecast(lines, [fc({ leadId: 'f1', nextPaymentAt: '2026-12-10T10:00:00Z' }), fc({ leadId: 'f2', nextPaymentAt: '2027-01-13T10:00:00Z' })], TODAY);
  ok(F.months.length === 6 && F.months[0].monthStart === '2026-12-01' && F.months[5].monthStart === '2027-05-01', 'this month + the next five calendar months');
  const dec = F.months[0];
  ok(dec.earnedNewSale === 29.7 && dec.earnedRecurring === 0 && dec.expected === 19.8, "this month: £29.70 collected (f2's sale) and £19.80 expected (f1 on the 10th)");
  ok(dec.items.filter((i) => i.state === 'earned').length === 1 && dec.items.filter((i) => i.state === 'expected').length === 1, '…each listed, collected kept apart from expected');
  ok(F.months.every((m) => m.total === r2(m.earnedNewSale + m.earnedRecurring + m.expected)), 'a month = collected + expected, never mixed');
  // f1: 1 paid, 5 left → Dec … Apr. f2: 6 left from Jan → Jan … May (Jun falls outside the window).
  ok(F.months.map((m) => m.expected).join(',') === '19.8,39.6,39.6,39.6,39.6,19.8', `expected per month from existing clients only (got ${F.months.map((m) => m.expected).join(',')})`);
  ok(F.expectedTotal === r2(19.8 * 10) && F.periodTotal === r2(29.7 + 19.8 * 10), 'expected over the six months £198.00; with this month\'s collected, £227.70');
  const none = commissionForecast([], [], TODAY);
  ok(none.expectedTotal === 0 && none.periodTotal === 0 && none.months.every((m) => m.items.length === 0), 'no sold clients → nothing expected (no hypothetical sales)');
  const passed = commissionForecast(lines, [fc({ leadId: 'f1', nextPaymentAt: '2026-12-01T10:00:00Z' })], TODAY);
  ok(passed.months[0].expected === 0 && passed.months[1].expected === 19.8, 'a billing date already passed without a payment is not expected');
  const past = commissionForecast(lines, [fc({ leadId: 'f1', nextPaymentAt: '2026-12-10T10:00:00Z', live: false })], TODAY);
  ok(past.expectedTotal === 0, 'a past-due / cancelled subscription expects nothing (a failed payment drops out)');
  const undated = commissionForecast(lines, [fc({ leadId: 'f1' })], TODAY);
  ok(undated.expectedTotal === 0 && undated.undated.length === 1 && undated.undated[0].amount === r2(5 * 19.8), 'no billing date yet → counted in no month, listed so nothing is hidden');
  const endedRun = run(L, new Map([[REP, '2026-12-03T00:00:00Z']]));
  const fe = commissionForecast(endedRun.lines, endedRun.clients.map((c) => ({ leadId: c.leadId, business: c.leadId, nextPaymentAt: '2026-12-10T10:00:00Z', paymentsLeft: c.commissionablePaymentsLeft, monthlyGbp: 99, live: true })), TODAY);
  ok(fe.expectedTotal === 0 && fe.months[0].earnedNewSale === 29.7, 'an ended seller: what they earned shows, nothing more is expected');
  const loader = read('supabase/functions/_shared/earnings.ts');
  ok(/const FORECAST_LIVE = new Set\(\["active", "trialing"\]\)/.test(loader) && /nextPaymentAt: l\?\.subscription_renews_at/.test(loader), "the loader expects only from active / trialing subscriptions, on Stripe's next billing date");
}

console.log('── 5. THE EXAMPLE: 20 SALES A MONTH AT £99 ──');
{
  /* Twenty sales every month for nine months; every client pays its £99 monthly from the month after. */
  const L: LedgerRow[] = [];
  for (let k = 0; k < 9; k++) {
    const y = 2027, m = 1 + k;
    for (let s = 1; s <= 20; s++) {
      const lead = `x${k}-${s}`;
      L.push(sale(lead, new Date(Date.UTC(y, m - 1, 2 + s, 10)).toISOString(), s));
      for (let j = 1; k + j < 9; j++) L.push(monthly(lead, y, m, j));
    }
  }
  const { lines } = run(L);
  const byMonth = (ms: string) => r2(lines.filter((l) => l.periodMonth === ms).reduce((s, l) => s + l.commission, 0));
  const firstPay = r2(lines.filter((l) => l.periodMonth === '2027-01-01' && l.paymentNumber === 1).reduce((s, l) => s + l.commission, 0));
  ok(firstPay === r2(12 * 29.7 + 8 * 39.6) && firstPay === 673.2, 'first-payment commission for 20 sales: 12 × £29.70 + 8 × £39.60 = £673.20');
  const cohort = r2(lines.filter((l) => l.periodMonth === '2027-02-01' && l.paymentNumber === 2).reduce((s, l) => s + l.commission, 0));
  ok(cohort === 396, 'one fully active cohort: 20 × £19.80 = £396 a month');
  const want = [673.2, 1069.2, 1465.2, 1861.2, 2257.2, 2653.2, 3049.2, 3049.2, 3049.2];
  const got = want.map((_, i) => byMonth(`2027-${String(i + 1).padStart(2, '0')}-01`));
  ok(JSON.stringify(got) === JSON.stringify(want), `month 1 £673.20 … month 6 £2,653.20, month 7 onward £3,049.20 (got ${got.join(', ')})`);
}

console.log('── 6. THE SALES PAGE ──');
{
  const page = read('src/pages/SalesDashboard.tsx');
  const card = read('src/components/salesDash/CommissionForecastCard.tsx');
  const ladder = read('src/components/salesDash/MonthlyLadder.tsx');
  const parts = read('src/components/salesDash/earningsParts.tsx');
  ok((page.match(/<CommissionForecastCard /g) ?? []).length === 1 && page.indexOf('<MonthlyLadder ') < page.indexOf('<CommissionForecastCard '), 'one forecast card, under the ladder');
  ok(/Total earned to date/.test(card) && /label="This month"/.test(card) && /Expected over \$\{FORECAST_MONTHS\} months/.test(card), 'it shows total earned to date, this month, and expected over the six months');
  ok(/forecast-month-collected/.test(card) && /forecast-month-expected/.test(card) && /forecast-month-detail/.test(card), 'each month shows collected and expected apart, and opens the clients behind it');
  ok(/not earned until they pay/.test(card) && /New sales are never guessed/.test(card), 'it says plainly that expected is not earned and no sales are guessed');
  ok(/forecast-engagement-ended/.test(card), 'an ended engagement says what it means');
  ok(/data-testid="ladder-next-line"/.test(ladder) && /text-lg font-semibold text-emerald-700/.test(ladder), 'the progress line is the headline of the ladder');
  ok(/data-testid="ladder-scheme"/.test(ladder) && /COMMISSION_RECURRING_COUNT/.test(ladder) && /zoneWords\(zones\)/.test(ladder), 'the scheme in one line, from the constants: 1–12 = 30% · 13–24 = 40% · 25+ = 50%, plus 20% of the next 6');
  ok(/of each of the next \{COMMISSION_RECURRING_COUNT\} successful monthly payments/.test(parts) && !/next 3|next three/i.test(parts + ladder + card), 'the explainer says six (from the constant); nothing still says three');
  const wn = read('src/lib/whatsNew.ts');
  ok(/id: '2026-10-02-commission-six-forecast'/.test(wn), "a What's New entry for this release");
}

console.log('── 7. FIND EMAIL → SET NEXT ACTION ──');
{
  const inbox = read('src/pages/Inbox.tsx');
  const editor = read('src/components/NextActionEditor.tsx');
  const dialog = read('src/components/LeadDetailDialog.tsx');
  const facts = read('src/components/ProspectFacts.tsx');
  ok(!/FindEmailButton/.test(inbox), 'the WhatsApp conversation header has no Find email');
  ok(/<NextActionEditor lead=\{activeLead\} variant="pill" \/>/.test(inbox), '…it has the one Next Action in its place');
  ok(/Set next action/.test(editor) && /\[v\.label, v\.when \?\? 'No date set', v\.time\]/.test(editor), '"+ Set next action", or the saved action itself ("Call · Tomorrow")');
  ok((editor.match(/saveNextAction\(/g) ?? []).length === 1 && /<NextActionForm compact/.test(editor), 'the same form and the one write — no second action system');
  ok(/perms\.enrichLeads && <FindEmailButton/.test(dialog) && /perms\.enrichLeads && <FindEmailButton/.test(facts), 'Find email is admin-only on the lead popup and the facts panel');
  ok(/href=\{`mailto:\$\{lead\.email\}`\}/.test(dialog) && /href=\{`mailto:\$\{lead\.email\}`\}/.test(facts), 'an email already on the lead still shows');
  ok(fs.existsSync(path.join(root, 'src/components/FindEmailButton.tsx')) && /email/.test(read('src/types/outreach.ts')), 'the email field and the admin tool are kept (UI change only)');
}

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURE(S)`);
process.exit(f === 0 ? 0 : 1);
