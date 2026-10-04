/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PAYMENT + CLIENT STATE (pre-sales certification fix 03, 2026-10-04) —
   docs/pre-sales-certification/fixes-03-payment-client.md.

     1. REPLAY: the same checkout delivered 5× gives one money result; in_delivery / refunded / ended stay
        put; payment_date is never rewritten; the onboarding row never moves back.
     2. CONCURRENCY: the same checkout delivered concurrently creates ONE monthly subscription (the claim +
        Stripe's Idempotency-Key); a second checkout for the lead is refused; a closed client gets none.
     3. ENDED CLIENT: no re-measure, no monthly update, no future commission, no reactivation, no new
        agreement or first-contact chase, the historic £99 kept.
     4. ROUTE: Build with no website has no false website blockers; Optimise keeps its requirements; an
        onboarding edit does not wipe the Build consents; the Welcome Pack says the right thing per route.
     5. AGREEMENT: a paid / accepted route is locked; what they paid on outranks the link; the PDF is rebuilt
        from the stored, write-once record.
     6. FIRST CONTACT: Paul's step with a due date; recorded once; never for a closed client.
   Run: npx tsx scripts/payment-client-state.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { FakeDb } from './fake-supabase.ts';
import { establishLeadPayment, markOnboardingPaid } from '../supabase/functions/_shared/payment-state.ts';
import { recordLedger } from '../supabase/functions/_shared/payment-ledger.ts';
import { clientClosed, maySetSubscriptionStatus, mayEstablishPayment, paymentDayOf, subscriptionRefusal, stripeIdFillPatch } from '../src/lib/paymentState.ts';
import { commissionLines, type LedgerRow } from '../src/lib/commission.ts';
import { handoffReadiness, type HandoffEvidence, type HandoffLead, type HandoffOnboarding } from '../src/lib/handoffReadiness.ts';
import { deliveryStage, matchesFilter, type StageInput } from '../src/lib/deliveryStage.ts';
import { answersFromRecords, changedOnboardingPatch, consentsCleared, cleanAnswers, visibleAnswers } from '../src/lib/manualOnboarding.ts';
import { agreementRouteLock, maySetAgreementRoute, resolveAgreementRoute } from '../src/lib/agreementRoute.ts';
import { firstContact, firstContactDueDay, FIRST_CONTACT_SINCE } from '../src/lib/firstContact.ts';
import { AGREEMENT_KEY_POINTS } from '../src/lib/welcomePackHtml.ts';
import { recordFirstContact } from '../supabase/functions/_shared/client-setup.ts';

let failures = 0;
const ok = (c: boolean, l: string) => { if (!c) failures++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const root = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');

const LEAD = '1f000000-0000-4000-8000-000000000f01';
const OB = '2f000000-0000-4000-8000-000000000f01';
const facts = (over: Partial<Parameters<typeof establishLeadPayment>[2]> = {}) => ({
  amountGbp: 99, paymentDay: '2026-10-05', paidFor: 'Findable Build', stripeCustomerId: 'cus_F1', stripePaymentIntentId: 'pi_F1', ...over,
});
const dbWith = (lead: Record<string, unknown>, ob: Record<string, unknown> = { id: OB, status: 'answers_saved' }) => {
  const db = new FakeDb();
  db.table('outreach_leads').push({ id: LEAD, business_name: 'ZZ QA-F1', amount_paid: null, status: 'interested', payment_date: null, service_terminated_at: null, stripe_customer_id: null, stripe_payment_intent_id: null, stripe_subscription_id: null, subscription_claim: null, sold_by_user_id: null, ...lead });
  db.table('onboarding_responses').push({ ...ob });
  db.unique.payment_ledger = [['kind', 'stripe_object_id']];
  db.unique.notifications = [['user_id', 'dedupe_key']];
  return db;
};
const leadOf = (db: FakeDb) => db.table('outreach_leads')[0];

/* ═════════════════════════════════════════════════════════════════════════════════════════════ */
console.log('── 1. REPLAY: one money result, state never moves backwards ──');
{
  const db = dbWith({});
  const outcomes: string[] = [];
  for (let i = 0; i < 5; i++) {
    // later deliveries carry a later "day" — the write must still keep the first one
    const o = await establishLeadPayment(db, LEAD, facts({ paymentDay: `2026-10-0${5 + i}` }));
    outcomes.push(o.kind);
    await markOnboardingPaid(db, OB, new Date().toISOString());
    await recordLedger(db, { lead_id: LEAD, kind: 'initial', amount_gbp: 99, occurred_at: '2026-10-05T10:00:00Z', stripe_object_id: 'pi_F1', stripe_payment_intent_id: 'pi_F1' });
  }
  ok(outcomes.join(',') === 'first,replay,replay,replay,replay', `5 deliveries → exactly one establishes the payment (got ${outcomes.join(',')})`);
  ok(leadOf(db).status === 'payment_received' && leadOf(db).amount_paid === 99, 'the lead is paid once, £99');
  ok(leadOf(db).payment_date === '2026-10-05', `payment_date is the FIRST delivery's day, never rewritten (got ${leadOf(db).payment_date})`);
  ok(db.table('payment_ledger').length === 1, `one ledger row for five deliveries (got ${db.table('payment_ledger').length})`);
  ok(db.table('onboarding_responses')[0].status === 'paid', 'the onboarding row is paid');
  ok(leadOf(db).stripe_payment_intent_id === 'pi_F1' && leadOf(db).stripe_customer_id === 'cus_F1', 'the Stripe ids are filled');
}
{
  // concurrent first deliveries: one wins the conditional write
  const db = dbWith({});
  const res = await Promise.all([1, 2, 3].map(() => establishLeadPayment(db, LEAD, facts())));
  ok(res.filter((r) => r.kind === 'first').length === 1, 'three CONCURRENT first deliveries → exactly one "first" (the database decides, not a read)');
}
for (const [label, start] of [
  ['in_delivery', { status: 'in_delivery', amount_paid: 99, payment_date: '2026-09-20' }],
  ['refunded', { status: 'refunded', amount_paid: 99, payment_date: '2026-09-20', refunded_at: '2026-09-30T10:00:00Z' }],
  ['ended (Completed)', { status: 'payment_received', amount_paid: 99, payment_date: '2026-09-20', service_terminated_at: '2026-10-03T09:00:00Z', service_termination_reason: 'client_ended_early' }],
] as const) {
  const db = dbWith({ ...start, stripe_payment_intent_id: 'pi_OLD', stripe_customer_id: 'cus_OLD' }, { id: OB, status: label === 'refunded' ? 'refunded' : label.startsWith('ended') ? 'completed' : 'paid' });
  const before = JSON.stringify(leadOf(db));
  const obBefore = db.table('onboarding_responses')[0].status;
  let kinds = '';
  for (let i = 0; i < 5; i++) {
    kinds += (await establishLeadPayment(db, LEAD, facts({ paymentDay: '2026-10-04', stripePaymentIntentId: 'pi_REPLAY' }))).kind[0];
    await markOnboardingPaid(db, OB, new Date().toISOString());
  }
  ok(kinds === 'rrrrr', `${label}: 5 replays are all replays`);
  ok(JSON.stringify(leadOf(db)) === before, `${label}: status, amount, payment_date, end mark and the FIRST payment intent are byte-identical after 5 replays`);
  ok(db.table('onboarding_responses')[0].status === obBefore, `${label}: the onboarding row is not moved back to "paid" (stays ${obBefore})`);
}
{
  ok(!mayEstablishPayment(null), 'an unreadable lead is never treated as unpaid');
  ok(stripeIdFillPatch({ stripe_payment_intent_id: 'pi_A' }, { stripeCustomerId: 'cus_X', stripePaymentIntentId: 'pi_B' }).stripe_payment_intent_id === undefined,
    'a stored payment intent is never replaced (a later refund resolves by the FIRST payment)');
  ok(paymentDayOf(1791100800) === '2026-10-04' && paymentDayOf(undefined, Date.parse('2026-10-05T12:00:00Z')) === '2026-10-05', 'the payment day is the EVENT\'s day (UTC), the same on every re-delivery');
  const db = new FakeDb();
  let threw = false;
  try { await establishLeadPayment(db, LEAD, facts()); } catch { threw = true; }
  ok(threw, 'a lead that does not exist THROWS (money with nowhere to record it → 500 → Stripe retries)');
}
{
  const wh = read('supabase/functions/stripe-webhook/index.ts');
  const co = wh.slice(wh.indexOf('case "checkout.session.completed"'), wh.indexOf('case "invoice.paid"'));
  ok(!/status:\s*"payment_received",\s*\n?\s*amount_paid/.test(co), 'the checkout path no longer writes status/amount/date unconditionally');
  ok(/establishLeadPayment\(service, findableLeadId/.test(co) && /markOnboardingPaid\(service, onboardingId/.test(co), 'it writes them through the conditional writers (_shared/payment-state.ts)');
  ok(/paymentDay: paymentDayOf\(event\.created\)/.test(co), 'the payment day is the event\'s, so a replay names the same day');
  ok(/if \(firstPayment && findableLeadId\) \{\s*await sendFindablePaymentConfirmation/.test(co), 'the customer confirmation goes only from the delivery that established the payment');
  ok(/claimedEmail = !paidEmailAlreadySent && \(!findableLeadId \|\| ownsPayment\)/.test(co), 'the new-client email only for the payment this checkout made (never a replay for a closed client)');
  ok(/if \(findableLeadId && !closedBefore\) \{[\s\S]{0,300}recordCheckoutAcceptance/.test(co), 'no agreement acceptance or PDF for a closed client on a replay');
  ok(/closedBefore\s*\n?\s*\? \{ ok: true, skipped: `client \$\{closedBefore\}` \}\s*\n?\s*: await startPaidBaseline/.test(co), 'no baseline start for a closed client on a replay');
}

/* ═════════════════════════════════════════════════════════════════════════════════════════════ */
console.log('\n── 2. CONCURRENCY: one checkout → at most one monthly subscription ──');
{
  const env: Record<string, string> = { STRIPE_SECRET_KEY: 'sk_test_fixture', FINDABLE_STANDARD_MONTHLY_PRICE_ID: 'price_fixture' };
  (globalThis as unknown as { Deno: unknown }).Deno = { env: { get: (k: string) => env[k] } };
  const stripeSubs: Array<{ id: string; body: string }> = [];
  const keys = new Map<string, { inFlight: boolean; result?: { id: string; status: string } ; body: string }>();
  const posts: Array<{ key: string | null; body: string }> = [];
  (globalThis as unknown as { fetch: unknown }).fetch = async (url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) => {
    const u = String(url);
    const reply = (status: number, j: unknown) => new Response(JSON.stringify(j), { status });
    if (u.includes('/payment_methods')) return reply(200, { data: [{ id: 'pm_card' }] });
    if (u.includes('/prices/')) return reply(200, { unit_amount: 9900, recurring: { interval: 'month' } });
    if (u.endsWith('/subscriptions') && init.method === 'POST') {
      const key = init.headers?.['Idempotency-Key'] ?? null;
      posts.push({ key, body: init.body ?? '' });
      if (key) {
        const k = keys.get(key);
        if (k?.inFlight) return reply(409, { error: { type: 'idempotency_error', message: 'in progress' } });
        if (k?.result) return k.body === init.body ? reply(200, k.result) : reply(400, { error: { message: 'params differ' } });
        keys.set(key, { inFlight: true, body: init.body ?? '' });
      }
      await new Promise((r) => setTimeout(r, 15)); // Stripe takes a moment
      const sub = { id: `sub_${stripeSubs.length + 1}`, status: 'trialing' };
      stripeSubs.push({ id: sub.id, body: init.body ?? '' });
      if (key) keys.set(key, { inFlight: false, result: sub, body: init.body ?? '' });
      return reply(200, sub);
    }
    return reply(404, {});
  };
  const { createDelayedSubscription, subscriptionIdempotencyKey } = await import('../supabase/functions/_shared/delayed-subscription.ts');
  const lead = { id: LEAD, business_name: 'ZZ', stripe_customer_id: 'cus_F1', stripe_subscription_id: null, status: 'payment_received', service_terminated_at: null };
  const signup = '2026-10-05T10:00:00.000Z';

  const db = dbWith({ status: 'payment_received', amount_paid: 99, stripe_customer_id: 'cus_F1' });
  const [a, b] = await Promise.all([
    createDelayedSubscription(db, { ...lead }, signup, 'build', 'cs_F1'),
    createDelayedSubscription(db, { ...lead }, signup, 'build', 'cs_F1'),
  ]);
  ok(stripeSubs.length === 1, `two simultaneous deliveries of one checkout → ONE subscription in Stripe (got ${stripeSubs.length})`);
  ok([a.kind, b.kind].sort().join(',') === 'created,skipped', `one creates it, the other stands down (got ${a.kind}, ${b.kind})`);
  ok(posts.every((p) => p.key === subscriptionIdempotencyKey('cs_F1')), 'every create carries the checkout\'s Idempotency-Key');
  ok(new Set(posts.map((p) => p.body)).size === 1, 'every delivery sends identical parameters (the key would otherwise be refused)');
  ok(leadOf(db).subscription_claim === 'cs_F1' && leadOf(db).stripe_subscription_id === 'sub_1', 'the lead records the claim and the one subscription');

  // A retry of the SAME checkout after a crash (claim held, no id stored) gets the same subscription back.
  leadOf(db).stripe_subscription_id = null;
  const again = await createDelayedSubscription(db, { ...lead }, signup, 'build', 'cs_F1');
  ok(again.kind === 'created' && (again as { subscriptionId: string }).subscriptionId === 'sub_1' && stripeSubs.length === 1, 'a retry of the same checkout after a crash completes with the SAME subscription (none extra)');
  // A replay once stored: skipped before any Stripe call.
  const n = posts.length;
  const replay = await createDelayedSubscription(db, { ...lead, stripe_subscription_id: 'sub_1' }, signup, 'build', 'cs_F1');
  ok(replay.kind === 'skipped' && posts.length === n, 'a replay once the id is stored never reaches Stripe');
  // A DIFFERENT checkout for the same lead is refused by the claim.
  const other = await createDelayedSubscription(db, { ...lead }, signup, 'build', 'cs_OTHER');
  ok(other.kind === 'skipped' && /already|another checkout/.test((other as { reason: string }).reason) && stripeSubs.length === 1, 'a second checkout for the same client never makes a second subscription');

  // Closed clients: refused before any claim or Stripe call.
  for (const [label, st] of [['ended', { service_terminated_at: '2026-10-03T09:00:00Z' }], ['refunded', { status: 'refunded' }]] as const) {
    const cdb = dbWith({ status: 'payment_received', amount_paid: 99, ...st });
    const before = posts.length;
    const r = await createDelayedSubscription(cdb, { ...lead, ...st }, signup, 'build', 'cs_C');
    ok(r.kind === 'skipped' && posts.length === before && !leadOf(cdb).subscription_claim, `${label} client → no subscription, no claim, no Stripe call`);
  }
  // A claim that cannot be written (column not migrated) FAILS CLOSED.
  const broken = dbWith({ status: 'payment_received', amount_paid: 99 });
  const realFrom = broken.from.bind(broken);
  (broken as unknown as { from: unknown }).from = (t: string) => {
    const q = realFrom(t);
    if (t !== 'outreach_leads') return q;
    const upd = q.update.bind(q);
    (q as unknown as { update: unknown }).update = (p: Record<string, unknown>) => ('subscription_claim' in p ? { eq: () => ({ is: () => ({ is: () => ({ is: () => ({ or: () => ({ select: async () => ({ data: null, error: { message: 'column "subscription_claim" does not exist' } }) }) }) }) }) }) } : upd(p));
    return q;
  };
  const before = posts.length;
  const fc = await createDelayedSubscription(broken, { ...lead }, signup, 'build', 'cs_B');
  ok(fc.kind === 'failed' && posts.length === before, 'a claim that cannot be written creates NOTHING (fails closed; Paul is told by the PAID email)');
  ok(subscriptionRefusal({ status: 'payment_received' }) === null && subscriptionRefusal({ service_terminated_at: 'x' }) !== null, 'the refusal rule: open → may subscribe; ended → never');

  const wh = read('supabase/functions/stripe-webhook/index.ts');
  ok(/createDelayedSubscription\([\s\S]{0,500}paid\.route,\s*\n\s*s\.id,\s*\n\s*\)/.test(wh), 'the webhook passes the checkout session id as the claim key');
  ok(/new Date\(\(typeof event\.created === "number"[\s\S]{0,120}\.toISOString\(\),\s*\n\s*paid\.route/.test(wh), 'and the EVENT\'s time as the sign-up instant (identical parameters on every delivery)');
  ok(/if \(!ownsPayment\) \{[\s\S]{0,300}\} else if \(stripeCustomerId\)/.test(wh), 'no subscription attempt at all for a replay that does not own the payment');
  const mig = read('supabase/migrations/20261007030000_payment_client_state.sql');
  ok(/add column if not exists subscription_claim text/.test(mig) && /add column if not exists subscription_claimed_at timestamptz/.test(mig), 'the claim columns are in the migration');
}

/* ═════════════════════════════════════════════════════════════════════════════════════════════ */
console.log('\n── 3. ENDED CLIENT: nothing new starts, history is kept ──');
{
  const ended = { service_terminated_at: '2026-10-03T09:00:00Z', service_termination_reason: 'client_ended_early', status: 'payment_received', amount_paid: 99 };
  ok(clientClosed(ended) === 'ended' && clientClosed({ status: 'refunded' }) === 'refunded' && clientClosed({ status: 'payment_received' }) === null, 'closed = ended or refunded, positively');
  ok(!maySetSubscriptionStatus(ended, 'active') && !maySetSubscriptionStatus(ended, 'trialing'), 'a late invoice / subscription event never makes an ended client "active" again');
  ok(maySetSubscriptionStatus(ended, 'canceled') && maySetSubscriptionStatus(ended, 'past_due'), '…but stopping statuses are still recorded');
  ok(maySetSubscriptionStatus({ status: 'payment_received' }, 'active'), 'an open client is unaffected');

  const wh = read('supabase/functions/stripe-webhook/index.ts');
  const inv = wh.slice(wh.indexOf('case "invoice.paid"'), wh.indexOf('case "invoice.payment_failed"'));
  ok(/recordLedger\(/.test(inv) && /setFindableSubscription\(leadId, \{\s*subscription_status: "active"/.test(inv), 'invoice.paid still records the money (a fact) and asks to set active…');
  ok(/if \(!maySetSubscriptionStatus\(st as PaymentStateLead \| null, patch\.subscription_status\)\)/.test(wh), '…through the one guard that withholds a live status from a closed client');
  ok(/wrote === "closed" && paidMinorAfter > 0\) await alertPaymentAfterClose/.test(inv), 'and Paul is told (once per invoice) that money arrived after the end');

  // Commission: initial kept, recurring after the end → 0, nothing projected.
  const REP = 'rep-1';
  const row = (id: string, kind: string, amount: number, at: string, over: Partial<LedgerRow> = {}): LedgerRow => ({ id, lead_id: 'L', kind, status: 'succeeded', amount_gbp: amount, occurred_at: at, stripe_object_id: id, stripe_payment_intent_id: null, stripe_charge_id: null, stripe_invoice_id: id, sold_by_user_id: REP, commission_rate: 0.3, ...over });
  const ledger = [row('i', 'initial', 99, '2026-09-10T10:00:00Z'), row('r1', 'recurring', 99, '2026-10-01T10:00:00Z'), row('r2', 'recurring', 99, '2026-11-01T10:00:00Z')];
  const run = (state?: { endedAt: string | null; refunded: boolean }) => commissionLines({ ledger, payouts: [], isCommissionable: (u) => u === REP, ...(state ? { clientStateOf: new Map([['L', state]]) } : {}) });
  const open = run();
  const closed = run({ endedAt: '2026-10-15T09:00:00Z', refunded: false });
  const line = (r: ReturnType<typeof run>, id: string) => r.lines.find((l) => l.id === `pay:${id}`)!;
  ok(line(closed, 'i').commission === line(open, 'i').commission && line(closed, 'i').commission > 0, 'the historic initial commission is untouched by the end');
  ok(line(closed, 'r1').commission === line(open, 'r1').commission && line(closed, 'r1').commission > 0, 'a monthly received BEFORE the end keeps its commission');
  ok(line(closed, 'r2').commission === 0 && line(closed, 'r2').status === 'not_commissionable' && line(closed, 'r2').afterClientEnded === true, 'a monthly received AFTER the end earns 0% (listed, flagged)');
  ok(open.clients[0].commissionablePaymentsLeft > 0 && closed.clients[0].commissionablePaymentsLeft === 0 && closed.clients[0].clientClosed === true, 'an ended client projects no future commission');
  ok(run({ endedAt: null, refunded: true }).clients[0].commissionablePaymentsLeft === 0, 'a refunded client projects no future commission either');
  // QA / test lead recurring payments stay excluded.
  const test = commissionLines({ ledger: [row('ti', 'initial', 99, '2026-09-10T10:00:00Z', { commission_rule: 'test_excluded', commission_rate: 0 }), row('tr', 'recurring', 99, '2026-10-01T10:00:00Z')], payouts: [], isCommissionable: (u) => u === REP });
  ok(test.lines.every((l) => l.commission === 0) && test.clients[0].commissionablePaymentsLeft === 0, 'a test lead\'s monthly payments earn 0% like its initial (E-16)');
  const ldg = read('supabase/functions/_shared/payment-ledger.ts');
  const earn = read('supabase/functions/_shared/earnings.ts');
  ok(/clientStateOf: new Map\(\[\[leadId, \{ endedAt: L\?\.service_terminated_at/.test(ldg), 'the "commission earned" alert reads the client\'s end too');
  ok(/clientStateOf: new Map\(\[\.\.\.leads\]\.map/.test(earn) && /service_terminated_at, status"\)/.test(earn), 'the earnings loader passes every client\'s end and refund');

  // No re-measure, no results, no weekly checks: the existing gates (asserted, not assumed).
  const ab = read('supabase/functions/_shared/audit-baseline.ts');
  const fire = ab.slice(ab.indexOf('export async function fireDueRemeasures'), ab.indexOf('export async function fireDueRemeasures') + 1500);
  ok(/\.is\("service_terminated_at", null\)/.test(fire) && /\.neq\("status", "refunded"\)/.test(fire), 'the re-measure firer skips an ended or refunded client');
  ok(/service_terminated_at/.test(read('supabase/functions/_shared/remeasure-results.ts')), 'the results sender reads the end mark');

  // Monthly update: refused by the database for an ended or refunded client.
  const mig = read('supabase/migrations/20261007030000_payment_client_state.sql');
  for (const fn of ['monthly_update_save', 'monthly_update_mark_sent']) {
    const body = mig.slice(mig.indexOf(`create or replace function public.${fn}`), mig.indexOf('end $$;', mig.indexOf(`create or replace function public.${fn}`)));
    ok(/if ended_at is not null then return jsonb_build_object\('ok', false, 'error', 'service_ended'\)/.test(body) && /'refunded'\); end if;/.test(body), `${fn} refuses an ended or refunded client`);
  }
  ok(/service_ended:/.test(read('src/components/MonthlyUpdatePanel.tsx')), 'and the panel says why in words');

  // No new agreement, no new link, no new signature.
  const hub = read('supabase/functions/paid-client-hub/index.ts');
  ok(/if \(closed && \(action === "agreement_set_route" \|\| action === "agreement_send_link"\)\)/.test(hub), 'the hub refuses to set a route or send an agreement link for a closed client');
  ok(/if \(clientClosed\(ctx\.lead\)\) return html\(agreementPageHtml\(\{ mode: "not_ready"/.test(read('supabase/functions/client-agreement/index.ts')), 'the public agreement page takes no new signature from a closed client (a signed copy stays readable)');

  // The delivery stage: ended is Completed, with no next step — not even a first-contact chase.
  const s = deliveryStage(stageInput({ lead: { ...ended, payment_date: '2026-10-06', client_contacted_at: null } }));
  ok(s.stage === 'ended' && s.next.action === false && s.next.key === 'none', 'an ended client has no next step (no delivery work, no chase)');
  ok(!matchesFilter(s, 'attention'), 'and never sits in "Needs attention"');

  // First contact is refused for a closed client.
  const db = dbWith(ended);
  const r = await recordFirstContact(db, LEAD, 'paul', 'phone', null);
  ok(!r.ok && r.error === 'closed' && !leadOf(db).client_contacted_at, 'no first contact can be recorded on an ended client');
  // Replays: the £99 stays (covered in 1 — re-asserted here on a Ronnie-shaped fixture).
  const rdb = dbWith({ ...ended, amount_paid: 49.99, payment_date: '2026-08-17', status: 'payment_received' });
  await establishLeadPayment(rdb, LEAD, facts());
  ok(leadOf(rdb).amount_paid === 49.99 && leadOf(rdb).payment_date === '2026-08-17' && leadOf(rdb).status === 'payment_received' && leadOf(rdb).service_terminated_at === ended.service_terminated_at,
    'a Ronnie-shaped ended client: a replay keeps the historic amount, date, status and end mark');
}

/* ═════════════════════════════════════════════════════════════════════════════════════════════ */
function stageInput(over: { lead?: Record<string, unknown>; ob?: HandoffOnboarding | null; route?: 'build' | 'optimise' | null } = {}): StageInput {
  const lead = { business_name: 'ZZ QA-F1', phone: '07700900601', amount_paid: 99, status: 'payment_received', contract_total_payments: 12, ...(over.lead ?? {}) };
  const ob: HandoffOnboarding | null = over.ob === undefined ? { services_list: ['Rewiring'], areas_list: ['Halifax'], confirmed_location: 'Halifax', website_platform: 'no_website', plan_tier: 'new_site', website_addon: true, gbp_status: 'done', domain_status: 'new', dns_permission: true, materials_confirmed: true, authority_confirmed: true } : over.ob;
  const ev: HandoffEvidence = { crawl: false, crawlAgeDays: null, hookAudit: true, salesHandoff: { applies: 'not_needed_own_sale', complete: false, missing: 0 } };
  return {
    readiness: handoffReadiness(lead as HandoffLead, ob, ev), lead: lead as never, onboarding: { baseline_status: 'needs_questions' }, baselineAudit: null,
    discovery: { generated: false, started: false, finished: false }, route: over.route ?? 'build', today: '2026-10-06',
  };
}

console.log('\n── 4. ROUTE: Build needs no existing website; Optimise keeps its requirements ──');
{
  const ev: HandoffEvidence = { crawl: false, crawlAgeDays: null, hookAudit: false, salesHandoff: { applies: 'not_needed_own_sale', complete: false, missing: 0 } };
  const item = (r: ReturnType<typeof handoffReadiness>, k: string) => r.items.find((i) => i.key === k)!;
  // The B1 shape: Quick Close "No website" (website_platform) on a paid Build.
  const b1 = handoffReadiness({ business_name: 'ZZ QA-B1', phone: '07700900601', amount_paid: 99, status: 'payment_received', contract_total_payments: 12 },
    { services_list: ['Rewiring'], areas_list: ['Halifax'], confirmed_location: 'Halifax', website_platform: 'no_website', plan_tier: 'new_site', website_addon: true, gbp_status: 'done' }, ev);
  ok(!b1.missing.includes('Website') && !b1.missing.includes('Website access / control'), `Build with no website → neither false blocker (missing: ${b1.missing.join(', ') || 'none'})`);
  ok(item(b1, 'website').notNeeded === true && item(b1, 'website_access').notNeeded === true, 'both read "not needed" for Build');
  // Build with an old site and NO access answers at all.
  const b2 = handoffReadiness({ business_name: 'ZZ', phone: '07700900602', amount_paid: 99, status: 'payment_received', contract_total_payments: 12, website: 'https://oldsite.example' },
    { services_list: ['Rewiring'], areas_list: ['Halifax'], confirmed_location: 'Halifax', gbp_status: 'done' }, ev);
  ok(!b2.missing.includes('Website access / control') && !b2.missing.includes('Website') && /current site: oldsite\.example/.test(item(b2, 'website').detail), 'Build with an old site but no login → no website-access blocker (the old site is shown for reference)');
  // Quick Close kept the answer only in its record.
  const b3 = handoffReadiness({ business_name: 'ZZ', phone: '07700900603', amount_paid: 99, status: 'payment_received' },
    { services_list: ['x'], areas_list: ['y'], confirmed_location: 'y', gbp_status: 'done', quick_close: { answers: { manager: 'no_website' } } }, ev);
  ok(!b3.missing.includes('Website') && !b3.missing.includes('Website access / control'), 'route unknown, but Quick Close said "no website" → a positive "no site", no blockers');
  // Optimise keeps its requirements.
  const o1 = handoffReadiness({ business_name: 'ZZ', phone: '07700900604', amount_paid: 99, status: 'payment_received', contract_total_payments: 6 },
    { services_list: ['x'], areas_list: ['y'], confirmed_location: 'y', plan_tier: 'keep', website_addon: false, gbp_status: 'done' }, ev);
  ok(o1.missing.includes('Website') && o1.missing.includes('Website access / control'), 'Optimise with no site on file → Website AND access still required');
  const o2 = handoffReadiness({ business_name: 'ZZ', phone: '07700900605', amount_paid: 99, status: 'payment_received', contract_total_payments: 6, website: 'https://client.example' },
    { services_list: ['x'], areas_list: ['y'], confirmed_location: 'y', plan_tier: 'keep', website_addon: false, gbp_status: 'done' }, ev);
  ok(!o2.missing.includes('Website') && o2.missing.includes('Website access / control'), 'Optimise with a site but nobody known to control it → access still required');
  // Unknown route keeps the old, stricter rule.
  const u1 = handoffReadiness({ business_name: 'ZZ', phone: '07700900606', amount_paid: 99, status: 'payment_received' }, { services_list: ['x'], areas_list: ['y'], confirmed_location: 'y', gbp_status: 'done' }, ev);
  ok(u1.missing.includes('Website'), 'unknown route and no positive "no site" → still asks (absence is never an answer)');
}

console.log('\n── 4b. ONBOARDING EDIT DOES NOT WIPE THE BUILD CONSENTS (the B1 replay) ──');
{
  // The row Quick Close leaves on a paid Build with no website (quickClose.onboardingColumnsFor).
  const row = { status: 'paid', plan_tier: 'new_site', website_addon: true, website_platform: 'no_website', domain_status: 'new', authority_confirmed: true, dns_permission: true, materials_confirmed: true, confirmed_location: null, services: null, services_list: null, contact_email: 'owner@example.test' };
  const lead = { business_name: 'ZZ QA-B1', derived_town: 'Halifax', category: 'electrician', email: 'owner@example.test' };
  const opened = answersFromRecords(row, lead);
  ok(opened.agency_manages === 'no' && opened.self_site === 'none', `the form opens on "I haven't got a website" (got ${opened.agency_manages}/${opened.self_site})`);
  ok(opened.authority_confirmed && opened.dns_permission && opened.materials_confirmed, 'with the three consents shown as given');
  // Paul adds the services and the town — the routine "Fix in onboarding".
  const edited = visibleAnswers(cleanAnswers({ ...opened, services: ['Rewiring', 'Fuse boards'], confirmed_location: 'Halifax' }));
  const patch = changedOnboardingPatch(edited, row, 'paul', '2026-10-06T10:00:00Z');
  ok(!('authority_confirmed' in patch) && !('dns_permission' in patch) && !('materials_confirmed' in patch), 'the save does not touch the consents at all');
  ok(consentsCleared(row, patch).length === 0, 'nothing confirmed is cleared');
  ok(JSON.stringify(patch.services_list) === JSON.stringify(['Rewiring', 'Fuse boards']) && patch.confirmed_location === 'Halifax' && patch.incomplete === false, 'the services and town ARE saved, and the row is complete');
  ok(!('website_manager' in patch) && !('domain_status' in patch), 'unrelated site answers are not rewritten either');
  // Even the untouched form (nothing changed) writes only provenance.
  const none = changedOnboardingPatch(visibleAnswers(opened), row, 'paul', '2026-10-06T10:00:00Z');
  ok(Object.keys(none).sort().join(',') === 'business_name,confirmed_location,incomplete,operator_edited_at,operator_edited_by,updated_at',
    `an untouched save writes provenance only, plus what the form pre-filled from the lead (name, town): ${Object.keys(none).sort().join(',')}`);
  // owner_only (Quick Close "they run it, cannot give access") also maps back.
  const ownerOnly = answersFromRecords({ website_manager: 'owner_only', plan_tier: 'new_site', website_addon: true, business_website: 'https://old.example' }, null);
  ok(ownerOnly.agency_manages === 'no' && ownerOnly.self_site === 'rebuild', 'Quick Close owner_only + Build reads back as "rebuild"');
  // An EXPLICIT change to Optimise would take the consents away → detected, so the server asks.
  const toOptimise = visibleAnswers({ ...opened, self_site: 'access' });
  const p2 = changedOnboardingPatch(toOptimise, row, 'paul', '2026-10-06T10:00:00Z');
  ok(consentsCleared(row, p2).length === 3, 'an operator who explicitly switches the site answer is told the consents would go (the server refuses until confirmed)');
  const hub = read('supabase/functions/paid-client-hub/index.ts');
  ok(/changedOnboardingPatch\(answers, existing, user\.id, now\)/.test(hub) && /cleared\.length && body\.confirm_clear_consents !== true/.test(hub), 'save_onboarding uses the partial patch and refuses a consent-clearing save without confirmation');
  ok(/e\.code !== 'would_clear_consents'/.test(read('src/components/ManualOnboardingDialog.tsx')), 'the dialog asks Paul before confirming');
}

console.log('\n── 4c. WELCOME PACK SAYS THE RIGHT THING PER ROUTE ──');
{
  const b = AGREEMENT_KEY_POINTS.build.join(' '), o = AGREEMENT_KEY_POINTS.optimise.join(' '), u = AGREEMENT_KEY_POINTS.unknown.join(' ');
  ok(/We build, host and manage your new website/.test(b) && /We own the website and our work until your final payment/.test(b), 'Build: Findable builds, hosts and manages the new site and owns it until the final payment');
  ok(/12 payments/.test(b) && /6 payments/.test(o), 'each route names its own payment count');
  ok(/Your website is always yours\. We will never take it offline\./.test(o), 'Optimise: the client keeps their website; we never take it offline');
  ok(!/We own the website|take down the website|take the site down/i.test(o), 'Optimise: no ownership claim and no right to take their site down');
  ok(!/own the website|take|offline/i.test(u), 'unknown route: no ownership or take-down terms at all');
  ok([b, o, u].every((t) => t.includes('claim your £99 back within 14 days')), 'the guarantee line is the same on every route');
  const pack = read('src/lib/welcomePackHtml.ts');
  ok(/AGREEMENT_KEY_POINTS\[a\.route \?\? 'unknown'\]/.test(pack), 'the agreement page picks the list by the agreement\'s route');
  ok(/A new website, built and hosted by us\./.test(pack) && /Clearer pages on your own website\./.test(pack), '"What you get" names the new website for Build and their own site for Optimise');
  ok(/seoStyle: 'issues'/.test(pack), 'no SEO letter grade in a client\'s pack');
  ok(/route: resolveAgreementRoute\(linkRoute/.test(read('supabase/functions/_shared/welcome-pack-render.ts')), 'the pack\'s route is what they paid on, else the link');
}

/* ═════════════════════════════════════════════════════════════════════════════════════════════ */
console.log('\n── 5. AGREEMENT ROUTE INTEGRITY ──');
{
  const build = agreementRouteLock({ contractTotalPayments: 12, acceptances: [{ method: 'checkout', service_route: 'build' }] });
  ok(build.locked && build.route === 'build', 'paid on Build and accepted at checkout → locked to Build');
  ok(!maySetAgreementRoute(build, 'optimise').ok && maySetAgreementRoute(build, 'build').ok, 'switching a paid Build client to Optimise is refused; re-setting Build is fine');
  ok(/Stripe payment schedule/.test(build.reason ?? ''), 'the refusal names the Stripe step a real correction needs');
  ok(agreementRouteLock({ contractTotalPayments: 6, acceptances: [] }).route === 'optimise', 'a stamped contract alone locks it');
  ok(agreementRouteLock({ contractTotalPayments: null, acceptances: [{ method: 'agree_page', service_route: 'optimise' }] }).locked, 'an agreement-page signature alone locks it');
  const free = agreementRouteLock({ contractTotalPayments: null, acceptances: [] });
  ok(!free.locked && maySetAgreementRoute(free, 'build').ok && maySetAgreementRoute(free, 'optimise').ok, 'a legacy client with nothing binding can still be set');
  const conflict = agreementRouteLock({ contractTotalPayments: 12, acceptances: [{ method: 'agree_page', service_route: 'optimise' }] });
  ok(conflict.locked && conflict.route === null && !maySetAgreementRoute(conflict, 'build').ok && !maySetAgreementRoute(conflict, 'optimise').ok, 'records that disagree → nothing can be switched in the app');
  ok(resolveAgreementRoute('optimise', 12) === 'build' && resolveAgreementRoute('optimise', null) === 'optimise' && resolveAgreementRoute(null, null) === null, 'what they paid on outranks the link');
  const hub = read('supabase/functions/paid-client-hub/index.ts');
  ok(/const allowed = maySetAgreementRoute\(lock, route\);\s*\n\s*if \(!allowed\.ok\) return json\(\{ ok: false, error: "route_locked"/.test(hub), 'agreement_set_route goes through the lock (checkout acceptance included)');
  ok(!/from\("client_agreement_acceptances"\)\s*\.(insert|update|delete|upsert)/.test(hub), 'the hub never writes an acceptance (write-once; the DB trigger refuses update/delete)');
  ok(/const pdf = await agreementPdfForRow\(row\);/.test(hub), 'the signed PDF is rebuilt from the stored record');
  ok(/resolveAgreementRoute\(link\.service_route, lead\.contract_total_payments\)/.test(read('supabase/functions/client-agreement/index.ts')), 'the agreement page uses the same resolver');
  ok(/route_locked/.test(read('src/pages/ClientHub.tsx')), 'the client page disables the other route button when it is locked');
}

/* ═════════════════════════════════════════════════════════════════════════════════════════════ */
console.log('\n── 6. FIRST CONTACT AFTER PAYMENT IS PAUL\'S ──');
{
  ok(firstContactDueDay('2026-10-09') === '2026-10-13', 'paid Fri 9 Oct → due Tue 13 Oct (two working days, weekend skipped)');
  ok(firstContactDueDay('2026-12-24') === '2026-12-30', 'paid Thu 24 Dec → due Wed 30 Dec (Christmas, Boxing Day substitute and the weekend skipped)');
  ok(firstContactDueDay('not a day') === null, 'an unreadable day gives no date, never a guess');
  const owed = deliveryStage(stageInput({ lead: { payment_date: '2026-10-05', client_contacted_at: null } }));
  ok(owed.state === 'waiting_findable' && owed.next.key === 'contact_client' && owed.next.action, `a new client → WAITING FOR FINDABLE, Paul's action (got ${owed.state} / ${owed.next.label})`);
  ok(/Introduce yourself and send the setup link — by Wed 7 Oct/.test(owed.next.label), 'with the due date in the step');
  ok(matchesFilter(owed, 'attention'), 'it sits in "Needs attention"');
  const late = deliveryStage({ ...stageInput({ lead: { payment_date: '2026-10-05', client_contacted_at: null } }), today: '2026-10-09' });
  ok(late.firstContact.state === 'overdue' && /overdue since/.test(late.next.label), 'past the due day → overdue');
  const done = deliveryStage(stageInput({ lead: { payment_date: '2026-10-05', client_contacted_at: '2026-10-06T09:00:00Z' } }));
  ok(done.next.key !== 'contact_client' && done.firstContact.state === 'done', 'once recorded, the normal setup step takes over');
  const older = deliveryStage(stageInput({ lead: { payment_date: '2026-09-20', client_contacted_at: null } }));
  ok(older.firstContact.state === 'not_recorded_before' && older.next.key !== 'contact_client', `a client paid before ${FIRST_CONTACT_SINCE} is never chased retroactively`);
  ok(firstContact({ payment_date: null }, '2026-10-06').state === 'not_recorded_before', 'no payment day → not recorded (never "overdue")');
  const db = dbWith({ status: 'payment_received', amount_paid: 99, payment_date: '2026-10-05' });
  const r1 = await recordFirstContact(db, LEAD, 'paul', 'phone', 'Spoke to Sam');
  const r2 = await recordFirstContact(db, LEAD, 'paul', 'email', null);
  ok(r1.ok && !r1.already && r2.ok && r2.already && leadOf(db).client_contacted_via === 'phone', 'recorded once (the second press is "already")');
  ok(db.table('lead_activity').length === 1 && db.table('lead_activity')[0].kind === 'contact_logged', 'one History line, an existing kind (no constraint change)');
  ok(!(await recordFirstContact(db, LEAD, 'paul', 'carrier pigeon', null)).ok, 'an unknown channel is refused');
  const wh = read('supabase/functions/stripe-webhook/index.ts');
  ok(/if \(firstPayment && findableLeadId\) \{\s*try \{[\s\S]{0,1400}dedupe_key: `first_contact:\$\{findableLeadId\}`/.test(wh), 'Paul gets one actionable notification per new client, on the payment that made them a client');
  ok(/FIRST CONTACT IS YOURS/.test(read('src/lib/newClientEmail.ts')), 'and the new-client email says first whose move it is');
  const mig = read('supabase/migrations/20261007030000_payment_client_state.sql');
  ok(/add column if not exists client_contacted_at timestamptz/.test(mig) && /client_contacted_via in \('phone', 'email', 'whatsapp', 'other'\)/.test(mig), 'the first-contact columns are in the migration');
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
if (failures) process.exit(1);
