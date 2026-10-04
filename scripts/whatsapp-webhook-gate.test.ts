/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE WHATSAPP WEBHOOK FAILS CLOSED (2026-10-04, pre-sales certification M-003 / E-01;
   docs/pre-sales-certification/fixes-01-security-inbound.md).

   Session E proved live that whatsapp-status accepted an unsigned, credential-free Meta-shaped post
   because WHATSAPP_APP_SECRET was unset and the code only WARNED. The decision now lives in
   src/lib/metaWebhookGate.ts; this drives it on every arrival, including the null ones:
     · secret missing → 401, even with a "valid-looking" header;
     · signature missing / wrong / for a different body / for a different secret → 401;
     · a genuine Meta signature → accepted;
     · the QA simulation → only with CRON_SECRET, only inbound MESSAGES, only reserved 07700 900xxx
       senders, only wamid.QA_ ids; refused for a real number, a status receipt, a wrong secret, an
       unset CRON_SECRET (a blank header never matches a blank secret).
   And the wiring: whatsapp-status calls the gate BEFORE it parses the body, and the old
   "accept with a warning" branch is gone.
   Run: npx tsx scripts/whatsapp-webhook-gate.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { judgeWhatsAppWebhookPost, qaInboundBodyRefusal, QA_INBOUND_HEADER, QA_INBOUND_ID_PREFIX } from '../src/lib/metaWebhookGate.ts';
import { metaSignatureHex } from '../src/lib/metaSignature.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const enc = (o: unknown) => new TextEncoder().encode(JSON.stringify(o));

const SECRET = 'test-app-secret-not-real';
const CRON = 'test-cron-secret-not-real';

const metaInbound = (from: string, id: string) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'WABA', changes: [{ field: 'messages', value: {
    messaging_product: 'whatsapp',
    contacts: [{ wa_id: from, profile: { name: 'X' } }],
    messages: [{ from, id, timestamp: '1759560000', type: 'text', text: { body: 'send me the link' } }],
  } }] }],
});

const judge = (o: Partial<Parameters<typeof judgeWhatsAppWebhookPost>[0]>) => judgeWhatsAppWebhookPost({
  rawBytes: enc(metaInbound('447700900611', 'wamid.real')),
  signatureHeader: null, appSecret: SECRET, qaHeader: null, cronSecret: CRON, ...o,
});

console.log('── Meta path ──');
{
  const body = enc(metaInbound('447911123456', 'wamid.HBgM'));
  const good = 'sha256=' + await metaSignatureHex(body, SECRET);

  const missingSecret = await judge({ rawBytes: body, signatureHeader: good, appSecret: '' });
  ok(!missingSecret.accept && missingSecret.status === 401 && missingSecret.reason === 'not_configured',
    'secret NOT configured → 401 not_configured (fail closed), even with a signature header');
  const missingSecretNoSig = await judge({ rawBytes: body, signatureHeader: null, appSecret: '' });
  ok(!missingSecretNoSig.accept && missingSecretNoSig.status === 401, 'secret not configured + no signature → 401 (the exact live exploit)');

  const missingSig = await judge({ rawBytes: body, signatureHeader: null });
  ok(!missingSig.accept && missingSig.status === 401 && missingSig.reason === 'missing_signature', 'missing signature → 401');
  const emptySig = await judge({ rawBytes: body, signatureHeader: '' });
  ok(!emptySig.accept && emptySig.status === 401, 'empty signature header → 401');

  const wrong = await judge({ rawBytes: body, signatureHeader: 'sha256=' + '0'.repeat(64) });
  ok(!wrong.accept && wrong.status === 401 && wrong.reason === 'invalid_signature', 'invalid signature → 401');
  const otherSecret = await judge({ rawBytes: body, signatureHeader: 'sha256=' + await metaSignatureHex(body, 'someone-elses-secret') });
  ok(!otherSecret.accept && otherSecret.status === 401, 'signed with a different secret → 401');
  const tampered = await judge({ rawBytes: enc(metaInbound('447911123456', 'wamid.FORGED')), signatureHeader: good });
  ok(!tampered.accept && tampered.status === 401, 'a valid signature for a DIFFERENT body → 401');

  const accepted = await judge({ rawBytes: body, signatureHeader: good });
  ok(accepted.accept && accepted.via === 'meta_signature', 'a genuine signed Meta delivery → accepted');

  const statusReceipt = enc({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.X', status: 'delivered' }] } }] }] });
  const receipt = await judge({ rawBytes: statusReceipt, signatureHeader: 'sha256=' + await metaSignatureHex(statusReceipt, SECRET) });
  ok(receipt.accept, 'a genuine signed delivery RECEIPT is accepted too (one gate covers both)');
}

console.log('\n── QA inbound simulation (fixtures only, never a bypass) ──');
{
  const qaBody = metaInbound('447700900611', `${QA_INBOUND_ID_PREFIX}ws1_1`);
  const qa = await judge({ rawBytes: enc(qaBody), qaHeader: CRON, appSecret: '' });
  ok(qa.accept && qa.via === 'qa_simulation', 'CRON_SECRET + reserved number + wamid.QA_ id → accepted (even with no app secret)');

  const badSecret = await judge({ rawBytes: enc(qaBody), qaHeader: 'guess', appSecret: '' });
  ok(!badSecret.accept && badSecret.status === 401 && badSecret.reason === 'qa_bad_secret', 'wrong CRON_SECRET → 401');
  const blankBoth = await judge({ rawBytes: enc(qaBody), qaHeader: '', cronSecret: '' });
  ok(!blankBoth.accept && blankBoth.status === 401, 'unset CRON_SECRET + blank header → 401 (blank never matches blank)');
  const unsetCron = await judge({ rawBytes: enc(qaBody), qaHeader: CRON, cronSecret: '' });
  ok(!unsetCron.accept && unsetCron.status === 401, 'unset CRON_SECRET → 401');

  const realNumber = await judge({ rawBytes: enc(metaInbound('447911123456', `${QA_INBOUND_ID_PREFIX}x`)), qaHeader: CRON });
  ok(!realNumber.accept && realNumber.status === 403 && realNumber.reason === 'qa_not_reserved_number', 'a REAL number via the QA path → 403');
  const realContact = metaInbound('447700900611', `${QA_INBOUND_ID_PREFIX}x`);
  realContact.entry[0].changes[0].value.contacts[0].wa_id = '447911123456';
  ok(qaInboundBodyRefusal(realContact) === 'qa_not_reserved_number', 'a real number hidden in contacts[] → refused');
  const realId = await judge({ rawBytes: enc(metaInbound('447700900611', 'wamid.HBgMNDQ3')), qaHeader: CRON });
  ok(!realId.accept && realId.reason === 'qa_bad_message_id', 'a Meta-looking id via the QA path → refused (cannot pre-empt a real id)');
  const statuses = enc({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.X', status: 'read' }] } }] }] });
  const qaStatus = await judge({ rawBytes: statuses, qaHeader: CRON });
  ok(!qaStatus.accept && qaStatus.reason === 'qa_statuses_refused', 'delivery statuses via the QA path → refused (messages only)');
  const notJson = await judge({ rawBytes: new TextEncoder().encode('not json'), qaHeader: CRON });
  ok(!notJson.accept && notJson.status === 400, 'a non-JSON QA body → 400');
  ok(qaInboundBodyRefusal({ entry: [] }) === 'qa_bad_shape' && qaInboundBodyRefusal(null) === 'qa_bad_shape', 'empty / null QA bodies → refused');
  const mixed = metaInbound('447700900611', `${QA_INBOUND_ID_PREFIX}a`);
  (mixed.entry[0].changes[0].value.messages as unknown[]).push({ from: '447911123456', id: `${QA_INBOUND_ID_PREFIX}b`, type: 'text', text: { body: 'x' } });
  ok(qaInboundBodyRefusal(mixed) === 'qa_not_reserved_number', 'one real sender among fixtures → the WHOLE post is refused');
  ok(qaInboundBodyRefusal(metaInbound('07700 900611', `${QA_INBOUND_ID_PREFIX}a`)) === null && qaInboundBodyRefusal(metaInbound('+447700900999', `${QA_INBOUND_ID_PREFIX}a`)) === null,
    'every format of the reserved range is a fixture');
  ok(qaInboundBodyRefusal(metaInbound('447700901000', `${QA_INBOUND_ID_PREFIX}a`)) === 'qa_not_reserved_number', '07700 901000 is outside the reserved range → refused');
}

console.log('\n── wiring in whatsapp-status ──');
{
  const ws = read('supabase/functions/whatsapp-status/index.ts');
  ok(ws.includes('judgeWhatsAppWebhookPost('), 'whatsapp-status calls the gate');
  ok(ws.indexOf('judgeWhatsAppWebhookPost(') < ws.indexOf('JSON.parse(rawBody'), '…before the body is parsed');
  ok(ws.indexOf('if (!verdict.accept)') < ws.indexOf('createClient('), '…and refuses before a database client exists');
  ok(!/signature NOT checked/.test(ws) && !/if \(appSecret\)/.test(ws), 'the old "no secret → accept with a warning" branch is gone');
  ok(ws.includes(`qaHeader: req.headers.get(QA_INBOUND_HEADER)`) && QA_INBOUND_HEADER === 'x-qa-simulate-inbound', 'the QA header is the named constant x-qa-simulate-inbound');
  ok(/appSecret: Deno\.env\.get\(APP_SECRET_SECRET\) \?\? ""/.test(ws) && /const APP_SECRET_SECRET = "WHATSAPP_APP_SECRET"/.test(ws), 'the app secret is read from WHATSAPP_APP_SECRET (never from the request)');
  ok(/cronSecret: Deno\.env\.get\("CRON_SECRET"\) \?\? ""/.test(ws), 'the QA secret is CRON_SECRET from the environment');
  const toml = read('supabase/config.toml');
  ok(/\[functions\.whatsapp-status\]\s*\nverify_jwt = false/.test(toml), 'config.toml keeps whatsapp-status public (Meta sends no JWT) — the gate is the auth');
}

console.log(`\n${f === 0 ? 'ALL PASS' : `${f} FAILED`}`);
if (f) process.exit(1);
