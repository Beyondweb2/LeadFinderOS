/* ONE ATTENTION PILL, the draft bubble and the two reply settings (2026-10-22, Paul). The rule (src/lib/inboxAttention.ts),
   the draft bubble wiring, the list row, and the "Audit after first reply" switch (migration 20261124120000), read as source.
   Nothing here can message anyone. */
import { readFileSync } from 'node:fs';
import { ATTENTION_ORDER, attentionFor, attentionsFor, INBOUND_LABEL_TITLES } from '../src/lib/inboxAttention.ts';
import type { AiReplyRow } from '../src/lib/aiReplyDraft.ts';
import type { ConversationState } from '../src/lib/conversationState.ts';
import { pitchNeedsAuditHint, INBOX_REPLY_MODE_HINTS } from '../src/lib/inboxReplyMode.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const NOW = Date.parse('2026-10-22T12:00:00Z');
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
const quiet: ConversationState = { unread: false, waitingSinceMs: null, waitingOnThem: false, windowOpen: true, templateRequired: false, failed: false, queued: false, followUpDue: false, tone: 'grey', label: null, failedError: null };
const draft = (over: Partial<AiReplyRow> = {}): AiReplyRow => ({ id: 'd1', phone: '447700900001', lead_id: 'L1', kind: 'draft', status: 'pending', inbound_at: ago(10), reason: null, reason_label: null, draft_text: 'Hi', why: null, error: null, regenerations: 0, ...over } as AiReplyRow);
const base = { ai: null, state: quiet, auditing: false, scheduled: [] as never[], channel: 'whatsapp' as const, nowMs: NOW };

console.log('1. the order');
{
  ok(JSON.stringify(ATTENTION_ORDER) === '["needs_approval","needs_you","send_failed","auditing","waiting","queued"]', 'Needs approval → Needs you → Send failed → Auditing → Waiting → Queued');
  const all = attentionsFor({
    ...base, ai: draft(), auditing: true, state: { ...quiet, failed: true, waitingSinceMs: NOW - 2 * 3600_000 },
    scheduled: [{ status: 'held', send_at: ago(-60), tz: 'Europe/London', hold_reason: 'replied_since' }, { status: 'scheduled', send_at: ago(-600), tz: 'Europe/London', hold_reason: null }],
  });
  ok(all.map((a) => a.kind).join(',') === 'needs_approval,needs_you,send_failed,auditing,waiting,queued', `every state found, in order (${all.map((a) => a.kind).join(',')})`);
  const one = attentionFor({ ...base, ai: draft(), state: { ...quiet, failed: true } });
  ok(one?.kind === 'needs_approval' && /Also: Send failed/.test(one.title), 'ONE pill, the highest; the hover names the rest');
  ok(attentionFor(base) === null, 'a quiet conversation shows no pill');
}

console.log('2. each state');
{
  const ny = attentionFor({ ...base, ai: draft({ kind: 'needs_you', draft_text: null, reason: 'price', reason_label: 'Asked about price' }) });
  ok(ny?.kind === 'needs_you' && ny.title.startsWith('Asked about price'), 'Needs you: the reason is the hover (the separate reason line is gone)');
  const tpl = attentionFor({ ...base, ai: draft({ inbound_at: ago(60 * 30) }) });
  ok(tpl?.kind === 'needs_you' && /24 hours/.test(tpl.title), 'a draft whose 24-hour window closed is Needs you (template only), never Needs approval');
  const w = attentionFor({ ...base, state: { ...quiet, waitingSinceMs: NOW - 2 * 3600_000 }, inboundLabel: 'Only confirmed' });
  ok(w?.label === 'Waiting' && /2h ago/.test(w.title) && w.title.includes(INBOUND_LABEL_TITLES['Only confirmed']), '"Waiting 2h" and "Only confirmed" fold into the Waiting pill\'s hover');
  const q = attentionFor({ ...base, scheduled: [{ status: 'scheduled', send_at: '2026-10-23T06:00:00Z', tz: 'Europe/London', hold_reason: null }] });
  ok(q?.kind === 'queued' && q.label === 'Queued (sends 07:00)', `Queued shows when it sends (${q?.label})`);
  ok(attentionFor({ ...base, state: { ...quiet, queued: true } })?.label === 'Queued', 'the drip queue reads Queued');
  ok(attentionFor({ ...base, auditing: true })?.kind === 'auditing', 'an audit running reads Auditing');
  ok(attentionFor({ ...base, ai: draft({ status: 'generating' }) }) === null, 'Drafting… is not a pill of its own');
}

console.log('3. the list row and the header');
{
  const INBOX = read('src/pages/Inbox.tsx');
  const row = INBOX.slice(INBOX.indexOf('const ConversationRow = memo('), INBOX.indexOf('}, sameRowProps);'));
  ok(!/InboundLabelChip|ConvStateChip|AiDraftChip|needs-you-reason|EngagementPills|NextActionPill|PipelineStatusSelect/.test(row), 'the row draws none of the old chips, no status menu');
  ok(/<AttentionPill kind=\{attentionKind\}/.test(row) && /<OneStatusText /.test(row) && /<ScoreLine /.test(row), 'the row: one pill, the status as text, one score line');
  ok((INBOX.match(/<AttentionPill /g) ?? []).length === 2 && /const at = rowAttention\(active\)/.test(INBOX), 'the header shows the SAME pill from the SAME rule');
  ok((INBOX.match(/<PipelineStatusSelect /g) ?? []).length === 1, 'the status menu lives only in the thread header');
  ok(/aria-label=\{active\.isPotentialWork \? 'Remove interested star' : 'Mark as interested'\}/.test(INBOX), 'Interested stays the star');
}

console.log('4. the draft bubble');
{
  const INBOX = read('src/pages/Inbox.tsx');
  const PANEL = read('src/components/AiDraftPanel.tsx');
  ok(/<AiDraftBubble row=\{activeAi\}/.test(INBOX) && INBOX.indexOf('<AiDraftBubble') > INBOX.indexOf('<ScheduledSendBubble'), 'the draft is a bubble in the thread, after the queued sends');
  ok(/data-testid="ai-approve-send"/.test(PANEL) && /data-testid="ai-reject"/.test(PANEL) && /data-testid="ai-regenerate"/.test(PANEL) && /Why this reply\?/.test(PANEL), 'three buttons on the bubble + "Why this reply?"');
  ok(/onReject=\{\(\) => void discardAiDraft\(\)\}/.test(INBOX), 'Reject = discard (the outcome trigger logs it as discarded; nothing is sent)');
  ok(/if \(!chip \|\| rowSendable\(row\)\) return null;/.test(PANEL) && /activeAi && !rowSendable\(activeAi\)/.test(INBOX), 'the old bar is gone for a written draft (only the hand-over note stays: Needs you with no draft, a stop, a template)');
  ok(!/insertWarmDraft\(active\.key, activeAiDraft\);\n\s+\/\/ eslint-disable-next-line react-hooks\/exhaustive-deps/.test(INBOX) && /const editAiDraftInBox = \(\) =>/.test(INBOX), 'the draft is no longer pre-filled in the box; "Edit in reply box" puts it there');
  ok(/const body = fromBox \? boxText : \(activeAi\.draft_text \?\? ''\)\.trim\(\);/.test(INBOX), 'Approve & send sends the bubble\'s words, or the box\'s after Edit in reply box');
  ok(/await invokeEdge\('ai-reply-drafts', \{ action: 'claim', draft_id: activeAi\.id, final_text: body \}\)/.test(INBOX) && /const res = await send\(\{ phone: active\.phone, leadId: active\.leadId, body \}\);/.test(INBOX), 'the send path is unchanged: claim once → the Inbox send → complete');
}

console.log('5. two reply settings');
{
  const MIG = read('supabase/migrations/20261124120000_reply_audit_switch.sql');
  const FN = read('supabase/functions/ai-reply-drafts/index.ts');
  const CTRL = read('src/components/InboxReplyModeControl.tsx');
  ok(/new\.auto_reply_enabled := coalesce\(new\.reply_audit_enabled, false\);/.test(MIG) && !/new\.auto_reply_enabled := new\.ai_reply_mode <> 'manual'/.test(MIG), 'the reply audit follows its OWN switch, no longer the mode (Manual no longer turns it off)');
  ok(/new\.ai_handles_replies := new\.ai_reply_mode <> 'manual';/.test(MIG) && /new\.first_reply_mode := 'audit_only';/.test(MIG) && /when new\.ai_handles_replies is true then 'draft' else 'manual'/.test(MIG), 'everything else in the sync trigger is unchanged (never auto from an old writer; Audit and reply stays retired)');
  ok(/set reply_audit_enabled = coalesce\(auto_reply_enabled, false\) where reply_audit_enabled is null/.test(MIG), 'the live row keeps today\'s behaviour');
  ok(/new\.reply_audit_enabled := coalesce\(new\.auto_reply_enabled, false\);/.test(MIG), 'an old writer of the audit toggle moves the new switch (the two never disagree)');
  ok(/action === "set_reply_audit"/.test(FN) && /typeof body\.on !== "boolean"/.test(FN) && /reply_audit: data\?\.reply_audit_enabled === true/.test(FN), 'set_reply_audit (admin, boolean only) and the settings read');
  ok(/data-testid="reply-audit-switch"/.test(CTRL) && /role="radiogroup"/.test(CTRL), 'two controls in Settings: the audit switch and the AI replies mode');
  ok(pitchNeedsAuditHint('draft', false) && pitchNeedsAuditHint('auto', false) && !pitchNeedsAuditHint('draft', true) && !pitchNeedsAuditHint('manual', false) && !pitchNeedsAuditHint('draft', null), 'the hint shows only when AI drafts and the audit is off');
  ok(!/no audit/i.test(INBOX_REPLY_MODE_HINTS.manual), 'Manual\'s words no longer say the audit is off');
  ok(/pitchNeedsEvidence/.test(FN), 'the draft-after-audit rule is untouched (a pitch is never drafted without evidence)');
}

if (f) { console.log(`${f} FAILURE(S)`); process.exit(1); }
console.log('inbox-attention: all passed');
