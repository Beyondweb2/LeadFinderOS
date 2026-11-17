/* Per-sender queue fairness (Paul, 2026-11-16): two senders, 50 queued each, both progress in turn. Pure simulation of the
   tick: each tick derives the order fresh (stateless), sends the head, and the sender's last-send time becomes "now".
   Nothing here can message anyone. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  fairQueueOrder, senderKeyOf, senderNextSendAt, senderQueueLine, stuckSince, stuckThresholdMin, stuckDedupeKey, NO_SENDER_KEY, type SenderLead,
} from '../supabase/functions/_shared/queue-fairness.ts';
import { interleaveByCampaign } from '../supabase/functions/_shared/campaign-interleave.ts';
import { tradeForFreeText } from '../supabase/functions/_shared/free-window.ts';

let failures = 0;
const ok = (condition: boolean, label: string) => { if (!condition) failures++; console.log(`${condition ? 'PASS' : 'FAIL'} ${label}`); };
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

type L = SenderLead & { id: string };
const PAUL = 'paul-0000', VAL = 'valentin-1111';
/* Paul queued 50 at 06:49; Valentin queued 50 at 15:53 — the shape that starved the later sender. */
const mk = (who: string, n: number, at: string, campaign: string): L[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${who}-${String(i).padStart(3, '0')}`, queued_by_user_id: who, campaign_id: campaign, queued_at: at }));

function simulate(queue: L[], ticks: number, cap = Infinity) {
  let q = [...queue];
  const last = new Map<string, string>();
  const sent: string[] = [];
  let t = Date.parse('2026-11-16T09:00:00Z');
  for (let i = 0; i < ticks && q.length && sent.length < cap; i++) {
    const head = fairQueueOrder(q, last)[0];
    sent.push(senderKeyOf(head));
    last.set(senderKeyOf(head), new Date(t).toISOString());
    q = q.filter((l) => l.id !== head.id);
    t += 8 * 60000;
  }
  return sent;
}

console.log('── two senders, 50 each ──');
const queue = [...mk(PAUL, 50, '2026-11-16T06:49:00Z', 'c-paul'), ...mk(VAL, 50, '2026-11-16T15:53:00Z', 'c-val')];
const sent = simulate(queue, 100);
ok(sent.length === 100, 'all 100 go, one per tick');
ok(sent.every((s, i) => i === 0 || s !== sent[i - 1]), 'strict turns: A, B, A, B … — never two in a row');
for (const n of [10, 20, 50, 80]) {
  const p = sent.slice(0, n).filter((s) => s === PAUL).length, v = n - p;
  ok(Math.abs(p - v) <= 1, `after ${n} sends: Paul ${p}, Valentin ${v} (both progress)`);
}
const old = (() => { let q = [...queue]; const out: string[] = []; for (let i = 0; i < 20; i++) { const h = interleaveByCampaign(q)[0]; out.push(senderKeyOf(h)); q = q.filter((l) => l.id !== h.id); } return out; })();
ok(old.every((s) => s === PAUL), 'the old campaign-only order (re-derived each tick) sent 20 of Paul\'s before any of Valentin\'s — the bug');

console.log('\n── limits are untouched ──');
const capped = simulate(queue, 100, 30);
ok(capped.length === 30, 'a cap of 30 stops at 30 in total (fairness changes who, never how many)');
ok(capped.filter((s) => s === PAUL).length === 15 && capped.filter((s) => s === VAL).length === 15, '…shared 15 / 15');

console.log('\n── uneven and three senders ──');
const three = [...mk(PAUL, 50, '2026-11-16T06:00:00Z', 'a'), ...mk(VAL, 3, '2026-11-16T10:00:00Z', 'b'), ...mk('ana-2222', 5, '2026-11-16T11:00:00Z', 'c')];
const s3 = simulate(three, 58);
ok(s3.slice(0, 9).filter((s) => s === PAUL).length === 3, 'three senders: one each per round');
ok(s3.lastIndexOf(VAL) < 9 && s3.lastIndexOf('ana-2222') < 15, 'small queues clear early; the big one keeps going after');
ok(s3.length === 58, 'nothing lost');

console.log('\n── who a lead belongs to ──');
ok(senderKeyOf({ id: 'x', queued_by_user_id: 'q', assigned_to_user_id: 'a', user_id: 'u' }) === 'q', 'the person who queued it');
ok(senderKeyOf({ id: 'x', assigned_to_user_id: 'a', user_id: 'u' }) === 'a' && senderKeyOf({ id: 'x', user_id: 'u' }) === 'u', 'else the holder, else the book');
ok(senderKeyOf({ id: 'x' }) === NO_SENDER_KEY, 'no person at all: its own bucket, never dropped');
const inner = fairQueueOrder([...mk(PAUL, 2, '2026-11-16T06:00:00Z', 'p1'), ...mk(PAUL, 2, '2026-11-16T07:00:00Z', 'p2').map((l) => ({ ...l, id: l.id + 'b' }))], new Map());
ok(inner.map((l) => l.campaign_id).join(',') === 'p1,p2,p1,p2', "inside one sender, that sender's campaigns still take turns");

console.log('\n── stuck: 30 minutes, once per episode, never while paused ──');
const now = Date.parse('2026-11-16T12:00:00Z');
const base = { nowMs: now, shouldBeMoving: true, lastSentAt: null, oldestSendableQueuedAt: '2026-11-16T11:20:00Z', activeSenders: 2, gapMin: 8, windowOpenedAt: '2026-11-16T07:00:00Z' };
/* 2026-11-17, the real false alarm: 07:00:21 London, nothing sent yet today, oldest lead queued YESTERDAY 11:21. */
const morning = { ...base, nowMs: Date.parse('2026-11-17T07:00:21Z'), oldestSendableQueuedAt: '2026-11-16T11:21:36.452864+00:00', windowOpenedAt: '2026-11-17T07:00:00.000Z' };
ok(stuckSince(morning) === null, 'first tick of the day, lead queued yesterday -> NOT stuck (overnight never counts)');
ok(stuckSince({ ...morning, nowMs: Date.parse('2026-11-17T07:40:00Z') }) === '2026-11-17T07:00:00.000Z', 'nothing for 40 min after opening -> stuck since 07:00, not since yesterday');
ok(stuckSince({ ...morning, nowMs: Date.parse('2026-11-17T07:40:00Z'), lastSentAt: '2026-11-17T07:30:00Z' }) === null, 'a send after opening restarts the clock');
ok(stuckSince(base) === '2026-11-16T11:20:00Z', '40 min with nothing sent while sending is on -> stuck since 11:20');
ok(stuckSince({ ...base, oldestSendableQueuedAt: '2026-11-16T11:45:00Z' }) === null, '15 min -> not stuck');
ok(stuckSince({ ...base, lastSentAt: '2026-11-16T11:50:00Z' }) === null, 'sent 10 min ago -> not stuck');
ok(stuckSince({ ...base, shouldBeMoving: false }) === null, 'paused / outside hours / limit reached -> never "stuck"');
ok(stuckSince({ ...base, oldestSendableQueuedAt: null }) === null, 'nothing that could go -> not stuck');
ok(stuckThresholdMin(2, 8) === 30 && stuckThresholdMin(5, 8) === 60, 'the bar is 30 min, or 1.5 honest turns when many senders share the pace');
ok(stuckDedupeKey(VAL, '2026-11-16T11:20:00Z') === stuckDedupeKey(VAL, '2026-11-16T11:20:00Z') && stuckDedupeKey(VAL, 'a') !== stuckDedupeKey(VAL, 'b'), 'one dedupe key per episode (one email), a new one after it moves');

console.log('\n── the line a rep reads ──');
const L0 = { queued: 12, paused: false, windowOpen: true, windowStart: '07:00', capReached: false, coldStop: null, nextSendAt: '2026-11-16T14:20:00Z', stuckReason: null, stuckSinceIso: null };
ok(senderQueueLine(L0).line === 'Queued: 12, next send ~14:20', 'Queued: 12, next send ~14:20');
ok(senderQueueLine({ ...L0, capReached: true }).line === 'Paused: daily limit reached (12 queued)', 'Paused: daily limit reached');
ok(senderQueueLine({ ...L0, paused: true }).line.startsWith('Paused: the queue is paused'), 'Paused: the queue is paused');
ok(senderQueueLine({ ...L0, windowOpen: false }).line.startsWith('Paused: outside send hours, starts 07:00'), 'Paused: outside send hours');
ok(senderQueueLine({ ...L0, stuckSinceIso: '2026-11-16T11:20:00Z', stuckReason: 'every lead that could go is waiting for its AI audit to finish' }).state === 'stuck', 'stuck shows its reason');
ok(senderQueueLine({ ...L0, queued: 0 }).line === 'Queued: 0', 'nothing queued');
ok(senderNextSendAt('2026-11-16T14:00:00Z', 2, 8) === '2026-11-16T14:16:00.000Z', 'next send ~ the queue\'s next + one gap per sender ahead');

console.log('\n── the wiring ──');
const fn = read('supabase/functions/process-whatsapp-queue/index.ts');
ok(/const candidates = fairQueueOrder\(scanned, lastQueueSendBySender\)\.slice\(0, QUEUE_LOOKAHEAD\)/.test(fn) && !/interleaveByCampaign\(scanned\)/.test(fn), 'the tick picks from the per-sender fair order');
ok(fn.indexOf('fairQueueOrder(scanned') > fn.indexOf('if (allCapsUsed && !qaDrill) return json') && fn.indexOf('fairQueueOrder(scanned') > fn.indexOf('skipped: "not_due"'), 'cap, pacing and every gate still run first (it changes who, never how many)');
ok(/stuckDedupeKey\(/.test(fn) && /raiseOperatorAlert\(service, "team_update"/.test(fn), 'stuck: one bell row + one email per episode (raiseOperatorAlert dedupe)');
ok(/mode === "my_queue"/.test(fn) && /mode === "my_queue"\) salesActor|"my_queue"/.test(fn), 'my_queue is readable by a salesperson (their own line)');

console.log('\n── the queue: "an <trade>" inside the 24 hours, the hold outside ──');
const T = Date.parse('2026-11-16T12:00:00Z');
const AUD = ['trade', 'town', 'audit_url'];
const open = tradeForFreeText(AUD, 'Electricians', T - 60 * 60000, T);
ok(open.freeTextOnly && open.bodyTrade === 'electrician' && open.fixWords('for a electrician in Leeds') === 'for an electrician in Leeds', 'window open: free text, "an electrician"');
const shut = tradeForFreeText(AUD, 'Electricians', T - 30 * 3600000, T);
ok(!shut.freeTextOnly && shut.bodyTrade === 'Electricians', 'window closed: no fix, the paid template keeps the hold');
ok(!tradeForFreeText(AUD, 'Electricians', null, T).freeTextOnly, 'never replied: the hold');
const plumb = tradeForFreeText(AUD, 'Plumbers', T - 60000, T);
ok(!plumb.freeTextOnly && plumb.bodyTrade === 'plumber', 'a consonant trade: normalised words ("a plumber"), nothing to fix');
ok(!tradeForFreeText(['name'], 'Electricians', T - 60000, T).freeTextOnly, 'a template with no trade slot is untouched');
ok(/arTrade\.freeTextOnly \? \{ \.\.\.auditExtra, freeTextOnly: true \} : auditExtra/.test(fn) && /if \(arFreeTextOnly && !arSwap\) \{/.test(fn), 'reply lane: built for free text, refused if it would go as the paid template');
ok(/mainTrade\?\.freeTextOnly \? \{ \.\.\.templateExtra, freeTextOnly: true \} : templateExtra/.test(fn) && /if \(mainTrade\?\.freeTextOnly && !campaignSwap\)/.test(fn), 'main lane: the same');
ok(fn.indexOf('if (arFreeTextOnly && !arSwap)') < fn.indexOf('const r = await sendViaGraph(accessToken, phoneNumberId, row.phone, payload)'), '…checked before anything is sent');

const panel = read('src/components/WhatsAppQueuePanel.tsx');
ok(panel.includes('<SenderQueueLines showTeam={teamControls} />') && /mode: 'my_queue'/.test(read('src/components/SenderQueueLines.tsx')), 'the queue screen shows the line (own line for a rep; every sender for the admin)');

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log('\nALL PASS');
