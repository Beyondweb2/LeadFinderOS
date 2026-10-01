/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ONE NEXT ACTION: one form, one write, one list of types, one optional UK time (2026-10-02, Paul;
   docs/outreach-workspace.md §J–K). The Outreach row, the phone card, the lead workspace, the bulk menu and the
   Inbox's lead popup all save through src/lib/nextActionWrite.ts (lead_set_follow_up, both roles, History)
   and the cell and the workspace draw the same form (NextActionForm). Live SQL half:
   supabase/tests/next-action-one-flow.sql.
   Run: node scripts/run-tests.mjs next-action-one-flow
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync } from 'node:fs';
import { NEXT_ACTION_OPTIONS, activityDetail, followUpBucket } from '../src/lib/salesCrm.ts';
import {
  NEXT_ACTION_KIND_OPTIONS, NEXT_ACTION_LABEL, londonInstant, londonLocalInput, meetingDayTime, nextActionKindOf, nextActionSortKey,
  nextActionText, nextActionView, nextActionViewOf, passesNextActionFilter,
} from '../src/lib/nextActionView.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const TODAY = '2026-10-01';
const at = (iso: string) => Date.parse(iso);

console.log('── one write: every screen saves through nextActionWrite ──');
const editor = read('src/components/NextActionEditor.tsx');
const form = read('src/components/NextActionForm.tsx');
const crm = read('src/components/LeadCrmPanel.tsx');
const hook = read('src/hooks/useOutreach.ts');
const table = read('src/components/OutreachTable.tsx');
const card = read('src/components/OutreachMobileCard.tsx');
const write = read('src/lib/nextActionWrite.ts');
const mig = read('supabase/migrations/20261002160100_next_action_time.sql');
ok(editor.includes("import { saveNextAction, type NextActionInput } from '@/lib/nextActionWrite';") && editor.includes('const r = await saveNextAction(lead.id, a, lead);'), 'the Outreach cell saves through saveNextAction');
ok(table.includes('<NextActionEditor lead={lead} />') && card.includes('<NextActionEditor lead={lead} />'), '…for the table row and the phone card alike');
ok(/<NextActionForm compact/.test(editor) && /<NextActionForm key=/.test(crm), 'the cell and the lead workspace draw the SAME form (NextActionForm)');
ok(crm.includes('afterWrite(await saveNextAction(leadId, a, stateLead()),') && crm.includes('afterWrite(await bookMeeting(leadId, iso, note ?? lead.next_action_note, stateLead()),'), 'the workspace saves through the same write (Next Action and the meeting box)');
ok(/const r = await saveNextAction\(leadId, \{/.test(hook) && !/next_action: nextAction/.test(hook), 'the bulk menu / Inbox popup (useOutreach.updateNextAction) use the same write; no direct row write');
ok(write.includes("leadRpc('lead_set_follow_up', { _lead_id: leadId, _next_action: a.nextAction, _date: date, _note: note, _time: time, _done: !!(none && a.done) })"), 'the write is lead_set_follow_up (role + ownership checked, History) for both roles, with the time and ✓ Done');
ok(/notifyLeadChanged\(leadId, undefined, patch\)/.test(write), '…and announces the change, so Outreach, the Inbox and the workspace show it at once');
const walk = (dir: string): string[] => readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })
  .flatMap((e) => e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [`${dir}/${e.name}`] : []);
const ALLOWED = new Set(['src/lib/nextActionWrite.ts', 'src/lib/leadRpc.ts', 'src/lib/salesPatchPlan.ts', 'src/lib/leadOutcome.ts']);
const callers = walk('src').filter((p) => !ALLOWED.has(p) && /['"]lead_set_follow_up['"]/.test(read(p)) && !p.startsWith('src/integrations/'));
ok(callers.length === 0, `no screen calls lead_set_follow_up itself (${callers.join(', ') || 'none'})`);
ok(read('src/lib/leadOutcome.ts').match(/_next_action: '([a-z_]+)'/g)?.every((m) => m.includes("'none'")) ?? true, '…a logged outcome only ever clears it (unchanged)');
ok((read('src/lib/leadRpc.ts').match(/_time: time/g) ?? []).length === 1 && hook.includes('time: date && date === lead?.next_action_date ? (lead?.next_action_time ?? null) : null,'), 'the bulk menu and a salesperson\'s patch keep the time while its day stays (never wiped by a type-only change)');

console.log('\n── one list of types (Send proposal and Chase payment added; nothing else) ──');
const offered = NEXT_ACTION_OPTIONS.map((o) => o.value);
ok(JSON.stringify(offered) === JSON.stringify(['call', 'send_follow_up', 'email', 'follow_up', 'send_info', 'send_proposal', 'chase_payment', 'meeting', 'none']), `the canonical list (${offered.join(', ')})`);
ok(NEXT_ACTION_OPTIONS.map((o) => o.label).join('|') === 'Call|WhatsApp follow-up|Email|Follow up (other)|Send information|Send proposal|Chase payment|Meeting|Nothing planned', 'in the order Paul asked for');
ok(!offered.some((v) => /agreement|signature/.test(v)), 'no agreement / signature type (that state will come from the contract workflow)');
ok(form.includes('{NEXT_ACTION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}'), 'the form offers every canonical type');
ok(table.includes('{CRM_NEXT_ACTION_OPTIONS.map((opt) => ('), 'the bulk "Set Action" menu offers the same list');
ok(offered.every((v) => v === 'none' || NEXT_ACTION_LABEL[v]), 'every offered type has its words in the one view');
const enumSql = readdirSync(new URL('../supabase/migrations', import.meta.url)).map((f) => read(`supabase/migrations/${f}`)).join('\n');
ok(['email', 'send_info', 'meeting', 'send_proposal', 'chase_payment'].every((v) => enumSql.includes(`add value if not exists '${v}'`)), 'every offered type exists in the database enum');
ok(form.includes("{!known && lead.next_action ? <SelectItem value={lead.next_action}>{NEXT_ACTION_LABEL[lead.next_action]"), 'an older stored type is shown in its own words and can be kept (never offered)');
ok(!offered.includes('send_voice_note') && NEXT_ACTION_LABEL.send_voice_note === 'Voice note', '…Voice note reads but is not selectable');
/* The reminder's words are the SQL twin of NEXT_ACTION_LABEL — the same map, every key. */
const sqlLabel = mig.slice(mig.indexOf('create or replace function public.next_action_label'), mig.indexOf('/* THE ONE NEXT-ACTION WRITE'));
const sqlPairs = Object.fromEntries([...sqlLabel.matchAll(/when '([a-z_0-9]+)' then '([^']+)'/g)].map((m) => [m[1], m[2]]));
ok(JSON.stringify(Object.entries(sqlPairs).sort()) === JSON.stringify(Object.entries(NEXT_ACTION_LABEL).sort()), `the reminder's SQL words equal NEXT_ACTION_LABEL (${Object.keys(sqlPairs).length} types)`);

console.log('\n── the filters: the two new types directly, no duplicate ──');
const kinds = NEXT_ACTION_KIND_OPTIONS.map((o) => o.value);
ok(kinds.includes('send_proposal') && kinds.includes('chase_payment') && new Set(kinds).size === kinds.length, `Type filter: Send proposal and Chase payment, each once (${kinds.join(', ')})`);
ok(nextActionKindOf('send_proposal') === 'send_proposal' && nextActionKindOf('chase_payment') === 'chase_payment' && nextActionKindOf('send_info') === 'send_info', '…a proposal is not "Send information", a payment chase is not "Other"');
ok(passesNextActionFilter({ next_action: 'chase_payment', next_action_date: '2026-10-02' }, 'all', 'chase_payment', TODAY) && !passesNextActionFilter({ next_action: 'chase_payment', next_action_date: '2026-10-02' }, 'all', 'send_proposal', TODAY), 'filtering by type finds exactly that type');

console.log('\n── an optional UK time for every type ──');
ok(form.includes('aria-label="Next action date"') && form.includes('aria-label="Time (optional, UK)"') && form.includes('aria-label="Next action note"') && form.includes('maxLength={500}'), 'the form has the day, an optional UK time for every type and the note (≤500)');
ok(!/isMeeting && \(\s*<Input type="time"/.test(form) && form.includes("<Input type=\"time\" value={time} onChange={(e) => setTime(e.target.value)} disabled={nextAction === 'none'}"), 'the time box is there for every type (Meeting only emphasises it)');
ok(form.includes('data-testid="next-action-no-time"') && form.includes("time: date && time ? time : null"), 'a time can be removed while the day stays; no time is ever required');
ok(write.includes("const meetingAt = a.nextAction === 'meeting' && date && time ? londonInstant(date, time) : null;") && /if v_action = 'meeting' and v_time is not null then\n\s+v_at := public\.next_action_due_at\(v_date, v_time\);/.test(mig), 'a Meeting with a time books call_booked_at from the SAME time (server-side; one meeting time)');
ok(/where id = _lead_id and next_action = 'meeting'/.test(mig), '…and moving the booked time moves the Meeting with it (lead_set_call_booked)');
ok(/add column if not exists next_action_time time;/.test(mig) && /check \(next_action_time is null or next_action_date is not null\)/.test(mig), 'next_action_time is a UK wall-clock time ON next_action_date (a time needs a day)');
ok(/\(\(_d \+ _t\) at time zone 'Europe\/London'\)/.test(mig), 'the database reads the day + time as Europe/London (BST/GMT by the day)');
const bst = meetingDayTime('2026-10-02T13:30:00Z');
ok(bst.day === '2026-10-02' && bst.time === '14:30', 'a booked instant reads in UK time (BST: 13:30Z → 14:30)');
ok(londonInstant('2026-10-02', '14:30') === '2026-10-02T13:30:00.000Z', 'typed 14:30 is 14:30 UK in summer (BST), whatever this computer\'s clock');
ok(londonInstant('2026-12-02', '14:30') === '2026-12-02T14:30:00.000Z', '…and in winter (GMT)');
ok(londonInstant('2026-03-29', '00:30') === '2026-03-29T00:30:00.000Z' && londonInstant('2026-03-29', '03:30') === '2026-03-29T02:30:00.000Z', '…and either side of the spring change (29 Mar 2026: 00:30 GMT, 03:30 BST)');
ok(londonInstant('2026-10-25', '00:30') === '2026-10-24T23:30:00.000Z' && londonInstant('2026-10-25', '03:30') === '2026-10-25T03:30:00.000Z', '…and the autumn change (25 Oct 2026: 00:30 BST, 03:30 GMT)');
ok(londonLocalInput(londonInstant('2026-10-02', '09:05')!) === '2026-10-02T09:05', 'round trip: what is typed is what is shown');
ok(londonInstant('2026-10-02', '') === null && londonInstant('', '14:30') === null, 'no day or no time → no instant (never a guessed one)');
ok(crm.includes('londonInstant(localValue.slice(0, 10), localValue.slice(11, 16))') && crm.includes('(UK time)') && !crm.includes('your local time'), 'the workspace\'s meeting boxes read and show UK time too');

console.log('\n── it shows the same compact words everywhere ──');
const NOW = at('2026-10-01T10:00:00Z');
const v = (na: string, d: string | null, t: string | null, note: string | null = null, today = TODAY, now = NOW) => nextActionText(nextActionViewOf(na, d, note, today, t, now)!);
ok(v('call', '2026-10-02', null) === 'Call · Tomorrow', `untimed: ${v('call', '2026-10-02', null)}`);
ok(v('call', '2026-10-02', '14:30:00') === 'Call · Tomorrow · 14:30', `timed (a stored '14:30:00' reads 14:30): ${v('call', '2026-10-02', '14:30:00')}`);
ok(v('send_follow_up', '2026-10-03', '10:00') === 'WhatsApp follow-up · Sat 3 Oct · 10:00', v('send_follow_up', '2026-10-03', '10:00'));
ok(v('email', '2026-10-06', null) === 'Email · Tue 6 Oct', v('email', '2026-10-06', null));
ok(v('send_proposal', '2026-10-01', '16:00') === 'Send proposal · Today · 16:00', v('send_proposal', '2026-10-01', '16:00'));
ok(v('meeting', '2026-10-02', '14:30') === 'Meeting · Tomorrow · 14:30', v('meeting', '2026-10-02', '14:30'));
ok(v('chase_payment', '2026-10-02', '11:00', 'invoice 1042') === 'Chase payment · Tomorrow · 11:00 · invoice 1042', v('chase_payment', '2026-10-02', '11:00', 'invoice 1042'));
ok(nextActionViewOf('call', null, null, TODAY, '14:30')!.time === null, 'a time without a day is never shown');
ok(editor.includes("[v.when ?? 'No date set', v.time].filter(Boolean).join(' · ')") && editor.includes('{v.note && <span'), 'the cell shows the day, the time and the note');
const call = nextActionView({ next_action: 'send_info', next_action_date: '2026-10-02', next_action_time: '09:15', next_action_note: 'price sheet' }, TODAY, NOW)!;
ok(nextActionText(call) === 'Send information · Tomorrow · 09:15 · price sheet', `a stored row reads its time (${nextActionText(call)})`);
const ptxt = read('src/pages/PaidClients.tsx') + read('src/components/team/TeamBoard.tsx') + read('src/components/team/TeamComposer.tsx') + read('src/lib/dashboardTasks.ts');
ok(ptxt.includes('c.next_action_time') && ptxt.includes('i.lead.next_action_time') && ptxt.includes('lead.actionTime') && ptxt.includes('nextActionWords(l.next_action)'), 'Paid clients, the Team Board, the team composer and dashboard tasks show the words and the time (no raw value)');
ok(/public\.next_action_label\(r\.na\)/.test(mig) && /' at ' \|\| to_char\(r\.next_action_time, 'HH24:MI'\)/.test(mig), 'the daily reminder says the action in words and its time');

console.log('\n── due: day-based without a time; a timed action is overdue once its UK time has passed ──');
// Call · Today · 16:00 — at 13:00 UK not overdue, at 16:01 UK overdue (BST: UK = UTC+1).
ok(followUpBucket('2026-10-01', TODAY, '16:00', at('2026-10-01T12:00:00Z')) === 'today', 'Call · Today · 16:00 at 13:00 UK → due today, not overdue');
ok(followUpBucket('2026-10-01', TODAY, '16:00', at('2026-10-01T15:01:00Z')) === 'overdue', '…at 16:01 UK → overdue');
ok(followUpBucket('2026-10-01', TODAY, null, at('2026-10-01T22:59:00Z')) === 'today', 'an untimed action is "today" all day (23:59 UK)');
ok(followUpBucket('2026-09-30', TODAY, null, NOW) === 'overdue' && followUpBucket('2026-10-02', TODAY, '00:01', NOW) === 'upcoming', 'an earlier day is overdue; a later one is upcoming, time or not');
ok(followUpBucket('2026-12-01', '2026-12-01', '16:00', at('2026-12-01T16:01:00Z')) === 'overdue' && followUpBucket('2026-12-01', '2026-12-01', '16:00', at('2026-12-01T15:59:00Z')) === 'today', 'in winter (GMT) 16:00 UK is 16:00 UTC');
const lead = (d: string, t: string | null) => ({ next_action: 'call', next_action_date: d, next_action_time: t });
const late = at('2026-10-01T15:30:00Z'); // 16:30 UK
ok(passesNextActionFilter(lead('2026-10-01', '16:00'), 'overdue', 'all', TODAY, late) && !passesNextActionFilter(lead('2026-10-01', '16:00'), 'today', 'all', TODAY, late), 'filters: a timed action past its time is Overdue, not Due today');
ok(passesNextActionFilter(lead('2026-10-01', '17:00'), 'today', 'all', TODAY, late) && !passesNextActionFilter(lead('2026-10-01', '17:00'), 'overdue', 'all', TODAY, late), '…one still to come today is Due today');
ok(passesNextActionFilter(lead('2026-10-01', null), 'today', 'all', TODAY, late) && !passesNextActionFilter(lead('2026-10-01', null), 'overdue', 'all', TODAY, late), '…an untimed one is Due today all day (never overdue at noon)');
ok(passesNextActionFilter(lead('2026-10-02', '09:00'), 'tomorrow', 'all', TODAY, late) && passesNextActionFilter(lead('2026-10-05', null), 'next7', 'all', TODAY, late) && passesNextActionFilter(lead('2026-10-20', '09:00'), 'later', 'all', TODAY, late), 'Tomorrow, Next 7 days and Later, timed or not');
ok(!passesNextActionFilter(lead('2026-10-01', '16:00'), 'next7', 'all', TODAY, late), '…an overdue one is not in "Next 7 days"');
ok(nextActionSortKey(lead('2026-10-01', '09:00')) < nextActionSortKey(lead('2026-10-01', '16:00')) && nextActionSortKey(lead('2026-10-01', '16:00')) < nextActionSortKey(lead('2026-10-01', null)) && nextActionSortKey(lead('2026-10-01', null)) < nextActionSortKey(lead('2026-10-02', '08:00')), 'soonest first: by day, then time, untimed last in the day');
ok(read('src/lib/adminMetrics.ts').includes("followUpBucket(due, todayDay, f.lead.next_action_time ?? null, input.nowMs) === 'overdue'") && read('src/lib/salesWorkspace.ts').includes("followUpBucket(naDate, today, lead?.next_action_time ?? null, now) === 'overdue'"), 'the admin dashboard and the sales workspace count overdue by the same rule');

console.log('\n── History says what happened ──');
const h = (data: Record<string, unknown>) => activityDetail({ kind: 'follow_up_set', data }, () => '');
ok(h({ next_action: 'call', date: '2026-10-02', time: '14:30', change: 'set', from: { next_action: 'none' } }) === 'Set: Call · Fri 2 Oct · 14:30', h({ next_action: 'call', date: '2026-10-02', time: '14:30', change: 'set', from: {} }) ?? '');
ok(h({ next_action: 'call', date: '2026-10-03', time: '10:00', change: 'rescheduled', from: { next_action: 'call', date: '2026-10-02', time: '14:30' } }) === 'Rescheduled: Call · Sat 3 Oct · 10:00 (was Fri 2 Oct · 14:30)', 'rescheduled, with what it was');
ok(h({ next_action: 'send_proposal', date: '2026-10-03', time: null, change: 'changed', from: { next_action: 'call', date: '2026-10-03' } }) === 'Changed: Call → Send proposal · Sat 3 Oct', 'changed: Call → Send proposal');
ok(h({ next_action: 'none', change: 'completed', from: { next_action: 'chase_payment', date: '2026-10-02', time: '11:00' } }) === 'Completed: Chase payment · Fri 2 Oct · 11:00', 'completed');
ok(h({ next_action: 'none', change: 'cleared', from: { next_action: 'email', date: '2026-10-06' } }) === 'Cleared: Email · Tue 6 Oct', 'cleared');
ok(h({ next_action: 'send_info', date: '2026-10-02' }) === 'Send information on 2026-10-02', 'an older History row (no "change") still reads, in words');
ok(/return jsonb_build_object\('ok', true, 'unchanged', true\);/.test(mig), 'a save that changes nothing writes no History row (no duplicates)');
ok(editor.includes("onClick={() => void save({ nextAction: 'none', date: null, note: lead.next_action_note ?? null, done: true })}"), '✓ Done is recorded as completed; Clear as cleared');

console.log('\n── view, edit, reschedule, complete, remove ──');
ok(editor.includes('lead={{ next_action: lead.next_action ?? null, next_action_date: lead.next_action_date ?? null, next_action_note: lead.next_action_note ?? null, next_action_time: lead.next_action_time ?? null }}'), 'clicking the cell opens the form with the saved values, time included');
ok(form.includes('data-testid="clear-next-action"'), 'Clear removes it');
ok(!/useEffect|setTimeout/.test(editor) && !/useEffect|setTimeout/.test(form), 'nothing auto-saves');

console.log('\n── stored next actions still read ──');
ok(nextActionViewOf('remove_if_no_reply', null)!.label === 'Close if no reply' && nextActionViewOf('send_voice_note', '2026-10-05', null, TODAY)!.label === 'Voice note', 'older stored values still read in their own words');
ok(nextActionText(nextActionViewOf('follow_up', '2026-10-01', null, TODAY, null, NOW)!) === 'Follow up · Today', 'an existing date-only action reads exactly as before');
const cols = read('src/lib/outreachLeadColumns.ts');
ok(cols.includes("'next_action', 'next_action_date', 'next_action_time', 'next_action_note',") && /'next_action_time',\n\] as const;\nconst SALES_VIEW/.test(cols), 'the admin list and the salesperson view both load the time');

console.log(`\n${fails ? `${fails} FAILED` : 'all passed'}`);
if (fails) process.exit(1);
