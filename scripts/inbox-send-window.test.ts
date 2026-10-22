/* ============================================================
   THE INBOX SEND WINDOW (2026-10-21, feat/inbox-send-window).

   ⛔ THE FAILURES THIS SUITE EXISTS FOR:
     · a message from the Inbox reaching a prospect outside their send hours (any path: typed, AI draft, Quick reply,
       template, follow-up buttons, voice note, text, file);
     · a queued message going after they opted out / got angry / the lead was stopped;
     · a queued message going after they wrote again (it must wait for a person: Needs you);
     · a queued free-form WhatsApp going after the 24 hours ran out (it must be held: use a template);
     · queued messages going out of order, twice, or all at once;
     · a second copy of the hours, or a door around them.
   Everything here is fake data: pure rules + the drain with fakes + source sweeps. Nothing sends.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import {
  replyWindowFor, replyHoursFrom, replyWindowOpen, nextWindowOpenAt, windowStatusLine, queuedLabel, queueDecision,
  drainDecision, keepsSendHours, scheduledLine, scheduledEditable, scheduledReleasable, sendVerb, HOLD_LABELS, type DrainFacts,
} from '../src/lib/inboxSendWindow.ts';
import { LONDON_SEND_WINDOW } from '../src/lib/sendWindow.ts';
import { bulkSummaryText } from '../src/lib/inboxBulkSend.ts';
import { DEFAULT_COUNTRY_SETTINGS } from '../src/lib/outreachMarkets.ts';
import { drainTick, senderOutcome, MAX_SENDS_PER_TICK, type DrainDeps, type DueRow, type SendOutcome } from '../supabase/functions/_shared/inbox-scheduled-drain.ts';
import { sendVoiceNote, type VoiceSendDeps } from '../supabase/functions/_shared/voice-note-send.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

const UK = '447700900123';
const MY = '60123456789';
const at = (iso: string) => new Date(iso);

/* ── 1. the hours: the outreach hours by default, one setting overrides ── */
{
  const wa = replyWindowFor('whatsapp', UK);
  ok(wa.tz === 'Europe/London' && wa.startMin === LONDON_SEND_WINDOW.startMin && wa.endMin === LONDON_SEND_WINDOW.endMin, 'WhatsApp UK = the queue window (07:00-21:30 London)');
  const sms = replyWindowFor('sms', UK);
  ok(sms.tz === 'Europe/London' && sms.startMin === 9 * 60 && sms.endMin === 20 * 60, 'SMS UK = the SMS queue window (09:00-20:00 London)');
  const my = replyWindowFor('whatsapp', MY, { countrySettings: DEFAULT_COUNTRY_SETTINGS });
  ok(my.tz === 'Asia/Kuala_Lumpur' && my.startMin === 540, 'a Malaysian mobile keeps its own country hours and zone');
  const set = replyWindowFor('whatsapp', UK, { replyHours: { startMin: 9 * 60, endMin: 18 * 60 } });
  ok(set.startMin === 540 && set.endMin === 1080 && set.tz === 'Europe/London', 'the one reply-hours setting overrides, read in the market zone');
  const setSms = replyWindowFor('sms', UK, { replyHours: { startMin: 9 * 60, endMin: 18 * 60 } });
  ok(setSms.endMin === 1080, 'the same setting applies to texts');
  ok(replyHoursFrom(null) === null && replyHoursFrom({ reply_start_min: 600, reply_end_min: null }) === null
    && replyHoursFrom({ reply_start_min: 900, reply_end_min: 600 }) === null && replyHoursFrom({ reply_start_min: 'x', reply_end_min: 5 }) === null,
    'absent, half-set or nonsense hours = not set (the outreach hours) — never "always open"');
  ok(replyHoursFrom({ reply_start_min: 540, reply_end_min: 1080 })?.startMin === 540, 'a valid setting reads');
}

/* ── 2. open / next opening / words, DST-correct ── */
{
  const w = replyWindowFor('whatsapp', UK);
  ok(!replyWindowOpen(w, at('2026-10-21T20:40:00Z')), '21:40 BST is outside 07:00-21:30');
  ok(replyWindowOpen(w, at('2026-10-21T09:15:00Z')), '10:15 BST is inside');
  ok(nextWindowOpenAt(w, at('2026-10-21T20:40:30Z')).toISOString() === '2026-10-22T06:00:00.000Z', 'at 21:40 BST the next opening is 07:00 BST tomorrow');
  ok(nextWindowOpenAt(w, at('2026-10-21T04:00:00Z')).toISOString() === '2026-10-21T06:00:00.000Z', 'at 05:00 BST the next opening is 07:00 today');
  ok(nextWindowOpenAt(w, at('2026-10-24T21:00:00Z')).toISOString() === '2026-10-25T07:00:00.000Z', 'across the October clock change: 07:00 GMT');
  ok(nextWindowOpenAt(w, at('2027-03-27T22:00:00Z')).toISOString() === '2027-03-28T06:00:00.000Z', 'across the March clock change: 07:00 BST');
  const now = at('2026-10-21T09:15:00Z');
  ok(nextWindowOpenAt(w, now) === now, 'inside the window the next opening is now');
  ok(windowStatusLine(w, at('2026-10-21T20:40:00Z')).text === 'Their time 21:40 · opens 07:00', 'header (closed): "Their time 21:40 · opens 07:00"');
  ok(windowStatusLine(w, at('2026-10-21T09:15:00Z')).text === 'Their time 10:15 · open until 21:30', 'header (open): "Their time 10:15 · open until 21:30"');
  ok(windowStatusLine(replyWindowFor('whatsapp', MY, { countrySettings: DEFAULT_COUNTRY_SETTINGS }), at('2026-10-21T13:40:00Z')).text === 'Their time 21:40 · opens 09:00', 'their time is THEIR zone (Kuala Lumpur)');
  ok(queuedLabel('2026-10-22T06:00:00.000Z', 'Europe/London') === 'Queued, sends at 07:00 their time', 'thread: "Queued, sends at 07:00 their time"');
  ok(sendVerb(false) === 'Queue' && sendVerb(true) === 'Send', 'the send button says Queue outside the window');
}

/* ── 3. at Send: send / queue / refuse because the 24 hours run out first ── */
{
  const w = replyWindowFor('whatsapp', UK);
  const night = at('2026-10-21T21:00:00Z'); // 22:00 BST; opens 06:00Z tomorrow (8 h)
  ok(queueDecision({ channel: 'whatsapp', kind: 'text', window: w, now: at('2026-10-21T09:00:00Z'), lastInboundAt: '2026-10-21T08:00:00Z' }).kind === 'send_now', 'inside the hours: sends as today');
  const q = queueDecision({ channel: 'whatsapp', kind: 'text', window: w, now: night, lastInboundAt: '2026-10-21T20:00:00Z' });
  ok(q.kind === 'queue' && q.sendAt === '2026-10-22T06:00:00.000Z' && q.tz === 'Europe/London', 'outside the hours, 24 h still open at 07:00: queued for 07:00');
  const r = queueDecision({ channel: 'whatsapp', kind: 'text', window: w, now: night, lastInboundAt: '2026-10-21T05:00:00Z' });
  ok(r.kind === 'refuse' && r.error === 'service_window_closes_first' && r.detail.startsWith(HOLD_LABELS.window_expired), 'free text whose 24 h end before 07:00 is refused: "24h window expired, use a template"');
  ok(queueDecision({ channel: 'whatsapp', kind: 'voice', window: w, now: night, lastInboundAt: null }).kind === 'refuse', 'a voice note with no inbound is refused (free-form needs the 24 h)');
  ok(queueDecision({ channel: 'whatsapp', kind: 'template', window: w, now: night, lastInboundAt: null }).kind === 'queue', 'a template needs no 24 h: queued');
  ok(queueDecision({ channel: 'sms', kind: 'text', window: replyWindowFor('sms', UK), now: night, lastInboundAt: null }).kind === 'queue', 'a text has no 24 h: queued');
}

/* ── 4. at send time: the order of the checks ── */
{
  const base: DrainFacts = {
    channel: 'whatsapp', kind: 'text', window: replyWindowFor('whatsapp', UK), now: at('2026-10-22T06:00:30Z'),
    suppression: 'none', leadArchived: false, leadStatus: 'replied', newestInboundAt: '2026-10-21T20:00:00Z',
    checkedAt: '2026-10-21T21:00:00Z', lastWhatsappInboundAt: '2026-10-21T20:00:00Z', earlierPending: false,
  };
  ok(drainDecision(base).kind === 'send', 'all clear inside the window: send');
  ok(JSON.stringify(drainDecision({ ...base, suppression: 'opted_out', newestInboundAt: '2026-10-22T05:00:00Z' })) === '{"kind":"cancel","reason":"opted_out"}', 'an opt-out cancels (and beats a newer reply)');
  ok(drainDecision({ ...base, suppression: 'wrong_number' }).kind === 'cancel', 'a wrong number cancels');
  ok(drainDecision({ ...base, suppression: 'other' }).kind === 'cancel', 'any other suppression (a decline, archived) cancels');
  ok(drainDecision({ ...base, leadArchived: true }).kind === 'cancel', 'an archived lead cancels');
  ok(drainDecision({ ...base, leadStatus: 'not_interested' }).kind === 'cancel', 'a stopped lead (not interested) cancels');
  ok(JSON.stringify(drainDecision({ ...base, suppression: 'unknown' })) === '{"kind":"wait","why":"suppression_unreadable"}', 'an unreadable suppression check waits — never sends');
  ok(JSON.stringify(drainDecision({ ...base, newestInboundAt: '2026-10-21T23:00:00Z' })) === '{"kind":"hold","reason":"replied_since"}', 'they wrote again after it was queued: held, Needs you');
  ok(drainDecision({ ...base, newestInboundAt: '2026-10-21T23:00:00Z', checkedAt: '2026-10-22T00:00:00Z' }).kind === 'send', 'after "Checked — send it" (or an edit) the newer reply has been seen: sends');
  ok(JSON.stringify(drainDecision({ ...base, lastWhatsappInboundAt: '2026-10-21T05:00:00Z', newestInboundAt: '2026-10-21T05:00:00Z' })) === '{"kind":"hold","reason":"window_expired"}', 'the 24 h ran out: held, "24h window expired, use a template"');
  ok(drainDecision({ ...base, kind: 'template', lastWhatsappInboundAt: null, newestInboundAt: null }).kind === 'send', 'a template needs no 24 h');
  ok(drainDecision({ ...base, channel: 'sms', window: replyWindowFor('sms', UK), now: at('2026-10-22T08:00:30Z'), lastWhatsappInboundAt: null }).kind === 'send', 'a text needs no 24 h');
  ok(JSON.stringify(drainDecision({ ...base, earlierPending: true })) === '{"kind":"wait","why":"earlier_pending"}', 'an earlier unsent message in the conversation goes first');
  ok(JSON.stringify(drainDecision({ ...base, now: at('2026-10-22T05:00:00Z') })) === '{"kind":"wait","why":"window_closed"}', 'still before the hours: waits');
  ok(scheduledLine({ status: 'held', hold_reason: 'replied_since', send_at: '', tz: 'Europe/London', cancel_reason: null, error: null }) === 'Held — They replied since, check before sending', 'the held line says why');
  ok(scheduledEditable({ status: 'scheduled', kind: 'text' }) && !scheduledEditable({ status: 'scheduled', kind: 'template' }) && !scheduledEditable({ status: 'sent', kind: 'text' }), 'only waiting free text is editable');
  ok(scheduledReleasable({ status: 'held', hold_reason: 'replied_since' }) && !scheduledReleasable({ status: 'held', hold_reason: 'window_expired' }), 'a 24 h hold cannot be released — only cancelled (use a template)');
}

/* ── 5. the drain with fakes: order, claims, pacing, failures ── */
async function drain(rows: DueRow[], opts: Partial<{ suppression: Record<string, DrainFacts['suppression']>; claimLose: Set<string>; throwOn: Set<string>; inbound: Record<string, string>; now: string; earlier: Set<string>; result: Record<string, SendOutcome> }> = {}) {
  const log: string[] = [];
  let slept = 0;
  const deps: DrainDeps = {
    now: () => at(opts.now ?? '2026-10-22T06:01:00Z'),
    replyHours: null, countrySettings: null,
    closeStuckSending: async () => 0,
    dueRows: async (_n, limit) => rows.slice(0, limit),
    suppression: async (r) => opts.suppression?.[r.id] ?? 'none',
    lead: async () => ({ is_archived: false, status: 'replied' }),
    newestInbound: async (r) => ({ any: opts.inbound?.[r.id] ?? '2026-10-21T20:00:00Z', whatsapp: '2026-10-21T20:00:00Z' }),
    earlierPending: async (r) => opts.earlier?.has(r.id) ?? false,
    reschedule: async (id, iso) => { log.push(`reschedule ${id} ${iso}`); },
    hold: async (id, reason) => { log.push(`hold ${id} ${reason}`); },
    cancel: async (id, reason) => { log.push(`cancel ${id} ${reason}`); },
    claim: async (id) => { log.push(`claim ${id}`); return !opts.claimLose?.has(id); },
    send: async (r) => { if (opts.throwOn?.has(r.id)) throw new Error('boom'); log.push(`send ${r.id}`); return opts.result?.[r.id] ?? { ok: true, messageId: `m-${r.id}` }; },
    finish: async (id, o) => { log.push(`finish ${id} ${o.ok ? 'sent' : 'failed'}`); },
    sleep: async () => { slept++; },
  };
  const report = await drainTick(deps);
  return { log, slept, report };
}
const row = (id: string, extra: Partial<DueRow> = {}): DueRow => ({
  id, user_id: 'book', lead_id: `lead-${id}`, phone: UK, channel: 'whatsapp', kind: 'text',
  send_at: '2026-10-22T06:00:00Z', created_at: '2026-10-21T21:00:00Z', checked_at: '2026-10-21T21:00:00Z', ...extra,
});
{
  const a = await drain([row('a'), row('b'), row('c')]);
  ok(a.log.join('|') === 'claim a|send a|finish a sent|claim b|send b|finish b sent|claim c|send c|finish c sent', 'due rows go oldest first, each claimed before it is sent');
  ok(a.slept === 2 && a.report.sent === 3, 'paced: a pause between sends, none before the first');
  const b = await drain([row('a'), row('b')], { suppression: { a: 'opted_out' }, inbound: { b: '2026-10-21T23:30:00Z' } });
  ok(b.log.join('|') === 'cancel a opted_out|hold b replied_since', 'an opt-out is cancelled and a newer reply is held — neither is claimed or sent');
  const c = await drain([row('a')], { claimLose: new Set(['a']) });
  ok(c.log.join('|') === 'claim a', 'a claim another tick won is never sent');
  const d = await drain([row('a')], { throwOn: new Set(['a']) });
  ok(d.log.join('|') === 'claim a|finish a failed' && d.report.failed === 1, 'a send that throws is recorded failed — never retried');
  const e = await drain([row('a')], { now: '2026-10-22T05:00:00Z' });
  ok(e.log.join('|') === 'reschedule a 2026-10-22T06:00:00.000Z', 'before the hours (e.g. the setting changed) it is parked at the next opening, not sent');
  const many = await drain(Array.from({ length: MAX_SENDS_PER_TICK + 5 }, (_, i) => row(`r${String(i).padStart(2, '0')}`)));
  ok(many.report.sent === MAX_SENDS_PER_TICK, `at most ${MAX_SENDS_PER_TICK} sends a tick`);
  const g = await drain([row('a'), row('b')], { earlier: new Set(['b']) });
  ok(g.log.join('|') === 'claim a|send a|finish a sent', 'a later row in a conversation waits behind an earlier unsent one');
  const h = await drain([row('a')], { result: { a: { ok: false, error: 'They have asked not to be contacted.' } } });
  ok(h.log.join('|') === 'claim a|send a|finish a failed', "a sender's refusal is recorded failed with its words");
}
{
  ok(senderOutcome({ ok: true }, 'm1').ok === true, 'sender ok → sent');
  const s = senderOutcome({ ok: true, scheduled: { id: 'x' } }, null);
  ok(!s.ok, 'a "scheduled" answer at send time is NOT a send (the hours closed again)');
  const r = senderOutcome({ ok: false, error: 'opted_out', reason: 'They asked to stop.' }, null);
  ok(!r.ok && (r as { error: string }).error === 'They asked to stop.', "a refusal keeps the sender's own words");
  ok(!senderOutcome(null, null).ok, 'no answer → failed (check the conversation)');
  /* 2026-10-22: the gateway's own refusal carried only "message", and the row read "The send was refused." with no reason. */
  const gw = senderOutcome({ message: 'Invalid API key', hint: 'Double check your API key.' }, undefined, 401);
  ok(!gw.ok && (gw as { error: string }).error === 'Refused: Invalid API key (HTTP 401)', `the platform's own refusal is shown (got "${(gw as { error: string }).error}")`);
  const code = senderOutcome({ ok: false, error: 'pitch_already_sent' }, null, 200);
  ok(!code.ok && /pitch_already_sent/.test((code as { error: string }).error), 'a bare refusal code is shown, never "The send was refused"');
  const bare = senderOutcome({ ok: false }, null, 500);
  ok(!bare.ok && /HTTP 500/.test((bare as { error: string }).error), 'nothing readable: the HTTP status is shown');
  ok(!/The send was refused/.test(read('supabase/functions/_shared/inbox-scheduled-drain.ts')), 'the reasonless "The send was refused." is gone');
  const SEND_FN = read('supabase/functions/inbox-scheduled-send/index.ts');
  const waCall = SEND_FN.slice(SEND_FN.indexOf('functions/v1/send-whatsapp-message'), SEND_FN.indexOf('return senderOutcome(body, msg?.id'));
  ok(waCall.length > 0 && !/Authorization|apikey/.test(waCall) && /x-cron-secret/.test(waCall), 'the drain calls the WhatsApp sender by its cron door only (a service-key bearer is refused by the gateway)');
}

/* ── 6. the voice note: outside the hours it is queued before any claim or Meta call ── */
{
  const calls: string[] = [];
  const ogg = (() => { const p = path.join(ROOT, 'scripts/fixtures/chrome-mediarecorder-fake-mic-3s.webm'); return fs.existsSync(p) ? new Uint8Array(fs.readFileSync(p)) : null; })();
  if (ogg) {
    const deps: VoiceSendDeps = {
      now: () => Date.parse('2026-10-21T21:00:00Z'), live: true, testMode: false,
      normalise: (raw) => raw.replace(/\D/g, '') || null,
      getLead: async () => ({ id: 'L1', user_id: 'book', phone: UK, country: 'UK', is_archived: false }),
      lastInboundAt: async () => '2026-10-21T20:00:00Z',
      claimStorage: async () => { calls.push('claim'); return { ok: true }; },
      releaseStorage: async () => { calls.push('release'); },
      uploadMedia: async () => { calls.push('upload'); return { ok: true, mediaId: 'x' }; },
      sendAudio: async () => { calls.push('send'); return { ok: true, messageId: 'w' }; },
      insertMessage: async () => { calls.push('insert'); return null; },
      insertSendLog: async () => { calls.push('log'); },
      markAnswered: async () => { calls.push('answered'); },
      queueOutsideWindow: async () => { calls.push('queued'); return { status: 200, body: { ok: true, status: 'scheduled', scheduled: { id: 's1' } } }; },
    };
    const r = await sendVoiceNote({ operatorId: 'book', leadId: 'L1', phone: UK, sendId: '11111111-2222-3333-4444-555555555555', audio: ogg, declaredBytes: ogg.length }, deps);
    ok((r.body as { status?: string }).status === 'scheduled' && calls.join('|') === 'queued', 'a voice note outside the hours is queued — no claim, no upload, no send, no row');
  } else ok(false, 'voice fixture missing');
}

/* ── 7. sweeps: every Inbox send path, the one door, no second copy of the hours ── */
{
  const inbox = read('src/pages/Inbox.tsx');
  const useInbox = read('src/hooks/useInbox.ts');
  ok(/sendWhatsAppRequest\(sb, \{ \.\.\.args, via: 'inbox' \}\)/.test(useInbox), 'useInbox WhatsApp send passes via:"inbox" (typed reply, Quick reply, template, AI draft, bulk)');
  ok(/sendSms\(\{ leadId: args\.leadId, key: newSendKey\(\)/.test(useInbox), 'useInbox texts go through the text sender (which queues every person-pressed text)');
  ok(!/functions\.invoke\('send-whatsapp-message'/.test(inbox.replace(/template_name: templateName, via: 'inbox'/, '')) || /template_name: templateName, via: 'inbox'/.test(inbox), 'the follow-up buttons (sendNamed) pass via:"inbox"');
  const directSends = inbox.match(/functions\.invoke\('send-whatsapp-message'[^)]*\)/g) ?? [];
  ok(directSends.every((c) => c.includes("via: 'inbox'") || c.includes("mode: 'dry_run'") || c.includes('dry_run')), 'no direct WhatsApp send from the Inbox page without via:"inbox"');
  ok(/if \(res\.ok && res\.scheduled\) \{[\s\S]{0,400}action: 'discard'/.test(inbox), 'an approved AI draft that was queued is closed (discarded) so it cannot be sent twice');
  ok(/!sms && active\.leadId && replyOpen && \(/.test(inbox), 'the file button is not offered outside the hours');
  ok(/queueHint=\{queueHint\}/.test(inbox) && /sendVerb=\{sendVerb\(replyOpen\)\}/.test(inbox) && /\{sendVerb\(replyOpen\)\} template/.test(inbox), 'composer, voice note and template buttons say Queue outside the hours');
  ok(/ReplyWindowChip/.test(inbox) && /ScheduledSendBubble/.test(inbox), 'the header shows their time and the thread shows queued messages');
  ok(/needsYouFor\(c\.phone\)/.test(inbox), 'a held queued message is a Needs you');

  const swm = read('supabase/functions/send-whatsapp-message/index.ts');
  const gateAt = swm.indexOf('const gate = await queueGate(');
  ok(gateAt > swm.indexOf('payload = textPayload(text);') && gateAt < swm.indexOf('if (dryRun) {') && gateAt < swm.indexOf('const r = await sendViaGraph(env.accessToken, env.phoneNumberId, to, payload);\n      if (r.ok) { status = "sent"'), 'send-whatsapp-message queues after every guard and the payload build, before the dry-run return and the Graph POST');
  ok(/const viaInbox = !sched && keepsSendHours\(body\.via\);/.test(swm), 'the listed screens queue; the drain request never re-queues');
  ok(/if \(sched && !\(await replyWindowOpenNow\(service, "whatsapp", to, new Date\(\), \{ leadId: sched\.row\.lead_id, leadTz: sched\.row\.tz \}\)\)\) return/.test(swm), "the drain's own send still needs the hours open NOW (no door around them)");
  const sch = read('supabase/functions/_shared/inbox-schedule.ts');
  ok(/if \(!isInternalCall\(req\)\) return \{ ok: false, error: "forbidden" \}/.test(sch) && /row\.status !== "sending"/.test(sch) && /from\("user_roles"\)/.test(sch), "the drain's door: CRON_SECRET + a CLAIMED row + the queuer's role re-read");
  const voice = read('supabase/functions/send-whatsapp-voice/index.ts');
  ok(/async queueOutsideWindow\(/.test(voice) && /kind: "voice"/.test(voice), 'the voice sender always wires the queue step');
  ok(/status !== "scheduled" && qaLeadId/.test(voice), 'a queued QA voice note does not move the lead');
  const media = read('supabase/functions/send-whatsapp-media/index.ts');
  ok(/error: "outside_reply_window"/.test(media), 'a file outside the hours is refused by the server');
  const smsSend = read('supabase/functions/twilio-sms-send/index.ts');
  ok(/queueOutsideWindow: \(\{ digits, body: words, bookUserId, leadId: id \}\) => queueGate\(/.test(smsSend) && !/body\.via/.test(smsSend), 'EVERY person-pressed text outside the hours is queued — no flag can skip it');
  const twilio = read('supabase/functions/_shared/twilio-sms.ts');
  ok(twilio.indexOf('// 6b. the lead') > twilio.indexOf('// 6. QA safety') && twilio.indexOf('// 6b. the lead') < twilio.indexOf('// 7. abuse guard'), 'the text sender queues after every check, before the usage guard and the row');

  /* the Outreach WhatsApp popup and the lead's text panel (Paul, 2026-10-21) */
  const waPanel = read('src/components/LeadWhatsAppPanel.tsx');
  const waSends = waPanel.match(/sendWhatsAppRequest\(sb, \{[^}]*\}\)/g) ?? [];
  ok(waSends.length === 2 && waSends.every((c) => c.includes("via: 'lead_panel'")), 'every send in the Outreach WhatsApp popup passes via:"lead_panel"');
  ok(/<LeadQueuedSends hours=\{hours\}/.test(waPanel) && /sendVerb\(hours\.open\)/.test(waPanel) && /r\.scheduled/.test(waPanel), 'the popup shows their time, Queue and its queued messages');
  const smsPanel = read('src/components/LeadSmsPanel.tsx');
  ok(/<LeadQueuedSends hours=\{hours\}/.test(smsPanel) && /sendVerb\(hours\.open\)/.test(smsPanel) && /queued = \(r as/.test(smsPanel), 'the text panel shows their time, Queue and its queued messages');
  ok(keepsSendHours('inbox') && keepsSendHours('lead_panel') && !keepsSendHours(undefined) && !keepsSendHours('quick_close'), 'the WhatsApp screens that keep the hours: Inbox + the lead popup, a positive list');
  ok(bulkSummaryText({ sent: 3, queued: 2, failed: 1 }) === 'Sent 3, queued 2 for their send hours, 1 failed', 'bulk summary: queued is never counted as sent');
  ok(bulkSummaryText({ sent: 0, queued: 4, failed: 0 }) === 'Queued 4 for their send hours', 'bulk summary: all queued');
  ok(bulkSummaryText({ sent: 5, queued: 0, failed: 0 }) === 'Sent 5', 'bulk summary: all sent (unchanged wording)');
  ok(/if \(res\.ok && res\.scheduled\) queued\+\+;/.test(inbox) && /data-testid="bulk-summary">\{bulkSummaryText/.test(inbox), 'the Inbox batch counts queued separately, banner and toast');
  const drainFn = read('supabase/functions/inbox-scheduled-send/index.ts');
  ok(/if \(!isInternalCall\(req\)\) return json\(\{ ok: false, error: "forbidden" \}, 403\)/.test(drainFn), 'the drain answers only the cron');
  ok(!/whatsapp_queue_state|sms_queue_state|status", "queued"|\.eq\("status", "queued"\)/.test(drainFn), 'the drain never reads or touches the paused drip queue');
  ok(/sendId: row\.id/.test(drainFn), 'a voice note sends under its row id (a second attempt is a duplicate, never a second note)');
  ok(/\[functions\.inbox-scheduled-send\]\nverify_jwt = false/.test(read('supabase/config.toml')), 'config.toml lists the drain (verify_jwt false)');

  const mig = read('supabase/migrations/20261114090000_inbox_scheduled_sends.sql');
  ok(/enable row level security/.test(mig) && !/create policy/i.test(mig) && /revoke all on public\.inbox_scheduled_sends from anon, authenticated/.test(mig), 'the table is service-role only (RLS on, no policies, no grants)');
  ok(/after insert or update on public\.contact_suppressions/.test(mig), 'any suppression (opt-out, angry, STOP, wrong number) cancels waiting rows');
  ok(/public\.my_role\(\) is distinct from 'admin'/.test(mig), 'only the admin changes the reply hours');
  ok(!/whatsapp_queue_state/.test(mig.replace(/WhatsApp drip \(outreach_leads\.status = 'queued', whatsapp_queue_state\)/, '')), 'the migration does not touch the drip queue state');

  // one copy of the hours: no other file writes 21 * 60 + 30 for the Inbox
  const leaf = read('src/lib/inboxSendWindow.ts');
  ok(!/21 \* 60|07:00|21:30/.test(leaf.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'the Inbox leaf holds no hours of its own — it reads the outreach windows');
}

console.log(`\n${f === 0 ? 'ALL PASS' : `${f} FAILED`}`);
if (f) process.exit(1);
