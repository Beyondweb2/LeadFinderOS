/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ONE NEXT ACTION (Paul, 2026-10-02: "There should be ONE kind of Next Action").
   The Outreach Next Action column could show "+ Set" over "Meeting · Fri 2 Oct 15:15" or "Call back · no day
   set" — a saved Next Action AND a derived hint. Now: the column is "+ Set" OR the saved action and its ✓;
   a booked meeting IS a Meeting Next Action (call_booked_at is its mirror, written only by lead_set_follow_up);
   a logged Call back IS a Call Next Action. Record: docs/one-next-action.md.
   Run: node scripts/run-tests.mjs one-next-action
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { outcomePlan, OUTCOME_RULE_VALUES } from '../src/lib/leadState.ts';
import * as view from '../src/lib/nextActionView.ts';
import { passesNextActionFilter } from '../src/lib/nextActionView.ts';
import { activityDetail } from '../src/lib/salesCrm.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

console.log('── 1. the column: "+ Set" or the saved action and its ✓ — nothing else ──');
{
  const table = read('src/components/OutreachTable.tsx');
  const cell = table.slice(table.indexOf('<NextActionEditor lead={lead} />') - 600, table.indexOf('<NextActionEditor lead={lead} />') + 200);
  ok(!('nextUpHint' in view), 'the derived hint (nextUpHint) no longer exists');
  ok(!/nextUpHint|row-next-up/.test(strip(table)) && !/nextUpHint|row-next-up/.test(strip(read('src/components/OutreachMobileCard.tsx'))), 'neither the row nor the phone card draws a second line');
  ok(/<\/TableCell>/.test(cell.slice(cell.indexOf('<NextActionEditor'))), 'the Next Action cell holds the editor alone');
  const editor = read('src/components/NextActionEditor.tsx');
  ok(/\{v \? \(/.test(editor) && /<Plus className="h-3 w-3" \/>Set/.test(editor), 'the trigger is the action (v) or "+ Set" — one or the other');
  ok(/\{v && \(\n\s+<Button[^>]*text-green-500/.test(editor) && /title="Complete next action" aria-label="Complete next action"/.test(editor), 'every saved action has the green ✓ "Complete next action"');
  ok(/done: true/.test(editor) && /saveNextAction\(lead\.id, a, lead\)/.test(editor), '✓ completes through the one write (History: completed)');
}

console.log('\n── 2. outcomes: which ones SAVE a Next Action ──');
{
  const lead = { status: 'initial_contact', is_potential_work: false, amount_paid: null, next_action: 'none', call_booked_at: null };
  const sets: Record<string, string | null> = {};
  for (const o of OUTCOME_RULE_VALUES) sets[o] = outcomePlan(o, lead).setNextAction;
  ok(sets.call_back === 'call', 'Call back → Call (no day)');
  ok(sets.meeting_booked === 'meeting', 'Meeting booked → Meeting (no day until "when" is saved)');
  const none = OUTCOME_RULE_VALUES.filter((o) => o !== 'call_back' && o !== 'meeting_booked');
  ok(none.every((o) => sets[o] === null), `every other outcome saves nothing (${none.join(', ')})`);
  ok(outcomePlan('call_back', { ...lead, next_action: 'call' }).setNextAction === null, 'a Call already planned keeps its day and time');
  ok(outcomePlan('meeting_booked', { ...lead, next_action: 'meeting' }).setNextAction === null, 'a Meeting already planned keeps its day and time');
  ok(outcomePlan('call_back', { ...lead, amount_paid: 99 }).setNextAction === 'call', 'a client asking for a call back is still a call to make');
  ok(outcomePlan('interested', lead).star && outcomePlan('interested', lead).setNextAction === null, 'Interested = the star, never a task by itself');
  const lo = read('src/lib/leadOutcome.ts');
  ok(/if \(plan\.setNextAction\) await step\('lead_set_follow_up', \{ _next_action: plan\.setNextAction, _date: null,/.test(lo), 'saved through lead_set_follow_up with no day (History; both roles)');
}

console.log('\n── 3. the booking is the Meeting\'s mirror (database) ──');
{
  const mig = read('supabase/migrations/20261002180000_one_next_action.sql');
  const fu = mig.slice(mig.indexOf('function public.lead_set_follow_up'), mig.indexOf('function public.lead_set_call_booked'));
  const cb = mig.slice(mig.indexOf('function public.lead_set_call_booked'));
  ok(/v_at := case when v_action = 'meeting' and v_time is not null then public\.next_action_due_at\(v_date, v_time\) end;/.test(fu), 'call_booked_at = the timed Meeting\'s UK instant, else null');
  ok(/set next_action = v_action, next_action_date = v_date, next_action_time = v_time, next_action_note = v_note,\n\s+call_booked_at = v_at/.test(fu), '…written in the SAME update as the Next Action (completing / clearing / changing takes the booking with it)');
  ok(/'reason', case when v_at is not null then 'booked'/.test(fu), '…and History says why a booking ended');
  ok(/v_change := 'synced'/.test(fu), 'a stale booking on an unchanged Next Action is lined up, with no false History line');
  ok(/return public\.lead_set_follow_up\(_lead_id, 'meeting'/.test(cb) && /return public\.lead_set_follow_up\(_lead_id, 'none'/.test(cb) && !/update public\.outreach_leads/.test(cb), 'lead_set_call_booked is a wrapper: it writes nothing itself');
  const shape = read('supabase/migrations/20261002180100_one_next_action_shape.sql');
  ok(/check \(call_booked_at is null or \(next_action = 'meeting' and next_action_time is not null\)\)/.test(shape), 'the database refuses a booking without its Meeting');
  const w = read('src/lib/nextActionWrite.ts');
  ok(/next_action_note: note, call_booked_at: meetingAt \};/.test(w), 'the open screens get the same mirror at once (optimistic patch)');
}

console.log('\n── 4. no second meeting editor ──');
{
  const crm = read('src/components/LeadCrmPanel.tsx');
  ok(!/lead_set_call_booked/.test(strip(crm)) && !/Call booked for/.test(strip(crm)), 'the "Call booked for" box is gone from the Work tab');
  ok(/bookMeeting\(leadId, iso,/.test(crm), 'the "When is the meeting?" box after Meeting booked puts the time on the Meeting Next Action');
}

console.log('\n── 5. filters read the one action (a meeting is in them) ──');
{
  const today = '2026-10-01';
  const meeting = { next_action: 'meeting', next_action_date: '2026-10-02', next_action_time: '15:15' };
  const callNoDay = { next_action: 'call', next_action_date: null, next_action_time: null };
  ok(passesNextActionFilter(meeting, 'tomorrow', 'all', today) && passesNextActionFilter(meeting, 'all', 'meeting', today) && passesNextActionFilter(meeting, 'next7', 'all', today), 'a booked meeting is Due tomorrow / a Meeting / in the next 7 days');
  ok(passesNextActionFilter(callNoDay, 'undated', 'call', today) && !passesNextActionFilter(callNoDay, 'none', 'all', today), 'a Call back is "Set, no date", never "No next action"');
  ok(view.nextActionViewOf('call', null, 'They asked to be called back', today)?.when === null, '…and reads "Call · No date set" (the cell prints No date set)');
}

console.log('\n── 6. History ──');
{
  const d = (data: Record<string, unknown>) => activityDetail({ kind: 'call_booked', data } as never, () => '');
  ok(d({ at: null, reason: 'completed' }) === 'Done' && d({ at: null, reason: 'changed' }) === 'Replaced by the next action' && d({ at: null }) === 'Cancelled', 'a booking that ended says why; old rows still read Cancelled');
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
