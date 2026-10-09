/* ═══════════════════════════════════════════════════════════
   TWILIO SMS + BROWSER CALLING + SMART ROUTING (2026-10-09, feat/twilio-comms).

   Provider calls are never made here: signatures and tokens are checked against an independent node:crypto
   implementation; the routing, costing and SMS rules are pure; the edge functions and SQL are asserted on their text
   (the same approach as the WhatsApp suites) because the real provider needs credentials.
   ═══════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { twilioSignature, validTwilioSignature, voiceAccessToken, VOICE_TOKEN_MAX_TTL_S } from '../src/lib/twilioAuth.ts';
import { decideContactRoute, smsGateOpen, type RoutingFacts } from '../src/lib/contactRouting.ts';
import { smsSize, smsCostGbp, costWords, CHANNEL_COST_GBP } from '../src/lib/channelCosts.ts';
import { buildSms, isApprovedSmsLink, advanceSmsStatus, mapTwilioStatus, smsDeliveryState, isStopMessage, SMS_TEMPLATES, SMS_STOP_LINE } from '../src/lib/smsMessages.ts';

let f = 0;
const ok = (c: unknown, msg: string) => { if (c) console.log('  ✓ ' + msg); else { f++; console.log('  ✗ ' + msg); } };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*--.*$/gm, '');

console.log('1. webhook signatures (Twilio algorithm: HMAC-SHA1 over URL + sorted params)');
{
  const url = 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/twilio-webhook?type=sms-in';
  const params = { MessageSid: 'SM123', From: '+447911123456', To: '+447400420187', Body: 'Hello' };
  const tok = 'auth_token_value_123456';
  const independent = createHmac('sha1', tok).update(url + Object.keys(params).sort().map((k) => k + (params as Record<string, string>)[k]).join('')).digest('base64');
  ok(await twilioSignature(tok, url, params) === independent, 'matches an independent node:crypto implementation');
  ok(await validTwilioSignature(tok, url, params, independent), 'a correct signature validates');
  ok(!(await validTwilioSignature(tok, url, { ...params, Body: 'Hello!' }, independent)), 'a changed body fails');
  ok(!(await validTwilioSignature(tok, url + '&x=1', params, independent)), 'a changed URL fails');
  ok(!(await validTwilioSignature('other_token_value_999999', url, params, independent)), 'a different token fails');
  ok(!(await validTwilioSignature(tok, url, params, '')) && !(await validTwilioSignature(tok, url, params, null)), 'a missing signature fails');
  ok(!(await validTwilioSignature('', url, params, independent)) && !(await validTwilioSignature(undefined, url, params, independent)), 'an UNSET token fails closed (never "skip the check")');
  ok(!(await validTwilioSignature(tok, url, params, independent.slice(0, -2) + 'xx')), 'a near-miss signature fails');
}

console.log('2. voice access tokens (outgoing only, short-lived, signed with the API key secret)');
{
  const cfg = { accountSid: 'AC' + 'a'.repeat(32), apiKeySid: 'SK' + 'b'.repeat(32), apiKeySecret: 'secret_value_1234567890', twimlAppSid: 'AP' + 'c'.repeat(32), identity: '9d5a7629-3171-4091-b3a4-43010a1d424d', nowMs: 1_800_000_000_000 };
  const jwt = await voiceAccessToken({ ...cfg, ttlSeconds: 300 });
  const [h, p, s] = jwt.split('.');
  const dec = (x: string) => JSON.parse(Buffer.from(x.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  const sig = createHmac('sha256', cfg.apiKeySecret).update(`${h}.${p}`).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  ok(sig === s, 'signature verifies with the API key secret (HS256)');
  ok(dec(h).cty === 'twilio-fpa;v=1' && dec(h).alg === 'HS256', 'Twilio header');
  const pl = dec(p);
  ok(pl.iss === cfg.apiKeySid && pl.sub === cfg.accountSid, 'issuer is the API key, subject the account (never the auth token)');
  ok(pl.exp - pl.iat === 300, 'lives 5 minutes');
  ok(JSON.stringify(Object.keys(pl.grants).sort()) === JSON.stringify(['identity', 'voice']) && JSON.stringify(Object.keys(pl.grants.voice)) === JSON.stringify(['outgoing']), 'only an outgoing voice grant — no incoming, no push, no other grant');
  ok(pl.grants.identity === cfg.identity && pl.grants.voice.outgoing.application_sid === cfg.twimlAppSid, 'bound to one rep and the TwiML App');
  const long = dec((await voiceAccessToken({ ...cfg, ttlSeconds: 999999 })).split('.')[1]);
  ok(long.exp - long.iat === VOICE_TOKEN_MAX_TTL_S, 'the lifetime is capped');
  let threw = 0;
  for (const bad of [{ accountSid: 'nope' }, { apiKeySid: 'nope' }, { twimlAppSid: 'nope' }, { identity: 'not-a-uuid' }]) { try { await voiceAccessToken({ ...cfg, ...bad }); } catch { threw++; } }
  ok(threw === 4, 'a malformed account / key / app / identity refuses to mint a token');
  ok(!jwt.includes(cfg.apiKeySecret), 'the secret is not in the token');
}

console.log('3. smart contact routing — never assume WhatsApp; SMS after a conversation; email; landline; nothing usable');
{
  const base: RoutingFacts = { phone: '07911 123456', country: 'UK', email: null, smsAllowed: true, smsConfigured: true, voiceConfigured: true };
  const best = (f2: Partial<RoutingFacts>, purpose: 'link' | 'message' | 'call' = 'link') => decideContactRoute({ ...base, ...f2 }, purpose);
  ok(best({ whatsapp_ever_delivered: true }).best === 'whatsapp', 'WhatsApp confirmed delivered -> WhatsApp');
  ok(best({ whatsappWindowOpen: true }).best === 'whatsapp', 'they replied and the window is open -> WhatsApp');
  const untried = best({ line_type: 'mobile' });
  ok(untried.best === 'sms', 'a mobile nobody has tried on WhatsApp is NOT recommended for WhatsApp -> SMS');
  ok(untried.options.find((o) => o.channel === 'whatsapp')?.available === true && untried.options.find((o) => o.channel === 'whatsapp')?.recommended === false, '…WhatsApp stays available as a choice, never the recommendation');
  ok(best({ status: 'no_whatsapp' }).best === 'sms', 'Meta said not on WhatsApp -> SMS');
  ok(best({ whatsapp_delivery_status: 'no_whatsapp' }).options.find((o) => o.channel === 'whatsapp')?.available === false, '…and WhatsApp is unavailable');
  ok(best({ smsAllowed: false, email: 'a@b.co' }).best === 'email', 'SMS gate shut + an email -> email');
  ok(best({ smsAllowed: false }).options.find((o) => o.channel === 'sms')?.reason.includes('spoken'), '…and says why SMS is not open');
  ok(best({ phone: '01632 960123', email: 'a@b.co' }).best === 'email', 'landline + email -> email');
  const land = best({ phone: '01632 960123' });
  ok(land.best === 'call' && /landline/i.test(land.headline), 'landline only -> a call, said plainly');
  const none = best({ phone: null, email: null });
  ok(none.best === null && none.action === 'update_details', 'no usable details -> a clear "get details" action');
  ok(best({ email: 'x@y.co', emailBounced: true, smsAllowed: false }).best !== 'email', 'a bounced address is not recommended');
  ok(best({ optedOut: true, email: 'a@b.co' }).best === null, 'opted out -> no channel at all');
  ok(best({ wrongNumber: true }).options.find((o) => o.channel === 'sms')?.available === false && best({ wrongNumber: true }).options.find((o) => o.channel === 'call')?.available === false, 'wrong number -> no phone channel');
  ok(best({ phone: '+91 98765 43210', country: 'India', email: null }).options.find((o) => o.channel === 'sms')?.available === false, 'an Indian number: no SMS');
  ok(best({ phone: '0412 345 678', country: 'Australia', email: null }).options.find((o) => o.channel === 'whatsapp')?.available === false, 'an Australian number: no cold WhatsApp');
  ok(best({ smsConfigured: false }).options.find((o) => o.channel === 'sms')?.available === false, 'SMS not configured -> unavailable, with the reason');
  const failedSms = best({ failed: ['sms'], email: 'a@b.co' });
  ok(failedSms.best === 'email' && failedSms.options.find((o) => o.channel === 'sms')?.state === 'failed', 'a failed SMS recommends the next channel (email) and marks SMS failed');
  const sent = best({ alreadySent: ['sms'] });
  ok(/Already sent by SMS/.test(sent.headline), 'a link already out says so — it never defaults to a second send');
  ok(best({ failed: ['sms'], alreadySent: ['whatsapp'], whatsapp_ever_delivered: true }).options.every((o) => !(o.recommended && o.channel === 'sms')), 'a failed channel is never the recommendation');
  const callDecision = best({}, 'call');
  ok(callDecision.best === 'call' && callDecision.options.map((o) => o.channel).join() === 'call,whatsapp_app_call', 'purpose call -> browser call first, WhatsApp app call as the labelled alternative');
  ok(callDecision.options.find((o) => o.channel === 'whatsapp_app_call')?.recommended === false && callDecision.options.find((o) => o.channel === 'whatsapp_app_call')?.costGbp === 0, '…the app call is free and never the recommendation (no silent swap either way)');
  ok(best({}, 'call').options.filter((o) => o.recommended).length === 1, 'exactly one recommendation');
  ok(smsGateOpen({ loggedConversation: false, inboundSms: false, inboundWhatsapp: false, isAdmin: false }) === false && smsGateOpen({ loggedConversation: true, inboundSms: false, inboundWhatsapp: false, isAdmin: false }) && smsGateOpen({ loggedConversation: false, inboundSms: true, inboundWhatsapp: false, isAdmin: false }) && smsGateOpen({ loggedConversation: false, inboundSms: false, inboundWhatsapp: true, isAdmin: false }) && smsGateOpen({ loggedConversation: false, inboundSms: false, inboundWhatsapp: false, isAdmin: true }), 'the SMS gate: closed by default; a conversation, a message from them, or the admin opens it');
}

console.log('4. cost model — segments, encoding, wording');
{
  ok(smsSize('a'.repeat(160)).segments === 1 && smsSize('a'.repeat(161)).segments === 2 && smsSize('a'.repeat(306)).segments === 2 && smsSize('a'.repeat(307)).segments === 3, 'GSM-7: 160 / 153 per segment');
  ok(smsSize('Hello 😀').encoding === 'UCS-2' && smsSize('x'.repeat(71) + '😀').segments === 2, 'an emoji makes it UCS-2 (70 / 67)');
  ok(smsSize('{[€]}').characters === 10, 'extension characters count twice');
  ok(smsSize('').segments === 0, 'empty is zero segments');
  ok(smsCostGbp('a'.repeat(161)) === CHANNEL_COST_GBP.sms * 2, 'cost follows segments');
  ok(costWords(0) === 'free' && costWords(0.05) === 'about 5p' && costWords(0.004) === 'under 1p', 'plain words for the rep');
  ok(CHANNEL_COST_GBP.whatsapp_service === 0 && CHANNEL_COST_GBP.email === 0, 'a WhatsApp reply in-window and email are free');
  const cost = read('src/lib/channelCosts.ts');
  ok(/ESTIMATE/.test(cost) && /billed row/.test(cost), 'the cost table says it is an estimate to be checked against a billed row');
}

console.log('5. SMS texts and links');
{
  const url = 'https://findable.live/agree/' + 'A1b2C3d4E5f6G7h8I9j0';
  ok(buildSms('agreement_link', { rep: 'Sam', link: url })?.includes(url) === true, 'the agreement text carries the link');
  ok(buildSms('agreement_link', { rep: 'Sam', link: null }) === null && buildSms('agreement_link', { rep: 'Sam', link: 'http://findable.live/agree/x' }) === null, 'a link template with no (or an insecure) link is refused, not sent with a hole');
  for (const k of Object.keys(SMS_TEMPLATES) as Array<keyof typeof SMS_TEMPLATES>) ok(SMS_TEMPLATES[k].text.includes(SMS_STOP_LINE), `${k} says how to opt out`);
  ok(isApprovedSmsLink('agreement', url), 'agreement: findable.live/agree/<token>');
  ok(!isApprovedSmsLink('agreement', 'https://checkout.stripe.com/c/pay/cs_live_abc123'), 'a raw Stripe link is NEVER approved — the agreement comes first');
  ok(!isApprovedSmsLink('agreement', 'https://evil.example/agree/' + 'A1b2C3d4E5f6G7h8I9j0') && !isApprovedSmsLink('agreement', 'https://findable.live.evil.example/agree/' + 'A1b2C3d4E5f6G7h8I9j0'), 'another host is refused');
  ok(!isApprovedSmsLink('agreement', 'https://findable.live/agree/short'), 'a malformed token is refused');
  ok(isApprovedSmsLink('setup', 'https://findable.live/onboarding/?lead=9d5a7629-3171-4091-b3a4-43010a1d424d') && !isApprovedSmsLink('setup', 'https://findable.live/onboarding/?lead=x'), 'setup: the lead-id form only');
  ok(isApprovedSmsLink('website', 'https://findable.live') && !isApprovedSmsLink('website', 'https://findable.live/agree/' + 'A1b2C3d4E5f6G7h8I9j0'), 'website: the home page only');
  ok(isStopMessage('STOP') && isStopMessage(' stop. ') && isStopMessage('Unsubscribe') && !isStopMessage('please stop by tomorrow'), 'STOP words, exactly');
}

console.log('6. delivery statuses — accepted is not delivered');
{
  ok(mapTwilioStatus('accepted') === 'queued' && mapTwilioStatus('sending') === 'queued' && mapTwilioStatus('weird') === 'queued', 'unknown / accepted -> queued, never delivered');
  ok(mapTwilioStatus('delivered') === 'delivered' && mapTwilioStatus('undelivered') === 'undelivered' && mapTwilioStatus('failed') === 'failed' && mapTwilioStatus('sent') === 'sent', 'the real receipts map');
  ok(advanceSmsStatus('delivered', 'sent') === 'delivered' && advanceSmsStatus('queued', 'sent') === 'sent' && advanceSmsStatus('sent', 'delivered') === 'delivered', 'out-of-order receipts never move a text backwards');
  ok(advanceSmsStatus('simulated', 'delivered') === 'simulated', 'a simulated text can never become delivered');
  const t = (direction: 'inbound' | 'outbound', status: string, at: string) => ({ direction, status, created_at: at });
  ok(smsDeliveryState([]) === 'not_sent', 'nothing sent -> Not sent');
  ok(smsDeliveryState([t('outbound', 'queued', '2026-10-09T10:00:00Z')]) === 'queued', 'queued');
  ok(smsDeliveryState([t('outbound', 'delivered', '2026-10-09T10:00:00Z')]) === 'delivered', 'delivered');
  ok(smsDeliveryState([t('outbound', 'undelivered', '2026-10-09T10:00:00Z')]) === 'failed', 'undelivered -> failed');
  ok(smsDeliveryState([t('outbound', 'delivered', '2026-10-09T10:00:00Z'), t('inbound', 'received', '2026-10-09T10:05:00Z')]) === 'replied', 'a later inbound -> replied');
  ok(smsDeliveryState([t('inbound', 'received', '2026-10-09T09:00:00Z'), t('outbound', 'sent', '2026-10-09T10:00:00Z')]) === 'sent', 'an earlier inbound does not count as a reply');
  ok(smsDeliveryState([t('outbound', 'simulated', '2026-10-09T10:00:00Z')]) === 'simulated', 'a test send is labelled as one');
}

console.log('7. SMS sender guards (server)');
{
  const s = code(read('supabase/functions/_shared/twilio-sms.ts'));
  const order = ['leadAccess(', 'isUkColdDestination(digits)', 'checkSuppressed(', 'smsGateOpen(', 'qaSendVerdict(', 'guardAction(', 'insert({', 'twilioSendSms('].map((m) => s.indexOf(m));
  ok(order.every((n) => n > 0) && order.every((n, i) => i === 0 || n > order[i - 1]), 'guards run in order: access -> UK mobile -> opt-out -> conversation gate -> QA -> abuse limit -> record -> send');
  ok(/lookup_failed"[\s\S]{0,60}suppression_unreadable|matchedOn === "lookup_failed"\) return fail\("suppression_unreadable"/.test(s), 'an unreadable opt-out list refuses (fail closed)');
  ok(/code === "23505"|\.code === "23505"/.test(s) && /idempotency_key/.test(s), 'duplicate send prevention: idempotency key, unique-violation returns the first result');
  ok(/sms_messages_idem_uq/.test(read('supabase/migrations/20261018090000_twilio_comms.sql')), '…backed by a unique index');
  ok(/already_sent_recently/.test(s) && /link_kind/.test(s), 'the same link kind within 10 minutes needs allow_resend');
  ok(/URL_IN_TEXT\.test\(body\)/.test(s) && /link_not_allowed/.test(s), 'free text can never carry a link');
  ok(/isApprovedSmsLink\(linkKind, String\(a\.linkUrl/.test(s), 'a link template needs an approved findable.live URL');
  ok(!/body\.phone|\.phone\)\s*:\s*String\(body/.test(s) && /lead\.phone/.test(s), 'the number is the lead\'s stored number, never a parameter');
  ok(/simulated = env\.testMode \|\| qa\.kind === "simulate"/.test(s), 'test mode (default) and QA fixtures simulate: no Twilio call');
  ok(/status = "failed"/.test(s) && /sent_by_user_id: a\.actor\.id/.test(s), 'a failure is recorded as failed; the rep is recorded as the sender');
  const fnSend = code(read('supabase/functions/twilio-sms-send/index.ts'));
  ok(/t\.linkKind === "setup" \|\| t\.linkKind === "agreement"/.test(fnSend) && /use_quick_close/.test(fnSend), 'setup / agreement links cannot be sent from the Inbox endpoint — Quick Close only');
  ok(/resolveActor\(req, service\)/.test(fnSend) && !/body\.phone|body\.to\b/.test(fnSend), 'role required; no phone parameter exists');
  ok(/isUkColdDestination/.test(read('supabase/functions/_shared/twilio-sms.ts')), 'UK only (India and Australia cold contact stay off)');
}

console.log('8. voice token + webhook');
{
  const tk = code(read('supabase/functions/twilio-voice-token/index.ts'));
  ok(/resolveActor\(req, service\)/.test(tk) && /leadAccess\(service, who\.actor, leadId\)/.test(tk), 'token: role + lead ownership');
  ok(!/body\.phone|body\.to\b|body\.number/.test(tk), 'token: the browser supplies no number');
  ok(/UK_CALLABLE\.test\(digits\)/.test(tk) && /\[1237\]/.test(tk), 'token: UK numbers only, no premium ranges');
  ok(/checkSuppressed\(/.test(tk) && /suppression_unreadable/.test(tk), 'token: opt-out / wrong number refuse, unreadable refuses');
  ok(/guardAction\(service, who\.actor\.id, "voice_call"/.test(tk), 'token: rate limit');
  ok(/ttlSeconds: 300/.test(tk), 'token: 5 minutes');
  ok(/simulated\) return json\(\{ ok: true, simulated: true/.test(tk) && tk.indexOf('simulated) return json') < tk.indexOf('voiceAccessToken({'), 'token: a simulated call never receives a real token');
  ok(!/lead_activity|outreach_leads"\)\s*\.update|status:\s*"initial_contact"/.test(tk), 'token: writes no lead state — opening the workspace is not contact');
  const wh = code(read('supabase/functions/twilio-webhook/index.ts'));
  ok(wh.indexOf('validTwilioSignature(') > 0 && wh.indexOf('validTwilioSignature(') < wh.indexOf('createClient(') && /status: 403/.test(wh), 'webhook: signature checked BEFORE anything else, 403 on failure');
  ok(/\.eq\("status", "initiated"\)/.test(wh) && /\.eq\("user_id", identity\)/.test(wh) && /gte\("created_at", since\)/.test(wh), 'webhook: a call row is claimed once, for its own rep, while fresh');
  ok(/claimed\.phone/.test(wh) && !/p\.To\b|p\.number|params\.to\b/.test(code(wh).slice(code(wh).indexOf('async function voiceTwiml'), code(wh).indexOf('async function voiceStatus'))), 'webhook: the dialled number comes from the stored row, not from a request parameter');
  ok(!/<Record|record="|recordingStatusCallback/i.test(wh) && !/record(ing|ings)?(?!<)/i.test(code(read('src/hooks/useTwilioCall.ts'))), 'calls are never recorded');
  ok(/recordOptOut\(service, \{ phone: `\+\$\{from\}`, leadId: m\.leadId \}, "twilio_inbound"\)/.test(wh), 'a STOP reply is recorded as an opt-out');
  ok(/"23505"/.test(wh), 'a retried inbound webhook is a no-op');
  ok(/advanceSmsStatus\(row\.status, mapTwilioStatus\(p\.MessageStatus\)\)/.test(wh), 'delivery receipts only move forward');
  ok(!/outreach_leads"\)\.update\(\{ status: "initial_contact"|status: "initial_contact"/.test(wh), 'webhook: a connected call does not mark the lead Contacted');
  ok(/kind: "call_made"/.test(wh), 'a finished call leaves one History line');
  const cfg = read('supabase/config.toml');
  ok(/\[functions\.twilio-webhook\]\s*\nverify_jwt = false/.test(cfg) && /\[functions\.twilio-sms-send\]\s*\nverify_jwt = true/.test(cfg) && /\[functions\.twilio-voice-token\]\s*\nverify_jwt = true/.test(cfg), 'config.toml: webhook public (signature-checked), the two SPA functions JWT-gated');
  const envSrc = code(read('supabase/functions/_shared/twilio.ts'));
  ok(/TWILIO_TEST_MODE"\)\.toLowerCase\(\) !== "off"/.test(envSrc), 'test mode is the default; only an explicit "off" goes live');
  for (const dir of ['src', 'supabase/functions/twilio-sms-send', 'supabase/functions/twilio-voice-token']) void dir;
}

console.log('9. secrets stay server-side; whatsapp-status untouched');
{
  const fs = await import('node:fs');
  const walk = (d: string): string[] => fs.readdirSync(new URL('../' + d, import.meta.url), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(d + '/' + e.name) : [d + '/' + e.name]);
  const clientFiles = walk('src').filter((p) => /\.(ts|tsx)$/.test(p) && p !== 'src/lib/twilioAuth.ts');
  const leaks = clientFiles.filter((p) => /TWILIO_(AUTH_TOKEN|API_KEY_SECRET|ACCOUNT_SID)|api\.twilio\.com/.test(read(p)));
  ok(leaks.length === 0, `no Twilio secret name or REST host anywhere in the browser code (${leaks.join(', ') || 'none'})`);
  const logs = walk('supabase/functions').filter((p) => /twilio/.test(p) && p.endsWith('.ts'));
  ok(logs.every((p) => !/console\.(log|error|warn)\([^)]*(authToken|apiKeySecret|env\.)/.test(read(p))), 'no secret is logged');
  ok(!/whatsapp-status/.test(logs.map(read).join('\n').replace(/\/\/[^\n]*/g, '')), 'no Twilio file touches whatsapp-status');
}

console.log('9b. the configuration check never returns a secret');
{
  const d = code(read('supabase/functions/_shared/twilio-diagnose.ts'));
  const fn = code(read('supabase/functions/twilio-sms-send/index.ts'));
  ok(/mode === "diagnose"[\s\S]{0,160}role !== "admin"[\s\S]{0,80}403/.test(fn), 'diagnose is admin-only');
  ok(!/Messages\.json|Calls\.json|method: "POST"|method: "DELETE"/.test(d), 'it only READS from Twilio: no message, no call, no change');
  const answerLines = d.split('\n').filter((l) => /\badd\(|\bsid\(|\burl\(|say/.test(l) && !/twGet\(/.test(l));
  ok(answerLines.length > 10 && !answerLines.some((l) => /\$\{env\.(authToken|apiKeySecret|accountSid|apiKeySid|twimlAppSid|smsFrom)\}/.test(l)) && !/console\./.test(d), 'no secret value is placed in the answer or logged (only lengths and yes/no)');
}

console.log('10. database: scope and isolation');
{
  const m = code(read('supabase/migrations/20261018090000_twilio_comms.sql'));
  ok(/alter table public\.sms_messages enable row level security/.test(m) && /alter table public\.call_logs enable row level security/.test(m), 'RLS on both new tables');
  ok(!/for insert|for update|for delete|for all/i.test(m.replace(/for each row/gi, '')), 'no write policy for any browser role');
  ok(/lead_id in \(select public\.my_sales_lead_ids\(\)\)/.test(m), 'a salesperson reads only their assigned leads\' texts');
  ok(/user_id = \(select auth\.uid\(\)\) or lead_id in \(select public\.my_sales_lead_ids\(\)\)/.test(m), '…and their own calls');
  ok(/security invoker/.test(m.slice(m.indexOf('my_sms_unread_counts'))), 'unread counts run under the caller\'s own RLS');
  ok(/status in \('queued', 'sent', 'delivered', 'undelivered', 'failed', 'received', 'simulated'\)/.test(m), 'status vocabulary includes simulated and the carrier receipts');
  ok(/'sms_reply', 'sms_failed', 'missed_call'/.test(m), 'notification kinds for a reply, a failure and a missed call');
  ok(/lead_activity_kind_check/.test(m) && /'sms_sent', 'call_made'/.test(m), 'History kinds widened');
  ok(!/lead_reached_contact|lead_first_contact_at/.test(m.replace(/--[^\n]*/g, '')), 'no contact rule is changed — a call row is not contact');
  const pl = read('src/lib/protectionLimits.ts');
  ok(/'sms_send', 'voice_call'/.test(pl) && /sms_send: \{ paid: false/.test(pl) && /voice_call: \{ paid: false/.test(pl), 'abuse guard knows both new actions');
}

console.log('11. Quick Close: the SMS link is the authoritative link, agreement before payment');
{
  const q = code(read('supabase/functions/quick-close/index.ts'));
  const i = q.indexOf('if (channel === "sms") {');
  ok(i > 0, 'quick-close has an sms channel for the agreement link');
  const block = q.slice(i, i + 1400);
  ok(/templateKey: "agreement_link", linkUrl: url/.test(block), 'the agreement text carries the link quick-close generated (qc.link_url), not one built here');
  ok(/linkUsable\(qc\)/.test(q.slice(q.indexOf('if (mode === "share_link")'), i)), '…only while that link is still usable');
  ok(/smsPrior\.length && body\.resend !== true/.test(block), 'one text per link unless Resend');
  ok(/templateKey: "setup_link", linkUrl: url/.test(q), 'Full Setup texts the setupLinkUrl(lead) form');
  ok(/stripe/i.test(code(read('supabase/functions/_shared/twilio-sms.ts'))) === false, 'the SMS sender knows nothing of Stripe — no path to a raw payment link');
  const sentry = read('src/lib/smsMessages.ts');
  ok(/agree\\\/\[A-Za-z0-9_-\]\{16,\}/.test(sentry), 'only the agreement page URL shape is textable');
  const ui = read('src/components/SmsLinkSend.tsx');
  ok(!/https?:\/\//.test(code(ui)), 'the SMS button builds no URL');
  ok(/'sms'/.test(read('src/lib/quickClose.ts')), 'the share record type includes sms');
}

console.log('12. UI: one inbox, WhatsApp preserved, honest call states');
{
  const inbox = read('src/pages/Inbox.tsx');
  ok(/const WhatsAppInbox = \(\) => \{/.test(inbox) && /useInboxChannel\(\) === 'sms' \? <SmsInbox \/> : <WhatsAppInbox \/>/.test(inbox), '/inbox is still the WhatsApp inbox by default; ?channel=sms is the SMS tab');
  ok(/<InboxChannelSwitch current="whatsapp" \/>/.test(inbox), 'a WhatsApp / SMS switch on the same page');
  const call = code(read('src/hooks/useTwilioCall.ts'));
  ok(/call\.on\('accept', \(\) => \{ set\('connected'\)/.test(call) && /call\.on\('ringing'/.test(call), '"connected" is the SDK\'s accept event, "ringing" its ringing event');
  ok(/mic_denied/.test(call) && /unsupported/.test(call) && /getUserMedia/.test(call), 'microphone permission and unsupported browsers are handled');
  ok(!/outreach_leads|lead_log_contact|updateLead|status:/.test(call), 'the call hook writes no lead data');
  ok(/pagehide/.test(call), 'closing the page ends the call');
  const panel = read('src/components/CallPanel.tsx');
  ok(/data-testid="call-mute"/.test(panel) && /data-testid="call-hangup"/.test(panel) && /data-testid="call-duration"/.test(panel) && /Log this call/.test(panel), 'mute, hang up, duration and Log this call');
  ok(/call-other-lead/.test(panel), 'a call in progress with another prospect is shown, not hidden');
  const dlg = read('src/components/LeadDetailDialog.tsx');
  ok(/<CallPanel leadId=\{lead\.id\}/.test(dlg) && /<ColdCallPlaybookInline/.test(dlg) && /<LeadHookPanel leadId=\{lead\.id\} variant="call"/.test(dlg), 'the script, the AI result and the call panel are all on the Call tab');
  ok(/useTwilioCall\(\)/.test(dlg) && dlg.indexOf('useTwilioCall()') < dlg.indexOf('<Tabs'), 'the call lives above the tabs, so switching tabs does not end it');
  ok(/WhatsApp app call|Call on WhatsApp/.test(read('src/components/CallNumberPopup.tsx')), 'the free WhatsApp app call is still there, labelled');
  const panelCode = code(read('src/components/CallPanel.tsx'));
  const pickFn = panelCode.slice(panelCode.indexOf('const pick = '), panelCode.indexOf('return (', panelCode.indexOf('const pick = ')));
  ok(pickFn.length > 40 && /if \(c === 'call'\) void call\.start\(leadId\);/.test(pickFn) && !/whatsapp_app_call'[^\n]*call\.start/.test(pickFn), 'the app call is its own choice — never started as a fallback of the Twilio call');
  ok(!/state === 'failed'[\s\S]{0,160}window\.open/.test(panelCode), '…and a failed call never opens it by itself');
  const routing = code(read('src/lib/contactRouting.ts'));
  ok(!/unofficial|wa\.me\/check|lookup/i.test(routing), 'no number-checking tool');
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall passed');
