/* ════════════════════════════════════════════════════════════════════════════════════════════════
   INBOX WORKFLOW (2026-09-30, release C): assignment, the star, the header, Next Action filters.
   Run: npx tsx scripts/inbox-workflow.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { passesNextActionFilter, nextActionKindOf, nextActionSortKey, NEXT_ACTION_WHEN_OPTIONS, NEXT_ACTION_KIND_OPTIONS, NEXT_ACTION_LABEL } from '../src/lib/nextActionView.ts';
import { INBOX_QUICK_FILTERS, passesQuickFilter } from '../src/lib/conversationState.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const T = '2026-09-30';
const L = (next_action: string | null, next_action_date: string | null) => ({ next_action, next_action_date });

console.log('── Next Action filters (one rule, both screens) ──');
{
  ok(passesNextActionFilter(L('call', '2026-09-29'), 'overdue', 'all', T) && !passesNextActionFilter(L('call', T), 'overdue', 'all', T), 'overdue = before today (London day)');
  ok(passesNextActionFilter(L('call', T), 'today', 'all', T) && passesNextActionFilter(L('call', '2026-10-01'), 'tomorrow', 'all', T), 'due today / due tomorrow');
  ok(passesNextActionFilter(L('call', '2026-10-07'), 'next7', 'all', T) && !passesNextActionFilter(L('call', '2026-10-08'), 'next7', 'all', T) && passesNextActionFilter(L('call', '2026-10-08'), 'later', 'all', T), 'next 7 days, then later');
  ok(passesNextActionFilter(L('call', null), 'undated', 'all', T) && !passesNextActionFilter(L('call', null), 'overdue', 'all', T), 'an action with no date is "Set, no date" — never given a date');
  ok(passesNextActionFilter(L('none', T), 'none', 'all', T) && passesNextActionFilter(L(null, null), 'none', 'all', T) && !passesNextActionFilter(L('none', '2026-09-01'), 'overdue', 'all', T), 'a cleared (done) action is "No next action", never still due');
  ok(passesNextActionFilter(L('send_follow_up', T), 'today', 'whatsapp', T) && !passesNextActionFilter(L('call', T), 'today', 'whatsapp', T), 'the type filter narrows within the day filter');
  ok(nextActionKindOf('meeting') === 'meeting' && nextActionKindOf('2nd_follow_up') === 'whatsapp' && nextActionKindOf('follow_up') === 'other' && nextActionKindOf('none') === null, 'types come only from stored values');
  ok(NEXT_ACTION_KIND_OPTIONS.every((o) => o.value === 'all' || o.value === 'other' || Object.keys(NEXT_ACTION_LABEL).some((k) => nextActionKindOf(k) === o.value)), 'every type option matches at least one stored value');
  ok(NEXT_ACTION_WHEN_OPTIONS.map((o) => o.value).join() === 'all,overdue,today,tomorrow,next7,later,undated,none', 'the day options');
  const sorted = [L('call', '2026-10-02'), L(null, null), L('call', null), L('call', '2026-09-20')].sort((a, b) => nextActionSortKey(a).localeCompare(nextActionSortKey(b)));
  ok(sorted[0].next_action_date === '2026-09-20' && sorted[1].next_action_date === '2026-10-02' && sorted[2].next_action === 'call' && sorted[3].next_action === null, 'sort: most overdue first, then soonest, then undated, then none');
}

console.log('\n── Waiting on us / waiting on them ──');
{
  ok(INBOX_QUICK_FILTERS.some((f) => f.value === 'waiting_them' && f.label === 'Waiting on them'), 'a "Waiting on them" view beside "Waiting on us"');
  ok(passesQuickFilter('waiting_them', { unread: false, waitingSinceMs: null, waitingOnThem: true }) && !passesQuickFilter('waiting_them', { unread: false, waitingSinceMs: 1, waitingOnThem: false }), 'it reads the conversation state\'s own waitingOnThem');
}

console.log('\n── the Inbox uses them, for both roles ──');
{
  const inbox = read('src/pages/Inbox.tsx');
  ok(/passesNextActionFilter\(c\.leadId \? leadByIdForState\.get\(c\.leadId\) : null, naWhen, naKind, today\)/.test(inbox), 'the Inbox filters on the lead\'s stored next action');
  ok(/'inbox-na-when'/.test(inbox) && /'inbox-na-kind'/.test(inbox) && /'inbox-sort'/.test(inbox), 'the choices are remembered per person (session)');
  ok(/Reset next action filters/.test(inbox), 'one click resets them');
  ok(!/isAdmin && \(\s*<Select value=\{naWhen\}/.test(inbox), 'not an admin-only control');
}

console.log('\n── the star and the green badge ──');
{
  const inbox = read('src/pages/Inbox.tsx');
  ok(/!\(activeSales\.view\.state === 'interested' && active\.isPotentialWork\) && <SalesStatePill/.test(inbox), 'the green Interested pill is hidden only when it repeats the star — other states still show');
  ok(/onClick=\{\(\) => void toggleStar\(active\)\}/.test(inbox) && /aria-pressed=\{!!active\.isPotentialWork\}/.test(inbox), 'the header star is the toggle');
  const qa = read('src/lib/leadQuickActions.ts');
  ok(/rpc\('lead_mark_interested', \{ _lead_id: leadId, _on: on \}\)/.test(qa) && !/from\('outreach_leads'\)\.update\(\{ is_potential_work/.test(qa), 'one path for both roles: lead_mark_interested (History records it); no direct admin write');
  const mig = read('supabase/migrations/20261001190000_sales_workflow_inbox.sql');
  ok(/new\.status = 'not_interested' and old\.status is distinct from 'not_interested'/.test(mig) && /new\.is_potential_work := false/.test(mig) && /before update of status on public\.outreach_leads/.test(mig), 'Not interested clears the star in the database — for every writer');
  ok(!/update public\.outreach_leads set is_potential_work/.test(mig), 'existing rows are not rewritten');
}

console.log('\n── the header is lighter ──');
{
  const inbox = read('src/pages/Inbox.tsx');
  const header = inbox.slice(inbox.indexOf('{/* Thread header */}'), inbox.indexOf('<DropdownMenuContent align="end" className="w-56">'));
  ok(!/<span className="text-\[11px\] text-muted-foreground">\+\{active\.phone\}<\/span>/.test(header), 'the phone number left the header line…');
  ok(/aria-label="Copy the number"/.test(inbox), '…and is in More, with Copy');
}

console.log('\n── assignment and transfer requests ──');
{
  const owner = read('src/components/LeadOwnerControl.tsx');
  ok(/if \(r\.unchanged\) \{ toast\(\{ title: name \? `Already assigned to/.test(owner), 'picking the current owner says so (the server writes no History and no notice)');
  ok(/const notified = !!to && to !== user\?\.id && team\.byId\.get\(to\)\?\.role === 'sales';/.test(owner), 'the confirmation only says "notified" when the database really notified someone');
  ok(/role === 'sales' && ownerId === user\?\.id/.test(owner) && /rpc\('request_lead_transfer'/.test(owner), 'a salesperson can request a transfer of their own lead; only the admin can assign');
  const mig = read('supabase/migrations/20261001190000_sales_workflow_inbox.sql');
  ok(/if public\.my_role\(\) is distinct from 'sales' then return jsonb_build_object\('ok', false, 'error', 'sales_only'\)/.test(mig) && /perform public\._require_work\(_lead_id\);/.test(mig), 'request_lead_transfer: salespeople only, on a lead they may work');
  ok(/'transfer_requested', jsonb_build_object\('note', v_note\)/.test(mig) && /'transfer_request'/.test(mig), '…recorded in History and sent to every active admin');
  ok(/' assigned you '/.test(mig) && /'\/inbox\?lead=' \|\| new\.id/.test(mig), 'the assignment notice names who assigned it and opens the conversation');
  ok(/transfer_requested: 'Transfer requested'/.test(read('src/lib/salesCrm.ts')), 'History labels the request');
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
