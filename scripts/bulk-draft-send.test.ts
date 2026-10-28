/* SEND DRAFTS — draft and send several replies in one go, no approval step (Paul, 2026-10-27). Pure + source checks;
   nothing is read from or sent to anyone. Run: npx tsx scripts/bulk-draft-send.test.ts */
import { readFileSync } from 'node:fs';
import {
  BULK_DRAFT_AT_ONCE, BULK_DRAFT_MAX, BULK_UNDO_MS, UNDONE_REASON, batchWorkCount, draftOutcomeSummary, itemFor, planBatch, runBatch,
  type BatchDeps, type BatchRow, type DraftCandidate, type GenerateResult, type SendResult,
} from '../src/lib/bulkDraftSend.ts';
import { BULK_SKIP, bulkDraftRefusal } from '../src/lib/bulkDraftRule.ts';
import type { AiReplyRow } from '../src/lib/aiReplyDraft.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const NOW = Date.parse('2026-10-27T10:00:00Z');
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
/** A clean, model-written draft's "why" (no checker warning, not the fallback, not a stop). */
const CLEAN = { move: 'playbook', intent: 'who_are_you', stop: false, needsYou: null, label: null, problems: [], usedFallback: false, confidence: null } as unknown as AiReplyRow['why'];
const HOOK = { ...CLEAN, move: 'first_reply_pitch', intent: null } as unknown as AiReplyRow['why'];
const why = (o: Record<string, unknown>) => ({ ...CLEAN, ...o }) as unknown as AiReplyRow['why'];
const row = (id: string, o: Partial<AiReplyRow> = {}): AiReplyRow => ({ id: 'd' + id, phone: '447700900001', lead_id: 'L' + id, kind: 'draft', status: 'pending', inbound_at: ago(30), draft_text: `Draft for ${id}`, why: CLEAN, ...o });
const cand = (id: string, o: Partial<DraftCandidate> = {}, r: Partial<AiReplyRow> | null = {}): DraftCandidate => ({
  key: 'k' + id, leadId: 'L' + id, label: 'ZZ QA Biz ' + id, phone: '4477009000' + id.padStart(2, '0'), leadStatus: 'replied',
  lastInboundAt: ago(30), lastInboundText: 'yes please', lastInboundType: 'text', row: r === null ? null : row(id, r), ...o,
});
const rule = (o: Partial<Parameters<typeof bulkDraftRefusal>[0]>) => bulkDraftRefusal({ kind: 'draft', draft_text: 'Hi mate, quick one…', why: CLEAN as unknown as Record<string, unknown>, inboundText: 'yes', inboundType: 'text', prospectOnly: false, ...o });

console.log('1. the plan: who is drafted, who is sent, who is skipped');
{
  const p = planBatch([
    cand('1'),                                            // waiting draft → send
    cand('2', {}, null),                                  // no draft → draft it
    cand('3', { leadStatus: 'no_whatsapp' }, null),
    cand('4', { lastInboundAt: ago(25 * 60) }, null),     // window closed, no draft
    cand('5', { lastInboundAt: ago(5) }),                 // replied again after the waiting draft
    cand('6', { answered: true }, null),                  // our message is the newest
    cand('7', {}, { status: 'generating' }),
    cand('8', {}, { status: 'sending' }),
    cand('9', { lastInboundAt: null }, null),
    cand('10', { leadId: null }, null),
  ], { senderName: 'Paul', nowMs: NOW });
  const by = Object.fromEntries(p.items.map((i) => [i.cand.key, i]));
  ok(by.k1.todo === 'send' && by.k2.todo === 'draft', 'a waiting draft is sent; a conversation with none gets one drafted');
  ok(/no WhatsApp/.test(by.k3.row.reason ?? ''), 'no WhatsApp → skipped, nothing drafted');
  ok(/template/.test(by.k4.row.reason ?? ''), 'outside the 24-hour window → skipped, says a template is needed');
  ok(/replied again/.test(by.k5.row.reason ?? ''), 'they replied again after the draft → skipped');
  ok(/already answered/.test(by.k6.row.reason ?? ''), 'already answered → skipped, nothing drafted');
  ok(/drafting/.test(by.k7.row.reason ?? '') && /being sent/.test(by.k8.row.reason ?? ''), 'still drafting / already being sent → skipped');
  ok(/not replied/.test(by.k9.row.reason ?? '') && /no lead/.test(by.k10.row.reason ?? ''), 'no reply yet / no lead → skipped');
  ok(batchWorkCount(p) === 2, 'the button counts only what will be worked on');
  ok(planBatch([cand('1')], { senderName: null, nowMs: NOW }).needsName, 'no sender name → needsName (nothing starts, the name box opens)');
  const many = planBatch(Array.from({ length: BULK_DRAFT_MAX + 3 }, (_, i) => cand(String(i + 1), {}, null)), { senderName: 'Paul', nowMs: NOW });
  ok(BULK_DRAFT_MAX === 20 && batchWorkCount(many) === 20 && /limit/.test(many.items[20].row.reason ?? ''), 'at most 20 per batch; the rest listed as skipped');
  ok(BULK_DRAFT_AT_ONCE === 3 && BULK_UNDO_MS === 10_000, 'drafts 3 at a time; a 10 second Undo');
}

console.log('2. never sent unread (bulkDraftRule.ts)');
{
  ok(rule({}) === null, 'a clean draft to a plain message may go');
  ok(rule({ why: why({ move: 'first_reply_pitch', intent: null }) as never }) === null, 'the hook may go');
  ok(rule({ kind: 'needs_you' }) === BULK_SKIP.needs_you && rule({ why: why({ needsYou: { reason: 'payment', label: 'x' } }) as never }) === BULK_SKIP.needs_you, 'Needs you → skipped');
  ok(rule({ why: why({ problems: ['too long'] }) as never }) === BULK_SKIP.low_confidence && rule({ why: why({ usedFallback: true }) as never }) === BULK_SKIP.low_confidence, 'checker warned / rule-built fallback → low confidence');
  ok(rule({ why: why({ intent: 'unsure', move: 'unsure' }) as never }) === BULK_SKIP.low_confidence, 'an unsure read → low confidence');
  ok(rule({ inboundText: 'how much is it?' }) === BULK_SKIP.price && rule({ why: why({ intent: 'how_much' }) as never }) === BULK_SKIP.price, 'a price question → skipped');
  ok(rule({ inboundText: 'is there a guarantee' }) === BULK_SKIP.price, 'a guarantee question → skipped');
  ok(rule({ why: why({ intent: 'too_expensive' }) as never }) !== null && rule({ why: why({ move: 'objection_rank', intent: null }) as never }) === BULK_SKIP.objection, 'an objection → skipped');
  ok(rule({ why: why({ intent: 'dont_need' }) as never }) === BULK_SKIP.no && rule({ why: why({ move: 'close_politely', intent: null }) as never }) === BULK_SKIP.no, 'not interested / a no → skipped');
  ok(rule({ inboundText: 'STOP' }) === BULK_SKIP.opt_out && rule({ why: why({ stop: true }) as never }) === BULK_SKIP.opt_out && rule({ inboundText: 'leave me alone' }) === BULK_SKIP.opt_out, 'opt-out / stop / hostile → skipped');
  ok(rule({ why: why({ label: 'Auto-reply' }) as never }) === BULK_SKIP.bot && rule({ why: why({ move: 'auto_reply', intent: null, structure: 'hook' }) as never }) === BULK_SKIP.bot && rule({ why: why({ intent: 'is_bot' }) as never }) === BULK_SKIP.bot, 'a bot / automatic reply → skipped');
  ok(rule({ inboundType: 'sticker' }) === BULK_SKIP.media && rule({ inboundText: '👍' }) === BULK_SKIP.media && rule({ inboundType: 'reaction' }) === BULK_SKIP.media, 'a sticker / reaction / emoji → skipped');
  ok(rule({ why: why({ intent: 'voice_yes' }) as never }) === BULK_SKIP.promise, 'a promised voice note / call → skipped');
  ok(rule({ why: why({ intent: 'how_long' }) as never }) !== null, 'a fact answer → skipped');
  ok(rule({ prospectOnly: true, draft_text: 'It is £99 to start' }) === BULK_SKIP.australia && rule({ prospectOnly: true }) === null, 'Australia: a price / sign-up word → skipped; a plain reply may go');
  ok(rule({ why: null }) !== null && rule({ why: {} }) !== null, 'a missing "why" reads as unsafe → skipped');
}

console.log('3. the run: draft, wait for Undo, then claim → send → complete one at a time');
const fixture = () => {
  const log: string[] = [];
  let inFlight = 0; let maxInFlight = 0; let genIn = 0; let maxGen = 0;
  const sendRes: Record<string, SendResult> = {
    k1: { ok: true, messageId: 'm1' },
    k2: { ok: true, scheduled: { id: 's2', send_at: '2026-10-28T08:00:00Z', tz: 'Europe/London' } },
    k3: { ok: false, error: 'meta_error', reason: '(#131047) Re-engagement message' },
    k5: { ok: true, messageId: 'm5' },
  };
  const genRows: Record<string, GenerateResult> = {
    k2: { ok: true, row: row('2', { why: HOOK, draft_text: 'Hi mate, ChatGPT named 3 others…' }) },
    k5: { ok: true, row: row('5') },
    k6: { ok: true, row: row('6', { why: why({ intent: 'how_much' }) }) },
    k7: { ok: false, refused: true, reason: 'The audit is still running.' },
  };
  const deps = (o: Partial<BatchDeps> = {}): BatchDeps => ({
    generate: async (c) => { genIn++; maxGen = Math.max(maxGen, genIn); log.push('gen ' + c.key); await new Promise((r) => setTimeout(r, 2)); genIn--; return genRows[c.key]; },
    claim: async (id) => { log.push('claim ' + id); return id === 'd4' ? { ok: false, refused: true, reason: 'They replied again after this draft was written.' } : { ok: true }; },
    send: async (it) => { inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); log.push('send ' + it.key + ' ' + JSON.stringify(it.body)); await new Promise((r) => setTimeout(r, 1)); inFlight--; return sendRes[it.key]; },
    complete: async (id, m, e) => { log.push(`complete ${id} ${m ?? '-'} ${e ?? '-'}`); },
    discard: async (id) => { log.push('discard ' + id); },
    goAhead: Promise.resolve(true), stopped: () => false, onRow: () => undefined, senderName: 'Sam', nowMs: () => NOW,
    ...o,
  });
  const plan = planBatch([cand('1'), cand('2', {}, null), cand('3'), cand('4'), cand('5', {}, null), cand('6', {}, null), cand('7', {}, null)], { senderName: 'Sam', nowMs: NOW });
  return { log, deps, plan, stats: () => ({ maxInFlight, maxGen }) };
};
{
  const { log, deps, plan, stats } = fixture();
  const out = await runBatch(plan, deps());
  const by = Object.fromEntries(out.map((o) => [o.key, o])) as Record<string, BatchRow>;
  ok(stats().maxInFlight === 1, 'sends are sequential, never in parallel');
  ok(stats().maxGen <= BULK_DRAFT_AT_ONCE, 'drafting is limited to 3 at a time');
  ok(by.k1.state === 'sent' && log.includes('complete d1 m1 -') && !log.includes('gen k1'), 'a waiting draft is sent as it is (not redrafted) → complete with the message id');
  ok(by.k2.state === 'queued' && by.k2.drafted && by.k2.scheduledId === 's2' && log.includes('discard d2'), 'drafted, then queued for their send hours: time kept, draft closed so it can never go twice');
  ok(log.some((l) => l.startsWith('send k2') && l.endsWith('\\n\\nSam"')), 'the drafted hook is signed with the sender’s own name');
  ok(by.k3.state === 'failed' && by.k3.reason === '(#131047) Re-engagement message', 'failed → Meta’s own reason');
  ok(by.k4.state === 'skipped' && !log.some((l) => l.startsWith('send k4')) && /replied again/.test(by.k4.reason ?? ''), 'a refused claim sends NOTHING and says why');
  ok(by.k5.state === 'sent' && by.k5.drafted, 'one failure never stops the rest; drafted and sent');
  ok(by.k6.state === 'skipped' && by.k6.reason === BULK_SKIP.price && !log.includes('claim d6'), 'a freshly drafted price answer is skipped before any claim');
  ok(by.k7.state === 'skipped' && /audit/.test(by.k7.reason ?? ''), 'a drafter refusal is skipped with its reason');
  ok(draftOutcomeSummary(out) === 'Drafts: 2 sent · 1 queued · 1 failed · 3 skipped', 'the summary counts every kind');
  ok(out.map((o) => o.key).join() === 'k1,k2,k3,k4,k5,k6,k7', 'results in selection order');
}
{
  /* Undo: drafts may be written, but nothing is claimed or sent. */
  const { log, deps, plan } = fixture();
  let stopped = false;
  const out = await runBatch(plan, deps({ goAhead: new Promise((r) => setTimeout(() => { stopped = true; r(false); }, 5)), stopped: () => stopped }));
  ok(!log.some((l) => l.startsWith('claim') || l.startsWith('send')), 'Undo → nothing is claimed or sent');
  ok(out.every((o) => o.state === 'skipped'), 'Undo → every row reads skipped');
  ok(out.find((o) => o.key === 'k1')?.reason === UNDONE_REASON, 'Undo says nothing was sent');
}
{
  /* No send starts before the Undo window has passed. */
  const { log, deps, plan } = fixture();
  let release: (v: boolean) => void = () => undefined;
  const run = runBatch(plan, deps({ goAhead: new Promise((r) => { release = r; }) }));
  await new Promise((r) => setTimeout(r, 30));
  ok(!log.some((l) => l.startsWith('claim') || l.startsWith('send')) && log.some((l) => l.startsWith('gen')), 'during the Undo window drafts are written but nothing is sent');
  release(true); await run;
  ok(log.some((l) => l.startsWith('send')), 'after the window, sending starts');
}
{
  /* Stop part-way: what has not started is not sent. */
  const { log, deps, plan } = fixture();
  let stopped = false;
  const out = await runBatch(plan, deps({ send: async (it) => { log.push('send ' + it.key); stopped = true; return { ok: true, messageId: 'm' }; }, stopped: () => stopped }));
  ok(log.filter((l) => l.startsWith('send')).length === 1 && out.filter((o) => o.state === 'sent').length === 1, 'Stop → nothing more is sent');
}
{
  /* The same draft twice, and a claim that got no answer. */
  const { deps } = fixture();
  const twice = planBatch([cand('1'), cand('1', { key: 'kX' })], { senderName: 'Sam', nowMs: NOW });
  const dup = await runBatch(twice, deps({ send: async () => ({ ok: true }) }));
  ok(dup[1].state === 'skipped' && /twice/.test(dup[1].reason ?? ''), 'the same draft twice in a batch is sent once');
  const thrown = await runBatch(planBatch([cand('1')], { senderName: 'Sam', nowMs: NOW }), deps({ claim: async () => { throw new Error('offline'); } }));
  ok(thrown[0].state === 'failed', 'a claim that got no answer is failed, and nothing is sent');
  ok(itemFor(cand('9', {}, { draft_text: 'Hi {{business_name}}' }), 'Sam', NOW).skip === 'the draft still has blanks to fill', 'unfilled blanks → skipped');
}

console.log('4. source: the normal paths only, nothing bypassed');
{
  const LIB = read('src/lib/bulkDraftSend.ts') + read('src/lib/bulkDraftRule.ts');
  ok(!/supabase|fetch\(|graph\.facebook/.test(LIB), 'the run talks to nothing itself: every call is injected');
  ok(!/Promise\.all\(\s*plan\.items/.test(LIB), 'sends are never Promise.all');
  const INBOX = read('src/pages/Inbox.tsx');
  const run = INBOX.slice(INBOX.indexOf('const runDraftSend = async'), INBOX.indexOf('const undoDraftSend'));
  ok(/action: 'claim', draft_id: draftId, final_text: body, bulk: true/.test(run), 'each lead is claimed with bulk: true (the once-only gate + the server re-check)');
  ok(/action: 'draft', lead_id: c\.leadId, phone: c\.phone/.test(run), 'a missing draft comes from the normal drafter (Draft reply)');
  ok(/await send\(\{ phone: it\.phone, leadId: it\.leadId, body: it\.body \}\)/.test(run), 'each send is the Inbox’s own send (send hours, caps, opt-outs, 24h, Meta)');
  ok(!/allowResend|allow_resend|templateName/.test(run), 'no resend override, no template');
  ok(/if \(draftRunningRef\.current\) return;/.test(run), 'a double click cannot start two runs');
  ok(/needsName/.test(run) && /OPEN_MESSAGE_NAME_EVENT/.test(run), 'no name → the name box opens, nothing starts');
  ok(/BULK_UNDO_MS/.test(run) && /goAhead/.test(run), 'every send waits for the Undo window');
  ok(!/DraftBatchConfirm/.test(INBOX), 'no confirm dialog');
  const FN = read('supabase/functions/ai-reply-drafts/index.ts');
  const claim = FN.slice(FN.indexOf('async function handleClaim'), FN.indexOf('async function handleComplete'));
  const iBulk = claim.indexOf('if (body.bulk === true)'); const iWon = claim.indexOf('const { data: won }');
  ok(iBulk > 0 && iBulk < iWon, 'the bulk refusals run BEFORE the once-only claim');
  ok(/error: "newer_inbound"/.test(claim) && /error: "no_whatsapp"/.test(claim) && /d\.kind !== "draft"/.test(claim), 'bulk claim refuses: they replied again, no WhatsApp, a Needs-you draft');
  ok(/bulkDraftRefusal\(/.test(claim) && /error: "bulk_skip"/.test(claim), 'bulk claim runs the never-sent-unread rule on the stored row');
  ok(/if \(inbErr \|\| !inb\) return json\(\{ ok: false/.test(claim), 'their message unreadable → refused (fail closed)');
  ok(/if \(error \|\| !data\) return \{ noWhatsApp: true, prospectOnly: true \}/.test(FN), 'a failed lead read refuses (fail closed)');
  ok(!/bulkDraftRule|bulk/.test(read('src/lib/aiAutoSend.ts')), 'Level 2 (aiAutoSend.ts) is untouched by Send drafts');
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall passed');
