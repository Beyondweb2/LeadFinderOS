/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ONE NEXT ACTION: one form, one write, one list of types (2026-10-02, Paul; docs/outreach-workspace.md §J).
   The Outreach row, the phone card, the lead workspace, the bulk menu and the Inbox's lead popup all save
   through src/lib/nextActionWrite.ts (lead_set_follow_up / lead_set_call_booked, both roles, History) and
   the cell and the workspace draw the same form (NextActionForm). Live SQL half:
   supabase/tests/next-action-one-flow.sql.
   Run: node scripts/run-tests.mjs next-action-one-flow
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync } from 'node:fs';
import { NEXT_ACTION_OPTIONS } from '../src/lib/salesCrm.ts';
import { NEXT_ACTION_LABEL, meetingDayTime, meetingNote, nextActionText, nextActionView, nextActionViewOf } from '../src/lib/nextActionView.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const TODAY = '2026-10-01';

console.log('── one write: every screen saves through nextActionWrite ──');
const editor = read('src/components/NextActionEditor.tsx');
const form = read('src/components/NextActionForm.tsx');
const crm = read('src/components/LeadCrmPanel.tsx');
const hook = read('src/hooks/useOutreach.ts');
const table = read('src/components/OutreachTable.tsx');
const card = read('src/components/OutreachMobileCard.tsx');
const write = read('src/lib/nextActionWrite.ts');
ok(editor.includes("import { saveNextAction, type NextActionInput } from '@/lib/nextActionWrite';") && editor.includes('const r = await saveNextAction(lead.id, a, lead);'), 'the Outreach cell saves through saveNextAction');
ok(table.includes('<NextActionEditor lead={lead} />') && card.includes('<NextActionEditor lead={lead} />'), '…for the table row and the phone card alike');
ok(/<NextActionForm compact/.test(editor) && /<NextActionForm key=/.test(crm), 'the cell and the lead workspace draw the SAME form (NextActionForm)');
ok(crm.includes('afterWrite(await saveNextAction(leadId, a, stateLead()),') && crm.includes('afterWrite(await bookMeeting(leadId, iso, note, stateLead()),'), 'the workspace saves through the same write (Next Action and the meeting)');
ok(/const r = await saveNextAction\(leadId, \{/.test(hook) && !/next_action: nextAction/.test(hook), 'the bulk menu / Inbox popup (useOutreach.updateNextAction) use the same write; no direct row write');
ok(/leadRpc\('lead_set_follow_up', \{ _lead_id: leadId, _next_action: a\.nextAction, _date: date, _note: note \}\)/.test(write), 'the write is lead_set_follow_up (role + ownership checked, History "Follow-up set") for both roles');
ok(/notifyLeadChanged\(leadId, undefined, patch\)/.test(write), '…and announces the change, so Outreach, the Inbox and the workspace show it at once');
const walk = (dir: string): string[] => readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })
  .flatMap((e) => e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [`${dir}/${e.name}`] : []);
const ALLOWED = new Set(['src/lib/nextActionWrite.ts', 'src/lib/leadRpc.ts', 'src/lib/salesPatchPlan.ts', 'src/lib/leadOutcome.ts']);
const callers = walk('src').filter((p) => !ALLOWED.has(p) && /['"]lead_set_follow_up['"]/.test(read(p)) && !p.startsWith('src/integrations/'));
ok(callers.length === 0, `no screen calls lead_set_follow_up itself (${callers.join(', ') || 'none'})`);
ok(read('src/lib/leadOutcome.ts').match(/_next_action: '([a-z_]+)'/g)?.every((m) => m.includes("'none'")) ?? true, '…a logged outcome only ever clears it (unchanged)');

console.log('\n── one list of types ──');
const offered = NEXT_ACTION_OPTIONS.map((o) => o.value);
ok(JSON.stringify(offered) === JSON.stringify(['call', 'send_follow_up', 'email', 'follow_up', 'send_info', 'meeting', 'none']), `the canonical list (${offered.join(', ')})`);
ok(form.includes('{NEXT_ACTION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}'), 'the form offers every canonical type (the table no longer filters any out)');
ok(read('src/components/OutreachTable.tsx').includes('{CRM_NEXT_ACTION_OPTIONS.map((opt) => ('), 'the bulk "Set Action" menu offers the same list');
ok(offered.every((v) => v === 'none' || NEXT_ACTION_LABEL[v]), 'every offered type has its words in the one view');
const enumSql = readdirSync(new URL('../supabase/migrations', import.meta.url)).map((f) => read(`supabase/migrations/${f}`)).join('\n');
ok(['email', 'send_info', 'meeting'].every((v) => enumSql.includes(`add value if not exists '${v}'`)), 'every offered type exists in the database enum');
ok(form.includes("{!known && lead.next_action ? <SelectItem value={lead.next_action}>{NEXT_ACTION_LABEL[lead.next_action]"), 'an older stored type is shown in its own words and can be kept');

console.log('\n── the fields: type, day, a Meeting\'s time, the note ──');
ok(form.includes('aria-label="Next action date"') && form.includes('aria-label="Meeting time"') && form.includes('aria-label="Next action note"') && form.includes('maxLength={500}'), 'the form has the day, the Meeting time and the note (≤500, the column\'s limit)');
ok(/const meetingAt = isMeeting && date && time \? new Date\(`\$\{date\}T\$\{time\}`\)\.toISOString\(\) : null;/.test(form) && /if \(a\.nextAction === 'meeting' && a\.meetingAt\) return bookMeeting\(/.test(write), 'a Meeting with a time books call_booked_at (the only time the model stores)');
ok(meetingNote('14:30', null) === 'Meeting at 14:30' && meetingNote('14:30', 'bring the audit') === 'Meeting at 14:30 · bring the audit' && meetingNote('15:00', 'Meeting at 14:30 · bring the audit') === 'Meeting at 15:00 · bring the audit', 'the meeting note carries the time once, then the person\'s words (a reschedule replaces the time)');
const bst = meetingDayTime('2026-10-02T13:30:00Z');
ok(bst.day === '2026-10-02' && bst.time === '14:30', 'the meeting time is London time (BST: 13:30Z → 14:30)');

console.log('\n── it shows clearly after saving ──');
const m = nextActionViewOf('meeting', '2026-10-02', 'Meeting at 14:30', TODAY, '2026-10-02T13:30:00Z')!;
ok(m.label === 'Meeting' && m.when === 'Tomorrow' && m.time === '14:30', `Meeting · Tomorrow · 14:30 (${nextActionText({ ...m, note: null })})`);
const thu = nextActionViewOf('meeting', '2026-10-08', null, '2026-10-05', '2026-10-08T13:30:00Z')!;
ok(nextActionText(thu) === 'Meeting · Thu 8 Oct · 14:30', `a day this week reads with the weekday (${nextActionText(thu)})`);
ok(nextActionViewOf('meeting', '2026-10-03', null, TODAY, '2026-10-02T13:30:00Z')!.time === null, 'a meeting time on a different day than the action is not shown as its time');
ok(nextActionViewOf('call', '2026-10-02', null, TODAY, '2026-10-02T13:30:00Z')!.time === null, 'only a Meeting carries a time');
const call = nextActionView({ next_action: 'send_info', next_action_date: '2026-10-02', next_action_note: 'price sheet' }, TODAY)!;
ok(nextActionText(call) === 'Send information · Tomorrow · price sheet', `Send information · Tomorrow · its note (${nextActionText(call)})`);
ok(editor.includes("[v.when ?? 'No date set', v.time].filter(Boolean).join(' · ')") && editor.includes('{v.note && <span'), 'the cell shows the day, the time and the note, not just the type');

console.log('\n── view, edit, reschedule, complete, remove ──');
ok(editor.includes('<PopoverTrigger asChild>') && editor.includes('lead={{ next_action: lead.next_action ?? null, next_action_date: lead.next_action_date ?? null, next_action_note: lead.next_action_note ?? null, call_booked_at: lead.call_booked_at ?? null }}'), 'clicking the cell opens the form with the saved values (view / edit / reschedule are Save)');
ok(editor.includes("onClick={() => void save({ nextAction: 'none', date: null, note: lead.next_action_note ?? null })}") && editor.includes('title="Done — clear the next action"'), '✓ Done completes it (cleared, History records it)');
ok(form.includes('data-testid="clear-next-action"') && form.includes("onClick={() => void run({ nextAction: 'none', date: null, note: note.trim() || null })}"), 'Clear removes / cancels it');
ok(!/useEffect|setTimeout/.test(editor) && !/useEffect|setTimeout/.test(form), 'nothing auto-saves any more (the old cell saved the moment a type and a day were both picked)');

console.log('\n── stored next actions still read ──');
ok(nextActionViewOf('remove_if_no_reply', null)!.label === 'Close if no reply' && nextActionViewOf('send_voice_note', '2026-10-05', null, TODAY)!.label === 'Voice note', 'older stored values still read in their own words');
ok(read('src/lib/outreachLeadColumns.ts').includes("'next_action', 'next_action_date', 'next_action_note',"), 'the admin\'s list now loads the note (the salesperson\'s view already had it)');
const paid = read('src/pages/PaidClients.tsx');
ok(paid.includes('const na = nextActionViewOf(c.next_action, c.next_action_date); return na ? nextActionText(na)'), 'Paid clients shows the same words (it showed the raw value, "none" included)');

console.log(`\n${fails ? `${fails} FAILED` : 'all passed'}`);
if (fails) process.exit(1);
