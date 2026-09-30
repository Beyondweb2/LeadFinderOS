/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE ADMIN CONTROL CENTRE FOLD — the definitions that make its numbers trustworthy.
   Run: npx tsx scripts/admin-metrics.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { foldAdminOverview, CHANNEL_MIN_ATTEMPTS, type AdminInput, type AdminLead, type AdminMessage, type AdminActivity } from '../src/lib/adminMetrics.ts';
import { buildExclusions, isInternalEmail, NO_EXCLUSIONS } from '../src/lib/metricExclusions.ts';
import { resolvePeriod, londonMidnightMs, londonDay, inPeriod, previousPeriod, addDays, mondayOf } from '../src/lib/reportingPeriod.ts';
import { costProviderOf, costFeatureOf } from '../src/lib/apiCostLabels.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const PAUL = 'p0000000-0000-0000-0000-000000000001';
const REP = 'r0000000-0000-0000-0000-000000000002';
const TEST = 't0000000-0000-0000-0000-000000000003';
// A Wednesday in BST, mid-afternoon London.
const NOW = Date.parse('2026-09-30T14:00:00Z');
const at = (daysAgo: number, hourUtc = 10) => new Date(Date.parse(`${addDays('2026-09-30', -daysAgo)}T${String(hourUtc).padStart(2, '0')}:00:00Z`)).toISOString();

let seq = 0;
const lead = (o: Partial<AdminLead> = {}): AdminLead => ({
  id: `L${++seq}`, business_name: `Biz ${seq}`, created_at: at(40), added_by_user_id: PAUL, assigned_to_user_id: null, sold_by_user_id: null, sold_at: null,
  status: 'new', amount_paid: null, is_potential_work: null, call_booked_at: null, whatsapp_sent_at: null, next_action: null, next_action_date: null,
  is_archived: false, phone: `07700 90${String(seq).padStart(4, '0')}`, email: null, search_keyword: 'plumber', category: null, payment_date: null, refunded_at: null,
  service_terminated_at: null, subscription_status: null, contract_total_payments: null, baseline_audit_id: null, remeasure_due_date: null, remeasure_audit_id: null, ...o,
});
const send = (l: AdminLead, when: string, who: string | null = null, o: Partial<AdminMessage> = {}): AdminMessage => ({ lead_id: l.id, direction: 'outbound', status: 'delivered', created_at: when, body: null, sent_by_user_id: who, template_name: 'hook_v1', test_mode: false, ...o });
const reply = (l: AdminLead, when: string, body = 'Yes tell me more', o: Partial<AdminMessage> = {}): AdminMessage => ({ lead_id: l.id, direction: 'inbound', status: 'received', created_at: when, body, sent_by_user_id: null, template_name: null, test_mode: false, ...o });
const act = (l: AdminLead, kind: string, when: string, who: string | null, data: Record<string, unknown> = {}): AdminActivity => ({ lead_id: l.id, actor_user_id: who, kind, data, created_at: when });

function base(o: Partial<AdminInput> = {}): AdminInput {
  const p = (k: string) => resolvePeriod(k, NOW);
  return {
    period: p('30d'), today: p('today'), yesterday: p('yesterday'), week: p('week'), month: p('mtd'), nowMs: NOW,
    bookOwnerId: PAUL,
    people: [{ userId: PAUL, name: 'Paul', role: 'admin', excluded: false }, { userId: REP, name: 'Sumi', role: 'sales', excluded: false }, { userId: TEST, name: 'test1', role: 'sales', excluded: true }],
    exclusions: buildExclusions([{ kind: 'user', value: TEST, reason: 'test' }]),
    leads: [], messages: [], activity: [], suppressions: [], ledger: [], onboarding: [],
    commissionLines: [], commissionTotals: null, commissionDueBySeller: new Map(), payoutsBySeller: new Map(),
    cost: { period: [], today: [], yesterday: [], week: [], month: [] }, ...o,
  };
}
const row = (o: ReturnType<typeof foldAdminOverview>, u: string) => o.team.find((r) => r.userId === u);

/* ── 1. The clock ──────────────────────────────────────────────────────────────────────────────── */
{
  ok(new Date(londonMidnightMs('2026-09-30')).toISOString() === '2026-09-29T23:00:00.000Z', 'BST: London midnight is 23:00 UTC the day before');
  ok(new Date(londonMidnightMs('2026-12-01')).toISOString() === '2026-12-01T00:00:00.000Z', 'GMT: London midnight is 00:00 UTC');
  ok(new Date(londonMidnightMs('2026-10-25')).toISOString() === '2026-10-24T23:00:00.000Z', 'the day the clocks go back starts in BST');
  ok(new Date(londonMidnightMs('2026-10-26')).toISOString() === '2026-10-26T00:00:00.000Z', 'the day after starts in GMT');
  const t = resolvePeriod('today', NOW);
  ok(t.fromDay === '2026-09-30' && t.toMs === NOW, 'today = London midnight → now');
  ok(inPeriod('2026-09-29T23:30:00Z', t), '00:30 London on the 30th is today (UTC says the 29th)');
  ok(!inPeriod('2026-09-29T22:30:00Z', t), '23:30 London on the 29th is not today');
  ok(resolvePeriod('7d', NOW).fromDay === '2026-09-24' && resolvePeriod('7d', NOW).days === 7, '7 days = the last 7 London days including today');
  ok(resolvePeriod('week', NOW).fromDay === '2026-09-28' && mondayOf('2026-10-04') === '2026-09-28', 'this week starts Monday (London) — Sunday belongs to the week before it ends');
  ok(resolvePeriod('mtd', NOW).fromDay === '2026-09-01', 'month to date starts the 1st');
  ok(resolvePeriod('custom', NOW, { from: '2026-09-10', to: '2026-09-01' }).key === '7d', 'a backwards custom range falls back to 7 days, never to all time');
  ok(resolvePeriod('nonsense', NOW).key === '7d', 'an unknown preset falls back to 7 days');
  ok(resolvePeriod('custom', NOW, { from: '2026-09-01', to: '2026-09-05' }).days === 5, 'a custom range counts its days inclusively');
  ok(previousPeriod(resolvePeriod('7d', NOW), NOW)?.toDay === '2026-09-23', 'the previous period ends the day before this one starts');
  ok(londonDay(Date.parse('2026-09-29T23:30:00Z')) === '2026-09-30', 'londonDay reads the London calendar');
}

/* ── 2. Test accounts are excluded from performance, never from inventory ─────────────────────── */
{
  const a = lead({ added_by_user_id: TEST, created_at: at(3), assigned_to_user_id: TEST });
  const b = lead({ assigned_to_user_id: REP, created_at: at(3), added_by_user_id: REP });
  const o = foldAdminOverview(base({
    leads: [a, b],
    messages: [send(a, at(2), TEST), send(b, at(2), REP), send(b, at(1), null)],
    activity: [act(a, 'call_outcome', at(1), TEST, { outcome: 'spoke_to_owner' })],
    cost: { period: [{ user_id: TEST, function_name: 'search-leads', api_type: 'text_search', usd: 5, calls: 10 }, { user_id: REP, function_name: 'search-leads', api_type: 'text_search', usd: 1, calls: 2 }], today: [], yesterday: [], week: [], month: [] },
  }));
  ok(!o.team.some((r) => r.userId === TEST), 'the test account has no row in the team comparison');
  ok(row(o, REP)?.whatsappSent === 2, "a queue send (no sender) on the rep's lead counts for the rep");
  ok(o.totals.whatsappSent === 2 && o.excludedActivity.whatsappSent === 1, "the test account's send is tallied apart, not in the total");
  ok(o.totals.calls === 0 && o.excludedActivity.calls === 1, "the test account's call is excluded");
  ok(row(o, REP)?.apiCostUsd === 1 && o.excludedActivity.apiCostUsd === 5, "the test account's API spend is not attributed to anyone real");
  ok(o.inventory.leads === 2 && o.inventory.addedByTestAccounts === 1, 'the business the test account added still counts in inventory');
  ok(o.funnel.stages[0].count === 2, 'and in the funnel of leads added');
  ok(o.money.cost.period.byPerson.some((p) => p.key === 'Internal/test'), 'cost by person shows internal/test as its own line');
}

/* ── 3. What counts as a reply, a call, a send ─────────────────────────────────────────────────── */
{
  const a = lead({ assigned_to_user_id: REP });
  const b = lead({ assigned_to_user_id: REP });
  const c = lead({ assigned_to_user_id: REP });
  const o = foldAdminOverview(base({
    leads: [a, b, c],
    messages: [
      send(a, at(5)), reply(a, at(4)), reply(a, at(3), 'and another thing'),
      send(b, at(5)), reply(b, at(4), 'Thank you for your message. We are currently out of the office.'),
      send(c, at(5), null, { test_mode: true }), send(c, at(5), null, { status: 'failed' }), reply(c, at(4), 'yes', { test_mode: true }),
    ],
    activity: [act(a, 'call_outcome', at(2), REP, { outcome: 'no_answer', channel: 'call' }), act(b, 'contact_logged', at(2), REP, { outcome: 'message_sent', channel: 'email' })],
  }));
  ok(row(o, REP)?.replies === 1, 'two replies on one lead are one reply; an auto-responder and a test-mode reply are none');
  ok(row(o, REP)?.whatsappSent === 2, 'test-mode and failed sends are not WhatsApps sent');
  ok(row(o, REP)?.calls === 1 && row(o, REP)?.emails === 1, 'only a logged call outcome is a call; an email log is an email');
  ok(o.calls.total.total === 1 && o.calls.total.byOutcome.no_answer === 1, 'the Calls table counts logged outcomes by outcome');
}

/* ── 4. Interested, meetings, losses are dated events, once per lead ───────────────────────────── */
{
  const a = lead({ assigned_to_user_id: REP, created_at: at(10), is_potential_work: true });
  const b = lead({ assigned_to_user_id: REP, created_at: at(10), status: 'interested' }); // interested by old status, no recorded moment
  const c = lead({ assigned_to_user_id: REP, created_at: at(10) });
  const o = foldAdminOverview(base({
    leads: [a, b, c],
    messages: [send(a, at(9)), send(b, at(9)), send(c, at(9))],
    activity: [
      act(a, 'marked_interested', at(3), REP, { on: true }), act(a, 'state_changed', at(2), REP, { to: 'interested' }),
      act(a, 'call_booked', at(2), REP, { at: at(-1) }), act(a, 'contact_logged', at(2), REP, { outcome: 'meeting_booked', channel: 'call' }),
      act(c, 'call_outcome', at(1), REP, { outcome: 'not_interested' }),
    ],
    suppressions: [{ lead_id: c.id, reason: 'not_interested', source: 'backfill_2026_08_08', created_at: at(1), wrong_number_at: null, wrong_number_by: null }],
  }));
  ok(row(o, REP)?.interested === 1, 'interested counts the first recorded moment once; an undated old status never counts in a period');
  ok(row(o, REP)?.meetings === 1, 'a booking and a meeting outcome on one lead are one meeting');
  ok(row(o, REP)?.notInterested === 1, 'a logged not-interested counts; a backfilled suppression is not a dated event');
  ok(o.funnel.stages.find((s) => s.key === 'interested')?.count === 2, 'the current funnel does count the old interested status');
}

/* ── 5. Money comes from the ledger only ───────────────────────────────────────────────────────── */
{
  const paidByStatus = lead({ status: 'payment_received', amount_paid: 99, sold_by_user_id: PAUL, sold_at: at(50), baseline_audit_id: 'A1' });
  const repSale = lead({ status: 'payment_received', amount_paid: 99, sold_by_user_id: REP, sold_at: at(2), baseline_audit_id: 'A2' });
  const o = foldAdminOverview(base({
    leads: [paidByStatus, repSale],
    ledger: [
      { id: 'g1', lead_id: repSale.id, kind: 'initial', status: 'succeeded', amount_gbp: 99, occurred_at: at(2), sold_by_user_id: REP },
      { id: 'g2', lead_id: repSale.id, kind: 'refund', status: 'succeeded', amount_gbp: 20, occurred_at: at(1), sold_by_user_id: REP },
    ],
    onboarding: [{ lead_id: repSale.id, status: 'paid', created_at: at(2), plan_tier: 'new_site', website_addon: null }],
    commissionLines: [{ id: 'pay:g1', leadId: repSale.id, sellerId: REP, kind: 'payment', paymentNumber: 1, label: 'Initial', clientAmount: 99, rate: 0.3, commission: 29.7, occurredAt: at(2), periodMonth: '2026-09-01', payoutDate: '2026-10-01', status: 'due' }],
    commissionDueBySeller: new Map([[REP, 29.7]]),
    cost: { period: [{ user_id: PAUL, function_name: 'extract-competitors', api_type: 'openai_competitor_clean', usd: 4, calls: 1 }, { user_id: PAUL, function_name: 'x', api_type: 'guard', usd: 100, calls: 1 }], today: [], yesterday: [], week: [], month: [] },
  }));
  ok(o.money.period.gross === 99 && o.money.period.refunds === 20 && o.money.period.net === 79, 'revenue is the ledger: £99 in, £20 refunded, £79 net');
  ok(o.money.outsideLedger.count === 1 && o.money.outsideLedger.amount === 99, 'a lead paid by status with no ledger row is reported as outside the ledger, not as revenue');
  ok(row(o, REP)?.revenue === 99 && row(o, REP)?.paid === 1 && row(o, REP)?.commissionInitial === 29.7, 'revenue and commission are attributed to the seller');
  ok(o.money.byRoute.build === 99, 'the Build route is read from the sign-up row');
  ok(o.money.cost.period.usd === 4, 'guard estimates are never summed as spend');
  const k = o.money.contribution as Record<string, unknown>;
  ok(k.afterCommission === Math.round((79 - 29.7) * 100) / 100, 'revenue after commission = net revenue − commission, in pounds');
  ok(k.apiUsd === 4, 'API spend stays in US dollars, as recorded');
  ok(!('value' in k) && !('apiGbp' in k), 'no combined figure: dollars are never subtracted from pounds (no invented exchange rate)');
  ok(o.money.commission.periodAdded === 29.7, 'commission is the ledger line at its stamped rate, unchanged');
}

/* ── 5b. A client refunded OUTSIDE the ledger (RG, 2026-09-30) ─────────────────────────────────── */
{
  const rg = lead({ business_name: 'RG', status: 'refunded', amount_paid: 19.99, sold_by_user_id: PAUL, payment_date: '2026-08-11', baseline_audit_id: 'F', remeasure_due_date: '2026-10-06' });
  const ronnie = lead({ business_name: 'Ronnie', status: 'payment_received', amount_paid: 49.99, sold_by_user_id: PAUL, baseline_audit_id: 'R' });
  const mcl = lead({ business_name: 'MCL', status: 'payment_received', amount_paid: 99, sold_by_user_id: PAUL, baseline_audit_id: 'M' });
  const ledger = [{ id: 'm1', lead_id: mcl.id, kind: 'initial', status: 'succeeded', amount_gbp: 99, occurred_at: at(13), sold_by_user_id: PAUL }];
  const o = foldAdminOverview(base({ leads: [rg, ronnie, mcl], ledger }));
  ok(o.money.payingClients === 2, 'a refunded client is not an active paying client (the others still are)');
  ok(o.money.period.net === 99 && o.money.period.refunds === 0, 'no refund row is invented for a refund the ledger never saw — revenue is the ledger alone');
  ok(o.money.outsideLedger.count === 1 && o.money.outsideLedger.names[0] === 'Ronnie', 'the kept earlier payment stays in the outside-the-ledger note');
  ok(o.money.outsideLedger.refunded.count === 1 && o.money.outsideLedger.refunded.names[0] === 'RG' && o.money.outsideLedger.refunded.amount === 19.99, 'the refunded one is named separately, never as money kept');
  ok(o.attention.filter((x) => x.leadId === rg.id).length === 0, 'nothing in Needs your attention asks for work on the refunded client (no re-measure, no setup)');
  const row = o.clients.find((c) => c.leadId === rg.id);
  ok(!!row && row.refunded && row.payment === 'Refunded', 'the refunded client stays listed, as history, marked Refunded');
  ok(o.clients.filter((c) => !c.refunded).length === 2, 'the active client count excludes the refunded client');
  const twice = foldAdminOverview(base({ leads: [rg, ronnie, mcl], ledger }));
  ok(JSON.stringify(twice.money) === JSON.stringify(o.money), 'folding twice gives the same money — reading never writes or duplicates a ledger entry');
}

/* ── 6. Needs your attention: deterministic, and the refund bug fixed ──────────────────────────── */
{
  const refunded = lead({ status: 'refunded', amount_paid: 49.99, sold_by_user_id: PAUL });
  const unstarted = lead({ status: 'payment_received', amount_paid: 99, sold_by_user_id: PAUL, sold_at: at(4) });
  const disputed = lead({ status: 'payment_received', amount_paid: 99, sold_by_user_id: PAUL, baseline_audit_id: 'B' });
  const overdue = lead({ status: 'payment_received', amount_paid: 99, baseline_audit_id: 'C', remeasure_due_date: '2026-09-20' });
  const signup = lead({ status: 'interested' });
  const o = foldAdminOverview(base({
    leads: [refunded, unstarted, disputed, overdue, signup],
    ledger: [{ id: 'd1', lead_id: disputed.id, kind: 'chargeback', status: 'needs_response', amount_gbp: 99, occurred_at: at(1), sold_by_user_id: PAUL }],
    onboarding: [{ lead_id: signup.id, status: 'submitted', created_at: at(2), plan_tier: 'keep', website_addon: null }],
  }));
  const kinds = (id: string) => o.attention.filter((x) => x.leadId === id).map((x) => x.kind);
  ok(kinds(refunded.id).length === 0, 'a refunded client never shows as "setup not started"');
  ok(o.attention.find((x) => x.leadId === unstarted.id)?.group === 'urgent', 'paid four days ago with no baseline is urgent (past the two-day promise)');
  ok(o.attention.find((x) => x.leadId === disputed.id)?.kind === 'payment_dispute', 'an open dispute surfaces');
  ok(kinds(overdue.id).includes('remeasure_overdue'), 'a re-measure past its date surfaces');
  ok(kinds(signup.id).includes('signup_unpaid'), 'an unpaid sign-up older than a day surfaces');
  ok(o.attention[0].group === 'urgent', 'urgent items come first');
  ok(o.clients.find((c) => c.leadId === refunded.id)?.payment === 'Refunded', 'the refunded client is listed as refunded');
}

/* ── 7. Channels never show a rate on a tiny sample; follow-ups are current and in play ─────────── */
{
  const leads = Array.from({ length: CHANNEL_MIN_ATTEMPTS }, () => lead({ assigned_to_user_id: REP }));
  const won = lead({ assigned_to_user_id: REP, status: 'payment_received', amount_paid: 99, next_action: 'call', next_action_date: '2026-09-01' });
  const due = lead({ assigned_to_user_id: REP, next_action: 'call', next_action_date: '2026-09-29' });
  const today = lead({ assigned_to_user_id: REP, next_action: 'follow_up', next_action_date: '2026-09-30' });
  const o = foldAdminOverview(base({
    leads: [...leads, won, due, today],
    messages: leads.map((l) => send(l, at(3))),
    activity: [act(due, 'contact_logged', at(1), REP, { outcome: 'message_sent', channel: 'linkedin' })],
  }));
  ok(o.channels.find((c) => c.channel === 'whatsapp')?.enoughData === true, `${CHANNEL_MIN_ATTEMPTS} WhatsApp attempts is enough data`);
  ok(o.channels.find((c) => c.channel === 'linkedin')?.enoughData === false && o.channels.find((c) => c.channel === 'linkedin')?.attempts === 1, 'one LinkedIn attempt is not enough data');
  ok(row(o, REP)?.followUpsDue === 2 && row(o, REP)?.followUpsOverdue === 1, 'follow-ups count due-by-today on leads in play; a won lead is not a follow-up');
  ok(row(o, REP)?.social === 1, 'a LinkedIn log is social outreach');
}

/* ── 8. Exclusion by lead, and no-exclusions default ──────────────────────────────────────────── */
{
  const a = lead({ assigned_to_user_id: REP });
  const o = foldAdminOverview(base({ leads: [a], messages: [send(a, at(1))], exclusions: buildExclusions([{ kind: 'lead', value: a.id, reason: 'QA lead' }]) }));
  ok(o.totals.whatsappSent === 0 && o.inventory.leads === 1, "an excluded lead's activity leaves the numbers; the lead stays in inventory");
  ok(NO_EXCLUSIONS.users.size === 0, 'the empty exclusion set excludes nobody');
}

/* ── 8b. An internal email marks a SUBMISSION as internal, never a whole lead ──────────────────── */
{
  // A real business Paul tested the sign-up on: his address on the lead AND on the sign-up row.
  const real = lead({ assigned_to_user_id: REP, email: 'paul@move37.fun', status: 'interested' });
  const other = lead({ status: 'interested' });
  const ex = buildExclusions([{ kind: 'email', value: '@move37.fun', reason: 'Paul\'s domain' }]);
  ok(isInternalEmail(ex, 'Paul@Move37.fun') && isInternalEmail(ex, 'rich@move37.fun') && !isInternalEmail(ex, 'owner@plumber.co.uk'), 'a domain exclusion matches every address on it, case-insensitively');
  const o = foldAdminOverview(base({
    leads: [real, other], exclusions: ex,
    messages: [send(real, at(3)), reply(real, at(2))],
    onboarding: [
      { lead_id: real.id, status: 'submitted', created_at: at(3), plan_tier: 'keep', website_addon: null, contact_email: 'paul@move37.fun' },
      { lead_id: other.id, status: 'submitted', created_at: at(3), plan_tier: 'keep', website_addon: null, contact_email: 'owner@plumber.co.uk' },
    ],
  }));
  ok(row(o, REP)?.replies === 1, "the real business's WhatsApp reply still counts — the lead is not excluded by Paul's email on it");
  ok(!o.attention.some((a) => a.leadId === real.id && a.kind === 'signup_unpaid'), "Paul's own test sign-up is never a chase item");
  ok(o.attention.some((a) => a.leadId === other.id && a.kind === 'signup_unpaid'), "a prospect's unpaid sign-up still is");
}

/* ── 9. Cost labels ────────────────────────────────────────────────────────────────────────────── */
{
  ok(costProviderOf('apify_place_details') === 'Google Maps', 'Google Place Details routed through the runner is billed by Google, not Apify');
  ok(costProviderOf('apify_ai_search') === 'Apify' && costProviderOf('openai_warm_reply') === 'OpenAI', 'Apify and OpenAI are labelled');
  ok(costFeatureOf('enrichment', 'apify_ai_search_correction') === 'AI visibility audits', 'a correction row belongs to the audits it corrects');
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
