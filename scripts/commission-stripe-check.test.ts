/* STRIPE IS THE SOURCE OF TRUTH FOR COMMISSION (Paul, 2026-11-03, docs/commission-owed.md). The plan from what was charged, the daily check,
   the up-front rate on the row, totals to the penny, and no handover form. Fixtures only: nothing here talks to Stripe.
   Live proof of the database half: supabase/tests/commission-stripe-check.sql (a rolled-back transaction). */
import { existsSync, readFileSync } from 'node:fs';
import { commissionLines, DISPUTE_RELEASED, type LedgerRow } from '../src/lib/commission.ts';
import { COMMISSION_UPFRONT_RATE } from '../src/lib/commissionConfig.ts';
import { buildOwed, planMarkPaid, type LinePaymentRow } from '../src/lib/commissionOwed.ts';
import { invoiceRefs, planReconcile, stripeCheckWords, webhookProblems, REQUIRED_WEBHOOK_EVENTS, type ChargePlacement, type LedgerFact, type StripeChargeFact } from '../src/lib/commissionReconcile.ts';
import { salePlanFlagAtPayment, salePlanFromCharge } from '../src/lib/salePlan.ts';
import { paidClientRecord } from '../src/lib/paidClientRecord.ts';
import { handoffReadiness } from '../src/lib/handoffReadiness.ts';

let f = 0;
const ok = (c: unknown, l: string) => { if (!c) f++; console.log((c ? 'PASS ' : 'FAIL ') + l); };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

console.log('── 1. THE PLAN IS WHAT STRIPE CHARGED ──');
for (const [plan, amount] of [['complete', 99], ['complete_upfront', 999], ['full', 499], ['six', 99], ['twelve', 99]] as const) {
  ok(salePlanFromCharge({ metaPlan: plan, amountGbp: amount }) === plan && salePlanFlagAtPayment({ stripePlan: plan, pickedPlan: plan, amountGbp: amount }) === null, `${plan} at £${amount}: read as itself, no flag`);
}
ok(salePlanFromCharge({ metaPlan: 'complete', amountGbp: 999 }) === 'complete_upfront', 'the session says monthly but £999 was charged: up front');
ok(salePlanFromCharge({ metaPlan: 'six', amountGbp: 499 }) === 'full', 'the session says six but £499 was charged: pay in full');
ok(salePlanFromCharge({ metaPlan: null, amountGbp: 999 }) === 'complete_upfront', 'no plan on the session, £999: only one plan costs that');
ok(salePlanFromCharge({ metaPlan: null, amountGbp: 99 }) === null, 'no plan on the session, £99: several plans start there, so it is not guessed');
ok(salePlanFromCharge({ metaPlan: 'full', amountGbp: 99 }) === 'full', '£99 cannot overrule a session: it stays, and is flagged');
ok(salePlanFlagAtPayment({ stripePlan: 'full', pickedPlan: 'full', amountGbp: 99 }) === 'amount_differs', '...flagged amount_differs');
ok(salePlanFlagAtPayment({ stripePlan: 'complete', pickedPlan: 'complete', amountGbp: 999 }) === 'plan_differs', 'all said monthly, Stripe charged up front: flagged');
ok(salePlanFlagAtPayment({ stripePlan: 'six', pickedPlan: 'complete', amountGbp: 99 }) === 'plan_differs', 'the salesperson picked another plan: flagged');
const ledgerSrc = strip(read('supabase/functions/_shared/payment-ledger.ts'));
ok(/sale_plan: salePlanFromCharge\(\{ metaPlan: w\.stripe_plan, amountGbp: w\.amount_gbp \}\)/.test(ledgerSrc), 'the ledger stores what was charged, not only what the session said');

console.log('── 2. BOTH SHAPES OF A STRIPE INVOICE ──');
ok(JSON.stringify(invoiceRefs({ subscription: 'sub_1', payment_intent: 'pi_1', charge: 'ch_1' })) === JSON.stringify({ subscription: 'sub_1', paymentIntent: 'pi_1', charge: 'ch_1' }), 'the older shape');
ok(invoiceRefs({ parent: { subscription_details: { subscription: 'sub_2' } }, payments: { data: [{ payment: { payment_intent: 'pi_2', charge: 'ch_2' } }] } }).subscription === 'sub_2', 'the 2025 shape: subscription under parent');
ok(invoiceRefs({ payments: { data: [{ payment: { payment_intent: 'pi_2' } }] } }).paymentIntent === 'pi_2', 'the 2025 shape: payment intent under payments');
ok(invoiceRefs({}).subscription === null, 'nothing there is null, never a guess');
const hook = strip(read('supabase/functions/stripe-webhook/index.ts'));
ok(/case "invoice\.paid": \{\s+const inv = [^\n]+\n\s+const refs = invoiceRefs\(inv\);/.test(hook), 'invoice.paid reads both shapes');

console.log('── 3. THE DAILY CHECK ──');
const LEAD = 'lead-1'; const SINCE = '2026-09-04T00:00:00.000Z';
const charge = (o: Partial<StripeChargeFact> = {}): StripeChargeFact => ({ id: 'ch_1', paymentIntent: 'pi_1', invoice: null, customer: 'cus_1', amountGbp: 99, refundedGbp: 0, refundedAt: null, createdAt: '2026-11-01T10:00:00.000Z', currency: 'gbp', ...o });
const row = (o: Partial<LedgerFact> = {}): LedgerFact => ({ id: 'row-1', kind: 'initial', status: 'succeeded', amount_gbp: 99, lead_id: LEAD, occurred_at: '2026-11-01T10:00:00.000Z', stripe_object_id: 'pi_1', stripe_payment_intent_id: 'pi_1', stripe_charge_id: 'ch_1', stripe_invoice_id: null, stripe_customer_id: 'cus_1', payout_rule: 'plan_v1', sale_plan: 'complete', sale_plan_flag: null, commission_rule: 'monthly_tier_v1', ...o });
const placed = (o: Partial<ChargePlacement> = {}): ChargePlacement => ({ leadId: LEAD, findable: true, plan: 'complete', picked: 'complete', held: false, ...o });
const check = (i: { charges?: StripeChargeFact[]; disputes?: Parameters<typeof planReconcile>[0]['disputes']; ledger?: LedgerFact[]; place?: ChargePlacement; paid?: string[] }) => planReconcile({
  charges: i.charges ?? [], disputes: i.disputes ?? [], ledger: i.ledger ?? [], placeOf: () => i.place ?? placed(), paidLedgerIds: new Set(i.paid ?? []), sinceIso: SINCE,
});
{
  const clean = check({ charges: [charge()], ledger: [row()] });
  ok(clean.writes.length === 0 && clean.planFixes.length === 0 && clean.needsYou.length === 0, 'everything agrees: nothing to do');
  const missed = check({ charges: [charge()] });
  ok(missed.writes.length === 1 && missed.writes[0].kind === 'initial' && missed.writes[0].stripe_object_id === 'pi_1' && missed.writes[0].lead_id === LEAD && missed.writes[0].stripe_plan === 'complete', 'a missed first payment is written, under the webhook\'s own key, with its plan');
  const monthlyMissed = check({ charges: [charge({ id: 'ch_2', paymentIntent: 'pi_2', invoice: 'in_2' })], ledger: [row()] });
  ok(monthlyMissed.writes.some((w) => w.kind === 'recurring' && w.stripe_object_id === 'in_2'), 'a missed monthly is written, keyed by its invoice');
  const twice = check({ charges: [charge()], ledger: [row()] });
  ok(twice.writes.length === 0, 'a second run changes nothing: it is idempotent');
  const stranger = check({ charges: [charge()], place: placed({ leadId: null, findable: false }) });
  ok(stranger.writes.length === 0 && stranger.needsYou.length === 0 && stranger.notOurs === 1, 'a charge that is not ours is left alone, and counted');
  const lost = check({ charges: [charge()], place: placed({ leadId: null }) });
  ok(lost.writes.length === 0 && lost.needsYou[0]?.kind === 'charge_no_lead', 'a Findable charge with no paid lead is reported, never written');
  const held = check({ charges: [charge()], place: placed({ held: true }) });
  ok(held.writes.length === 0 && held.needsYou[0]?.kind === 'held_payment', 'a held payment (no signature) is not a sale: reported, never written');
  const wrong = check({ charges: [charge({ amountGbp: 120 })], ledger: [row()] });
  ok(wrong.writes.length === 0 && wrong.needsYou[0]?.kind === 'amount_differs', 'a different amount on a recorded payment is reported, never overwritten');
  const fill = check({ charges: [charge()], ledger: [row({ stripe_charge_id: null })] });
  ok(fill.writes.length === 1 && fill.writes[0].stripe_charge_id === 'ch_1' && fill.writes[0].amount_gbp === 99, 'a blank Stripe id is filled, so a later refund can tie to the payment');

  const partial = check({ charges: [charge({ refundedGbp: 20, refundedAt: '2026-11-02T10:00:00.000Z' })], ledger: [row()] });
  ok(partial.writes.length === 1 && partial.writes[0].kind === 'refund' && partial.writes[0].amount_gbp === 20 && partial.writes[0].stripe_object_id === 'ch_1' && partial.writes[0].occurred_at === '2026-11-02T10:00:00.000Z', 'a missed partial refund is written, keyed by the charge');
  const full = check({ charges: [charge({ refundedGbp: 99 })], ledger: [row(), row({ id: 'r', kind: 'refund', amount_gbp: 20, stripe_object_id: 'ch_1' })] });
  ok(full.writes.length === 1 && full.writes[0].amount_gbp === 99, 'a refund grown to full: the one row moves up');
  const failedRefund = check({ charges: [charge({ refundedGbp: 0 })], ledger: [row(), row({ id: 'r', kind: 'refund', amount_gbp: 20, stripe_object_id: 'ch_1' })] });
  ok(failedRefund.writes.length === 1 && failedRefund.writes[0].kind === 'refund' && failedRefund.writes[0].amount_gbp === 0, 'a refund that failed after it was issued: the row moves back down');
  const noisyRefund = check({ charges: [charge({ refundedGbp: 20 })], place: placed({ leadId: null, findable: false }) });
  ok(noisyRefund.writes.length === 0, 'a refund on a charge that is not ours is left alone');

  const dispute = { id: 'dp_1', charge: 'ch_1', paymentIntent: 'pi_1', status: 'needs_response', amountGbp: 99, createdAt: '2026-11-03T10:00:00.000Z', currency: 'gbp' };
  const opened = check({ charges: [charge()], disputes: [dispute], ledger: [row()] });
  ok(opened.writes.length === 1 && opened.writes[0].kind === 'chargeback' && opened.writes[0].status === 'needs_response' && opened.writes[0].lead_id === LEAD, 'a missed dispute is written, on the right lead');
  const disputeRow = row({ id: 'd', kind: 'chargeback', status: 'needs_response', stripe_object_id: 'dp_1' });
  ok(check({ charges: [charge()], disputes: [{ ...dispute, status: 'lost' }], ledger: [row(), disputeRow] }).writes[0]?.status === 'lost', 'a dispute lost: the row follows');
  ok(check({ charges: [charge()], disputes: [{ ...dispute, status: 'won' }], ledger: [row(), disputeRow] }).writes[0]?.status === 'won', 'a dispute won: the row follows');
  ok(check({ charges: [charge()], disputes: [dispute], ledger: [row(), disputeRow] }).writes.length === 0, 'no change in the dispute: nothing written');
  ok(DISPUTE_RELEASED.has('charge_refunded'), 'a dispute closed by a refund releases the hold: the refund row takes the money back, once');

  const fixUp = check({ charges: [charge({ amountGbp: 999 })], ledger: [row({ amount_gbp: 999, sale_plan: 'complete' })], place: placed({ plan: 'complete', picked: 'complete' }) });
  ok(fixUp.planFixes[0]?.to === 'complete_upfront' && fixUp.planFixes[0]?.flag === 'plan_differs', 'a sale recorded on the wrong plan: corrected from Stripe and flagged');
  const fixPaid = check({ charges: [charge({ amountGbp: 999 })], ledger: [row({ amount_gbp: 999, sale_plan: 'complete' })], paid: ['row-1'] });
  ok(fixPaid.planFixes.length === 0 && fixPaid.needsYou[0]?.kind === 'plan_paid_differs', '...but never once its commission has been paid: reported');
  const old = check({ charges: [charge({ amountGbp: 999 })], ledger: [row({ amount_gbp: 999, payout_rule: 'legacy', sale_plan: null })] });
  ok(old.planFixes.length === 0, 'an old sale keeps its record');

  const ghost = check({ ledger: [row()] });
  ok(ghost.needsYou[0]?.kind === 'not_in_stripe' && ghost.writes.length === 0, 'a recorded payment Stripe does not list is reported, never deleted');
  ok(check({ ledger: [row({ commission_rule: 'test_excluded' })] }).needsYou.length === 0, 'a test sale is expected to be absent');
  ok(check({ ledger: [row({ occurred_at: '2026-01-01T00:00:00.000Z' })] }).needsYou.length === 0, 'older than the window: not expected');

  const all = webhookProblems([{ url: 'https://x.supabase.co/functions/v1/stripe-webhook', status: 'enabled', enabled_events: [...REQUIRED_WEBHOOK_EVENTS] }]);
  ok(all.length === 0, 'every event on: no problem');
  const short = webhookProblems([{ url: 'https://x.supabase.co/functions/v1/stripe-webhook', status: 'enabled', enabled_events: ['invoice.paid'] }]);
  ok(short[0]?.kind === 'webhook_events_missing' && /charge\.refunded/.test(short[0].detail), 'a missing event is named');
  ok(webhookProblems([])[0]?.kind === 'webhook_not_found', 'no endpoint is reported');
  ok(webhookProblems([{ url: 'https://x/stripe-webhook', status: 'disabled', enabled_events: [...REQUIRED_WEBHOOK_EVENTS] }])[0]?.kind === 'webhook_events_missing', 'a disabled endpoint counts as sending nothing');

  const NOW = Date.parse('2026-11-03T12:00:00Z');
  const base = { finished_at: '2026-11-03T04:10:00Z', ok: true, fixed_count: 0, needs_you_count: 0 };
  ok(stripeCheckWords(base, NOW).tone === 'good', 'a clean run today reads good');
  ok(stripeCheckWords({ ...base, needs_you_count: 2 }, NOW).tone === 'attention', 'something to look at reads amber');
  ok(stripeCheckWords({ ...base, ok: false }, NOW).tone === 'problem', 'a failed run is never fine');
  ok(stripeCheckWords({ ...base, finished_at: '2026-11-01T04:10:00Z' }, NOW).tone === 'problem', 'a run that stopped happening is never fine');
  ok(stripeCheckWords(null, NOW).tone === 'problem', 'no run at all is never fine');
  ok(stripeCheckWords({ ...base, finished_at: 'garbage' }, NOW).tone === 'problem', 'an unreadable time is never fine');
}
{
  const fn = strip(read('supabase/functions/commission-stripe-check/index.ts'));
  ok(!/method: "POST"|method: 'POST'/.test(fn), 'Stripe is only read: the function makes no POST');
  ok(!/establishLeadPayment|amount_paid:/.test(fn), 'it writes no paid state');
  ok(/source: "reconcile"/.test(fn) && /recordLedger\(service/.test(fn), 'it writes through the one ledger writer');
  ok(!/\.delete\(/.test(fn), 'it deletes nothing');
  ok(!/billing_details|receipt_email/.test(fn), 'an email never places a charge on a lead');
  ok(/isInternalCall\(req\)/.test(fn), 'internal only');
  ok(!/console\.\w+\([^)]*STRIPE_SECRET_KEY/.test(fn), 'the key is never logged');
  ok(/\[functions\.commission-stripe-check\]\nverify_jwt = false/.test(read('supabase/config.toml')), 'config.toml entry in the same commit');
  const mig = read('supabase/migrations/20261206090000_commission_stripe_check.sql');
  ok(/cron\.schedule\('commission-stripe-check-daily', '10 4 \* \* \*'/.test(mig), 'scheduled daily');
  ok(/enable row level security/.test(mig) && /revoke all on public\.commission_stripe_checks from anon, authenticated/.test(mig), 'the log is closed to the browser');
  ok(!/\b(delete from|drop table|truncate)\b/i.test(mig), 'the migration removes nothing');
}

console.log('── 4. THE UP-FRONT RATE IS ON THE ROW ──');
{
  const mig = read('supabase/migrations/20261206090000_commission_stripe_check.sql');
  ok(mig.includes(`case when _plan = 'complete_upfront' then ${COMMISSION_UPFRONT_RATE.toFixed(2)} else null end`), 'public.commission_fixed_rate_for_plan mirrors the config');
  ok(/commission_rate = coalesce\(public\.commission_fixed_rate_for_plan\(r\.sale_plan\), public\.monthly_tier_rate\(v_seq\)\)/.test(mig), 'the stamp stores the fixed rate, and the seat in the month still counts');
  ok(/before update of sale_plan on public\.payment_ledger/.test(mig), 'a plan corrected later takes its rate with it');
  ok(/where kind = 'initial' and sale_plan = 'complete_upfront' and commission_rule = 'monthly_tier_v1'/.test(mig), 'the one backfill touches up-front sales only, and never a test row');
}

console.log('── 5. TOTALS MATCH THE LEDGER TO THE PENNY ──');
{
  const REP = 'rep-1'; const REP2 = 'rep-2'; let n = 0;
  const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
  const sale = (o: Partial<LedgerRow> = {}): LedgerRow => { n += 1; return { id: uuid(n), lead_id: `lead-${n}`, kind: 'initial', status: 'succeeded', amount_gbp: 99, occurred_at: '2026-11-05T10:00:00.000Z', stripe_object_id: `pi_${n}`, stripe_payment_intent_id: `pi_${n}`, stripe_charge_id: `ch_${n}`, stripe_invoice_id: null, sold_by_user_id: REP, commission_rule: 'monthly_tier_v1', commission_month_start: '2026-11-01', commission_month_seq: 1, commission_rate: 0.3, payout_rule: 'plan_v1', sale_plan: 'complete', commission_payable_on: '2026-11-20', ...o }; };
  const monthly = (s: LedgerRow, amount: number, at: string): LedgerRow => { n += 1; return { ...s, id: uuid(n), kind: 'recurring', amount_gbp: amount, occurred_at: at, stripe_object_id: `in_${n}`, stripe_invoice_id: `in_${n}`, stripe_payment_intent_id: `pi_r${n}`, stripe_charge_id: `ch_r${n}`, commission_rule: null, commission_rate: null, commission_payable_on: null }; };
  const refund = (s: LedgerRow, amount: number, at: string): LedgerRow => { n += 1; return { ...s, id: uuid(n), kind: 'refund', amount_gbp: amount, occurred_at: at, stripe_object_id: `ch_${n}` }; };

  /* Amounts worked out by hand, in pence, from the ledger below. */
  const a = sale({ sale_plan: 'complete' });                                                      // £99 at 30%: 2970p
  const b = sale({ amount_gbp: 999, sale_plan: 'complete_upfront', commission_month_seq: 2 });     // £999 at 30%: 29970p
  const c = sale({ amount_gbp: 499, sale_plan: 'full', commission_rate: 0.4, commission_month_seq: 13 }); // £499 at 40%: 19960p
  const d = sale({ sale_plan: 'twelve', sold_by_user_id: REP2 });                                  // £99 at 30%: 2970p
  const d1 = monthly(d, 49.99, '2026-10-30T10:00:00.000Z');                                        // £49.99 at 20%: 1000p (due 1 Nov)
  const e = sale({ commission_rate: 0.5, commission_month_seq: 25 });                              // £99 at 50%, £30 refunded: (99-30)*0.5 = 3450p
  const eR = refund(e, 30, '2026-11-08T10:00:00.000Z');
  const g = sale({ commission_payable_on: '2027-01-15' });                                         // £99 at 30%, not due yet: 2970p
  const h = sale({ commission_payable_on: null });                                                 // waiting: 2970p
  const ledger = [a, b, c, d, d1, e, eR, g, h];
  const lines = commissionLines({ ledger, payouts: [], isCommissionable: (u) => u === REP || u === REP2, nowIso: '2026-12-01T12:00:00.000Z' }).lines;
  const owed = (payments: LinePaymentRow[] = []) => {
    const paid = new Map<string, number>();
    for (const p of payments) paid.set(p.line_key, (paid.get(p.line_key) ?? 0) + p.amount_gbp);
    return buildOwed({ lines: commissionLines({ ledger, payouts: [], isCommissionable: (u) => u === REP || u === REP2, paidByLine: paid, nowIso: '2026-12-01T12:00:00.000Z' }).lines, payments, businessOf: (i) => i, planOf: () => 'complete', today: '2026-12-01' });
  };
  const pence = (x: number) => Math.round(x * 100);
  const v = owed();
  const repNow = 2970 + 29970 + 19960 + 3450; const rep2Now = 2970 + 1000;
  ok(lines.find((l) => l.id === `pay:${b.id}`)?.commission === 299.7, 'up front: £299.70');
  ok(pence(v.totalOwedNow) === repNow + rep2Now, `the total is the ledger's, to the penny (${repNow + rep2Now}p)`);
  ok(pence(v.people.find((p) => p.sellerId === REP)!.owedNow) === repNow, 'one person, to the penny');
  ok(pence(v.people.find((p) => p.sellerId === REP2)!.owedNow) === rep2Now, 'the other person, to the penny');
  ok(pence(v.people.find((p) => p.sellerId === REP)!.comingSoon) === 2970, 'coming, to the penny');
  ok(pence(v.people.find((p) => p.sellerId === REP)!.waiting) === 2970, 'waiting, to the penny');
  ok(v.people.reduce((s, p) => s + pence(p.owedNow), 0) === pence(v.totalOwedNow), 'the people add up to the big number exactly');
  ok(v.next.filter((i) => i.bucket === 'now').reduce((s, i) => s + pence(i.amount), 0) === pence(v.totalOwedNow), 'the lines add up to the big number exactly');
  /* Paying a person takes exactly that much off, and it shows as paid. */
  const plan = planMarkPaid(v, { person: REP2, expectedTotal: rep2Now / 100 });
  ok(plan.ok && pence(plan.total) === rep2Now, 'Mark as paid settles exactly what was shown');
  const rows: LinePaymentRow[] = plan.ok ? plan.items.flatMap((i) => i.parts.map((p) => ({ id: `p-${p.lineId}`, batch_id: 'b', line_key: p.lineId, part: p.part, user_id: REP2, lead_id: i.leadId, amount_gbp: p.amount, business_name: i.business, plan: i.plan, label: i.label, rate: i.rate, client_amount_gbp: i.clientAmount, collected_at: i.collectedAt, payable_on: i.payableOn, paid_at: '2026-12-01T12:00:00.000Z', paid_by: 'admin' }))) : [];
  const after = owed(rows);
  ok(pence(after.totalOwedNow) === repNow, 'afterwards the total falls by exactly that');
  ok(pence(after.people.find((p) => p.sellerId === REP2)!.paidSoFar) === rep2Now, 'and it shows as paid so far, to the penny');
  /* Twelve sales of £49.99 × 20%: the sum of rounded lines, never a rounded sum. */
  const many = Array.from({ length: 12 }, () => { const s = sale({ sale_plan: 'twelve', commission_payable_on: '2026-11-20' }); return [s, monthly(s, 49.99, '2026-10-30T10:00:00.000Z')]; }).flat();
  const mv = buildOwed({ lines: commissionLines({ ledger: many, payouts: [], isCommissionable: (u) => u === REP, nowIso: '2026-12-01T12:00:00.000Z' }).lines, payments: [], businessOf: (i) => i, planOf: () => 'twelve', today: '2026-12-01' });
  ok(pence(mv.totalOwedNow) === 12 * (2970 + 1000), 'many small lines add up with no drift');
}

console.log('── 6. THE SCREEN ──');
{
  const scr = read('src/components/admin/CommissionOwed.tsx');
  for (const [needle, what] of [['data-testid="owed-total"', 'total owed now'], ['Owed now', 'per person: owed now'], ['Coming soon', 'per person: coming'], ['Paid so far', 'per person: paid so far'], ['Next payments', 'next payments'], ['data-testid="owed-countdown"', 'countdowns'], ['Waiting for four-week audit', 'the waiting list'], ['Held for a dispute', 'the dispute list'], ['data-testid="mark-person-paid"', 'Mark as paid, per person'], ['data-testid="mark-line-paid"', 'Mark as paid, per line'], ['data-testid="paid-history"', 'paid history'], ['<StripeCheckLine', 'the Stripe check line']] as const) {
    ok(scr.includes(needle), `Commission owed shows ${what}`);
  }
  ok(/href=\{`tel:\$\{r\.phone\}`\}/.test(scr) && /href=\{`mailto:\$\{r\.email\}`\}/.test(scr), 'New paid clients shows phone and email, one tap away');
  ok(!/Handoff complete|handoff-missing-chip/.test(scr), 'and no handoff chip');
  const fn = read('supabase/functions/sales-earnings/index.ts');
  ok(/actor\.role === "sales"\) return json\(\{ ok: true, \.\.\.owed, history, names: \{\}, new_paid_clients: \[\]/.test(fn), 'a salesperson never receives the client list or the Stripe check');
}

console.log('── 7. NO HANDOVER FORM ──');
{
  ok(!existsSync(new URL('../src/components/SalesHandoffForm.tsx', import.meta.url)), 'the form is deleted');
  const close = read('src/components/QuickCloseDialog.tsx');
  ok(!/SalesHandoffForm|qc-handoff|sendToPaul|Send to Paul|send the handoff|submit_delivery|Handoff for Paul/.test(close), 'Quick Close has no handover step, no Send to Paul, no Submit for delivery');
  ok(/Paid: your part is done\./.test(close), 'paid means done');
  ok(/v\.state === 'paid' && v\.closed !== 'client_closed' && v\.info_request && v\.client_info/.test(close), 'after payment a salesperson is asked for something only when Paul asked');
  const list = read('src/components/salesDash/MyHandoffs.tsx');
  ok(/filter\(\(s\) => !!s\.info_request\)/.test(list) && !/Finish the handoff/.test(list), 'the Sales page lists Paul\'s requests only');
  const card = read('src/components/ClientSetupCard.tsx');
  ok(!/SalesHandoffForm|Fill it in/.test(card), 'Paul\'s client page has no form either');
  const r = handoffReadiness({ business_name: 'B', amount_paid: 99, status: 'payment_received', phone: '07700900123' } as never, null, { crawl: true, crawlAgeDays: 1, hookAudit: true } as never);
  ok(!r.items.some((i) => (i.key as string) === 'sales_handoff'), 'the setup checklist does not wait for one');
  ok(!/sales_handoff/.test(read('src/lib/deliveryStage.ts')), 'no delivery step waits for one');
  ok(!/Sales handoff:/.test(read('src/lib/newClientEmail.ts')), 'Paul\'s new-client email does not mention one');

  const rec = paidClientRecord({
    lead: { phone: '07700 900111', email: 'lead@example.test', contact_name: 'Sam', website: 'old.example', address: '1 High St', services_included: ['Boilers'], service_areas: ['Leeds'], website_control: 'agency_controls', website_control_note: 'contract ends Nov',
      sales_handoff: { promised: 'A logo', notes_for_paul: 'Rings after 5' } },
    onboarding: { confirmed_phone: '07700 900222', contact_email: 'client@example.test', quick_close: { answers: { manager: 'agency', agency_contract: 'free' }, call: { jobs: 'emergency call-outs', areas: 'Ossett' } } },
    activity: [{ kind: 'note', body: 'Promised a call Friday', created_at: '2026-11-01T10:00:00Z' }, { kind: 'call_outcome', body: 'Wants it live by March', created_at: '2026-11-02T10:00:00Z' }, { kind: 'note', body: '  ', created_at: '2026-11-03T10:00:00Z' }, { kind: 'status_changed', body: 'not typed', created_at: '2026-11-03T10:00:00Z' }],
  });
  ok(rec.phone === '07700 900222' && rec.email === 'client@example.test', 'the client\'s own phone and email rank first');
  ok(rec.contactName === 'Sam' && rec.website === 'old.example', 'then what Sales typed');
  const text = rec.lines.map((l) => `${l.label}: ${l.value}`).join('\n');
  for (const needle of ['Services: Boilers', 'Areas: Leeds', 'Address: 1 High St', 'contract ends Nov', 'emergency call-outs', 'Ossett', 'A logo', 'Rings after 5']) ok(text.includes(needle), `everything typed reaches Paul: ${needle}`);
  ok(rec.notes.map((n) => n.text).join('|') === 'Wants it live by March|Promised a call Friday', 'notes newest first, only what a person typed');
  ok(paidClientRecord({ lead: {}, onboarding: null, activity: [] }).phone === null, 'nothing known is null, never invented');
}

console.log(f ? `\n${f} FAILED` : '\nALL PASS');
process.exit(f ? 1 : 0);
