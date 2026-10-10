/* ═══════════════════════════════════════════════════════════
   TEXT (SMS) REPLIES IN "REPLIED, UNANSWERED" (2026-10-10, feat/sms-replies-in-unanswered).

   The same rule as WhatsApp (conversationState), through the real fold: a text reply with no real send after it waits on
   us; a delivered text answers it, a failed one does not; a clear no is owed nothing; an opt-out text (STOP, UNSUBSCRIBE…)
   is never a reply that needs an answer; closing hides it and a NEW text brings it back (a STOP does not).
   ═══════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { foldSalesPerformanceWithFacts, type FoldInput } from '../src/lib/salesPerformance.ts';
import { foldSalesWorkspace, smsWaitingSinceMs, type WorkspaceLead } from '../src/lib/salesWorkspace.ts';
import type { ConvMessage } from '../src/lib/conversationState.ts';
import { leadTarget, smsLinkForLead } from '../src/lib/salesLinks.ts';

let f = 0;
const ok = (c: unknown, msg: string) => { if (c) console.log('  ✓ ' + msg); else { f++; console.log('  ✗ ' + msg); } };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const NOW = Date.parse('2026-10-10T12:00:00Z');
const H = 3_600_000, D = 24 * H;
const at = (ms: number) => new Date(ms).toISOString();
const ME = 'u-me';
const tx = (direction: 'inbound' | 'outbound', ms: number, body = 'Yes please, tell me more', status = direction === 'outbound' ? 'delivered' : 'received'): ConvMessage => ({ direction, status, created_at: at(ms), body });

/* One lead with NO WhatsApp reply (only our opener), so anything waiting comes from its texts. */
const run = (sms: ConvMessage[] | null, opts: { closedAt?: string | null; waReply?: boolean; status?: string } = {}) => {
  const input = {
    personId: ME, sinceMs: null, campaignNames: new Map(),
    leads: [{ id: 't1', business_name: 'Biz t1', campaign_id: 'c1', status: opts.status ?? 'contacted', amount_paid: null, is_potential_work: true, lead_source: null, sold_by_user_id: null }],
    messages: [
      { lead_id: 't1', direction: 'outbound', template_name: 'initial_contact', status: 'delivered', created_at: at(NOW - 6 * D), body: 'Hi', sent_by_user_id: ME },
      ...(opts.waReply ? [{ lead_id: 't1', direction: 'inbound', template_name: null, status: 'received', created_at: at(NOW - 5 * D), body: 'Interested, call me', sent_by_user_id: null }] : []),
    ],
    activity: [], linkEvents: [], hits: [],
  } as unknown as FoldInput;
  const { facts } = foldSalesPerformanceWithFacts(input);
  const wl: WorkspaceLead = { id: 't1', business_name: 'Biz t1', status: opts.status ?? 'contacted', next_action: null, next_action_date: null, next_action_note: null, work_closed_at: opts.closedAt ?? null };
  return foldSalesWorkspace({ personId: ME, facts, leads: new Map([['t1', wl]]), audits: [], activity: [], nowMs: NOW, smsThreads: sms ? new Map([['t1', sms]]) : undefined });
};
const listed = (w: ReturnType<typeof run>) => w.followUps.repliedUnanswered.find((l) => l.id === 't1');
const action = (w: ReturnType<typeof run>) => w.nextActions.find((a) => a.leadId === 't1' && a.kind === 'reply_waiting');

console.log('1. a text reply waits like a WhatsApp reply');
{
  const base = [tx('outbound', NOW - 4 * D, 'Hi from Findable')];
  ok(!listed(run(null)) && !listed(run(base)), 'no text reply: not listed');
  const w = run([...base, tx('inbound', NOW - 2 * H)]);
  ok(listed(w)?.link === 'sms', 'an unanswered text reply is in "Replied, unanswered" and opens the SMS Inbox');
  ok(action(w)?.title === 'New text reply' && action(w)?.link === 'sms', '…and in "What to do next" as "New text reply"');
  ok(w.waiting.some((x) => x.leadId === 't1'), '…and in the waiting timers');
  ok(!listed(run([...base, tx('inbound', NOW - 2 * H), tx('outbound', NOW - H, 'Thanks!')])), 'a delivered text from us after it answers it — it leaves');
  ok(!listed(run([...base, tx('inbound', NOW - 2 * H), tx('outbound', NOW - H, 'Thanks!', 'sent')])), '…a sent one too');
  ok(!!listed(run([...base, tx('inbound', NOW - 2 * H), tx('outbound', NOW - H, 'Thanks!', 'failed')])), 'a FAILED text is not an answer (same as WhatsApp)');
  ok(!!listed(run([...base, tx('inbound', NOW - 2 * H), tx('outbound', NOW - H, 'Thanks!', 'queued')])), '…nor a still-queued one');
  ok(!listed(run([...base, tx('inbound', NOW - 2 * H, 'No thanks, not interested')])), 'a clear no is owed nothing (the same decline rule)');
}

console.log('2. opt-outs are never "needs an answer"');
{
  const base = [tx('outbound', NOW - 4 * D, 'Hi')];
  for (const word of ['STOP', 'Stop.', 'UNSUBSCRIBE', 'stopall', 'opt out']) ok(!listed(run([...base, tx('inbound', NOW - H, word)])), `"${word}" alone: not listed`);
  ok(!listed(run([...base, tx('inbound', NOW - 3 * H, 'How much?'), tx('inbound', NOW - H, 'STOP')])), 'a question then STOP: their newest word is the opt-out — not listed');
  ok(smsWaitingSinceMs([...base, tx('inbound', NOW - 3 * H, 'STOP'), tx('inbound', NOW - H, 'Actually, how much?')], NOW) === NOW - H, 'STOP then a real question: only the question waits');
  ok(smsWaitingSinceMs(undefined, NOW) === null && smsWaitingSinceMs([], NOW) === null, 'no thread: nothing waits (absent is not a reply)');
}

console.log('3. closing, and a new text');
{
  const thread = [tx('outbound', NOW - 4 * D, 'Hi'), tx('inbound', NOW - 2 * D)];
  ok(!!listed(run(thread)), 'before closing: listed');
  const closed = run(thread, { closedAt: at(NOW - D) });
  ok(!listed(closed) && !action(closed), 'closed: gone from both lists');
  const back = run([...thread, tx('inbound', NOW - H, 'Are you still there?')], { closedAt: at(NOW - D) });
  ok(!!listed(back) && action(back)?.title === 'New text reply', 'a NEW text after the close brings it back');
  ok(!listed(run([...thread, tx('inbound', NOW - H, 'STOP')], { closedAt: at(NOW - D) })), 'a STOP after the close does not bring it back');
}

console.log('4. everything else unchanged');
{
  const thread = [tx('outbound', NOW - 4 * D, 'Hi'), tx('inbound', NOW - 2 * H)];
  const a = run(null), b = run(thread);
  ok(JSON.stringify(a.pipeline.map((p) => p.count)) === JSON.stringify(b.pipeline.map((p) => p.count)) && a.notInterested === b.notInterested, 'the pipeline (status reading) is the same with or without texts');
  ok(!listed(run(thread, { status: 'not_interested' })), 'a Not interested lead is still not listed (out)');
  const both = run(thread, { waReply: true });
  ok(listed(both)?.link === undefined && action(both)?.title === 'New WhatsApp reply', 'WhatsApp waiting as well: the WhatsApp item, exactly as before');
  ok(smsLinkForLead('a b') === '/inbox?channel=sms&lead=a%20b' && leadTarget('sms', 'x')[0] === '/inbox?channel=sms&lead=x' && leadTarget('whatsapp', 'x')[0] === '/inbox?lead=x', 'links: texts → the SMS Inbox; WhatsApp unchanged');
  const ed = read('supabase/functions/sales-performance/index.ts');
  ok(/"sms_messages", "id, lead_id, direction, status, created_at, body", ids\)/.test(ed) && /smsThreads,\n/.test(ed), 'sales-performance reads every lead\'s texts and passes them to the fold');
  ok(!/\.(insert|update|upsert|delete)\(/.test(ed) && !/functions\.invoke|send-sms|twilio/i.test(ed), 'sales-performance still writes and sends nothing');
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall passed');
