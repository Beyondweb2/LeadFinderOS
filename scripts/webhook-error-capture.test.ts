/* ============================================================
   THE WEBHOOK SAVES META'S ERROR; A SECOND APP SECRET FOR THE SWITCH (2026-10-22, fix/webhook-error-capture,
   docs/whatsapp-status-cutover-plan.md).

   Pins: a failed delivery report's errors[0] is stored on the send, the message and the lead (masked, never blanking a
   stored error with an empty one); the gate accepts either of two app secrets and still refuses everything else;
   no secret at all is still "not configured" (fail closed).

   Run: npx tsx scripts/webhook-error-capture.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { judgeWhatsAppWebhookPost } from '../src/lib/metaWebhookGate.ts';
import { metaErrorParts } from '../src/lib/sendErrorMeaning.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let failures = 0;
function ok(cond: unknown, label: string) {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}
const enc = (s: string) => new TextEncoder().encode(s);
const sign = (body: Uint8Array, secret: string) => 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
const OLD = 'move37-app-secret-for-tests';
const NEW = 'findable-app-secret-for-tests';
const body = enc(JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.X', status: 'failed' }] } }] }] }));
const judge = (o: Partial<Parameters<typeof judgeWhatsAppWebhookPost>[0]>) => judgeWhatsAppWebhookPost({
  rawBytes: body, signatureHeader: null, appSecret: OLD, qaHeader: null, cronSecret: 'cron', ...o,
});

console.log('\n── 1. two app secrets during the switch ──');
{
  const a = await judge({ signatureHeader: sign(body, OLD) });
  ok(a.accept, 'signed by the main secret: accepted');
  const b = await judge({ signatureHeader: sign(body, NEW), nextAppSecret: NEW });
  ok(b.accept, 'signed by the second secret: accepted while it is set');
  const c = await judge({ signatureHeader: sign(body, NEW) });
  ok(!c.accept && c.status === 401 && c.reason === 'invalid_signature', 'signed by the second secret with no second secret set: refused');
  const d = await judge({ signatureHeader: sign(body, 'someone-else'), nextAppSecret: NEW });
  ok(!d.accept && d.reason === 'invalid_signature', 'signed by anyone else: refused');
  const e = await judge({ signatureHeader: null, nextAppSecret: NEW });
  ok(!e.accept && e.reason === 'missing_signature', 'unsigned: refused');
  const f = await judge({ appSecret: '', nextAppSecret: '', signatureHeader: sign(body, OLD) });
  ok(!f.accept && f.reason === 'not_configured', 'no secret at all: still "not configured" (fail closed)');
  const g = await judge({ appSecret: '', nextAppSecret: NEW, signatureHeader: sign(body, NEW) });
  ok(g.accept, 'only the second secret set: it alone verifies');
  const h = await judge({ appSecret: '', nextAppSecret: NEW, signatureHeader: sign(body, '') });
  ok(!h.accept, 'an empty secret never verifies anything');
}

console.log('\n── 2. a failed delivery report\'s error is stored ──');
const p = metaErrorParts({ code: 131026, title: 'Message undeliverable', message: 'Message undeliverable',
  error_data: { details: 'Message failed to send because of an unknown error. EAAB' + 'x'.repeat(30) } });
ok(p.code === 131026 && p.title === 'Message undeliverable' && /\[token\]/.test(p.details ?? ''), `Meta's webhook error → code, title, details (masked): ${JSON.stringify(p)}`);
const ws = read('supabase/functions/whatsapp-status/index.ts');
ok(/function failureParts\(st: \{ errors\?: unknown \} \| null \| undefined\): SendErrorParts \| null/.test(ws)
  && /return p\.code != null \|\| p\.title \|\| p\.details \? p : null;/.test(ws), 'an empty error object stores nothing (never blanks a stored error)');
ok(/const parts = status === "failed" \? failureParts\(st\) : null;/.test(ws), 'only a FAILED status carries an error');
ok(/from\("whatsapp_sends"\)\.update\(\{ delivery_status: status, \.\.\.\(parts \? errorColumns\(parts\) : \{\}\) \}\)/.test(ws), 'the send row gets error_code / error_title / error_details');
ok(/\.update\(\{ status, \.\.\.\(parts \? errorColumns\(parts\) : \{\}\) \}\)\s*\n\s*\.eq\("wa_message_id", wamid\)/.test(ws), 'the message row too');
ok(/whatsapp_error_code: parts\.code, whatsapp_error_title: parts\.title, whatsapp_error_at: nowIso/.test(ws), 'and the lead (as the queue writes it at send time)');
ok(/\.\.\.leadFailurePatch\(code,/.test(ws), 'the lead routing is unchanged (leadFailurePatch)');
ok(/nextAppSecret: Deno\.env\.get\(NEXT_APP_SECRET_SECRET\) \?\? ""/.test(ws) && /const NEXT_APP_SECRET_SECRET = "WHATSAPP_APP_SECRET_NEXT";/.test(ws), 'the second secret is read from WHATSAPP_APP_SECRET_NEXT');
ok(/judgeWhatsAppWebhookPost\(\{/.test(ws) && ws.indexOf('judgeWhatsAppWebhookPost({') < ws.indexOf('JSON.parse(rawBody'), 'the gate still runs before anything is parsed');

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
