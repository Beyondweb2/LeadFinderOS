/* ============================================================
   F + H INTEGRATION (2026-10-05): the v3 sign-up decides the seller, and the attribution hold decides
   commission. docs/pre-sales-certification/v3-commercial-sales-production-release.md.
   1. The seller is the authorised CREATOR OF THE SIGN-UP the client paid through (paid_signup_id →
      sale_creations), never the owner at payment, never whoever opened the Stripe session.
   2. A manual payment is credited only when exactly ONE sign-up is on record; otherwise REVIEW.
   3. Commission reads the hold EXPLICITLY: open / not credited → nothing, not in any ladder; confirmed →
      normal rules with the original dates, joining the ladder only from its confirmation (locked places
      never re-rated, never owed into a month already paid).
   Run: npx tsx scripts/v3-sales-attribution-integration.test.ts
   ============================================================ */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { commissionLines, earningsTotals, type LedgerRow, type PayoutRow } from '../src/lib/commission.ts';
import { COMMERCIAL_TERMS_V3 } from '../src/lib/clientTimeline.ts';
import { firstPaymentPatch } from '../src/lib/paymentState.ts';

let failures = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) failures++; };
const ROOT = path.resolve(import.meta.dirname ?? __dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

const SELLER = 'sarah';
let n = 0;
const pay = (lead: string, kind: 'initial' | 'recurring', at: string, amount = 99, seller: string | null = SELLER): LedgerRow => {
  n += 1;
  return { id: `row-${String(n).padStart(4, '0')}`, lead_id: lead, kind, status: 'succeeded', amount_gbp: amount, occurred_at: at,
    stripe_object_id: `pi_${n}`, stripe_payment_intent_id: `pi_${n}`, stripe_charge_id: `ch_${n}`, stripe_invoice_id: kind === 'recurring' ? `in_${n}` : null,
    sold_by_user_id: seller };
};
type Att = Map<string, { status: string; resolvedAt: string | null }>;
const run = (ledger: LedgerRow[], approval: Record<string, string | null>, nowIso: string, attributionOf?: Att, payouts: PayoutRow[] = []) => commissionLines({
  ledger, payouts, isCommissionable: (u) => u === SELLER,
  termsOf: new Map(Object.entries(approval).map(([lead, d]) => [lead, { terms: COMMERCIAL_TERMS_V3, approvalDay: d }])),
  attributionOf, nowIso,
});

/* A November where the seller has 13 sales: H0 is the EARLIEST (the one under review) and X the LAST. Counted,
   X is the 13th sale (40%); without H0 it is the 12th (30%). */
const novemberSales = (heldSeller: string | null) => {
  const rows: LedgerRow[] = [pay('H0', 'initial', '2026-11-01T10:00:00Z', 99, heldSeller)];
  for (let i = 1; i <= 11; i++) rows.push(pay(`L${i}`, 'initial', `2026-11-${String(2 + i).padStart(2, '0')}T10:00:00Z`));
  rows.push(pay('X', 'initial', '2026-11-20T10:00:00Z'));
  return rows;
};
const approvals = (x: string | null, h0: string | null) => {
  const a: Record<string, string | null> = { H0: h0, X: x };
  for (let i = 1; i <= 11; i++) a[`L${i}`] = '2026-12-10';
  return a;
};
const lineOf = (lines: ReturnType<typeof run>['lines'], lead: string) => lines.find((l) => l.leadId === lead && l.kind === 'payment' && l.paymentNumber === 1)!;

console.log('── 1. OPEN review: no commission, in nobody\'s ladder ──');
{
  // While held the database stamps NO seller; the engine must hold even if a row carried one.
  const lines = run(novemberSales(SELLER), approvals(null, null), '2026-11-25T10:00:00Z', new Map([['H0', { status: 'open', resolvedAt: null }]])).lines;
  const h = lineOf(lines, 'H0'), x = lineOf(lines, 'X');
  ok(h.commission === 0 && h.status === 'not_commissionable' && h.sellerId === null, 'held sale: £0, not commissionable, no seller (even with a seller on the row)');
  ok(/attribution review open/.test(h.label), `held sale is labelled: "${h.label}"`);
  ok(x.monthSeq === 12 && x.rate === 0.30, `the held sale does not move the seller up the ladder (X = sale ${x.monthSeq}, ${x.rate * 100}%)`);
  const t = earningsTotals(lines.filter((l) => l.sellerId === SELLER), [], [], '2026-11-25');
  ok(!lines.some((l) => l.leadId === 'H0' && l.sellerId === SELLER), 'no line of the held sale is attributed to the claimed seller');
  ok(t.pending > 0 && t.earned === 0, 'the seller\'s other v3 sales stay pending as normal');
  const rec = run([...novemberSales(SELLER), pay('H0', 'recurring', '2027-01-01T10:00:00Z')], approvals(null, '2026-12-10'), '2027-01-02T10:00:00Z', new Map([['H0', { status: 'open', resolvedAt: null }]])).lines;
  ok(rec.filter((l) => l.leadId === 'H0').every((l) => l.commission === 0), 'a held sale\'s recurring £99 earns nothing either');
}

console.log('\n── 2. NOT CREDITED: no commission, ever ──');
{
  const lines = run(novemberSales(null), approvals('2026-12-22', '2026-12-10'), '2027-02-01T10:00:00Z', new Map([['H0', { status: 'not_credited', resolvedAt: '2026-11-26T10:00:00Z' }]])).lines;
  const h = lineOf(lines, 'H0'), x = lineOf(lines, 'X');
  ok(h.commission === 0 && h.sellerId === null && /not credited/.test(h.label), 'not credited: £0, no seller, labelled');
  ok(x.monthSeq === 12 && x.rate === 0.30, 'not credited: never in the ladder');
}

console.log('\n── 3. An unknown review status is HELD (never pay on a value nobody recognises) ──');
{
  const lines = run(novemberSales(SELLER), approvals(null, null), '2026-11-25T10:00:00Z', new Map([['H0', { status: 'mystery', resolvedAt: null }]])).lines;
  ok(lineOf(lines, 'H0').commission === 0 && lineOf(lines, 'X').monthSeq === 12, 'unknown status → held');
}

console.log('\n── 4. CONFIRMED before the Approval Date: normal rules, original dates ──');
{
  // Paul confirmed Sarah on 26 Nov; X is still pending (approval 22 Dec) → the confirmed sale counts for X.
  const att: Att = new Map([['H0', { status: 'confirmed', resolvedAt: '2026-11-26T10:00:00Z' }]]);
  const lines = run(novemberSales(SELLER), approvals('2026-12-22', '2026-12-08'), '2026-12-01T10:00:00Z', att).lines;
  const h = lineOf(lines, 'H0'), x = lineOf(lines, 'X');
  ok(h.sellerId === SELLER && h.monthSeq === 1 && h.rate === 0.30 && h.status === 'pending', `confirmed sale: Sarah's, sale 1 of November, 30%, pending (${h.status})`);
  ok(/seller confirmed after review 2026-11-26/.test(h.label), 'the confirmation is recorded on the line');
  ok(x.monthSeq === 13 && x.rate === 0.40, `a still-pending later sale is re-placed normally (X = sale ${x.monthSeq}, ${x.rate * 100}%)`);
  const later = run(novemberSales(SELLER), approvals('2026-12-22', '2026-12-08'), '2026-12-09T10:00:00Z', att).lines;
  ok(lineOf(later, 'H0').status === 'due' && lineOf(later, 'H0').periodMonth === '2026-12-01', 'confirmed before its own Approval Date → approved on it, owed in that month as normal');
}

console.log('\n── 5. CONFIRMED AFTER other sales were LOCKED: no cascade backwards ──');
{
  // X was approved on 22 Dec at place 12 (30%). Paul confirms H0 on 5 Jan. X must stay at 12 / 30%.
  const att: Att = new Map([['H0', { status: 'confirmed', resolvedAt: '2027-01-05T10:00:00Z' }]]);
  const decPaid: PayoutRow[] = [{ user_id: SELLER, period_month: '2026-12-01', amount_gbp: 100, paid_at: '2027-01-04T09:00:00Z' }];
  const lines = run(novemberSales(SELLER), approvals('2026-12-22', '2026-12-08'), '2027-01-10T10:00:00Z', att, decPaid).lines;
  const h = lineOf(lines, 'H0'), x = lineOf(lines, 'X');
  ok(x.monthSeq === 12 && x.rate === 0.30, `X keeps the place it was approved at (sale ${x.monthSeq}, ${x.rate * 100}%) — never re-rated`);
  ok(h.monthSeq === 1 && h.rate === 0.30, 'the reviewed sale takes its own place from its original date (sale 1, 30%)');
  ok(h.periodMonth === '2027-01-01' && h.status === 'due' && h.payoutDate === '2027-02-01', `the reviewed sale is owed in the CONFIRMATION month, not the already-paid December (${h.periodMonth}, ${h.status}, ${h.payoutDate})`);
  // Without the review at all (a sale that was never held), X would be 13th — proving the lock is what kept it.
  const never = run(novemberSales(SELLER), approvals('2026-12-22', '2026-12-08'), '2027-01-10T10:00:00Z').lines;
  ok(lineOf(never, 'X').monthSeq === 13, 'control: an unheld H0 would always have made X the 13th sale');
  // Same scenario seen BEFORE the confirmation: H0 held, X at 12 — identical to after. Nothing moved.
  const before = run(novemberSales(null), approvals('2026-12-22', '2026-12-08'), '2027-01-04T10:00:00Z', new Map([['H0', { status: 'open', resolvedAt: null }]]), decPaid).lines;
  ok(lineOf(before, 'X').commission === x.commission && lineOf(before, 'X').status === x.status, 'X\'s commission and status are identical before and after the late confirmation');
}

console.log('\n── 6. No review = exactly the engine as before ──');
{
  const same = novemberSales(SELLER);
  const a = run(same, approvals('2026-12-22', '2026-12-08'), '2027-01-10T10:00:00Z').lines;
  const b = run(same, approvals('2026-12-22', '2026-12-08'), '2027-01-10T10:00:00Z', new Map()).lines;
  ok(JSON.stringify(a) === JSON.stringify(b), 'an empty attribution map changes nothing');
}

console.log('\n── 7. The sign-up decides the seller: the database rule (migration 20261010130000) ──');
{
  const m = read('supabase/migrations/20261010130000_v3_signup_seller_attribution.sql');
  const decision = m.slice(m.indexOf('create or replace function public.sale_attribution_decision'), m.indexOf('-- ── the stamp'));
  const stamp = m.slice(m.indexOf('create or replace function public.trg_outreach_leads_sold_by'));
  ok(/add column if not exists paid_signup_id uuid/.test(m), 'outreach_leads.paid_signup_id (the paid sign-up)');
  ok(/if _lead\.paid_signup_id is not null then\s*\n\s*v_mode := 'paid_signup'/.test(decision), 'the PAID SIGN-UP is consulted first');
  ok(/coalesce\(s\.onboarding_id::text, 'event:' \|\| s\.event_id::text\) = v_key/.test(decision), 'the creators are those of THAT sign-up (sale_creations by onboarding id)');
  ok(/cardinality\(v_creators\), 0\) > 1 then\s*\n\s*v_reason := 'conflicting_creators'/.test(decision), 'two different creators of one sign-up → REVIEW (conflicting_creators)');
  ok(/s\.creator_role = 'admin' or s\.creator_ready is true/.test(decision), 'authorised = the admin, or Ready to Sell at a creation of that sign-up (unknown readiness never counts)');
  ok(/v_reason := 'creator_not_authorised'/.test(decision), 'a creator who was never authorised → REVIEW');
  ok(/elsif v_signups > 1 then\s*\n\s*v_reason := 'ambiguous_manual_payment'/.test(decision), 'manual payment with more than one sign-up → REVIEW (ambiguous_manual_payment)');
  ok(!/order by created_at desc limit 1;\s*\n\s*v_found/.test(decision) && !/most recent sign-up link made for this lead/.test(decision), 'manual payment never takes "the most recent sign-up link"');
  ok(/if v_owner_is_paul and v_latest_sales is null then/.test(decision), 'Paul\'s own sale ONLY when Paul (or nobody) owns it and no salesperson ever created a sign-up for it');
  ok(!/assigned_to_user_id\s*;/.test(decision.replace(/v_owner uuid := coalesce\(_lead\.assigned_to_user_id, _lead\.user_id\);/, '')), 'the owner is never the seller except as Paul\'s own sale');
  ok(/'conflicting_creators', 'ambiguous_manual_payment'/.test(m), 'the review accepts the two new reasons');
  ok(/if old\.paid_signup_id is not null then new\.paid_signup_id := old\.paid_signup_id; end if;/.test(stamp), 'the paid sign-up is write-once');
  ok(/if old\.sold_by_user_id is not null then\s*\n\s*new\.sold_by_user_id := old\.sold_by_user_id;/.test(stamp), 'a stamped seller never changes (reassignment, not-ready, disabled, later payments)');
  ok((m.match(/paid_checkout_session_id, paid_signup_id\n\s*on public\.outreach_leads/g) ?? []).length === 2, 'both H triggers fire on the paid sign-up too');
  ok(!/salesperson_ready_to_sell\(/.test(decision), 'readiness is the snapshot at creation — never re-read at payment (a rep going not-ready later cannot change it)');
  ok(!/team_members[^;]*status/.test(decision) && !/disabled/.test(decision), 'a rep being disabled later cannot change it');
}

console.log('\n── 8. The payment carries the sign-up; nothing sets a seller from the payment ──');
{
  const patch = firstPaymentPatch({ amountGbp: 99, paymentDay: '2026-11-01', paidFor: 'x', stripeCustomerId: null, stripePaymentIntentId: null, checkoutSessionId: 'cs_1', paidSignupId: '11111111-1111-4111-8111-111111111111' });
  ok(patch.paid_signup_id === '11111111-1111-4111-8111-111111111111' && patch.paid_checkout_session_id === 'cs_1', 'the first-payment patch writes the paid sign-up and session in the SAME update as the money');
  ok(!('sold_by_user_id' in patch), 'the payment patch never names a seller');
  const wh = read('supabase/functions/stripe-webhook/index.ts');
  ok(/paidSignupId: \/\^\[0-9a-f\]\{8\}[^\n]*\.test\(onboardingId\) \? onboardingId : null/.test(wh), 'the webhook passes the session\'s sign-up (uuid-shaped only)');
  ok(!/sold_by_user_id\s*:/.test(wh), 'the webhook never writes a seller');
  const co = read('supabase/functions/findable-checkout/index.ts');
  const gateAt = co.indexOf('checkoutAgreementGate({'), creatorAt = co.indexOf('metadata[signup_creator]'), createAt = co.indexOf('https://api.stripe.com/v1/checkout/sessions');
  ok(gateAt > 0 && creatorAt > gateAt && createAt > creatorAt, 'the session carries the sign-up creator (tracing), set after the v3 gate and before the session exists');
  ok(/metadata\[onboarding_id\]/.test(co) && /metadata\[agreement_acceptance_id\]/.test(co), 'session → sign-up → acceptance → creator are all on the Stripe object');
}

console.log('\n── 9. Every commission path reads the hold ──');
{
  const e = read('supabase/functions/_shared/earnings.ts');
  ok(/from\("sale_attribution_holds"\)/.test(e) && /attributionOf, nowIso/.test(e), 'loadEarnings (Earnings, Sales dashboard, Admin) passes the holds to the engine');
  ok(/code === "42P01" \|\| code === "PGRST205"\) return out;\s*\n\s*throw/.test(e), 'an unreadable hold FAILS CLOSED (only a missing view reads as none)');
  const pl = read('supabase/functions/_shared/payment-ledger.ts');
  ok(/loadAttributionHolds\(service, leadId\)/.test(pl) && /termsOf, attributionOf,/.test(pl), 'the money notice reads the hold — a held sale announces no commission');
  const c = read('src/lib/commission.ts');
  ok(/import \{ isAttributionHeld \} from '\.\/saleAttribution\.ts';/.test(c), 'commission.ts uses the ONE hold rule (saleAttribution.ts), not a copy');
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
