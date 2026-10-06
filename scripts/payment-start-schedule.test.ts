/* ============================================================
   PAYMENT START SCHEDULING (v3, Option B) — against a FAKE Stripe and a FAKE database. No real Stripe
   customer is touched. Proves: the subscription is created on a hold; the real Payment Start Date is set
   only when the contract produces one; never inside the Refund Window; only on OUR trialing v3
   subscription; with a stable Idempotency-Key; and recorded as confirmed only when Stripe's read-back
   agrees. Also: £29.99 is never set from here.
   Run: npx tsx scripts/payment-start-schedule.test.ts
   ============================================================ */
import { readFileSync } from 'node:fs';
import { planPaymentStart, schedulePaymentStart, OPTION_B_TIMING } from '../supabase/functions/_shared/client-terms.ts';
import { minimumTermCancelAt, paymentStartHoldIso } from '../supabase/functions/_shared/delayed-subscription.ts';
import { COMMERCIAL_TERMS_V3, PAYMENT_START_HOLD_DAYS, ukDayAtHourIso, type TimelineFacts } from '../src/lib/clientTimeline.ts';

let failures = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) failures++; };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const LEAD = '11111111-1111-4111-8111-111111111111';
const facts: TimelineFacts = {
  terms: COMMERCIAL_TERMS_V3, route: 'optimise', initialPaidAt: '2026-11-02T15:00:00Z', accessDate: '2026-11-09',
  resultsSentAt: '2026-12-07T10:30:00Z', guaranteeCeasedAt: null,
};
const sub = { id: 'sub_test', status: 'trialing', trial_end: 1_900_000_000, cancel_at: null, metadata: { lead_id: LEAD, payment_timing: OPTION_B_TIMING } };
const NOW = '2026-12-07T10:31:00Z';

console.log('── THE HOLD AT SIGN-UP ──');
{
  const hold = paymentStartHoldIso('2026-11-02T15:00:00Z')!;
  ok(Date.parse(hold) - Date.parse('2026-11-02T15:00:00Z') === PAYMENT_START_HOLD_DAYS * 86_400_000, 'the v3 subscription is created with its first charge a full hold away');
  const ds = read('supabase/functions/_shared/delayed-subscription.ts');
  ok(/timing === OPTION_B_TIMING \? paymentStartHoldIso\(signupAtIso\) : firstRecurringPaymentIso\(signupAtIso\)/.test(ds), 'v3 uses the hold; legacy keeps six weeks');
  ok(/"metadata\[payment_timing\]": OPTION_B_TIMING/.test(ds), 'the v3 subscription carries the option_b marker');
  const wh = read('supabase/functions/stripe-webhook/index.ts');
  ok(/v3Checkout && s\.metadata\?\.payment_timing === OPTION_B_TIMING \? OPTION_B_TIMING : "legacy"/.test(wh), 'the webhook creates the held subscription only for a v3 checkout');
}

console.log('\n── THE PLAN (pure) ──');
{
  const p = planPaymentStart(facts, LEAD, sub, NOW);
  ok(p.ok && p.day === '2026-12-22', 'results 7 Dec → Payment Start 22 Dec');
  if (p.ok) {
    ok(p.trialEndSec === Math.floor(Date.parse(ukDayAtHourIso('2026-12-22')) / 1000), 'trial_end is 10:00 UK on the Payment Start Date');
    ok(p.cancelAtSec === minimumTermCancelAt(p.trialEndSec, 5), 'cancel_at = after the 5th monthly (Optimise) — no £29.99 is ever set here');
    ok(p.idempotencyKey === `findable-payment-start-sub_test-${p.trialEndSec}`, 'a stable Idempotency-Key per subscription and date');
  }
  const refuse = (f: TimelineFacts, s: typeof sub | null, why: RegExp, m: string) => { const r = planPaymentStart(f, LEAD, s as never, NOW); ok(!r.ok && why.test(r.reason), m + (r.ok ? '' : ` — "${r.reason.slice(0, 70)}"`)); };
  refuse({ ...facts, resultsSentAt: null }, sub, /Refund Window/, 'no Results Date → refused (nothing to set)');
  refuse({ ...facts, terms: null }, sub, /not on the agreement-first/, 'a legacy client → refused');
  refuse({ ...facts, refundedAt: 'x' }, sub, /ended/, 'a refunded client → refused');
  refuse(facts, { ...sub, metadata: { lead_id: 'other', payment_timing: OPTION_B_TIMING } }, /does not belong/, 'another client\'s subscription → refused');
  refuse(facts, { ...sub, metadata: { lead_id: LEAD } as never }, /option_b/, 'a subscription made under the old timing → refused');
  refuse(facts, { ...sub, status: 'active' }, /not waiting/, 'a subscription already billing → refused');
  refuse(facts, null, /No Stripe subscription/, 'no subscription → refused');
  const late = planPaymentStart(facts, LEAD, sub, '2026-12-28T10:00:00Z');
  ok(late.ok && late.trialEndSec >= Math.floor(Date.parse('2026-12-28T10:00:00Z') / 1000) + 3600, 'set late (the date passed) → charged at the next safe moment, never back-dated');
}

/* ── a fake database + fake Stripe ── */
function fakeService(terms: Record<string, unknown>) {
  const writes: Array<{ table: string; patch: Record<string, unknown> }> = [];
  const events: string[] = [];
  const q = (table: string) => {
    const chain: Record<string, unknown> = {};
    const result = () => {
      if (table === 'client_service_terms') return { data: terms, error: null };
      if (table === 'outreach_leads') return { data: { id: LEAD, business_name: 'Test', email: 't@x', status: 'payment_received', service_terminated_at: null, contract_total_payments: 6, remeasure_results_sent_at: '2026-12-07T10:30:00Z', stripe_subscription_id: 'sub_test', payment_date: '2026-11-02' }, error: null };
      if (table === 'payment_ledger') return { data: [], error: null };
      return { data: null, error: null };
    };
    for (const m of ['select', 'eq', 'is', 'order', 'limit', 'in']) chain[m] = () => chain;
    chain.maybeSingle = async () => result();
    chain.then = (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res);
    chain.update = (patch: Record<string, unknown>) => { writes.push({ table, patch }); return chain; };
    chain.insert = async (row: Record<string, unknown>) => { if (table === 'client_service_events') events.push(String(row.kind)); return { error: null }; };
    return chain;
  };
  return { svc: { from: q }, writes, events };
}
const termsRow = { lead_id: LEAD, commercial_terms: COMMERCIAL_TERMS_V3, service_route: 'optimise', initial_paid_at: facts.initialPaidAt, access_date: facts.accessDate, guarantee_ceased_at: null, payment_start_date: null, payment_start_confirmed_at: null, continuing_decision: null, continuing_reminder_sent_at: null };

async function main() {
  console.log('\n── SCHEDULING AGAINST A FAKE STRIPE ──');
  {
    const { svc, writes, events } = fakeService(termsRow);
    const calls: Array<{ method: string; url: string; idem: string | null; body: string }> = [];
    let stored = { ...sub };
    const fetcher = async (url: string, init?: RequestInit) => {
      const h = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ method: init?.method ?? 'GET', url, idem: h['Idempotency-Key'] ?? null, body: String(init?.body ?? '') });
      if ((init?.method ?? 'GET') === 'POST') {
        const p = new URLSearchParams(String(init?.body));
        stored = { ...stored, trial_end: Number(p.get('trial_end')), cancel_at: Number(p.get('cancel_at')) };
      }
      return new Response(JSON.stringify(stored), { status: 200 });
    };
    const out = await schedulePaymentStart(svc, LEAD, 'paul', { fetcher, secret: 'sk_test_fake', nowIso: NOW });
    ok(out.kind === 'scheduled' && out.day === '2026-12-22', `scheduled for 22 Dec (got ${out.kind})`);
    const post = calls.find((c) => c.method === 'POST');
    ok(!!post && /trial_end=\d+/.test(post.body) && /proration_behavior=none/.test(post.body) && !!post.idem, 'one POST with trial_end, no proration and an Idempotency-Key');
    ok(calls.filter((c) => c.method === 'GET').length === 2, 'read before, and READ BACK after');
    ok(writes.some((w) => w.table === 'client_service_terms' && w.patch.payment_start_date === '2026-12-22' && !!w.patch.payment_start_confirmed_at), 'recorded as confirmed only after the read-back matched');
    ok(events.includes('payment_start_scheduled'), 'logged in the client history');
    ok(!/29\.99|2999/.test(post?.body ?? ''), 'no £29.99 price is ever sent');
    /* Idempotent: running again sends no second POST (Stripe already agrees). */
    calls.length = 0;
    const again = await schedulePaymentStart(svc, LEAD, 'paul', { fetcher, secret: 'sk_test_fake', nowIso: NOW });
    ok(again.kind === 'scheduled' && !calls.some((c) => c.method === 'POST'), 'scheduling the same day again writes nothing to Stripe');
  }
  {
    const { svc, writes } = fakeService(termsRow);
    const fetcher = async (_url: string, init?: RequestInit) => new Response(JSON.stringify({ ...sub, trial_end: (init?.method ?? 'GET') === 'POST' ? 1 : 1_900_000_000 }), { status: 200 });
    const out = await schedulePaymentStart(svc, LEAD, 'paul', { fetcher, secret: 'sk_test_fake', nowIso: NOW });
    ok(out.kind === 'failed' && /did not confirm/.test((out as { reason: string }).reason), 'Stripe read-back disagrees → FAILED, nothing recorded as confirmed');
    ok(!writes.some((w) => w.table === 'client_service_terms'), 'no confirmation written on a mismatch');
  }
  {
    const { svc } = fakeService({ ...termsRow, commercial_terms: 'something_else' });
    const out = await schedulePaymentStart(svc, LEAD, 'paul', { fetcher: async () => new Response(JSON.stringify(sub)), secret: 'sk', nowIso: NOW });
    ok(out.kind === 'refused', 'a non-v3 terms row is refused before any Stripe write');
  }
  if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
  console.log('\nAll payment-start checks passed.');
}
main().catch((e) => { console.error(e); process.exit(1); });
