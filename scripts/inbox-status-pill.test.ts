/* ONE STATUS PILL (2026-10-31): the derived words and tones. Pure — nothing here can message anyone. */
import { readFileSync } from 'node:fs';
import { statusPillFor, STATUS_PILL_LABELS, type StatusPillInput } from '../src/lib/inboxStatusPill.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };
const base: StatusPillInput = { stage: 'initial_contact', stageLabel: 'Contacted', attentionKind: null, attentionTitle: null, waitingOnUs: false, waitingOnThem: false, failed: false, followUpDue: false, meetingBooked: false };
const p = (o: Partial<StatusPillInput>) => statusPillFor({ ...base, ...o });

ok(p({}).label === 'Contacted' && p({}).key === 'stage', 'nothing to say → the stored stage in its own words');
ok(p({ stage: null, stageLabel: 'New' }).label === 'New', 'no stage → New, never a derived state');
ok(p({ waitingOnUs: true }).label === 'Reply needed' && p({ waitingOnUs: true }).tone === 'warm', 'they replied, nothing answered → Reply needed (warm)');
ok(p({ attentionKind: 'needs_you' }).label === 'Reply needed', 'Needs you folds into Reply needed');
ok(p({ attentionKind: 'needs_approval' }).label === 'Approve draft', 'a draft waiting → Approve draft');
ok(p({ waitingOnThem: true }).label === 'Waiting on them' && p({ waitingOnThem: true }).tone === 'cool', 'our message is newest → Waiting on them (cool)');
ok(p({ stage: 'replied', stageLabel: 'Replied', waitingOnThem: true }).label === 'Waiting on them', 'a Replied stage we have already answered no longer contradicts itself');
ok(p({ followUpDue: true }).label === 'Follow-up due', 'follow-up due');
ok(p({ meetingBooked: true }).label === 'Call booked' && p({ meetingBooked: true }).tone === 'good', 'call booked (green)');
ok(p({ failed: true }).label === 'Send failed', 'failed send');
ok(p({ attentionKind: 'auditing' }).label === 'Auditing' && p({ attentionKind: 'queued' }).label === 'Queued', 'auditing and queued keep their words');
ok(p({ waitingOnUs: true, followUpDue: true, meetingBooked: true }).label === 'Reply needed', 'a reply that needs me outranks follow-up and call');
for (const [stage, label, tone] of [['not_interested', 'Not interested', 'muted'], ['opted_out', 'Opted out', 'muted'], ['refunded', 'Refunded', 'muted'], ['won_pending_onboarding', 'Won', 'good'], ['payment_received', 'Paid', 'good']] as const) {
  const r = p({ stage, waitingOnUs: true, attentionKind: 'needs_you', failed: true });
  ok(r.label === label && r.tone === tone, `${stage} outranks whose turn it is → ${label} (${tone})`);
}
ok(Object.values(STATUS_PILL_LABELS).every((l) => l.length <= 16), 'every label is short enough never to wrap');
/* 2026-11-05: Queued, and every trigger in one place. */
ok(p({ queuedSend: true }).label === 'Queued' && p({ queuedSend: true }).key === 'queued', 'a queued message → Queued');
ok(p({ queuedSend: true, waitingOnUs: true }).label === 'Queued', 'they replied AND our answer is queued → Queued, not Reply needed (the GB Electrical bug)');
ok(p({ queuedSend: true, attentionKind: 'needs_approval', followUpDue: true }).label === 'Queued', 'queued outranks Approve draft and Follow-up due');
ok(p({ queuedSend: false, waitingOnUs: true }).label === 'Reply needed', 'queued message cancelled → back to Reply needed');
ok(p({ queuedSend: false, waitingOnThem: true }).label === 'Waiting on them', 'queued message sent → Waiting on them');
ok(p({ queuedSend: true, failed: true }).label === 'Send failed', 'send failed outranks queued');
for (const stage of ['not_interested', 'opted_out', 'won_pending_onboarding']) ok(p({ stage, queuedSend: true, waitingOnUs: true }).key !== 'queued' && p({ stage, queuedSend: true }).key !== 'reply_needed', stage + ' outranks queued');
ok(p({ attentionKind: 'needs_you' }).label === 'Reply needed', 'a held message / flagged reply is Reply needed (not passed as queuedSend)');
ok(p({ waitingOnThem: true, followUpDue: true }).label === 'Follow-up due', 'we sent, they have not replied, follow-up date passed → Follow-up due');
ok(new Set(Object.values(STATUS_PILL_LABELS)).size === Object.keys(STATUS_PILL_LABELS).length, 'one label per status');
const comp = readFileSync(new URL('../src/components/InboxAttention.tsx', import.meta.url), 'utf8');
ok(/<PipelineStatusBadge/.test(comp) && !/rounded-md/.test(comp) && !/h-[18px]/.test(comp), 'the pill IS the Outreach PipelineStatusBadge, not a restyled copy');
const sel = readFileSync(new URL('../src/pages/Inbox.tsx', import.meta.url), 'utf8');
ok(/queuedSend/.test(sel) && /status:s*'held'|r.status === 'held'/.test(sel), 'the Inbox passes queuedSend and never counts a held message as queued');
if (f) { console.log(`${f} FAILURE(S)`); process.exit(1); }
console.log('inbox-status-pill: all passed');
