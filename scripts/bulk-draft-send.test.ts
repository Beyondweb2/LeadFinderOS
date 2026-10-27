/* SEND DRAFTS — approve and send several AI drafts at once (Paul, 2026-10-27). Pure + source checks; nothing is read from
   or sent to anyone. Run: npx tsx scripts/bulk-draft-send.test.ts */
import { readFileSync } from 'node:fs';
import { BULK_DRAFT_MAX, anyDraftWaiting, draftOutcomeSummary, planDraftSend, runDraftBatch, type DraftCandidate, type DraftItem, type DraftRunDeps, type SendResult } from '../src/lib/bulkDraftSend.ts';
import type { AiReplyRow } from '../src/lib/aiReplyDraft.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const NOW = Date.parse('2026-10-27T10:00:00Z');
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
const row = (id: string, o: Partial<AiReplyRow> = {}): AiReplyRow => ({ id, phone: '447700900001', lead_id: 'L' + id, kind: 'draft', status: 'pending', inbound_at: ago(30), draft_text: `Draft for ${id}`, why: null, ...o });
const cand = (id: string, o: Partial<DraftCandidate> = {}, r: Partial<AiReplyRow> | null = {}): DraftCandidate => ({
  key: 'k' + id, leadId: 'L' + id, label: 'ZZ QA Biz ' + id, phone: '4477009000' + id.padStart(2, '0'), leadStatus: 'replied',
  lastInboundAt: ago(30), lastInboundText: 'yes   please\nsend it', row: r === null ? null : row(id, r), ...o,
});
const HOOK_WHY = { move: 'first_reply_pitch' } as unknown as AiReplyRow['why'];

console.log('1. who is sent, who is skipped');
{
  const p = planDraftSend([
    cand('1'),
    cand('2', {}, null),
    cand('3', {}, { kind: 'needs_you' }),
    cand('4', {}, { inbound_at: ago(25 * 60) }),
    cand('5', { lastInboundAt: ago(5) }),
    cand('6', { leadStatus: 'no_whatsapp' }),
    cand('7', {}, { status: 'sent' }),
    cand('8', {}, { status: 'sending' }),
    cand('9', {}, { draft_text: 'Hi {{business_name}}' }),
  ], { senderName: 'Paul', nowMs: NOW });
  ok(p.send.length === 1 && p.send[0].key === 'k1', 'only the waiting, sendable draft is sent');
  const why = Object.fromEntries(p.skipped.map((s) => [s.key, s.skip]));
  ok(why.k2 === 'no waiting draft', 'no draft → skipped');
  ok(/needs you/.test(why.k3 ?? ''), 'a Needs-you draft is never bulk-sent');
  ok(/24-hour/.test(why.k4 ?? ''), 'past the 24-hour window → skipped');
  ok(/replied again/.test(why.k5 ?? ''), 'they replied again after the draft → skipped');
  ok(/no WhatsApp/.test(why.k6 ?? ''), 'marked no WhatsApp → skipped');
  ok(why.k7 === 'draft no longer waiting' && why.k8 === 'already being sent', 'already sent / being sent → skipped');
  ok(/blanks/.test(why.k9 ?? ''), 'unfilled blanks → skipped');
  ok(p.send[0].body === 'Draft for 1' && p.send[0].theirLast === 'yes please send it', 'its OWN draft, exactly; their last message on one line');
}

console.log('2. the hook is signed; no name sends nothing');
{
  const withName = planDraftSend([cand('1', {}, { why: HOOK_WHY })], { senderName: 'Paul', nowMs: NOW });
  ok(withName.send[0].isHook && withName.send[0].body.endsWith('\n\nPaul') && !withName.needsName, 'a hook draft ends with the approver’s name');
  const noName = planDraftSend([cand('1', {}, { why: HOOK_WHY }), cand('2')], { senderName: null, nowMs: NOW });
  ok(noName.needsName, 'a hook with no name chosen → needsName (the UI opens the name box and sends nothing)');
  const plain = planDraftSend([cand('2')], { senderName: null, nowMs: NOW });
  ok(!plain.needsName && plain.send[0].body === 'Draft for 2', 'a non-hook draft is never signed');
}

console.log('3. batch limit and the action’s visibility');
{
  const many = Array.from({ length: BULK_DRAFT_MAX + 3 }, (_, i) => cand(String(i + 1)));
  const p = planDraftSend(many, { senderName: 'Paul', nowMs: NOW });
  ok(BULK_DRAFT_MAX === 20 && p.send.length === 20 && p.skipped.length === 3 && /limit/.test(p.skipped[0].skip ?? ''), 'at most 20 per batch; the rest listed as skipped');
  ok(anyDraftWaiting([cand('1', {}, null), cand('2')], NOW) && !anyDraftWaiting([cand('1', {}, null), cand('3', {}, { kind: 'needs_you' })], NOW), 'Send drafts shows only when a selected conversation Needs approving');
}

console.log('4. the run: claim → send → complete, one at a time');
{
  const items: DraftItem[] = planDraftSend([cand('1'), cand('2'), cand('3'), cand('4'), cand('5')], { senderName: 'Paul', nowMs: NOW }).send;
  const log: string[] = [];
  const sendRes: Record<string, SendResult> = {
    k1: { ok: true, messageId: 'm1' },
    k2: { ok: true, scheduled: { id: 's2', send_at: '2026-10-28T08:00:00Z', tz: 'Europe/London' } },
    k3: { ok: false, error: 'meta_error', reason: '(#131047) Re-engagement message' },
    k5: { ok: true, messageId: 'm5' },
  };
  let inFlight = 0; let maxInFlight = 0;
  const deps: DraftRunDeps = {
    claim: async (id) => { log.push('claim ' + id); return id === 'k4' ? { ok: false, refused: true, reason: 'They replied again after this draft was written.' } : { ok: true }; },
    send: async (it) => { inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); log.push('send ' + it.key); await new Promise((r) => setTimeout(r, 1)); inFlight--; return sendRes[it.key]; },
    complete: async (id, m, e) => { log.push(`complete ${id} ${m ?? '-'} ${e ?? '-'}`); },
    discard: async (id) => { log.push('discard ' + id); },
  };
  const itemsById = items.map((it) => ({ ...it, draftId: it.key }));
  const out = await runDraftBatch(itemsById, deps);
  const by = Object.fromEntries(out.map((o) => [o.key, o]));
  ok(maxInFlight === 1, 'sequential, never in parallel');
  ok(by.k1.kind === 'sent' && log.includes('complete k1 m1 -'), 'sent → complete with the message id');
  ok(by.k2.kind === 'queued' && by.k2.scheduledId === 's2' && by.k2.sendAt === '2026-10-28T08:00:00Z' && log.includes('discard k2'), 'queued → send time kept, draft closed so it can never go twice');
  ok(by.k3.kind === 'failed' && by.k3.reason === '(#131047) Re-engagement message', 'failed → Meta’s own reason');
  ok(by.k4.kind === 'skipped' && !log.includes('send k4') && /replied again/.test(by.k4.reason ?? ''), 'a refused claim sends NOTHING and says why');
  ok(by.k5.kind === 'sent', 'one failure never stops the rest');
  ok(draftOutcomeSummary(out) === 'Drafts: 2 sent · 1 queued · 1 failed · 1 skipped', 'the summary counts every kind');
  const dup = await runDraftBatch([itemsById[0], { ...itemsById[0], key: 'kX' }], { ...deps, send: async () => ({ ok: true }) });
  ok(dup[1].kind === 'skipped', 'the same draft twice in a batch is sent once');
  const thrown = await runDraftBatch([itemsById[0]], { ...deps, claim: async () => { throw new Error('offline'); } });
  ok(thrown[0].kind === 'failed', 'a claim that got no answer is failed, and nothing is sent');
}

console.log('5. source: the normal paths only, nothing bypassed');
{
  const LIB = read('src/lib/bulkDraftSend.ts');
  ok(!/supabase|fetch\(|graph\.facebook/.test(LIB), 'the run talks to nothing itself: every call is injected');
  const INBOX = read('src/pages/Inbox.tsx');
  const run = INBOX.slice(INBOX.indexOf('const runDraftSend = async'), INBOX.indexOf('const cancelDraftQueued'));
  ok(/action: 'claim', draft_id: draftId, final_text: body, bulk: true/.test(run), 'each lead is claimed with bulk: true (the once-only gate + the extra refusals)');
  ok(/await send\(\{ phone: it\.phone, leadId: it\.leadId, body: it\.body \}\)/.test(run), 'each send is the Inbox’s own send (send hours, caps, opt-outs, 24h, Meta)');
  ok(!/allowResend|allow_resend|templateName/.test(run), 'no resend override, no template');
  ok(/if \(draftRunningRef\.current/.test(run), 'a double click cannot start two runs');
  ok(/needsName/.test(run) && /OPEN_MESSAGE_NAME_EVENT/.test(INBOX.slice(INBOX.indexOf('const openDraftConfirm'), INBOX.indexOf('const runDraftSend'))), 'no name → the name box opens, nothing is sent');
  const FN = read('supabase/functions/ai-reply-drafts/index.ts');
  const claim = FN.slice(FN.indexOf('async function handleClaim'), FN.indexOf('async function handleComplete'));
  const iBulk = claim.indexOf('if (body.bulk === true)'); const iWon = claim.indexOf('const { data: won }');
  ok(iBulk > 0 && iBulk < iWon, 'the bulk refusals run BEFORE the once-only claim');
  ok(/error: "newer_inbound"/.test(claim) && /error: "no_whatsapp"/.test(claim) && /d\.kind !== "draft"/.test(claim), 'bulk claim refuses: they replied again, no WhatsApp, a Needs-you draft');
  ok(/if \(error\) return true;/.test(FN.slice(FN.indexOf('async function newerInboundSince'), FN.indexOf('async function handleClaim'))), 'a failed read refuses (fail closed)');
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall passed');
