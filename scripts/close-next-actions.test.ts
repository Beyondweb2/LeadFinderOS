/* ═══════════════════════════════════════════════════════════
   CLOSE DASHBOARD ITEMS (2026-10-10, feat/close-next-actions).

   The rule (salesWorkspace.ts isClosedItem) is run through the real fold: closing hides the item, a due Next Action
   is never hidden by the stamp, a NEW inbound reply (WhatsApp or SMS) brings it back, anything that happens after the
   close shows. The server function (migration 20261021090000) is asserted on its text — the live proof (another
   person's lead refused, status / star / campaign unchanged, bulk) is supabase/tests/close-next-actions.sql.
   ═══════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { foldSalesPerformanceWithFacts, type FoldInput } from '../src/lib/salesPerformance.ts';
import { foldSalesWorkspace, isClosedItem, type WorkspaceLead } from '../src/lib/salesWorkspace.ts';
import { ACTIVITY_LABEL, activityDetail } from '../src/lib/salesCrm.ts';

let f = 0;
const ok = (c: unknown, msg: string) => { if (c) console.log('  ✓ ' + msg); else { f++; console.log('  ✗ ' + msg); } };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*--.*$/gm, '');

const NOW = Date.parse('2026-10-10T12:00:00Z');
const H = 3_600_000, D = 24 * H;
const at = (ms: number) => new Date(ms).toISOString();
const ME = 'u-me';

console.log('1. the rule');
{
  const closed = at(NOW - H);
  ok(!isClosedItem(null, null, at(NOW - D)), 'never closed: shown');
  ok(isClosedItem(closed, null, at(NOW - D)), 'closed after the item: hidden');
  ok(isClosedItem(closed, null, null), 'an item with no moment of its own was there when they closed it: hidden');
  ok(!isClosedItem(closed, null, at(NOW - H / 2)), 'something that happened after the close: shown');
  ok(isClosedItem(closed, NOW - 2 * H, at(NOW - D)), 'a reply from BEFORE the close does not re-open it');
  ok(!isClosedItem(closed, NOW - H / 2, at(NOW - D)), 'a new reply after the close re-opens it');
  ok(!isClosedItem('garbage', null, at(NOW - D)), 'an unreadable stamp never hides anything');
}

console.log('2. through the fold');
const base = (id: string, extra: Record<string, unknown> = {}) => ({ id, business_name: `Biz ${id}`, campaign_id: null, status: 'replied', amount_paid: null, is_potential_work: false, lead_source: null, sold_by_user_id: null, ...extra });
const wm = (lead_id: string, direction: string, ms: number) => ({ lead_id, direction, template_name: direction === 'outbound' ? 'initial_contact' : null, status: direction === 'outbound' ? 'delivered' : 'received', created_at: at(ms), body: 'Yes please, tell me more', sent_by_user_id: direction === 'outbound' ? ME : null });
const run = (closedAt: string | null, extraMsgs: ReturnType<typeof wm>[] = [], sms?: Map<string, number>, lead: Partial<WorkspaceLead> = {}) => {
  const input: FoldInput = {
    personId: ME, sinceMs: null, campaignNames: new Map(),
    leads: [base('r1', { is_potential_work: true })],
    messages: [wm('r1', 'outbound', NOW - 5 * D), wm('r1', 'inbound', NOW - 3 * D), ...extraMsgs],
    activity: [], linkEvents: [], hits: [],
  } as unknown as FoldInput;
  const { facts } = foldSalesPerformanceWithFacts(input);
  const wl: WorkspaceLead = { id: 'r1', business_name: 'Biz r1', status: 'replied', next_action: null, next_action_date: null, next_action_note: null, work_closed_at: closedAt, ...lead };
  return foldSalesWorkspace({ personId: ME, facts, leads: new Map([['r1', wl]]), audits: [], activity: [], nowMs: NOW, lastSmsReplyMs: sms });
};
{
  const open = run(null);
  ok(open.followUps.repliedUnanswered.some((l) => l.id === 'r1'), 'before: the lead is in "Replied, unanswered"');
  ok(open.nextActions.some((a) => a.leadId === 'r1' && a.kind === 'reply_waiting'), 'before: it is in "What to do next"');

  const closed = run(at(NOW - D));
  ok(!closed.followUps.repliedUnanswered.some((l) => l.id === 'r1'), 'closing clears it from "Replied, unanswered"');
  ok(!closed.nextActions.some((a) => a.leadId === 'r1'), 'closing clears it from "What to do next"');
  ok(closed.notInterested === open.notInterested && closed.pipeline.find((p) => p.key === 'replied')!.count === open.pipeline.find((p) => p.key === 'replied')!.count,
    'the pipeline reading is unchanged (closing is not a status)');

  const back = run(at(NOW - D), [wm('r1', 'inbound', NOW - H)]);
  ok(back.followUps.repliedUnanswered.some((l) => l.id === 'r1'), 'a NEW WhatsApp reply after the close brings it back');
  ok(back.nextActions.some((a) => a.leadId === 'r1' && a.kind === 'reply_waiting'), '…into "What to do next" too');

  const smsBack = run(at(NOW - D), [], new Map([['r1', NOW - H]]));
  ok(smsBack.followUps.repliedUnanswered.some((l) => l.id === 'r1'), 'a NEW text (SMS) reply after the close brings it back');
  const smsOld = run(at(NOW - D), [], new Map([['r1', NOW - 2 * D]]));
  ok(!smsOld.followUps.repliedUnanswered.some((l) => l.id === 'r1'), 'an older text does not');

  const later = run(at(NOW - D), [], undefined, { next_action: 'call', next_action_date: '2026-10-09' });
  ok(later.followUps.overdue.some((l) => l.id === 'r1'), 'a Next Action set after closing (closing cleared the old one) still shows');
}

console.log('3. the server function (migration text)');
{
  const m = read('supabase/migrations/20261021090000_close_next_actions.sql');
  const c = code(m);
  ok(/create or replace function public\.lead_close_work\(_lead_ids uuid\[\], _reason text, _outcome text default null\)/.test(c), 'lead_close_work(lead ids, reason, outcome)');
  ok(/security definer/.test(c) && /revoke all on function public\.lead_close_work\(uuid\[\], text, text\) from public, anon/.test(c), 'security definer; anon cannot call it');
  ok(/if not public\.can_work_lead\(v_id\) then[\s\S]*?'not_your_lead'[\s\S]*?continue;/.test(c), 'each lead is checked with can_work_lead; a refused one is skipped and reported');
  ok(/public\.lead_set_follow_up\(v_id, 'none', null, null, null, true, null\)/.test(c), 'the Next Action is cleared ONLY through lead_set_follow_up (History "completed")');
  const updates = c.match(/update public\.outreach_leads set [^;]*;/g) ?? [];
  ok(updates.length === 1 && /set work_closed_at = now\(\), work_closed_by = auth\.uid\(\) where id = v_id;/.test(updates[0]), 'the only direct write is the closed stamp — never status, star or campaign');
  ok(!/is_potential_work|campaign_id|\bstatus\s*=/.test(c.replace(/lead_activity_kind_check[\s\S]*?not valid;/, '')), 'the function never names status, the star or the campaign');
  ok(/'dead' and coalesce\(_outcome, ''\) not in \('not_interested', 'wrong_number'\)/.test(c), 'Dead lead only names the two existing outcomes — no new status');
  ok(/'work_closed'/.test(c) && /'call_made', 'work_closed'\]\)\) not valid/.test(c), 'History kind work_closed added to the CHECK (NOT VALID, then validated)');
  ok(/insert into public\.lead_activity \(lead_id, actor_user_id, kind, data\)\s*values \(v_id, auth\.uid\(\), 'work_closed'/.test(c), 'who (auth.uid) and when (created_at) are recorded in History');
  ok(/cardinality\(_lead_ids\) > 500/.test(c), 'bulk is capped at 500 per call');
  ok(!/net\.http|whatsapp_messages|sms_messages|send/i.test(c.replace(/lead_activity_kind_check[\s\S]*?not valid;/, '').replace(/'sms_sent'/g, '')), 'nothing in it sends or writes a message');
}

console.log('4. History and the browser');
{
  ok(ACTIVITY_LABEL.work_closed === 'Closed on the dashboard', 'History label');
  const row = (data: Record<string, unknown>) => ({ id: 'x', lead_id: 'l', actor_user_id: ME, kind: 'work_closed', body: null, data, created_at: at(NOW) });
  ok(activityDetail(row({ reason: 'done', cleared_next_action: 'call' }) as never)?.startsWith('Done, no action needed · Next Action cleared'), 'Done reads as done, naming the cleared Next Action');
  ok(activityDetail(row({ reason: 'dead', outcome: 'wrong_number' }) as never) === 'Dead lead — Wrong number', 'Dead lead names its outcome');
  const cw = code(read('src/lib/closeWork.ts'));
  ok(/applyOutcome\(lead, choice, salesStateOf\(lead\), false\)/.test(cw), 'Dead lead runs the Call tab\'s own applyOutcome (same History, star, queue stop)');
  ok(!/functions\.invoke|send-whatsapp|send-sms|sales_queue_opener/.test(cw), 'closeWork never sends anything itself');
  ok(cw.indexOf("closeCall([id], 'dead'") < cw.indexOf('applyOutcome('), 'the server checks permission (close) before the outcome is recorded');
  const ed = read('supabase/functions/sales-performance/index.ts');
  ok(/is_archived, work_closed_at"/.test(ed) && /smsThreads,/.test(ed), 'sales-performance reads the stamp and the newest inbound text');
  const sec = read('src/components/salesDash/sections.tsx');
  ok((sec.match(/<RowClose /g) ?? []).length === 2 && (sec.match(/<SelectBar /g) ?? []).length === 2, 'a Close per row and a Select-all bar on both lists');
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall passed');
