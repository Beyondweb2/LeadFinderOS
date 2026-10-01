/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHO HELD A LEAD WHEN (2026-10-01): moving a lead never moves its history.
   Paul: "keep the historical records as they are … activity from the reassignment onward should
   attribute normally to the current user." The case: 82 leads worked under the Test account, moved to
   Paul. Their queue-sent openers (no sender named) stay the Test account's (excluded from performance);
   anything after the move is Paul's.
   Run: node scripts/run-tests.mjs holder-timeline
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { holderTimeline } from '../src/lib/holderTimeline.ts';
import { foldAdminOverview } from '../src/lib/adminMetrics.ts';
import { foldSalesPerformance } from '../src/lib/salesPerformance.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const TEST = 'test-acct'; const PAUL = 'paul'; const REP = 'rep';
const MOVE = '2026-09-30T15:40:00Z';
const at = (iso: string) => Date.parse(iso);

console.log('── the timeline ──');
{
  const moved = holderTimeline(PAUL, [{ kind: 'lead_assigned', actor_user_id: PAUL, data: { from: TEST, to: PAUL }, created_at: MOVE }]);
  ok(moved(at('2026-09-29T10:00:00Z')) === TEST, 'before the move: the Test account held it');
  ok(moved(at(MOVE)) === PAUL && moved(at('2026-10-01T09:00:00Z')) === PAUL, 'from the move on: Paul');
  ok(holderTimeline(REP, [])(at('2026-01-01T00:00:00Z')) === REP, 'no recorded move: the current holder (the 2026-09-27 backfill rows)');
  const claimed = holderTimeline(REP, [{ kind: 'lead_claimed', actor_user_id: REP, data: {}, created_at: '2026-09-28T09:00:00Z' }]);
  ok(claimed(at('2026-09-27T09:00:00Z')) === null && claimed(at('2026-09-29T09:00:00Z')) === REP, 'a claim: nobody before it, the claimer after');
  const twice = holderTimeline(PAUL, [
    { kind: 'lead_assigned', data: { from: null, to: REP }, created_at: '2026-09-28T09:00:00Z' },
    { kind: 'lead_unassigned', data: { from: REP, to: null }, created_at: '2026-09-29T09:00:00Z' },
    { kind: 'lead_assigned', data: { from: null, to: PAUL }, created_at: '2026-09-30T09:00:00Z' },
  ]);
  ok(twice(at('2026-09-28T12:00:00Z')) === REP && twice(at('2026-09-29T12:00:00Z')) === null && twice(at('2026-09-30T12:00:00Z')) === PAUL, 'several moves, unassigned in between');
}

const period = { key: '30d', label: 'Last 30 days', fromDay: '2026-09-01', toDay: '2026-10-01', fromMs: at('2026-09-01T00:00:00Z'), toMs: at('2026-10-02T00:00:00Z') };
const lead = { id: 'L1', business_name: 'Hollyfield Roofing', status: 'replied', assigned_to_user_id: PAUL, user_id: PAUL, added_by_user_id: TEST, is_archived: false, amount_paid: null, created_at: '2026-09-27T13:54:00Z' };
const before = { id: 'm1', lead_id: 'L1', direction: 'outbound', status: 'read', created_at: '2026-09-29T10:00:00Z', template_name: 'initial_contact', sent_by_user_id: null, body: 'Hi' };
const reply = { id: 'm2', lead_id: 'L1', direction: 'inbound', status: 'received', created_at: '2026-09-29T11:00:00Z', template_name: null, sent_by_user_id: null, body: 'Yes this is us' };
const after = { id: 'm3', lead_id: 'L1', direction: 'outbound', status: 'read', created_at: '2026-10-01T08:00:00Z', template_name: 'audit_followup_call', sent_by_user_id: null, body: 'Follow up' };
const move = { id: 'a1', lead_id: 'L1', actor_user_id: PAUL, kind: 'lead_assigned', data: { from: TEST, to: PAUL }, created_at: MOVE };

console.log('\n── the Admin dashboard (adminMetrics) ──');
{
  // deno-lint-ignore no-explicit-any
  const input: any = {
    period, today: period, yesterday: period, week: period, month: period, nowMs: at('2026-10-01T12:00:00Z'), bookOwnerId: PAUL,
    people: [{ userId: PAUL, name: 'Paul', role: 'admin', status: 'active' }, { userId: TEST, name: 'Test', role: 'sales', status: 'active' }],
    exclusions: { users: new Set([TEST]), leads: new Set(), phones: new Set(), emails: new Set(), rows: [] },
    leads: [lead], messages: [before, reply, after], activity: [move], suppressions: [], ledger: [], onboarding: [], commissionLines: [], commissionTotals: null,
    commissionDueBySeller: new Map(), payoutsBySeller: new Map(), cost: { period: [], today: [], yesterday: [], week: [], month: [] }, triage: null,
  };
  const o = foldAdminOverview(input);
  const paul = o.team.find((r) => r.userId === PAUL);
  ok(paul?.whatsappSent === 1, `Paul is credited the ONE send after the move, not last week's (got ${paul?.whatsappSent})`);
  ok(o.excludedActivity.whatsappSent === 1, 'the send before the move stays the Test account\'s — counted apart as excluded');
  ok((paul?.replies ?? 0) === 0 && o.totals.replies === 0, 'the reply before the move is not Paul\'s, and stays out of the totals (a test account\'s)');
  const noMove = foldAdminOverview({ ...input, activity: [], exclusions: { ...input.exclusions, users: new Set() } });
  ok(noMove.team.find((r) => r.userId === PAUL)?.whatsappSent === 2, 'a lead with no recorded move: every unnamed send is the holder\'s, as before');
}

console.log('\n── the Sales dashboard (salesPerformance) ──');
{
  const base = { personId: PAUL, sinceMs: null, leads: [{ ...lead }], messages: [before, reply, after], activity: [move], linkEvents: [], hits: [], campaignNames: new Map() };
  // deno-lint-ignore no-explicit-any
  const r = foldSalesPerformance(base as any);
  ok(r.funnel.contacted === 1, 'Paul\'s funnel: the lead counts as contacted by him (the send after the move)');
  ok(r.funnel.responded === 0, '…and last week\'s reply to the Test account\'s opener is not his reply');
  // deno-lint-ignore no-explicit-any
  const earlyOnly = foldSalesPerformance({ ...base, messages: [before, reply] } as any);
  ok(earlyOnly.funnel.contacted === 0, 'with only last week\'s opener, Paul has not contacted it yet');
  const { assigned_to_user_id: _drop, ...noOwner } = lead;
  // deno-lint-ignore no-explicit-any
  const old = foldSalesPerformance({ ...base, leads: [noOwner], messages: [before, reply] } as any);
  ok(old.funnel.contacted === 1, 'a caller that did not read the owner gets the old behaviour (never a silent zero)');
}

console.log(`\n${fails ? `${fails} FAILED` : 'all passed'}`);
if (fails) process.exit(1);
