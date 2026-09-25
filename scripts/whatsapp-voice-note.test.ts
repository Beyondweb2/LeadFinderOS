/* ============================================================
   OUTGOING WHATSAPP VOICE NOTES.

   ⛔ THE FAILURES THIS SUITE EXISTS FOR:
     · a voice note sent outside the 24-hour window, or to the wrong person;
     · the same recording sent twice (double-click, retry);
     · a failure that shows as "sent", or a failure that throws the recording away;
     · a file that arrives as an audio ATTACHMENT instead of a voice note — i.e. a WebM renamed .ogg,
       a stereo file, or a payload without `voice: true`.

   The remux is tested against a REAL Chrome MediaRecorder recording
   (scripts/fixtures/chrome-mediarecorder-fake-mic-3s.webm — Chromium 151's synthetic fake-mic tone,
   recorded 2026-09-25 through the same mono pipeline the Inbox uses; decoded back by Chromium after
   the remux to 3.0 s mono with the identical peak level).
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import {
  toVoiceNoteOgg, webmOpusToOgg, inspectOggOpus, writeOggOpus, opusPacketSamples, oggCrc,
} from '../src/lib/oggOpus.ts';
import {
  pickRecorderMimeType, formatVoiceDuration, micErrorNotice, isVoiceSendId, voiceNoteObjectPath,
  voiceSendErrorMessage, VOICE_NOTE_MAX_SECONDS, VOICE_NOTE_MAX_UPLOAD_BYTES, WHATSAPP_AUDIO_MAX_BYTES,
  VOICE_NOTE_MAX_RECORDING_BYTES,
} from '../src/lib/voiceNote.ts';
import { voiceReducer, VOICE_IDLE, voiceTakesComposer, type VoiceClip, type VoiceState } from '../src/lib/voiceRecorderState.ts';
import { sendVoiceNote, voiceNotePayload, type VoiceSendDeps, type VoiceSendInput } from '../supabase/functions/_shared/voice-note-send.ts';
import { WHATSAPP_SERVICE_WINDOW_MS } from '../src/lib/serviceWindow.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

/* ── a tiny WebM writer, for shapes the real fixture does not cover ── */
const vintSize = (n: number): number[] => {
  for (let len = 1; len <= 8; len++) if (n < Math.pow(2, 7 * len) - 1) {
    const out: number[] = []; let v = n;
    for (let i = len - 1; i >= 0; i--) { out[i] = v & 0xff; v = Math.floor(v / 256); }
    out[0] |= 1 << (8 - len);
    return out;
  }
  throw new Error('too big');
};
const idBytes = (id: number): number[] => { const o: number[] = []; let v = id; while (v > 0) { o.unshift(v & 0xff); v = Math.floor(v / 256); } return o; };
const el = (id: number, data: number[]): number[] => [...idBytes(id), ...vintSize(data.length), ...data];
const elUnknown = (id: number, data: number[]): number[] => [...idBytes(id), 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, ...data];
const str = (s: string) => [...s].map((c) => c.charCodeAt(0));
const opusHead = (channels: number) => [...str('OpusHead'), 1, channels, 0x38, 0x01, 0x80, 0xbb, 0, 0, 0, 0, 0];
/** A CELT 20 ms mono packet (config 31, code 0) = 960 samples. */
const pkt = (fill: number, len = 40) => [31 << 3, ...Array(len - 1).fill(fill)];
const simpleBlock = (frames: number[][], lacing: 0 | 1 | 2 | 3 = 0): number[] => {
  const head = [0x81, 0, 0, lacing << 1];
  if (lacing === 0) return el(0xa3, [...head, ...frames[0]]);
  const n = [frames.length - 1];
  if (lacing === 1) for (const fr of frames.slice(0, -1)) { let s = fr.length; while (s >= 255) { n.push(255); s -= 255; } n.push(s); }
  if (lacing === 3) {
    n.push(...vintSize(frames[0].length));
    for (let i = 1; i < frames.length - 1; i++) {
      const diff = frames[i].length - frames[i - 1].length; // 1-byte signed vint, bias 63
      n.push(0x80 | (diff + 63));
    }
  }
  return el(0xa3, [...head, ...n, ...frames.flat()]);
};
function webm(opts: { channels?: number; codec?: string; blocks: number[][]; codecPrivate?: boolean }): Uint8Array {
  const entry = [
    ...el(0xd7, [1]), ...el(0x83, [2]), ...el(0x86, str(opts.codec ?? 'A_OPUS')),
    ...(opts.codecPrivate === false ? [] : el(0x63a2, opusHead(opts.channels ?? 1))),
    ...el(0xe1, el(0x9f, [opts.channels ?? 1])),
  ];
  const segment = [...el(0x1654ae6b, el(0xae, entry)), ...elUnknown(0x1f43b675, [...el(0xe7, [0]), ...opts.blocks.flat()])];
  return new Uint8Array([...el(0x1a45dfa3, el(0x4282, str('webm'))), ...elUnknown(0x18538067, segment)]);
}

console.log('── THE REMUX: A REAL CHROME RECORDING BECOMES A REAL OGG/OPUS VOICE NOTE ──');
{
  const real = new Uint8Array(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/chrome-mediarecorder-fake-mic-3s.webm')));
  ok(real[0] === 0x1a && real[1] === 0x45 && real[2] === 0xdf && real[3] === 0xa3, 'the fixture really is WebM (EBML magic) — what Chrome/Edge record');
  const r = toVoiceNoteOgg(real);
  ok(r.ok, 'the real Chrome WebM converts');
  if (r.ok) {
    ok(r.container === 'webm', '  from the WebM container');
    ok(String.fromCharCode(...r.ogg.slice(0, 4)) === 'OggS', '  into an Ogg container (not a renamed WebM)');
    ok(r.channels === 1, '  mono — what Meta requires for a voice note');
    ok(Math.abs(r.durationMs - 3000) <= 60, `  3 s long, counted from the Opus packets (${r.durationMs} ms)`);
    ok(r.packets === 50, `  every Opus packet carried across (${r.packets})`);
    const head = r.ogg.slice(28, 36);
    ok(String.fromCharCode(...head) === 'OpusHead', '  the first page carries OpusHead (RFC 7845)');
    const again = inspectOggOpus(r.ogg);
    ok(again.ok && again.durationMs === r.durationMs, '  and our own validator accepts our own output');
  }
}

console.log('\n── A RENAME IS NOT A CONVERSION; ONLY OPUS, ONLY MONO ──');
{
  const stereo = webm({ channels: 2, blocks: [simpleBlock([pkt(1)])] });
  const s = toVoiceNoteOgg(stereo);
  ok(!s.ok && s.reason === 'not_mono', 'a stereo recording is refused (Meta renders voice notes from mono only)');
  const vorbis = webm({ codec: 'A_VORBIS', blocks: [simpleBlock([pkt(1)])] });
  const v = toVoiceNoteOgg(vorbis);
  ok(!v.ok && v.reason === 'not_opus', 'a non-Opus codec is refused');
  const aac = new Uint8Array([0, 0, 0, 0x20, ...str('ftypM4A '), ...Array(40).fill(0)]);
  const a = toVoiceNoteOgg(aac);
  ok(!a.ok && a.reason === 'unrecognised_container', 'an MP4/AAC recording (Safari) is refused — it would arrive as an attachment, not a voice note');
  ok(!toVoiceNoteOgg(new Uint8Array(0)).ok, 'an empty file is refused');
  ok(!toVoiceNoteOgg(new Uint8Array([1, 2, 3, 4, 5, 6])).ok, 'random bytes are refused');
  const noAudio = webm({ blocks: [] });
  const n = toVoiceNoteOgg(noAudio);
  ok(!n.ok && n.reason === 'no_audio', 'a WebM with no audio blocks is refused');
}

console.log('\n── THE WEBM SHAPES A BROWSER CAN PRODUCE ──');
{
  const frames = [pkt(1), pkt(2), pkt(3)];
  for (const [lacing, name] of [[1, 'Xiph'], [2, 'fixed-size'], [3, 'EBML']] as const) {
    const r = webmOpusToOgg(webm({ blocks: [simpleBlock(frames, lacing)] }));
    ok(r.ok && r.packets === 3, `${name} lacing: all three packets recovered`);
  }
  const unequal = [pkt(1, 40), pkt(2, 45), pkt(3, 30)];
  const e = webmOpusToOgg(webm({ blocks: [simpleBlock(unequal, 3)] }));
  ok(e.ok && e.packets === 3, 'EBML lacing with different packet sizes (signed size deltas)');
  const noPriv = webmOpusToOgg(webm({ codecPrivate: false, blocks: [simpleBlock([pkt(1)]), simpleBlock([pkt(2)])] }));
  ok(noPriv.ok && noPriv.channels === 1, 'no CodecPrivate: an OpusHead is synthesised from the track (mono)');
  const full = webm({ blocks: [simpleBlock([pkt(1)]), simpleBlock([pkt(2)]), simpleBlock([pkt(3)])] });
  const cut = webmOpusToOgg(full.slice(0, full.length - 10));
  ok(cut.ok && cut.packets === 2, 'a recording cut mid-block keeps the complete blocks and drops the partial one');
}

console.log('\n── OGG IN: VALIDATED AND PASSED THROUGH UNCHANGED (FIREFOX) ──');
{
  const head = new Uint8Array(opusHead(1));
  const packets = Array.from({ length: 120 }, (_, i) => new Uint8Array(pkt(i & 0xff)));
  const ogg = writeOggOpus(head, packets);
  const r = toVoiceNoteOgg(ogg);
  ok(r.ok && r.container === 'ogg' && r.ogg === ogg, 'a valid Ogg/Opus mono file passes through byte-identical');
  ok(r.ok && r.durationMs === Math.round(((120 * 960 - 312) / 48000) * 1000), `  its duration is the final granule minus pre-skip (${r.ok ? r.durationMs : '-'} ms)`);
  const corrupt = ogg.slice();
  corrupt[corrupt.length - 5] ^= 0xff;
  const c = toVoiceNoteOgg(corrupt);
  ok(!c.ok && c.reason === 'malformed', 'a flipped byte fails the page checksum and is refused');
  const stereoOgg = writeOggOpus(new Uint8Array(opusHead(2)), packets);
  const s = toVoiceNoteOgg(stereoOgg);
  ok(!s.ok && s.reason === 'not_mono', 'a stereo Ogg is refused');
  ok(oggCrc(new Uint8Array(str('123456789'))) === 0x89a1897f, 'the Ogg CRC matches CRC-32/POSIX without its final xor (check value 0x765e7680 ^ 0xffffffff)');
}

console.log('\n── OPUS PACKET LENGTHS, FROM THE TOC BYTE ──');
{
  ok(opusPacketSamples(new Uint8Array([31 << 3])) === 960, 'CELT 20 ms, one frame = 960 samples');
  ok(opusPacketSamples(new Uint8Array([(3 << 3) | 0])) === 2880, 'SILK 60 ms = 2880');
  ok(opusPacketSamples(new Uint8Array([(31 << 3) | 1])) === 1920, 'code 1: two frames');
  ok(opusPacketSamples(new Uint8Array([(31 << 3) | 3, 3])) === 2880, 'code 3: the frame count is in byte 2');
  ok(opusPacketSamples(new Uint8Array([])) === 0, 'an empty packet carries nothing');
}

console.log('\n── LIMITS AND WORDS ──');
{
  ok(VOICE_NOTE_MAX_SECONDS === 300, 'recording limit is 5 minutes');
  ok(VOICE_NOTE_MAX_RECORDING_BYTES < VOICE_NOTE_MAX_UPLOAD_BYTES && VOICE_NOTE_MAX_UPLOAD_BYTES < WHATSAPP_AUDIO_MAX_BYTES, 'recorder cap < upload cap < Meta\'s 16 MB audio cap');
  ok(WHATSAPP_AUDIO_MAX_BYTES === 16 * 1024 * 1024, 'Meta\'s audio cap is 16 MB (Cloud API media reference)');
  ok(pickRecorderMimeType((m) => m === 'audio/webm;codecs=opus') === 'audio/webm;codecs=opus', 'Chrome: WebM/Opus is picked');
  ok(pickRecorderMimeType(() => true) === 'audio/ogg;codecs=opus', 'Ogg/Opus is preferred when the browser has it (no conversion)');
  ok(pickRecorderMimeType((m) => m === 'audio/mp4') === null, 'an AAC-only browser gets NO format — refused up front, never sent as an attachment');
  ok(pickRecorderMimeType(undefined) === null, 'no MediaRecorder → unsupported');
  ok(formatVoiceDuration(8_400) === '0:08' && formatVoiceDuration(300_000) === '5:00', 'durations read m:ss');
  ok(/blocked/i.test(micErrorNotice({ name: 'NotAllowedError' })) && /LeadFinder/.test(micErrorNotice({ name: 'NotAllowedError' })), 'permission denied → "Microphone access is blocked…"');
  ok(/No microphone/i.test(micErrorNotice({ name: 'NotFoundError' })), 'no microphone → says so');
  ok(/another app/i.test(micErrorNotice({ name: 'NotReadableError' })), 'mic busy → says so');
  ok(isVoiceSendId('3f2b1c4d-1111-4222-8333-944455556666') && !isVoiceSendId('../../x') && !isVoiceSendId(''), 'send ids are UUIDs only (no path injection into storage)');
  ok(voiceNoteObjectPath('op-1', '3F2B1C4D-1111-4222-8333-944455556666') === 'op-1/voice-out-3f2b1c4d-1111-4222-8333-944455556666.ogg', 'the stored copy lives in the operator\'s own folder (the bucket\'s read policy)');
  ok(/24-hour/.test(voiceSendErrorMessage('window_closed')) && /template/i.test(voiceSendErrorMessage('window_closed')), 'window closed → "send an approved template instead"');
}

console.log('\n── THE RECORDER: NOTHING SENDS WITHOUT AN EXPLICIT SEND ──');
const clip: VoiceClip = { blob: new Blob(['x']), url: 'blob:x', mime: 'audio/webm', durationMs: 8000, sendId: '3f2b1c4d-1111-4222-8333-944455556666' };
{
  const run = (events: Parameters<typeof voiceReducer>[1][], from: VoiceState = VOICE_IDLE) => events.reduce(voiceReducer, from);
  const recorded = run([{ type: 'REQUEST' }, { type: 'GRANTED', at: 1 }, { type: 'RECORDED', clip }]);
  ok(recorded.kind === 'recorded', 'C. record → stop lands on a PREVIEW, not a send');
  ok(run([{ type: 'DELETE' }], recorded).kind === 'idle', 'C. preview → delete → back to the composer, nothing sent');
  ok(run([{ type: 'SEND' }], recorded).kind === 'sending', 'D. preview → send → sending');
  const sending = run([{ type: 'SEND' }], recorded);
  ok(run([{ type: 'SEND' }], sending) === sending, 'E. a second SEND while sending is ignored (double-click)');
  ok(run([{ type: 'DELETE' }], sending) === sending, '   and the recording cannot be deleted mid-send');
  ok(run([{ type: 'REQUEST' }], sending) === sending, '   and no new recording can start mid-send');
  const failed = run([{ type: 'SEND_FAILED', error: 'Meta said no', retryable: true }], sending);
  ok(failed.kind === 'recorded' && failed.clip === clip && failed.error === 'Meta said no', 'F/G. a failed send KEEPS the recording, with the error shown');
  ok(run([{ type: 'SEND' }], failed).kind === 'sending', '   and it can be retried (same clip, same send id)');
  const unknown = run([{ type: 'SEND_FAILED', error: 'unknown', retryable: false }], sending);
  ok(run([{ type: 'SEND' }], unknown) === unknown, '   but NOT when the server says the result is unknown (could double-send)');
  ok(run([{ type: 'SENT' }], sending).kind === 'idle', 'D. only a confirmed send clears it');
  ok(run([{ type: 'SENT' }], recorded) === recorded, '   a stray SENT outside sending changes nothing (never a false "sent")');
  ok(run([{ type: 'REQUEST' }, { type: 'FAILED', notice: 'blocked' }]).kind === 'idle', 'permission denied → back to idle with the notice, never stuck on Recording');
  ok(run([{ type: 'REQUEST' }, { type: 'GRANTED', at: 1 }, { type: 'CANCEL' }]).kind === 'idle', 'cancel while recording → idle, no clip');
  ok(run([{ type: 'REQUEST' }, { type: 'CANCEL' }, { type: 'GRANTED', at: 1 }]).kind === 'idle', 'a permission answer arriving after cancel does not start recording');
  ok(!voiceTakesComposer(VOICE_IDLE) && voiceTakesComposer(recorded) && voiceTakesComposer(sending), 'the text box is hidden only while recording / previewing / sending');
}

console.log('\n── THE SERVER: WINDOW, OWNERSHIP, ONE SEND, HONEST FAILURES ──');
const OP = '9d5a7629-0000-4000-8000-000000000001';
const LEAD = { id: 'lead-1', user_id: OP, phone: '07700 900123', country: 'UK', is_archived: false };
const NOW = Date.parse('2026-09-25T12:00:00Z');
const realWebm = new Uint8Array(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/chrome-mediarecorder-fake-mic-3s.webm')));
function harness(over: Partial<{ lastInboundAt: string | null; lead: typeof LEAD | null; live: boolean; upload: 'ok' | 'fail'; send: 'ok' | 'refused' | 'unknown' }> = {}) {
  const log = { claims: [] as string[], released: [] as string[], uploads: 0, sends: [] as Array<{ to: string; payload: Record<string, unknown> }>, messages: [] as Record<string, unknown>[], sendLogs: [] as Record<string, unknown>[], answered: [] as string[], windowReads: 0, getLead: 0 };
  const stored = new Set<string>();
  const cfg = { lastInboundAt: new Date(NOW - 60 * 60 * 1000).toISOString(), lead: LEAD as typeof LEAD | null, live: true, upload: 'ok' as const, send: 'ok' as const, ...over };
  const deps: VoiceSendDeps = {
    now: () => NOW, live: cfg.live, testMode: !cfg.live,
    normalise: (raw) => { const d = raw.replace(/\D/g, ''); return d.startsWith('07') ? '44' + d.slice(1) : d || null; },
    getLead: async () => { log.getLead++; return cfg.lead; },
    lastInboundAt: async () => { log.windowReads++; return cfg.lastInboundAt; },
    claimStorage: async (p) => { if (stored.has(p)) return { ok: false, exists: true, error: 'The resource already exists' }; stored.add(p); log.claims.push(p); return { ok: true }; },
    releaseStorage: async (p) => { stored.delete(p); log.released.push(p); },
    uploadMedia: async () => { log.uploads++; return cfg.upload === 'ok' ? { ok: true, mediaId: 'media-1' } : { ok: false, error: '{"code":131053}' }; },
    sendAudio: async (to, payload) => { log.sends.push({ to, payload }); return cfg.send === 'ok' ? { ok: true, messageId: 'wamid.X' } : { ok: false, definitive: cfg.send === 'refused', error: cfg.send === 'refused' ? '{"code":131000}' : 'connection reset' }; },
    insertMessage: async (row) => { log.messages.push(row); return { id: `m${log.messages.length}`, ...row }; },
    insertSendLog: async (row) => { log.sendLogs.push(row); },
    markAnswered: async (id) => { log.answered.push(id); },
  };
  return { deps, log, cfg };
}
const input = (over: Partial<VoiceSendInput> = {}): VoiceSendInput => ({ operatorId: OP, leadId: 'lead-1', phone: '+44 7700 900123', sendId: clip.sendId, audio: realWebm, declaredBytes: realWebm.length, ...over });

await (async () => {
  {
    const { deps, log } = harness();
    const r = await sendVoiceNote(input(), deps);
    ok(r.body.ok === true && r.status === 200, 'A/D. window open → the note is sent');
    ok(log.sends.length === 1 && log.uploads === 1, 'D. exactly ONE media upload and ONE WhatsApp message');
    const p = log.sends[0]?.payload as { type?: string; audio?: { id?: string; voice?: boolean } };
    ok(p?.type === 'audio' && p.audio?.id === 'media-1' && p.audio?.voice === true, 'the payload is { type:"audio", audio:{ id, voice:true } } — a VOICE NOTE, not an attachment');
    ok(log.sends[0]?.to === '447700900123', 'the recipient is the LEAD\'s number, normalised');
    const m = log.messages[0] ?? {};
    ok(m.message_type === 'audio' && m.direction === 'outbound' && m.status === 'sent' && m.wa_message_id === 'wamid.X', 'the transcript row: outbound audio, sent, with the WhatsApp message id');
    ok(m.media_path === log.claims[0] && m.media_mime_type === 'audio/ogg', '  pointing at the ONE stored Ogg copy the Inbox plays back');
    ok(typeof m.body === 'string' && /Voice note \(0:0[23]\)/.test(m.body as string), `  with a readable body for the conversation list ("${m.body}")`);
    ok(log.sendLogs.length === 1 && log.sendLogs[0].delivery_status === 'sent', 'a whatsapp_sends row, like every other send (counts against the day)');
    ok(log.answered[0] === 'lead-1', 'a replied lead moves to "You replied", as a typed reply does');
    ok(r.body.ok === true && 'message' in r.body && (r.body.message as { id?: string })?.id === 'm1', 'the inserted row comes back so the Inbox shows it at once');
  }
  {
    const { deps, log } = harness({ lastInboundAt: new Date(NOW - WHATSAPP_SERVICE_WINDOW_MS - 1000).toISOString() });
    const r = await sendVoiceNote(input(), deps);
    ok(!r.body.ok && r.body.error === 'window_closed', 'B. window closed → refused');
    ok(log.claims.length === 0 && log.uploads === 0 && log.sends.length === 0 && log.messages.length === 0, 'B. …before ANY storage write, Meta upload, send or row');
  }
  {
    const { deps, log } = harness({ lastInboundAt: null });
    const r = await sendVoiceNote(input(), deps);
    ok(!r.body.ok && r.body.error === 'window_closed' && log.sends.length === 0, 'B. never replied (no inbound at all) → closed, not open');
  }
  {
    const { deps, log } = harness({ live: false, lastInboundAt: new Date(NOW - WHATSAPP_SERVICE_WINDOW_MS - 1000).toISOString() });
    const r = await sendVoiceNote(input(), deps);
    ok(!r.body.ok && r.body.error === 'window_closed' && log.claims.length === 0, 'B. test mode does NOT bypass the window (unlike the text path)');
  }
  {
    const { deps, log } = harness({ lead: { ...LEAD, user_id: 'someone-else' } });
    const r = await sendVoiceNote(input(), deps);
    ok(r.status === 403 && !r.body.ok && r.body.error === 'forbidden' && log.windowReads === 0 && log.sends.length === 0, 'another operator\'s lead → 403, nothing read or sent');
  }
  {
    const { deps, log } = harness({ lead: null });
    const r = await sendVoiceNote(input(), deps);
    ok(r.status === 403 && log.sends.length === 0, 'an unknown lead id → 403');
  }
  {
    const { deps, log } = harness({ lead: { ...LEAD, is_archived: true } });
    const r = await sendVoiceNote(input(), deps);
    ok(!r.body.ok && r.body.error === 'lead_archived' && log.sends.length === 0, 'an archived lead → refused');
  }
  {
    const { deps, log } = harness();
    const r = await sendVoiceNote(input({ phone: '+44 7999 111222' }), deps);
    ok(!r.body.ok && r.body.error === 'phone_mismatch' && log.sends.length === 0, 'a phone from the browser that is not the lead\'s → refused (the browser never picks the recipient)');
  }
  {
    const { deps, log } = harness();
    const r = await sendVoiceNote(input({ leadId: null }), deps);
    ok(!r.body.ok && r.body.error === 'lead_required' && log.getLead === 0, 'no lead → refused before any read');
  }
  {
    const { deps, log } = harness();
    const r = await sendVoiceNote(input({ declaredBytes: VOICE_NOTE_MAX_UPLOAD_BYTES + 1 }), deps);
    ok(r.status === 413 && log.getLead === 0, 'an oversized upload is refused before anything is read');
    const bad = await sendVoiceNote(input({ sendId: '../other-operator/x' }), deps);
    ok(bad.status === 400 && !bad.body.ok && bad.body.error === 'bad_send_id', 'a send id that is not a UUID is refused (no storage path injection)');
  }
  {
    const { deps, log } = harness();
    const stereo = webm({ channels: 2, blocks: [simpleBlock([pkt(1)])] });
    const r = await sendVoiceNote(input({ audio: stereo, declaredBytes: stereo.length }), deps);
    ok(!r.body.ok && r.body.error === 'not_voice_format' && log.claims.length === 0 && log.uploads === 0, 'a stereo file is refused before storage or Meta');
    const tiny = webm({ blocks: [simpleBlock([pkt(1)])] });
    const t = await sendVoiceNote(input({ audio: tiny, declaredBytes: tiny.length }), deps);
    ok(!t.body.ok && t.body.error === 'too_short' && log.uploads === 0, 'a 20 ms blip is refused as too short');
  }
  {
    const { deps, log } = harness();
    const [a, b] = await Promise.all([sendVoiceNote(input(), deps), sendVoiceNote(input(), deps)]);
    const oks = [a, b].filter((x) => x.body.ok).length;
    ok(oks === 1 && log.sends.length === 1, 'E. two simultaneous sends of the same recording → exactly ONE WhatsApp message');
    ok([a, b].some((x) => !x.body.ok && x.body.error === 'duplicate_send'), '   the other is refused as duplicate_send');
    const later = await sendVoiceNote(input(), deps);
    ok(!later.body.ok && later.body.error === 'duplicate_send' && log.sends.length === 1, '   and so is a later retry of a recording that already went');
  }
  {
    const h = harness({ upload: 'fail' });
    const r = await sendVoiceNote(input(), h.deps);
    ok(!r.body.ok && r.body.error === 'meta_upload_failed' && r.body.retryable === true, 'F. Meta upload fails → not sent, retryable');
    ok(h.log.sends.length === 0 && h.log.messages.length === 0, 'F. …no message sent, no row claiming one');
    ok(h.log.released.length === 1 && h.log.released[0] === h.log.claims[0], 'F. …and the stored copy is removed (no orphan, the claim is free for a retry)');
    h.cfg.upload = 'ok';
    const retry = await sendVoiceNote(input(), { ...h.deps, uploadMedia: async () => { h.log.uploads++; return { ok: true, mediaId: 'media-2' }; } });
    ok(retry.body.ok === true && h.log.sends.length === 1, 'F. the SAME recording (same send id) retries and sends once');
  }
  {
    const { deps, log } = harness({ send: 'refused' });
    const r = await sendVoiceNote(input(), deps);
    ok(!r.body.ok && r.body.error === 'meta_send_failed' && r.body.retryable === true, 'G. Meta refuses the send → not ok, no "sent"');
    ok(log.messages.length === 1 && log.messages[0].status === 'failed' && log.messages[0].media_path === null, 'G. logged as a FAILED row with no playable media — the thread never shows a note that did not go');
    ok(log.sendLogs[0]?.delivery_status === 'failed', 'G. the send log says failed');
    ok(log.released.length === 1, 'G. the stored copy is removed; a retry is allowed');
    ok(log.answered.length === 0, 'G. the lead status is not moved by a failed send');
  }
  {
    const { deps, log } = harness({ send: 'unknown' });
    const r = await sendVoiceNote(input(), deps);
    ok(!r.body.ok && r.body.error === 'meta_send_unknown' && r.body.retryable === false, 'G. Meta did not answer → reported as UNKNOWN, not sent and not failed');
    ok(log.released.length === 0, 'G. …and the claim is KEPT, so a retry cannot deliver it twice');
    const retry = await sendVoiceNote(input(), deps);
    ok(!retry.body.ok && retry.body.error === 'duplicate_send' && log.sends.length === 1, 'G. a retry of that recording is refused');
  }
  {
    const { deps, log } = harness({ live: false });
    const r = await sendVoiceNote(input(), deps);
    ok(r.body.ok === true && 'simulated' in r.body && r.body.simulated === true && log.uploads === 0 && log.sends.length === 0, 'test mode → simulated, nothing reaches Meta');
    ok(log.messages[0]?.status === 'simulated' && !!log.messages[0]?.media_path, '  but the note is stored and logged so the Inbox can be exercised');
  }
  ok(JSON.stringify(voiceNotePayload('abc')) === '{"type":"audio","audio":{"id":"abc","voice":true}}', 'the payload builder, exactly');
})();

console.log('\n── WIRING: ONE WINDOW RULE, ONE RECIPIENT, THE INBOX ──');
{
  const mod = read('supabase/functions/_shared/voice-note-send.ts');
  const fn = read('supabase/functions/send-whatsapp-voice/index.ts');
  const inbox = read('src/pages/Inbox.tsx');
  const newFiles = [mod, fn, read('src/lib/voiceNote.ts'), read('src/lib/oggOpus.ts'), read('src/hooks/useVoiceRecorder.ts'), read('src/components/VoiceNoteRecorder.tsx')];
  ok(/import \{ serviceWindowState \} from "\.\.\/\.\.\/\.\.\/src\/lib\/serviceWindow\.ts"/.test(mod), 'the server window check uses the SHARED leaf');
  ok(newFiles.every((s) => !/24\s*\*\s*60\s*\*\s*60|86_?400_?000/.test(s)), 'no second 24-hour calculation anywhere in the voice-note code');
  ok(mod.indexOf('serviceWindowState(') < mod.indexOf('toVoiceNoteOgg(input') || mod.indexOf('serviceWindowState(') < mod.indexOf('toVoiceNoteOgg(audio'), 'the window is checked before the audio is converted');
  ok(mod.indexOf('serviceWindowState(') < mod.indexOf('deps.claimStorage(') && mod.indexOf('deps.claimStorage(') < mod.indexOf('deps.uploadMedia('), 'order: window → claim → Meta upload');
  ok(/resolveOperator\(req\)/.test(fn) && !/WHATSAPP_ACCESS_TOKEN/.test(read('src/hooks/useInbox.ts')), 'operator auth on the server; no Meta credential in the browser');
  ok(/\[functions\.send-whatsapp-voice\]\s*\nverify_jwt = true/.test(read('supabase/config.toml')), 'config.toml lists send-whatsapp-voice (explicit verify_jwt)');
  ok(!/upsert:\s*true/.test(fn) && /upsert: false/.test(fn), 'the storage write is upsert:false — it IS the double-send claim');
  const open = inbox.indexOf('{win.open ? (', inbox.indexOf('{/* Reply box */}'));
  const closed = inbox.indexOf('Outside the 24h window — free text', open);
  const rec = inbox.indexOf('<VoiceNoteRecorder');
  ok(open > 0 && rec > open && rec < closed, 'A/B. the mic is rendered ONLY in the open-window branch of the composer');
  ok(inbox.indexOf('<VoiceNoteRecorder', closed) === -1, 'B. …and nowhere in the closed-window branch');
  ok(/\{active\.leadId && \(\s*<VoiceNoteRecorder\s+key=\{active\.key\}/.test(inbox), 'H. keyed by conversation (a thread switch discards a recording) and only on a lead-linked thread');
  ok(/className=\{cn\('min-w-0 flex-1', voiceActive && active\.leadId && 'hidden'\)\}>\s*<InboxComposer/.test(inbox), 'I. the text composer is HIDDEN, not unmounted, while recording — its draft survives');
  ok(/\(m\.direction === 'inbound' \|\| m\.message_type === 'audio'\) && <InboundMedia message=\{m\} \/>/.test(inbox), 'J. audio renders for outbound as well as inbound, through the same signed-URL component');
  ok(/message\.message_type === 'audio'\) return <VoiceNotePlayer/.test(inbox), 'J. …with the one shared voice-note player (inbound audio no longer a bare native control)');
  ok(!/<audio src=\{url\} controls/.test(inbox), '   the old native <audio controls> is gone');
  const player = read('src/components/VoiceNotePlayer.tsx');
  ok(/aria-label=\{playing \? 'Pause voice note' : 'Play voice note'\}/.test(player), 'accessible play/pause label');
  const ui = read('src/components/VoiceNoteRecorder.tsx');
  for (const label of ['Record voice note', 'Stop recording', 'Cancel recording', 'Delete recording', 'Send voice note', 'Re-record voice note']) {
    ok(ui.includes(`aria-label="${label}"`) || ui.includes(`'${label}'`), `accessible label: ${label}`);
  }
  ok(/<span className="font-medium">Recording<\/span>/.test(ui), 'the recording state is said in words, not only a red dot');
}

console.log(`\n${f === 0 ? 'ALL PASS' : `${f} FAILED`}`);
if (f) process.exit(1);
