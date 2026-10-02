/* ════════════════════════════════════════════════════════════════════════════════════════════════
   "MY ACTIVITY: HIDDEN" — one toggle, one meaning, applied at the source (2026-10-02).
   Paul: "hide my personal sales/outreach activity from team performance and sales intelligence" — NOT
   "hide everything connected to Paul". The fold (src/lib/adminMetrics.ts, hideActivityOf) recomputes every
   activity figure without the hidden people; money, clients and attention never move.
   Run: npx tsx scripts/admin-my-activity.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { foldAdminOverview, type AdminInput, type AdminLead, type AdminMessage, type AdminActivity, type AdminLedgerRow } from '../src/lib/adminMetrics.ts';
import { buildExclusions } from '../src/lib/metricExclusions.ts';
import { resolvePeriod, addDays } from '../src/lib/reportingPeriod.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const PAUL = 'p0000000-0000-0000-0000-000000000001'; // admin AND the book owner, as live
const REP = 'r0000000-0000-0000-0000-000000000002';
const TEST = 't0000000-0000-0000-0000-000000000003';
const NOW = Date.parse('2026-09-30T14:00:00Z');
const at = (daysAgo: number) => new Date(Date.parse(`${addDays('2026-09-30', -daysAgo)}T10:00:00Z`)).toISOString();

let seq = 0;
const lead = (o: Partial<AdminLead> = {}): AdminLead => ({
  id: `L${++seq}`, business_name: `Biz ${seq}`, created_at: at(20), added_by_user_id: PAUL, assigned_to_user_id: null, sold_by_user_id: null, sold_at: null,
  status: 'contacted', amount_paid: null, is_potential_work: null, call_booked_at: null, whatsapp_sent_at: null, next_action: null, next_action_date: null,
  is_archived: false, phone: `07700 90${String(seq).padStart(4, '0')}`, email: null, search_keyword: 'plumber', category: null, payment_date: null, refunded_at: null,
  service_terminated_at: null, subscription_status: null, contract_total_payments: null, baseline_audit_id: null, remeasure_due_date: null, remeasure_audit_id: null, ...o,
});
let mid = 0;
const send = (l: AdminLead, when: string, who: string | null, template: string | null = 'hook_v1'): AdminMessage => ({ id: `m${++mid}`, lead_id: l.id, direction: 'outbound', status: 'delivered', created_at: when, body: null, sent_by_user_id: who, template_name: template, test_mode: false });
const reply = (l: AdminLead, when: string): AdminMessage => ({ id: `m${++mid}`, lead_id: l.id, direction: 'inbound', status: 'received', created_at: when, body: 'Yes, tell me more', sent_by_user_id: null, template_name: null, test_mode: false });
const act = (l: AdminLead, kind: string, when: string, who: string | null, data: Record<string, unknown> = {}): AdminActivity => ({ lead_id: l.id, actor_user_id: who, kind, data, created_at: when });

/* The book:
   A — Paul holds it (unassigned → the book owner). The QUEUE messaged it (no sender), they replied, Paul
       called and they said no ("price").
   B — Paul ADDED it, Sumi holds it and messaged it; they replied and Sumi marked them interested.
   C — Sumi's: messaged, then she recorded Not interested ("timing").
   D — Sumi holds it, but PAUL sent the WhatsApp himself (a free-form-named template); they replied. Sumi
       also called it.
   E — a paid client Paul sold and now delivers; Paul logged a call on it. */
const A = lead({ status: 'not_interested', lost_reason: 'price', lost_reason_recorded_by: PAUL, lost_reason_recorded_at: at(3) });
const B = lead({ assigned_to_user_id: REP, search_keyword: 'electrician', is_potential_work: true, status: 'interested' });
const C = lead({ assigned_to_user_id: REP, status: 'not_interested', lost_reason: 'timing', lost_reason_recorded_by: REP, lost_reason_recorded_at: at(2) });
const D = lead({ assigned_to_user_id: REP, search_keyword: 'roofer' });
const E = lead({ assigned_to_user_id: PAUL, sold_by_user_id: PAUL, sold_at: at(4), payment_date: at(4), amount_paid: 99, status: 'won', subscription_status: 'active', baseline_audit_id: 'aud1' });
const ledger: AdminLedgerRow[] = [{ id: 'g1', lead_id: E.id, kind: 'initial', status: 'succeeded', amount_gbp: 99, occurred_at: at(4), sold_by_user_id: PAUL }];

function input(hide?: ReadonlySet<string>): AdminInput {
  const p = (k: string) => resolvePeriod(k, NOW);
  return {
    period: p('30d'), today: p('today'), yesterday: p('yesterday'), week: p('week'), month: p('mtd'), nowMs: NOW,
    bookOwnerId: PAUL,
    people: [{ userId: PAUL, name: 'Paul', role: 'admin', excluded: false }, { userId: REP, name: 'Sumi', role: 'sales', excluded: false }, { userId: TEST, name: 'test1', role: 'sales', excluded: true }],
    exclusions: buildExclusions([{ kind: 'user', value: TEST, reason: 'test' }]),
    leads: [A, B, C, D, E],
    messages: [
      send(A, at(6), null), reply(A, at(5)),
      send(B, at(6), REP, 'hook_v2'), reply(B, at(5)),
      send(C, at(7), REP),
      send(D, at(6), PAUL, 'paul_direct'), reply(D, at(5)),
    ],
    activity: [
      act(A, 'call_outcome', at(3), PAUL, { outcome: 'not_interested', channel: 'call' }),
      act(B, 'marked_interested', at(4), REP, { on: true }),
      act(C, 'state_changed', at(2), REP, { to: 'not_interested' }),
      act(D, 'call_outcome', at(4), REP, { outcome: 'spoke_to_owner', channel: 'call' }),
      act(E, 'call_outcome', at(3), PAUL, { outcome: 'spoke_to_owner', channel: 'call' }),
    ],
    suppressions: [], ledger, onboarding: [],
    commissionLines: [], commissionTotals: null, commissionDueBySeller: new Map(), payoutsBySeller: new Map(),
    cost: { period: [], today: [], yesterday: [], week: [], month: [] },
    hideActivityOf: hide,
  };
}

const inc = foldAdminOverview(input());
const hid = foldAdminOverview(input(new Set([PAUL])));
const row = (o: typeof inc, u: string) => o.team.find((r) => r.userId === u);
const ch = (o: typeof inc, c: string) => o.channels.find((x) => x.channel === c)!;
const tpl = (o: typeof inc, t: string) => o.templates.meta.find((x) => x.template === t);
const niche = (o: typeof inc, k: string) => o.niches.find((x) => x.key === k);

/* ── A. Hidden ──────────────────────────────────────────────────────────────────────────────────── */
{
  ok(!row(hid, PAUL), 'hidden: Paul has no row in the team table');
  ok(hid.activityScope.hidden && hid.activityScope.people.join() === 'Paul', 'hidden: the response says whose outreach is left out');

  ok(ch(hid, 'whatsapp').attempts === 2, `hidden: WhatsApp reached = B and C only — the queue send on Paul's lead and Paul's own send are out (got ${ch(hid, 'whatsapp').attempts})`);
  ok(ch(hid, 'call').attempts === 1, `hidden: Phone reached = Sumi's call only — Paul's two calls are out (got ${ch(hid, 'call').attempts})`);
  ok(ch(hid, 'whatsapp').replies === 1, 'hidden: WhatsApp replies = B only (A was Paul\'s lead, D was reached only by Paul on WhatsApp)');
  ok(ch(hid, 'whatsapp').replies / ch(hid, 'whatsapp').attempts === 0.5, 'hidden: the reply RATE is recomputed (1 of 2), not the old rate shrunk');

  ok(!tpl(hid, 'paul_direct'), "hidden: the template Paul sent himself is not in WhatsApp templates");
  ok(tpl(hid, 'hook_v1')?.leadsSent === 1 && tpl(hid, 'hook_v1')?.replies === 0, 'hidden: hook_v1 = Sumi\'s send to C only; the queue send to Paul\'s lead A (and its reply) are out');
  ok(tpl(hid, 'hook_v2')?.leadsSent === 1 && tpl(hid, 'hook_v2')?.replies === 1, 'hidden: Sumi\'s hook_v2 keeps its send and its reply');

  ok(niche(hid, 'plumber')?.messaged === 1 && niche(hid, 'plumber')?.replied === 0, 'hidden: plumbers messaged = C only (A was the queue on Paul\'s lead)');
  ok(!niche(hid, 'roofer')?.messaged, 'hidden: the roofer reached only by Paul has nobody messaged');
  ok(niche(hid, 'plumber')?.leadsInBook === niche(inc, 'plumber')?.leadsInBook, 'hidden: niche inventory (leads in the book) never changes');

  ok(hid.lostReasons.saidNo === 1 && hid.lostReasons.rows.length === 1 && hid.lostReasons.rows[0].key === 'timing', 'hidden: Paul\'s "no" (price) is out of Why prospects say no; Sumi\'s (timing) stays');
  ok(hid.lostReasons.rows[0].pct === 100, 'hidden: reason percentages are of the reasons left (100%), not of the old total');

  ok(row(hid, REP)?.interested === 1 && ch(hid, 'whatsapp').interested === 1, 'hidden: Sumi\'s interested on a lead PAUL ADDED still counts — who added a lead never hides it');
  ok(row(hid, REP)?.replies === 2, 'hidden: a reply is the holder\'s — D is Sumi\'s lead, so its reply stays hers in the team table');
  ok(hid.calls.rows.every((r) => r.userId !== PAUL) && hid.calls.total.total === 1, 'hidden: the Calls fold has only Sumi\'s call');
  ok(hid.totals.cohort.contacted === row(hid, REP)!.cohort.contacted, 'hidden: the team cohort (contacted → sale) is the rows shown');
  ok(hid.funnel.stages.find((s) => s.key === 'contacted')!.count < inc.funnel.stages.find((s) => s.key === 'contacted')!.count, 'hidden: the funnel\'s Contacted drops the leads only Paul reached');
  ok(hid.funnel.stages[0].count === inc.funnel.stages[0].count, 'hidden: Leads added (inventory) does not change');
}

/* ── B. Included ────────────────────────────────────────────────────────────────────────────────── */
{
  ok(!!row(inc, PAUL) && !inc.activityScope.hidden, 'included: Paul appears in the team table');
  ok(ch(inc, 'whatsapp').attempts === 4 && ch(inc, 'call').attempts === 3, 'included: every channel counts his outreach again (WhatsApp 4, Phone 3)');
  ok(ch(inc, 'whatsapp').replies === 3, 'included: WhatsApp replies 3 of 4');
  ok(tpl(inc, 'paul_direct')?.leadsSent === 1 && tpl(inc, 'hook_v1')?.leadsSent === 2 && tpl(inc, 'hook_v1')?.replies === 1, 'included: every template send and reply is back');
  ok(niche(inc, 'plumber')?.messaged === 2 && niche(inc, 'plumber')?.replied === 1, 'included: plumbers messaged 2, replied 1');
  ok(inc.lostReasons.saidNo === 2, 'included: both "no"s are back');
  ok(row(inc, PAUL)!.calls === 2 && row(inc, PAUL)!.whatsappSent === 2, 'included: Paul\'s row has his calls and his sends (his own + the queue on his lead)');

  // With nobody hidden the output is EXACTLY what it was before this existed.
  const none = foldAdminOverview(input(new Set()));
  const strip = (o: typeof inc) => JSON.stringify({ ...o, activityScope: null });
  ok(strip(none) === strip(foldAdminOverview({ ...input(), hideActivityOf: undefined })), 'an empty hidden set and no setting give byte-identical figures');
}

/* ── C. Unaffected by the toggle ────────────────────────────────────────────────────────────────── */
{
  ok(JSON.stringify(hid.money) === JSON.stringify(inc.money), 'Money (revenue, paying clients, commission, cost, by seller) is identical in both states');
  ok(hid.money.bySeller.some((s) => s.userId === PAUL && s.gross === 99), 'Paul\'s own sale still counts in Money when hidden');
  ok(JSON.stringify(hid.clients) === JSON.stringify(inc.clients), 'Clients (handoffs / delivery) are identical in both states');
  ok(JSON.stringify(hid.attention) === JSON.stringify(inc.attention), 'What needs you is identical in both states');
  ok(JSON.stringify(hid.inventory) === JSON.stringify(inc.inventory), 'Inventory is identical in both states');
  ok(hid.today.sales === inc.today.sales && hid.today.revenue === inc.today.revenue && hid.yesterday.commission === inc.yesterday.commission, 'Today / yesterday money figures never move');
}

/* ── C2. Live-measured attribution cases (2026-10-02) ──────────────────────────────────────────────── */
{
  // F: a bare-status "no" (no history event, no recorder) on a lead PAUL holds; G: the same on Sumi's lead.
  // T: a lead a TEST account held when the queue messaged it (holderTimeline) — test activity everywhere else is out.
  const F = lead({ status: 'not_interested', created_at: at(10) });
  const G = lead({ status: 'not_interested', created_at: at(10), assigned_to_user_id: REP });
  const T = lead({ search_keyword: 'glazier', assigned_to_user_id: PAUL });
  const extra = (hide?: ReadonlySet<string>): AdminInput => {
    const b = input(hide);
    return { ...b, period: resolvePeriod('all', NOW), leads: [...b.leads, F, G, T],
      messages: [...b.messages, send(T, at(6), null, 'hook_v1'), reply(T, at(5))],
      activity: [...b.activity, act(T, 'lead_assigned', at(9), PAUL, { from: null, to: TEST }), act(T, 'lead_assigned', at(1), PAUL, { from: TEST, to: PAUL })] };
  };
  const i2 = foldAdminOverview(extra()); const h2 = foldAdminOverview(extra(new Set([PAUL])));
  const ids = (o: typeof i2) => new Set([...o.lostReasons.unrecordedLeads, ...o.lostReasons.rows.flatMap((r) => r.leads)].map((x) => x.id));
  ok(ids(i2).has(F.id) && ids(i2).has(G.id), 'included: bare-status "no"s are listed');
  ok(!ids(h2).has(F.id), 'hidden: a bare-status "no" on a lead Paul holds is his (the holder rule) and leaves the list');
  ok(ids(h2).has(G.id), "hidden: the same on Sumi's lead stays — it is hers");
  const tSent = (o: typeof i2) => o.niches.find((n) => n.key === 'glazier')?.messaged ?? 0;
  ok(tSent(i2) === 0 && tSent(h2) === 0 && tpl(i2, 'hook_v1')?.leadsSent === tpl(foldAdminOverview({ ...extra(), messages: extra().messages.filter((m) => m.lead_id !== T.id) }), 'hook_v1')?.leadsSent,
    "a send on a lead a TEST account held is left out of templates and niches in BOTH states (the header's test rule)");
}

/* ── D. The wiring: one toggle, sent to the server, admin resolved server-side ───────────────────── */
{
  const src = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  const dash = src('src/pages/Dashboard.tsx');
  ok(/useAdminOverview\(choice, isAdmin, hideMine\)/.test(dash), 'the Dashboard sends the one My activity setting to the server');
  ok((dash.match(/admin\.hideMyActivity/g) ?? []).length === 1, 'there is exactly one My activity preference');
  const hook = src('src/hooks/useAdminOverview.ts');
  ok(/queryKey: \[[^\]]*hideMine\]/.test(hook) && /hideMine \}\)/.test(hook), 'the setting is in the cache key and the request body');
  const fn = src('supabase/functions/admin-overview/index.ts');
  ok(/body\.hideMine === true \? who\.actor\.id : null/.test(fn), 'only an explicit true hides, and the caller is the signed-in admin');
  const loader = src('supabase/functions/_shared/admin-overview-load.ts');
  ok(/r\.role === "admin"/.test(loader) && /hideActivityOf,\s*\}\);/.test(loader), 'the loader resolves every admin account from user_roles and passes the set to the fold');
  ok(!/hideAdminActivityFor/.test(src('supabase/functions/business-summary/index.ts')), 'the weekly business summary never hides anyone');
}

console.log(fails ? `\n${fails} FAILED` : '\nAll passed');
if (fails) process.exit(1);
