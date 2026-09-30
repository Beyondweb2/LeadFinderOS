/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SALES TEAM BOARD (2026-10-01, docs/sales-team-board.md): the rules and the shape.
   The live, rolled-back security + workflow test is supabase/tests/sales-team-board.sql (41 checks).
   Run: node scripts/run-tests.mjs team-board
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import {
  attentionAssignable, dueText, isOverdue, itemDueDate, itemTarget, sortBoard, tabOf, unreadCount, boardRefusalText,
  type BoardItem,
} from '../src/lib/teamBoard.ts';
import { foldAdminOverview } from '../src/lib/adminMetrics.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const T = '2026-10-01';
const item = (o: Partial<BoardItem>): BoardItem => ({
  id: Math.random().toString(36).slice(2), kind: 'task', title: 't', body: null, details: {}, link: null, due_date: null, priority: null,
  published_at: '2026-09-30T10:00:00Z', edited_at: null, author: 'Paul', read_at: null, task_status: 'todo', status_at: null, completed_at: null,
  cancelled_reason: null, lead: null, ...o,
});

console.log('── dates: one per task; a lead assignment uses the LEAD\'s Next Action ──');
{
  ok(itemDueDate(item({ due_date: '2026-10-03' })) === '2026-10-03', 'a task: its own due date');
  const la = item({ kind: 'lead_assignment', due_date: '2026-12-25', lead: { id: 'L', name: 'X', mine: true, next_action: 'call', next_action_date: '2026-10-02' } });
  ok(itemDueDate(la) === '2026-10-02', '⛔ a lead assignment: the lead\'s Next Action date, never a stored copy');
  ok(itemDueDate({ ...la, lead: { ...la.lead!, next_action: 'none' } }) === null, 'a cleared Next Action (none) is no date');
  ok(itemDueDate({ ...la, lead: { id: null, name: null, mine: false } }) === null, 'a lead no longer theirs shows no date');
  ok(isOverdue(item({ due_date: '2026-09-30' }), T) && !isOverdue(item({ due_date: T }), T), 'overdue = before today (London day), derived');
  ok(!isOverdue(item({ due_date: '2026-09-01', task_status: 'completed' }), T) && !isOverdue(item({ due_date: '2026-09-01', task_status: 'cancelled' }), T), 'a finished or cancelled task is never overdue');
  ok(!isOverdue(item({ kind: 'announcement', due_date: '2026-09-01', task_status: null }), T), 'an update is never overdue');
  ok(dueText('2026-09-29', T)!.startsWith('Overdue') && dueText(T, T) === 'Due today' && dueText('2026-10-02', T)!.startsWith('Due '), 'due words');
}

console.log('\n── tabs, ordering, unread ──');
{
  ok(tabOf(item({ kind: 'announcement', task_status: null })) === 'updates' && tabOf(item({ kind: 'custom', task_status: null })) === 'updates', 'information → Updates');
  ok(tabOf(item({ task_status: 'in_progress' })) === 'todo' && tabOf(item({ kind: 'lead_assignment', task_status: 'todo' })) === 'todo', 'open work → To do');
  ok(tabOf(item({ task_status: 'completed' })) === 'completed' && tabOf(item({ task_status: 'cancelled' })) === 'completed', 'done or cancelled → Completed');
  const a = item({ title: 'later', due_date: '2026-10-09' }); const b = item({ title: 'late', due_date: '2026-09-28' }); const c = item({ title: 'none', priority: 'high' }); const d = item({ title: 'soon', due_date: '2026-10-02' });
  ok(sortBoard([a, c, d, b], 'todo', T).map((x) => x.title).join() === 'late,soon,later,none', 'To do: overdue first, then soonest, then undated');
  const r1 = item({ kind: 'announcement', task_status: null, read_at: '2026-09-30T11:00:00Z', published_at: '2026-09-30T12:00:00Z', title: 'read' });
  const r2 = item({ kind: 'announcement', task_status: null, published_at: '2026-09-29T12:00:00Z', title: 'unread' });
  ok(sortBoard([r1, r2], 'updates', T)[0].title === 'unread', 'Updates: unread first');
  ok(unreadCount([r1, r2, item({}), item({ task_status: 'completed' })]) === 2, 'unread = unread updates + never-opened open tasks (finished ones do not count)');
}

console.log('\n── where the button goes (internal only) ──');
{
  ok(itemTarget(item({ lead: { id: 'L1', name: 'A', mine: true } }))!.path === '/inbox?lead=L1', 'a lead of theirs → its conversation');
  ok(itemTarget(item({ lead: { id: null, name: null, mine: false }, link: null })) === null, 'a lead that moved on → no button to a lead they cannot open');
  ok(itemTarget(item({ link: '//evil.example' })) === null && itemTarget(item({ link: 'https://x.test' })) === null, '⛔ never an outside link');
  ok(itemTarget(item({ kind: 'template_update', task_status: null, details: { channel: 'whatsapp' } }))!.path === '/inbox', 'a WhatsApp template → the Inbox, where it is used');
  ok(itemTarget(item({ kind: 'targeting', task_status: null }))!.path === '/find-leads', 'a targeting priority → Find leads');
}

console.log('\n── Needs your attention: what may be delegated ──');
{
  ok(attentionAssignable({ kind: 'quote_quiet', leadId: 'L', group: 'today' }) && attentionAssignable({ kind: 'signup_unpaid', leadId: 'L', group: 'today' }), 'quote gone quiet / signed up not paid → Assign');
  ok(attentionAssignable({ kind: 'reply_question', leadId: 'L', group: 'today' }), 'a reply needing a follow-up → Assign');
  ok(!attentionAssignable({ kind: 'no_trade', leadId: null, group: 'review' }), '⛔ an aggregate ("N leads missing a trade") → never');
  for (const k of ['payment_dispute', 'payment_failed', 'setup_not_started', 'remeasure_overdue', 'something_new']) ok(!attentionAssignable({ kind: k, leadId: 'L', group: 'today' }), `⛔ ${k} → never (money, delivery, or unknown)`);
  for (const k of ['reply_client_message', 'reply_payment_issue', 'reply_complaint', 'reply_opt_out', 'reply_escalation']) ok(!attentionAssignable({ kind: k, leadId: 'L', group: 'today' }), `⛔ ${k} → stays Paul's`);
  ok(!attentionAssignable({ kind: 'reply_question', leadId: 'L', group: 'urgent' }), '⛔ anything urgent stays on Paul\'s list');
  ok(boardRefusalText('lead_not_theirs').includes('Lead assignment') && boardRefusalText('brand_new').includes('brand_new'), 'refusals in words; an unknown code shows itself');
}

console.log('\n── delegated follow-ups leave Paul\'s list, and come back ──');
{
  const period = { key: '30d', label: 'Last 30 days', fromDay: '2026-09-01', toDay: T, fromMs: Date.parse('2026-09-01T00:00:00Z'), toMs: Date.parse('2026-10-02T00:00:00Z') };
  const REP = 'rep-1'; const OWNER = 'owner';
  const lead = { id: 'L1', business_name: 'Access ASAP Locksmiths', status: 'price_given', assigned_to_user_id: REP, user_id: OWNER, added_by_user_id: null, is_archived: false, amount_paid: null, created_at: '2026-09-01T00:00:00Z' };
  const quiet = { id: 'm1', lead_id: 'L1', direction: 'outbound', status: 'read', created_at: '2026-09-20T10:00:00Z', template_name: 'x', sent_by_user_id: REP };
  // deno-lint-ignore no-explicit-any
  const base: any = {
    period, today: period, yesterday: period, week: period, month: period, nowMs: Date.parse('2026-10-01T09:00:00Z'), bookOwnerId: OWNER,
    people: [{ userId: REP, name: 'Sam', role: 'sales', status: 'active' }, { userId: OWNER, name: 'Paul', role: 'admin', status: 'active' }],
    exclusions: { users: new Set(), leads: new Set(), phones: new Set(), emails: new Set(), rows: [] },
    leads: [lead], messages: [quiet], activity: [], suppressions: [], ledger: [], onboarding: [], commissionLines: [], commissionTotals: null,
    commissionDueBySeller: new Map(), payoutsBySeller: new Map(), cost: { period: [], today: [], yesterday: [], week: [], month: [] }, triage: null,
  };
  let o: ReturnType<typeof foldAdminOverview> | null = null;
  try { o = foldAdminOverview({ ...base }); } catch (e) { ok(false, `fold ran: ${(e as Error).message}`); }
  if (o) {
    ok(o.attention.some((i) => i.kind === 'quote_quiet') && o.delegated === null, 'board not read → the item stays, nothing counted as delegated');
    const open = foldAdminOverview({ ...base, delegatedTasks: [{ post_id: 'p', lead_id: 'L1', user_id: REP, task_status: 'todo', published_at: '2026-09-30T00:00:00Z' }] });
    ok(!open.attention.some((i) => i.kind === 'quote_quiet') && open.delegated?.count === 1 && open.delegated.items[0].owner === 'Sam', 'an open board task held by the lead\'s holder → off the list, in the delegated line');
    const done = foldAdminOverview({ ...base, delegatedTasks: [] });
    ok(done.attention.some((i) => i.kind === 'quote_quiet') && done.delegated?.count === 0, 'task completed / cancelled → the item comes back while it is still true');
    const other = foldAdminOverview({ ...base, delegatedTasks: [{ post_id: 'p', lead_id: 'L1', user_id: 'someone-else', task_status: 'todo', published_at: '2026-09-30T00:00:00Z' }] });
    ok(other.attention.some((i) => i.kind === 'quote_quiet'), 'a task held by someone who no longer holds the lead does not hide it');
  }
}

console.log('\n── the shape: server-decided, one canonical move ──');
{
  const mig = read('supabase/migrations/20261001200000_sales_team_board.sql');
  ok(/revoke all on public\.team_posts, public\.team_post_recipients, public\.team_post_events from anon, authenticated;/.test(mig) && /grant select on public\.team_posts, public\.team_post_recipients, public\.team_post_events to authenticated;/.test(mig), 'no write grants on any board table — only the functions write');
  for (const f of ['team_save_post', 'team_edit_published', 'team_discard_draft', 'team_cancel_task', 'team_board_mark_read', 'team_task_set_status', 'team_board_mine', 'team_board_admin', 'assign_lead_with_brief', 'team_recipients_preview'])
    ok(new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from public, anon;`).test(mig), `${f}: not callable by anon`);
  for (const f of ['team_save_post', 'team_edit_published', 'team_discard_draft', 'team_cancel_task', 'team_board_admin', 'assign_lead_with_brief', 'team_recipients_preview']) {
    const body = mig.slice(mig.indexOf(`function public.${f}(`));
    ok(/if public\.my_role\(\) is distinct from 'admin' then raise exception 'admin_only'/.test(body.slice(0, body.indexOf('end $$'))), `${f}: admin-only in the database`);
  }
  ok(/r := public\.assign_lead\(_lead_id, _to_user_id\);/.test(mig), 'assign_lead_with_brief runs THE canonical assign_lead (no second ownership logic)');
  ok(/perform public\.lead_set_follow_up\(_lead_id,/.test(mig), 'a date given on assignment is written through lead_set_follow_up (the one Next Action writer)');
  ok(/after update of assigned_to_user_id on public\.outreach_leads/.test(mig) && /cancelled_reason = 'reassigned'/.test(mig), 'a moved lead cancels the previous holder\'s open tasks, whatever moved it');
  ok(/if p\.kind <> 'lead_assignment' then/.test(mig), 'a lead assignment sends ONE notice (the assignment trigger\'s), not two');
  ok(/on conflict \(user_id, dedupe_key\)|'team:' \|\| _id/.test(mig) && /client_key text unique/.test(mig), 'idempotent: one post per client key, one notice per person per post');
  const status = mig.slice(mig.indexOf('function public.team_task_set_status('), mig.indexOf('function public.team_board_mine('));
  ok(!/outreach_leads|whatsapp|suppression|next_action/.test(status), '⛔ completing a task touches nothing on the lead (no stage, Next Action, message or suppression)');
  const crm = read('src/hooks/useSalesCrm.ts');
  ok(/rpc\('assign_lead_with_brief'/.test(crm) && /rpc\('assign_lead'/.test(read('src/components/BulkAssignSelect.tsx')) === false && /leadRpc\('assign_lead'/.test(read('src/components/BulkAssignSelect.tsx')), 'one lead → assign_lead_with_brief (board task); bulk stays on plain assign_lead');
  const comp = read('src/components/team/TeamComposer.tsx');
  ok(/WHATSAPP_TEMPLATES\.map/.test(comp) && !/send-whatsapp-message|invokeEdge/.test(comp), 'a template update lists only approved WhatsApp templates and sends nothing');
  ok(/assign\.mutateAsync\(/.test(comp) && /useAssignLeadWithBrief/.test(comp), 'the composer\'s lead assignment is the same move as the Admin Assign and the Inbox');
  const board = read('src/components/team/TeamBoard.tsx');
  ok(/const r = await b\.setStatus\.mutateAsync/.test(board) && /if \(!r\.ok\)/.test(board), 'a task shows Completed only after the server said yes');
  const sd = read('src/pages/SalesDashboard.tsx');
  ok(/\{role === 'sales' && <TeamBoard \/>\}/.test(sd), 'the board is on the Sales dashboard for a salesperson (their own only)');
  const dash = read('src/pages/Dashboard.tsx');
  ok(/Send to sales team/.test(dash) && /<TeamOversight enabled=\{isAdmin\}/.test(dash) && /onAssign=\{\(i\) => setCompose\(\{ kind: 'lead_assignment'/.test(dash), 'Admin dashboard: one Send to sales team, the oversight panel, Assign from Needs your attention');
  const notif = read('src/hooks/useNotifications.ts');
  ok(/TEAM_BOARD_KINDS\.has\(p\.new\.kind\)/.test(notif) && /queryKey: \['team-board'\]/.test(notif), 'a team notice re-reads the board at once (no second realtime channel, no second notification centre)');
}

console.log(`\n${fails ? `${fails} FAILED` : 'all passed'}`);
if (fails) process.exit(1);
