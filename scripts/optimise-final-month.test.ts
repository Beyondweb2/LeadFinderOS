/* ════════════════════════════════════════════════════════════════════════════════════════════════
   v4 OPTIMISE — THE SIXTH PAYMENT, THE FINAL MONTH AND THE END, against a FAKE Stripe and a FAKE database
   (Paul, 2026-10-06; agreement clauses 9B.1–9B.3). No real Stripe object is touched.

   PAYMENT 6 SUCCEEDS → no further charge → the service runs one final month → it ends automatically on the
   Optimise End Date = one calendar month after the day payment 6 ACTUALLY succeeded (month-end clamped).

   The fake Stripe models what matters for "no payment 7": an invoice is generated at trial_end and at each
   monthly boundary strictly before cancel_at; while pause_collection is "void" it is voided at creation and
   never charged. Run: npx tsx scripts/optimise-final-month.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { finaliseFixedTerm, planFixedTermEnd, FIXED_TERM_EVENT, OPTION_B_TIMING } from '../supabase/functions/_shared/client-terms.ts';
import { minimumTermCancelAt, subscriptionEndedByTerm } from '../supabase/functions/_shared/delayed-subscription.ts';
import { COMMERCIAL_TERMS_V3, COMMERCIAL_TERMS_V4, addMonthsClamped, minimumTerm, serviceEndedOn, timelineView, ukDay, ukDayAtHourIso, type TimelineFacts } from '../src/lib/clientTimeline.ts';
import { FINDABLE_MONTHLY_GBP, paymentPlanCompleteEmail, recurringPaymentsFor, termCompleteEmail } from '../src/lib/findableOffer.ts';

let failures = 0;
const ok = (c: unknown, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) failures++; };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const dayOf = (s: number) => ukDay(new Date(s * 1000).toISOString())!;

const LEAD = '22222222-2222-4222-8222-222222222222';

/** The five monthly payments' DUE days for a Payment Start Date (Stripe's month-clamped boundaries). */
function dueDays(startDay: string): string[] {
  const t = sec(ukDayAtHourIso(startDay));
  return [t, ...[1, 2, 3, 4].map((k) => minimumTermCancelAt(t, k))].map(dayOf);
}

/* ── a fake Stripe that bills ── */
interface FakeSub { id: string; status: string; trial_end: number; cancel_at: number; pause_collection: { behavior: string } | null; metadata: Record<string, string> }
function fakeStripe(sub: FakeSub) {
  const calls: Array<{ method: string; body: string; idem: string | null }> = [];
  let stored: FakeSub = JSON.parse(JSON.stringify(sub));
  let readBackOverride: Partial<FakeSub> | null = null;
  const fetcher = async (_url: string, init?: RequestInit) => {
    const h = (init?.headers ?? {}) as Record<string, string>;
    const method = init?.method ?? 'GET';
    calls.push({ method, body: String(init?.body ?? ''), idem: h['Idempotency-Key'] ?? null });
    if (method === 'POST') {
      const p = new URLSearchParams(String(init?.body));
      stored = {
        ...stored,
        ...(p.get('cancel_at') ? { cancel_at: Number(p.get('cancel_at')) } : {}),
        ...(p.get('pause_collection[behavior]') ? { pause_collection: { behavior: p.get('pause_collection[behavior]')! } } : {}),
        metadata: { ...stored.metadata, ...Object.fromEntries([...p.entries()].filter(([k]) => k.startsWith('metadata[')).map(([k, v]) => [k.slice(9, -1), v])) },
      };
      return new Response(JSON.stringify(stored), { status: 200 });
    }
    return new Response(JSON.stringify({ ...stored, ...(readBackOverride ?? {}) }), { status: 200 });
  };
  /** Stripe's billing, modelled: charges taken at trial_end and every monthly boundary BEFORE cancel_at. An
   *  invoice created after `pausedFromSec` (when the final payment was finalised) is voided — never charged. */
  const charges = (pausedFromSec: number | null) => {
    const out: Array<{ day: string; charged: boolean }> = [];
    for (let k = 0; k < 14; k++) {
      const at = k === 0 ? stored.trial_end : minimumTermCancelAt(stored.trial_end, k);
      if (at >= stored.cancel_at) break;
      const voided = stored.pause_collection?.behavior === 'void' && pausedFromSec !== null && at > pausedFromSec;
      out.push({ day: dayOf(at), charged: !voided });
    }
    return out;
  };
  return { fetcher, calls, get stored() { return stored; }, charges, setReadBack: (o: Partial<FakeSub> | null) => { readBackOverride = o; } };
}

/* ── a fake database: the terms row, the lead, the ledger, and a client_service_events table with the unique claim ── */
function fakeDb(o: { terms: string; route: 'optimise' | 'build'; paidAt: string[]; sub: string | null }) {
  const events: Array<{ kind: string; detail: Record<string, unknown> }> = [];
  const termsRow = { lead_id: LEAD, commercial_terms: o.terms, service_route: o.route, initial_paid_at: '2026-11-02T15:00:00Z', access_date: '2026-11-09', guarantee_ceased_at: null, guarantee_ceased_reason: null, payment_start_date: null, payment_start_confirmed_at: null, continuing_decision: null, continuing_reminder_sent_at: null };
  const lead = { id: LEAD, business_name: 'Acme', email: 'owner@acme.test', status: 'payment_received', service_terminated_at: null, contract_total_payments: o.route === 'optimise' ? 6 : 12, remeasure_results_sent_at: '2026-12-07T10:30:00Z', stripe_subscription_id: o.sub, payment_date: '2026-11-02', phone: null, assigned_to_user_id: null };
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    const result = () => {
      if (table === 'client_service_terms') return { data: termsRow, error: null };
      if (table === 'outreach_leads') return { data: lead, error: null };
      if (table === 'payment_ledger') return { data: o.paidAt.map((at) => ({ occurred_at: at, amount_gbp: FINDABLE_MONTHLY_GBP, status: 'succeeded' })), error: null };
      if (table === 'onboarding_responses') return { data: [{ contact_email: 'owner@acme.test', status: 'paid' }], error: null };
      return { data: [], error: null };
    };
    for (const m of ['select', 'eq', 'is', 'order', 'limit', 'in', 'not', 'gte']) chain[m] = () => chain;
    chain.maybeSingle = async () => result();
    chain.then = (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res);
    chain.update = () => chain;
    chain.insert = async (row: Record<string, unknown>) => {
      if (table === 'client_service_events') {
        if (row.kind === FIXED_TERM_EVENT && events.some((e) => e.kind === FIXED_TERM_EVENT)) return { error: { code: '23505', message: 'duplicate key value violates unique constraint "client_service_events_one_fixed_term_final"' } };
        events.push({ kind: String(row.kind), detail: row.detail as Record<string, unknown> });
      }
      return { error: null };
    };
    return chain;
  };
  return { svc: { from }, events };
}

/** One full scenario: a Payment Start Date, payments 2–5 on time, payment 6 paid at `sixthPaidAt`. */
async function scenario(startDay: string, sixthPaidAt: string) {
  const due = dueDays(startDay);
  const trialEnd = sec(ukDayAtHourIso(startDay));
  const stripe = fakeStripe({ id: 'sub_fx', status: 'active', trial_end: trialEnd, cancel_at: minimumTermCancelAt(trialEnd, recurringPaymentsFor('optimise')), pause_collection: null, metadata: { lead_id: LEAD, payment_timing: OPTION_B_TIMING, commercial_terms: COMMERCIAL_TERMS_V4, service_route: 'optimise', total_payments: '6' } });
  const paid = [...due.slice(0, 4).map((d) => ukDayAtHourIso(d)), sixthPaidAt];
  const db = fakeDb({ terms: COMMERCIAL_TERMS_V4, route: 'optimise', paidAt: paid, sub: 'sub_fx' });
  const sent: Array<{ to: string; subject: string; text: string }> = [];
  const send = async (to: string, m: { subject: string; text: string }) => { sent.push({ to, ...m }); return { ok: true, detail: 'ok' }; };
  const out = await finaliseFixedTerm(db.svc, LEAD, { fetcher: stripe.fetcher, secret: 'sk_test_fake', nowIso: sixthPaidAt, send });
  return { due, stripe, db, sent, out, paid, trialEnd };
}

async function main() {
  console.log('── 1. PAYMENT 6 SUCCEEDS ON ITS DUE DATE ──');
  {
    /* Stripe creates the invoice at the boundary (10:00 UTC here) and collects it a few minutes later. */
    const s = await scenario('2026-12-22', '2027-04-22T10:05:00Z');
    ok(s.due[4] === '2027-04-22', 'payment 6 is due 22 Apr 2027');
    ok(s.out.kind === 'finalised' && s.out.endDay === '2027-05-22', 'Optimise End Date = 22 May 2027 (' + JSON.stringify(s.out) + ')');
    ok(dayOf(s.stripe.stored.cancel_at) === '2027-05-22' && s.stripe.stored.pause_collection?.behavior === 'void', 'Stripe: closes on 22 May, collection paused (void)');
    const ch = s.stripe.charges(sec('2027-04-22T10:05:00Z'));
    ok(ch.filter((c) => c.charged).length === 5 && ch.filter((c) => c.charged).at(-1)!.day === '2027-04-22', 'exactly five monthly charges after the sign-up — payment 6 (22 Apr) is the last');
    ok(!ch.some((c) => c.charged && c.day > '2027-04-22'), 'no payment 7');
  }

  console.log('\n── 2. PAYMENT 6 FAILS, THEN SUCCEEDS 3 DAYS LATE ──');
  {
    const s = await scenario('2026-12-22', '2027-04-25T14:30:00Z');
    ok(s.out.kind === 'finalised' && s.out.endDay === '2027-05-25', 'the End Date counts from the ACTUAL success (25 Apr) → 25 May, not the due date');
    ok(dayOf(s.stripe.stored.cancel_at) === '2027-05-25', 'Stripe\'s closure moved from 22 May to 25 May');
    const ch = s.stripe.charges(sec('2027-04-25T14:30:00Z'));
    ok(ch.some((c) => c.day === '2027-05-22' && !c.charged), 'the 22 May renewal Stripe generates is VOIDED — the extra billing boundary inside the final month charges nothing');
    ok(ch.filter((c) => c.charged).length === 5 && !ch.some((c) => c.charged && c.day > '2027-04-25'), 'still exactly five monthly charges — no payment 7');
    const facts: TimelineFacts = { terms: COMMERCIAL_TERMS_V4, route: 'optimise', initialPaidAt: '2026-11-02T15:00:00Z', accessDate: '2026-11-09', resultsSentAt: '2026-12-07T10:30:00Z', guaranteeCeasedAt: null, recurringPaidAt: s.paid };
    ok(minimumTerm(facts).finalPaymentDay === '2027-04-25' && minimumTerm(facts).serviceEndDay === '2027-05-25', 'Paid Client: final payment 25 Apr, final month until 25 May (from the ledger)');
    ok(!serviceEndedOn(facts, '2027-05-24T12:00:00Z') && serviceEndedOn(facts, '2027-05-25T12:00:00Z'), 'active until 25 May; ended from 25 May');
    ok(subscriptionEndedByTerm({ ...s.stripe.stored, ended_at: s.stripe.stored.cancel_at }, false), 'when Stripe closes on the moved date, the webhook still recognises it as OUR term end (not a cancellation)');
    ok(!subscriptionEndedByTerm({ ...s.stripe.stored, cancel_at: s.stripe.stored.cancel_at + 86400, ended_at: s.stripe.stored.cancel_at + 86400 }, false), '…and a hand-set date still is not');
  }

  console.log('\n── 3. PAYMENT 6 FAILS, THEN SUCCEEDS AFTER MONTH-END ──');
  {
    const s = await scenario('2026-12-30', '2027-05-03T08:00:00Z');
    ok(s.due.join() === '2026-12-30,2027-01-30,2027-02-28,2027-03-30,2027-04-30', 'due days clamp like Stripe (30 Jan → 28 Feb → 30 Mar → 30 Apr)');
    ok(s.out.kind === 'finalised' && s.out.endDay === '2027-06-03', 'payment 6 due 30 Apr, succeeded 3 May → End Date 3 Jun');
    const ch = s.stripe.charges(sec('2027-05-03T08:00:00Z'));
    ok(dayOf(s.stripe.stored.cancel_at) === '2027-06-03' && ch.filter((c) => c.charged).length === 5 && ch.some((c) => c.day === '2027-05-30' && !c.charged), 'closes 3 Jun; the 30 May renewal is voided; five charges only');
  }

  console.log('\n── 4. THE 31ST → A SHORTER MONTH ──');
  {
    const base: TimelineFacts = { terms: COMMERCIAL_TERMS_V4, route: 'optimise', initialPaidAt: '2026-11-02T15:00:00Z', accessDate: '2026-11-09', resultsSentAt: '2026-12-07T10:30:00Z', guaranteeCeasedAt: null };
    const end = (sixth: string) => minimumTerm({ ...base, recurringPaidAt: ['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01', sixth].map((d) => d + 'T10:00:00Z') }).serviceEndDay;
    ok(end('2027-08-31') === '2027-09-30', '31 Aug → 30 Sep');
    ok(addMonthsClamped('2027-01-30', 1) === '2027-02-28' && addMonthsClamped('2028-01-30', 1) === '2028-02-29', '30 Jan → 28 Feb (29 Feb in a leap year)');
    ok(end('2027-04-22') === '2027-05-22', '22 Apr → 22 May');
    ok(ukDay('2027-08-31T23:30:00Z') === '2027-09-01' && end(ukDay('2027-08-31T23:30:00Z')!) === '2027-10-01', 'the day is the UK day of Stripe\'s paid_at (23:30 UTC on 31 Aug is 1 Sep in London)');
  }

  console.log('\n── 5. THE FINAL MONTH STARTS ONLY AFTER PAYMENT 6 ACTUALLY SUCCEEDS ──');
  {
    const trialEnd = sec(ukDayAtHourIso('2026-12-22'));
    const stripe = fakeStripe({ id: 'sub_fx', status: 'past_due', trial_end: trialEnd, cancel_at: minimumTermCancelAt(trialEnd, 5), pause_collection: null, metadata: { lead_id: LEAD, payment_timing: OPTION_B_TIMING, commercial_terms: COMMERCIAL_TERMS_V4, service_route: 'optimise' } });
    const four = dueDays('2026-12-22').slice(0, 4).map((d) => ukDayAtHourIso(d));
    const db = fakeDb({ terms: COMMERCIAL_TERMS_V4, route: 'optimise', paidAt: four, sub: 'sub_fx' });
    const out = await finaliseFixedTerm(db.svc, LEAD, { fetcher: stripe.fetcher, secret: 'sk', nowIso: '2027-04-23T10:00:00Z', send: async () => ({ ok: true, detail: '' }) });
    ok(out.kind === 'skipped' && stripe.calls.length === 0, 'payment 6 still failing (5 of 6 collected) → nothing happens, not even a Stripe read');
    const facts: TimelineFacts = { terms: COMMERCIAL_TERMS_V4, route: 'optimise', initialPaidAt: '2026-11-02T15:00:00Z', accessDate: '2026-11-09', resultsSentAt: '2026-12-07T10:30:00Z', guaranteeCeasedAt: null, recurringPaidAt: four };
    ok(minimumTerm(facts).serviceEndDay === null && !minimumTerm(facts).planComplete && !timelineView(facts, '2027-06-30T10:00:00Z').serviceEnded, 'no End Date, no countdown, never "ended" before the sixth payment is collected');
  }

  console.log('\n── 6. DUPLICATE AND RETRIED WEBHOOKS ──');
  {
    const s = await scenario('2026-12-22', '2027-04-25T14:30:00Z');
    const posts1 = s.stripe.calls.filter((c) => c.method === 'POST');
    ok(posts1.length === 1 && !!posts1[0].idem && posts1[0].idem === `findable-fixed-term-end-sub_fx-${s.stripe.stored.cancel_at}`, 'one Stripe write, with a stable Idempotency-Key');
    const again = await finaliseFixedTerm(s.db.svc, LEAD, { fetcher: s.stripe.fetcher, secret: 'sk', nowIso: '2027-04-25T14:31:00Z', send: async (to, m) => { s.sent.push({ to, ...m }); return { ok: true, detail: '' }; } });
    ok(again.kind === 'already', 'a duplicate event: "already" (got ' + again.kind + ')');
    ok(s.stripe.calls.filter((c) => c.method === 'POST').length === 1, '…writes nothing more to Stripe (it already agrees)');
    ok(s.sent.length === 1 && s.db.events.filter((e) => e.kind === FIXED_TERM_EVENT).length === 1, '…and the client is emailed once, recorded once');
  }
  {
    const s = await scenario('2026-12-22', '2027-04-25T14:30:00Z');
    const stripe2 = fakeStripe({ ...s.stripe.stored, cancel_at: s.stripe.stored.cancel_at, pause_collection: null });
    stripe2.setReadBack({ pause_collection: null });
    const db2 = fakeDb({ terms: COMMERCIAL_TERMS_V4, route: 'optimise', paidAt: s.paid, sub: 'sub_fx' });
    const out = await finaliseFixedTerm(db2.svc, LEAD, { fetcher: stripe2.fetcher, secret: 'sk', nowIso: '2027-04-25T14:30:00Z', send: async () => ({ ok: true, detail: '' }) });
    ok(out.kind === 'failed' && /did not confirm/.test((out as { reason: string }).reason) && db2.events.length === 0, 'Stripe\'s read-back disagrees → FAILED, nothing claimed or emailed (the webhook throws and Stripe retries)');
  }
  {
    const s = await scenario('2026-12-22', '2027-04-22T10:05:00Z');
    ok(!/29\.99|2999/.test(s.stripe.calls.map((c) => c.body).join('&')), 'no £29.99 is ever sent to Stripe');
    ok(/proration_behavior=none/.test(s.stripe.calls.find((c) => c.method === 'POST')!.body), 'no proration');
  }
  {
    /* Payment 6 recovered AFTER Stripe already closed the subscription: nothing can charge, nothing to write. */
    const trialEnd = sec(ukDayAtHourIso('2026-12-22'));
    const stripe = fakeStripe({ id: 'sub_fx', status: 'canceled', trial_end: trialEnd, cancel_at: minimumTermCancelAt(trialEnd, 5), pause_collection: null, metadata: { lead_id: LEAD, commercial_terms: COMMERCIAL_TERMS_V4, service_route: 'optimise', payment_timing: OPTION_B_TIMING } });
    const db = fakeDb({ terms: COMMERCIAL_TERMS_V4, route: 'optimise', paidAt: [...dueDays('2026-12-22').slice(0, 4).map((d) => ukDayAtHourIso(d)), '2027-05-26T10:00:00Z'], sub: 'sub_fx' });
    const out = await finaliseFixedTerm(db.svc, LEAD, { fetcher: stripe.fetcher, secret: 'sk', nowIso: '2027-05-26T10:00:00Z', send: async () => ({ ok: true, detail: '' }) });
    ok(out.kind === 'finalised' && out.endDay === '2027-06-26' && !stripe.calls.some((c) => c.method === 'POST'), 'a subscription Stripe has already closed: no write (nothing can charge), the final month still runs to 26 Jun');
  }

  console.log('\n── 7. THE TWO MESSAGES ──');
  {
    const s = await scenario('2026-12-22', '2027-04-25T14:30:00Z');
    const m = s.sent[0];
    ok(s.out.kind === 'finalised' && (s.out as { emailed: boolean }).emailed && m.to === 'owner@acme.test', 'message 1 goes to the client\'s contact email when payment 6 succeeds');
    ok(/Your 6th and final payment has gone through, so your payment plan is complete and nothing more will be charged\./.test(m.text) && /we carry on your monthly work for one final month, until 25 May 2027\. Your service then ends automatically/.test(m.text), 'message 1: plan complete, final month RUNNING until the real date');
    ok(!/has finished|has now ended|has ended/.test(m.text), 'message 1 never says the final month has finished');
    const end = termCompleteEmail({ siteKind: 'client_owned', totalPayments: 6, finalMonthEnded: true });
    ok(end.subject === 'Your Findable service has now ended' && /final month of work has finished, so your service has now ended/.test(end.paragraphs.join(' ')), 'message 2 (at Stripe\'s closure on the End Date): the service has ended');
    ok(paymentPlanCompleteEmail({ totalPayments: 6, endDayWords: 'x' }).subject !== end.subject, 'the two messages are distinct');
  }

  console.log('\n── 8. ONLY v4 OPTIMISE; HISTORICAL v3 AND BUILD UNAFFECTED ──');
  {
    for (const [terms, route, label] of [[COMMERCIAL_TERMS_V3, 'optimise', 'a v3 Optimise client'], [COMMERCIAL_TERMS_V4, 'build', 'a v4 Build client']] as const) {
      const trialEnd = sec(ukDayAtHourIso('2026-12-22'));
      const stripe = fakeStripe({ id: 'sub_fx', status: 'active', trial_end: trialEnd, cancel_at: minimumTermCancelAt(trialEnd, 5), pause_collection: null, metadata: { lead_id: LEAD } });
      const paid = Array.from({ length: 11 }, (_, k) => ukDayAtHourIso(addMonthsClamped('2026-12-22', k)));
      const db = fakeDb({ terms, route, paidAt: paid, sub: 'sub_fx' });
      const out = await finaliseFixedTerm(db.svc, LEAD, { fetcher: stripe.fetcher, secret: 'sk', nowIso: '2027-11-30T10:00:00Z', send: async () => ({ ok: true, detail: '' }) });
      ok(out.kind === 'skipped' && stripe.calls.length === 0 && db.events.length === 0, `${label}: skipped — no Stripe call, no event, no email`);
    }
    const legacy = { cancel_at: minimumTermCancelAt(2_000_000_000, 5), trial_end: 2_000_000_000, ended_at: minimumTermCancelAt(2_000_000_000, 5), metadata: { total_payments: '6' } };
    ok(subscriptionEndedByTerm(legacy, false), 'an un-moved subscription still ends "by term" exactly as before');
    const facts: TimelineFacts = { terms: COMMERCIAL_TERMS_V4, route: 'optimise', initialPaidAt: '2026-11-02T15:00:00Z', accessDate: '2026-11-09', resultsSentAt: '2026-12-07T10:30:00Z', guaranteeCeasedAt: null, recurringPaidAt: [] };
    ok(planFixedTermEnd({ ...facts, refundedAt: 'refunded' }, LEAD, null, '2027-01-01T00:00:00Z').ok === false, 'a refunded client is never finalised');
  }

  console.log('\n── 9. WIRING ──');
  {
    const wh = read('supabase/functions/stripe-webhook/index.ts');
    const paidCase = wh.slice(wh.indexOf('case "invoice.paid": {'), wh.indexOf('case "invoice.payment_failed": {'));
    ok(paidCase.indexOf('recordLedger(') > 0 && paidCase.indexOf('finaliseFixedTerm(service, leadId)') > paidCase.indexOf('recordLedger('), 'invoice.paid: the ledger row (Stripe\'s paid_at) is written FIRST, then the final payment is finalised from it');
    ok(/status_transitions\?: \{ paid_at\?: number \| null \} \}\)\.status_transitions\?\.paid_at/.test(paidCase), 'the ledger records Stripe\'s ACTUAL paid time, not the invoice\'s creation');
    ok(/if \(fin\.kind === "failed"\) \{[\s\S]{0,300}throw new Error/.test(paidCase), 'a failed finalise throws → the webhook answers 500 → Stripe retries the event');
    const ct = read('supabase/functions/_shared/client-terms.ts');
    ok(/"pause_collection\[behavior\]": "void"/.test(ct) && /cancel_at: String\(plan\.cancelAtSec\)/.test(ct), 'the Stripe write: pause_collection void + cancel_at at the End Date');
    const mig = read('supabase/migrations/20261012090000_client_agreement_v4_optimise_fixed_term.sql');
    ok(/create unique index if not exists client_service_events_one_fixed_term_final\s+on public\.client_service_events \(lead_id\) where kind = 'fixed_term_final_payment'/.test(mig) && /'fixed_term_final_payment'\s*\)\);/.test(mig), 'migration: the event kind is allowed and claimed once per client (unique index)');
    const card = read('src/components/ClientTimelineCard.tsx');
    ok(/Payment plan complete · final month of service until \$\{ukDayWords\(mt\.serviceEndDay\)\}/.test(card) && /Service ended \$\{ukDayWords\(mt\.serviceEndDay\)\}/.test(card) && /The final-month date appears only after that payment succeeds/.test(card), 'Paid Client: "Payment plan complete · final month of service until …", then "Service ended …"; no date before payment 6');
    ok(!/extends by hand/.test(read('docs/client-agreement-v4.md')) && /finaliseFixedTerm/.test(read('docs/client-agreement-v4.md')), 'the late-payment case is no longer a manual extension (record updated)');
  }

  if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
  console.log('\nAll Optimise final-month checks passed.');
}
main().catch((e) => { console.error(e); process.exit(1); });
