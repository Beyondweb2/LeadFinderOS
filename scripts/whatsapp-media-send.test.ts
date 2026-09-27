/* ════════════════════════════════════════════════════════════════════════════════════════════════
   OUTGOING WHATSAPP ATTACHMENTS (2026-09-27) — send-whatsapp-media, driven with fakes.

   Nothing here reaches Meta, Storage or the database: _shared/media-attachment-send.ts takes every
   side effect as a dependency, so each refusal and each failure is driven directly. The salesperson
   rules are the SAME leadAccess the voice note uses (canWorkLead + isClientLead); the handler is read
   to prove it calls it before anything else can happen.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { sendMediaAttachment, type MediaSendDeps, type MediaSendInput } from '../supabase/functions/_shared/media-attachment-send.ts';
import {
  ATTACHMENT_ACCEPT, ATTACHMENT_MAX_BYTES, ATTACHMENT_TYPES, attachmentPayload, bytesMatchType, classifyAttachment, cleanAttachmentFilename,
} from '../src/lib/mediaAttachment.ts';
import { canWorkLead, isClientLead } from '../src/lib/roleRules.ts';
import { WHATSAPP_SERVICE_WINDOW_MS } from '../src/lib/serviceWindow.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

const BOOK = '9d5a7629-0000-4000-8000-000000000000';
const NOW = Date.parse('2026-09-27T12:00:00Z');
const SEND_ID = '11111111-2222-4333-8444-555555555555';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

type Calls = { claims: string[]; releases: string[]; uploads: string[]; sends: Record<string, unknown>[]; messages: Record<string, unknown>[]; logs: Record<string, unknown>[]; answered: string[] };

function world(opts: {
  live?: boolean; lastInbound?: string | null | (() => string | null); lead?: Partial<{ user_id: string; phone: string | null; is_archived: boolean }> | null;
  claim?: 'ok' | 'exists' | 'error'; upload?: 'ok' | 'fail'; send?: 'ok' | 'refused' | 'unknown';
} = {}) {
  const calls: Calls = { claims: [], releases: [], uploads: [], sends: [], messages: [], logs: [], answered: [] };
  const deps: MediaSendDeps = {
    now: () => NOW,
    live: opts.live ?? true,
    testMode: !(opts.live ?? true),
    normalise: (raw) => { const d = String(raw).replace(/\D/g, ''); if (!d) return null; return d.startsWith('0') ? '44' + d.slice(1) : d; },
    async getLead(id) {
      if (opts.lead === null) return null;
      return { id, user_id: BOOK, phone: '07700 900101', country: 'GB', is_archived: false, ...(opts.lead ?? {}) } as never;
    },
    async lastInboundAt() {
      const v = opts.lastInbound;
      return typeof v === 'function' ? v() : v === undefined ? new Date(NOW - 60 * 60 * 1000).toISOString() : v;
    },
    async claimStorage(p) {
      calls.claims.push(p);
      if (opts.claim === 'exists') return { ok: false, exists: true, error: 'The resource already exists' };
      if (opts.claim === 'error') return { ok: false, exists: false, error: 'boom' };
      return { ok: true };
    },
    async releaseStorage(p) { calls.releases.push(p); },
    async uploadMedia(_b, mime) { calls.uploads.push(mime); return opts.upload === 'fail' ? { ok: false, error: 'bad media' } : { ok: true, mediaId: 'MEDIA123' }; },
    async sendMedia(_to, payload) {
      calls.sends.push(payload);
      if (opts.send === 'refused') return { ok: false, definitive: true, error: '(#131053) Media upload error' };
      if (opts.send === 'unknown') return { ok: false, definitive: false, error: 'network' };
      return { ok: true, messageId: 'wamid.X' };
    },
    async insertMessage(row) { calls.messages.push(row); return { id: 'm1', ...row }; },
    async insertSendLog(row) { calls.logs.push(row); },
    async markAnswered(id) { calls.answered.push(id); },
  };
  return { deps, calls };
}
const input = (over: Partial<MediaSendInput> = {}): MediaSendInput => ({
  operatorId: BOOK, leadId: 'lead-1', phone: '447700900101', sendId: SEND_ID, filename: 'photo.jpg', caption: '',
  bytes: JPEG, declaredBytes: JPEG.length, dryRun: false, ...over,
});

console.log('── 1–3: admin sends an image, a video and a document in an open window ──');
{
  const { deps, calls } = world();
  const r = await sendMediaAttachment(input({ caption: 'Here is the mock-up' }), deps);
  ok(r.body.ok === true && r.body.status === 'sent' && r.body.kind === 'image', '1. image sent');
  ok(JSON.stringify(calls.sends[0]) === JSON.stringify({ type: 'image', image: { id: 'MEDIA123', caption: 'Here is the mock-up' } }), '   Meta payload: { type:image, image:{ id, caption } }');
  ok(calls.uploads[0] === 'image/jpeg', '   uploaded as image/jpeg');
  ok(calls.claims[0] === `${BOOK}/media-out-${SEND_ID}.jpg`, '   one stored copy under the book owner, keyed by the send id');
  const m = calls.messages[0];
  ok(m.message_type === 'image' && m.media_path === calls.claims[0] && m.status === 'sent' && m.direction === 'outbound' && m.body === 'Here is the mock-up', '   thread row: outbound image with the stored copy, caption as body');
  ok(calls.logs.length === 1 && calls.logs[0].delivery_status === 'sent', '   one whatsapp_sends row');
  ok(calls.answered.length === 1, '   Replied → Awaiting reply, as any in-window reply');
}
{
  const { deps, calls } = world();
  const r = await sendMediaAttachment(input({ filename: 'walkthrough.mp4', bytes: MP4, declaredBytes: MP4.length }), deps);
  ok(r.body.ok === true && r.body.kind === 'video' && calls.uploads[0] === 'video/mp4', '2. video sent as video/mp4');
  ok(JSON.stringify(calls.sends[0]) === JSON.stringify({ type: 'video', video: { id: 'MEDIA123' } }), '   no caption key when there is no caption');
  ok(calls.messages[0].body === '[video]', '   body is the [video] placeholder, like an inbound attachment');
}
{
  const { deps, calls } = world();
  const r = await sendMediaAttachment(input({ filename: 'C:\\Users\\x\\Quote 2026.pdf', bytes: PDF, declaredBytes: PDF.length, caption: 'Your quote' }), deps);
  ok(r.body.ok === true && r.body.kind === 'document', '3. document sent');
  ok(JSON.stringify(calls.sends[0]) === JSON.stringify({ type: 'document', document: { id: 'MEDIA123', caption: 'Your quote', filename: 'Quote 2026.pdf' } }), '   carries the filename the recipient sees (no path)');
  ok(calls.messages[0].media_filename === 'Quote 2026.pdf' && calls.messages[0].media_mime_type === 'application/pdf', '   thread row keeps the name and type');
}
{
  const { deps } = world();
  const r = await sendMediaAttachment(input({ filename: 'logo.PNG', bytes: PNG, declaredBytes: PNG.length }), deps);
  ok(r.body.ok === true && r.body.kind === 'image', '   PNG (upper-case extension) sent as an image');
}

console.log('── 4–7: the salesperson rule (leadAccess = canWorkLead + not a client) ──');
const repA = { id: 'rep-a', role: 'sales' as const };
ok(canWorkLead(repA, { assigned_to_user_id: 'rep-a' }) && !isClientLead({ amount_paid: null, status: 'replied' }), '4. Sales may send on a lead assigned to them');
ok(!canWorkLead(repA, { assigned_to_user_id: BOOK }), "5. Sales may not send on Paul's lead");
ok(!canWorkLead(repA, { assigned_to_user_id: 'rep-b' }), "6. Sales A may not send on Sales B's lead");
ok(!canWorkLead(repA, { assigned_to_user_id: null }), '   nor on an unclaimed lead');
ok(isClientLead({ amount_paid: 99, status: 'payment_received' }), '7. a paid client is a client (leadAccess refuses it for sales even if assigned)');
{
  const fn = read('supabase/functions/send-whatsapp-media/index.ts');
  const gate = fn.indexOf('if (actor.role !== "admin")');
  const access = fn.indexOf('await leadAccess(service, actor, salesLeadId)');
  const send = fn.indexOf('await sendMediaAttachment(');
  ok(gate > 0 && access > gate && send > access, '   the handler checks sales access BEFORE the file is read or anything is stored');
  ok(/if \(!access\.ok\) return json\(\{ ok: false, error: access\.error === "lookup_failed" \? "upstream_timeout" : "forbidden" \}/.test(fn), '   a refused lead answers forbidden, nothing more');
  ok(fn.indexOf('await resolveActor(req, service)') > 0 && fn.indexOf('await resolveActor(req, service)') < gate, '   the caller must have a live role first (a disabled account has none)');
  ok(!/SUPABASE_SERVICE_ROLE_KEY[^\n]*json\(/.test(fn) && !/accessToken[^\n]*json\(/.test(fn), '   no key or token is ever put in a response');
  const cfg = read('supabase/config.toml');
  ok(/\[functions\.send-whatsapp-media\]\nverify_jwt = true/.test(cfg), '   listed in config.toml (verify_jwt = true)');
}
{
  const { deps, calls } = world({ lead: { user_id: 'someone-else' } });
  const r = await sendMediaAttachment(input(), deps);
  ok(r.body.ok === false && r.body.error === 'forbidden' && calls.claims.length === 0, '   a lead outside the book is refused before anything is stored');
}
{
  const { deps, calls } = world({ lead: { is_archived: true } });
  const r = await sendMediaAttachment(input(), deps);
  ok(r.body.ok === false && r.body.error === 'lead_archived' && calls.claims.length === 0, '   an archived lead is refused');
}
{
  const { deps, calls } = world();
  const r = await sendMediaAttachment(input({ phone: '447700900999' }), deps);
  ok(r.body.ok === false && r.body.error === 'phone_mismatch' && calls.sends.length === 0, '   the recipient is the lead\u2019s number — a different phone from the browser is refused');
}

console.log('── 8–9: the 24-hour window ──');
{
  const { deps, calls } = world({ lastInbound: new Date(NOW - WHATSAPP_SERVICE_WINDOW_MS - 1000).toISOString() });
  const r = await sendMediaAttachment(input(), deps);
  ok(r.body.ok === false && r.body.error === 'window_closed', '8. closed window refused');
  ok(calls.claims.length === 0 && calls.uploads.length === 0 && calls.sends.length === 0, '   nothing stored, uploaded or sent');
}
{
  const { deps } = world({ lastInbound: null });
  const r = await sendMediaAttachment(input(), deps);
  ok(r.body.ok === false && r.body.error === 'window_closed', '   no inbound at all = closed');
}
{
  /* The page loaded with the window open; by the time Send is pressed it has closed. The server reads
     the newest inbound AT SEND TIME and compares with its own clock. */
  const { deps, calls } = world({ lastInbound: () => new Date(NOW - WHATSAPP_SERVICE_WINDOW_MS - 5).toISOString() });
  const r = await sendMediaAttachment(input(), deps);
  ok(r.body.ok === false && r.body.error === 'window_closed' && calls.sends.length === 0, '9. a window that expired before Send is re-checked server-side and refused');
}

console.log('── 10: types, sizes, bytes ──');
for (const [name, bytes] of [['clip.mov', MP4], ['photo.heic', JPEG], ['sound.mp3', JPEG], ['sticker.webp', JPEG], ['run.exe', JPEG], ['noext', JPEG]] as const) {
  const { deps, calls } = world();
  const r = await sendMediaAttachment(input({ filename: name, bytes, declaredBytes: bytes.length }), deps);
  ok(r.body.ok === false && r.body.error === 'unsupported_type' && calls.claims.length === 0, `10. ${name} refused as unsupported`);
}
{
  const { deps, calls } = world();
  const r = await sendMediaAttachment(input({ filename: 'fake.jpg', bytes: PDF, declaredBytes: PDF.length }), deps);
  ok(r.body.ok === false && r.body.error === 'type_mismatch' && calls.claims.length === 0, '   a PDF renamed to .jpg is refused (bytes checked, not the name)');
}
{
  const { deps } = world();
  const r = await sendMediaAttachment(input({ declaredBytes: ATTACHMENT_MAX_BYTES.image + 1 }), deps);
  ok(r.body.ok === false && r.body.error === 'too_large' && r.status === 413, `   an image over ${ATTACHMENT_MAX_BYTES.image} bytes refused before reading`);
  const big = new Uint8Array(ATTACHMENT_MAX_BYTES.image + 1); big.set(JPEG);
  const r2 = await sendMediaAttachment(input({ bytes: big, declaredBytes: 10 }), deps);
  ok(r2.body.ok === false && r2.body.error === 'too_large', '   an under-declared file is refused on its REAL length');
}
{
  const { deps } = world();
  const r = await sendMediaAttachment(input({ caption: 'x'.repeat(1025) }), deps);
  ok(r.body.ok === false && r.body.error === 'caption_too_long', '   caption over 1,024 characters refused');
  const r2 = await sendMediaAttachment(input({ bytes: new Uint8Array(0), declaredBytes: 0 }), deps);
  ok(r2.body.ok === false && r2.body.error === 'empty', '   an empty file refused');
  const r3 = await sendMediaAttachment(input({ sendId: 'not-a-uuid' }), deps);
  ok(r3.body.ok === false && r3.body.error === 'bad_send_id', '   a malformed send id refused');
  const r4 = await sendMediaAttachment(input({ leadId: null }), deps);
  ok(r4.body.ok === false && r4.body.error === 'lead_required', '   no lead refused');
}
ok(ATTACHMENT_MAX_BYTES.image === 5 * 1024 * 1024 && ATTACHMENT_MAX_BYTES.video === 16 * 1024 * 1024, "   Meta's own limits for images (5 MB) and videos (16 MB)");
ok(ATTACHMENT_MAX_BYTES.document <= 20971520, '   documents capped at the whatsapp-media bucket limit (20 MB)');
ok(!Object.values(ATTACHMENT_TYPES).some((t) => t.mime.startsWith('audio/')), '   audio is not offered as an attachment (voice notes have their own path)');
ok(ATTACHMENT_ACCEPT.split(',').length === Object.keys(ATTACHMENT_TYPES).length, '   the picker accepts exactly the extensions the server allows');
ok(classifyAttachment('a.docx', 10).ok && bytesMatchType('application/vnd.openxmlformats-officedocument.wordprocessingml.document', new Uint8Array([0x50, 0x4b, 3, 4])), '   Word (docx) accepted with a zip signature');
ok(bytesMatchType('text/plain', new TextEncoder().encode('hello')) && !bytesMatchType('text/plain', new Uint8Array([104, 0, 105])), '   a text file must be text');
ok(cleanAttachmentFilename('../../etc/passwd.txt', 'txt') === 'passwd.txt' && cleanAttachmentFilename('', 'pdf') === 'file.pdf', '   filenames lose any path; a blank one gets a plain name');
ok(JSON.stringify(attachmentPayload('image', 'X', null, 'a.jpg')) === '{"type":"image","image":{"id":"X"}}', '   an image never carries a filename');

console.log('── 11: a failure is never shown as a send ──');
{
  const { deps, calls } = world({ send: 'refused' });
  const r = await sendMediaAttachment(input(), deps);
  ok(r.body.ok === false && r.body.error === 'meta_send_failed', '11. Meta refused → not ok');
  ok(calls.messages.length === 1 && calls.messages[0].status === 'failed' && calls.messages[0].media_path === null, '    thread shows a FAILED row with no attachment');
  ok(calls.releases.length === 1, '    the stored copy is released');
  ok(calls.logs[0]?.delivery_status === 'failed', '    whatsapp_sends records the failure');
  ok(calls.answered.length === 0, '    the lead status is not moved');
}
{
  const { deps, calls } = world({ send: 'unknown' });
  const r = await sendMediaAttachment(input(), deps);
  ok(r.body.ok === false && r.body.error === 'meta_send_unknown' && r.body.retryable === false, '    unknown result → not ok, not retryable');
  ok(calls.releases.length === 0, '    the claim is KEPT, so a retry cannot deliver twice');
}
{
  const { deps, calls } = world({ upload: 'fail' });
  const r = await sendMediaAttachment(input(), deps);
  ok(r.body.ok === false && r.body.error === 'meta_upload_failed' && calls.sends.length === 0 && calls.releases.length === 1 && calls.messages.length === 0, '    upload refused → nothing sent, claim released, no thread row');
}
{
  const { deps, calls } = world({ claim: 'exists' });
  const r = await sendMediaAttachment(input(), deps);
  ok(r.body.ok === false && r.body.error === 'duplicate_send' && calls.uploads.length === 0, '    the same send id twice → duplicate_send, nothing uploaded');
}
{
  const { deps, calls } = world({ claim: 'error' });
  const r = await sendMediaAttachment(input(), deps);
  ok(r.body.ok === false && r.body.error === 'storage_failed' && calls.uploads.length === 0, '    storage failure → nothing sent');
}
{
  const { deps, calls } = world({ live: false });
  const r = await sendMediaAttachment(input(), deps);
  ok(r.body.ok === true && r.body.status === 'simulated' && calls.uploads.length === 0 && calls.messages[0].status === 'simulated', '    test mode: stored and logged as simulated, never reaches Meta');
}

console.log('── dry run: every check, nothing stored or sent ──');
{
  const { deps, calls } = world();
  const r = await sendMediaAttachment(input({ dryRun: true, filename: 'q.pdf', bytes: PDF, declaredBytes: PDF.length }), deps);
  ok(r.body.ok === true && r.body.status === 'dry_run', 'dry run answers ok');
  ok(calls.claims.length + calls.uploads.length + calls.sends.length + calls.messages.length + calls.logs.length === 0, 'dry run stores, uploads, sends and records nothing');
  const { deps: d2 } = world({ lastInbound: null });
  const r2 = await sendMediaAttachment(input({ dryRun: true }), d2);
  ok(r2.body.ok === false && r2.body.error === 'window_closed', 'dry run still refuses a closed window');
}

console.log('── 12–13: text and voice paths untouched ──');
{
  const voice = read('supabase/functions/send-whatsapp-voice/index.ts');
  ok(!/media-attachment-send|mediaAttachment/.test(voice), '13. send-whatsapp-voice does not import the attachment code');
  const msg = read('supabase/functions/send-whatsapp-message/index.ts');
  ok(!/media-attachment-send|mediaAttachment/.test(msg), '12. send-whatsapp-message does not import the attachment code');
}

console.log(f ? `\n${f} FAILURE(S)` : '\nall passed');
process.exit(f ? 1 : 0);
