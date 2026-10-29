/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SENDING THE WELCOME PACK (Paul, 2026-10-29) — WhatsApp by default (src/lib/welcomePackWhatsApp.ts), email only as
   the fallback (src/lib/welcomePackEmail.ts), paid-client-hub welcome_pack_send. Sending stays manual; a test goes to
   Paul's own WhatsApp test number only and is never recorded; the template fails safe until approved AND wired.
   Run: npx tsx scripts/welcome-pack-send.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { sendableEmail, welcomePackEmail, WELCOME_PACK_FROM, WELCOME_PACK_REPLY_TO } from '../src/lib/welcomePackEmail.ts';
import { GBP_PACK_STEPS } from '../src/lib/welcomePackHtml.ts';
import { decideWelcomePackWhatsApp, welcomePackWhatsAppText, WELCOME_PACK_TEMPLATE_BODY, WELCOME_PACK_TEMPLATE_NAME, WELCOME_PACK_TEMPLATE_WIRED, type WelcomePackWaFacts } from '../src/lib/welcomePackWhatsApp.ts';
import { isColdOutreachTemplate } from '../src/lib/coldOutreach.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const url = 'https://findable.live/w/abc123';

console.log('── the WhatsApp message (Paul\'s words) ──');
const msg = welcomePackWhatsAppText({ contactName: 'Sam Jones', businessName: 'Leeds Boilers', url });
ok(msg === `Hi Sam, welcome to Findable! Your welcome pack for Leeds Boilers is ready: ${url}. One thing I need from you: please add paul@findable.live as a Manager of your Google Business Profile (the steps are on the first page of the pack). Any questions, just reply here. Paul`, 'exactly Paul\'s wording');
ok(welcomePackWhatsAppText({ businessName: 'X', url }).startsWith('Hi there,'), 'no name → "Hi there"');
ok(WELCOME_PACK_TEMPLATE_BODY === welcomePackWhatsAppText({ contactName: '{{1}}', businessName: '{{2}}', url: '{{3}}' }), 'the template body is the same words with {{1}} {{2}} {{3}}');
const doc = read('docs/welcome-pack-whatsapp-template.md');
ok(doc.includes(WELCOME_PACK_TEMPLATE_BODY) && doc.includes('`welcome_pack_ready`') && /Utility/.test(doc) && doc.includes('https://findable.live/w/abc123'), 'the Meta doc carries the body, name, category and sample values');
ok(WELCOME_PACK_TEMPLATE_NAME === 'welcome_pack_ready' && WELCOME_PACK_TEMPLATE_WIRED === false, 'template name is the one setting; not wired yet');

console.log('── the decision ──');
const NOW = Date.parse('2026-10-29T12:00:00Z');
const base: WelcomePackWaFacts = { hasPhone: true, capability: 'verified', optedOut: false, wrongNumber: false, lastInboundAt: '2026-10-29T09:00:00Z', sendHoursOpen: true, templateStatus: 'NOT_FOUND' };
const d = (o: Partial<WelcomePackWaFacts>) => decideWelcomePackWhatsApp({ ...base, ...o }, NOW);
ok(d({}).route === 'text', 'messaged within 24 hours → free text');
ok(d({ lastInboundAt: '2026-10-27T09:00:00Z' }).reason === 'template_not_approved' && d({ lastInboundAt: null }).route === 'none', 'outside 24 hours, template not approved → nothing, with a reason');
ok(d({ lastInboundAt: null, templateStatus: 'APPROVED' }).reason === 'template_not_wired', 'approved but not wired → still nothing (the gate goes first)');
ok(d({ lastInboundAt: null, templateStatus: 'APPROVED', templateWired: true }).route === 'template', 'approved and wired → template');
ok(d({ sendHoursOpen: false }).reason === 'outside_hours', 'outside send hours → nothing now');
ok(d({ optedOut: true }).reason === 'opted_out' && d({ optedOut: true }).emailFallback, 'opted out → nothing on WhatsApp, email offered');
ok(d({ optedOut: null }).reason === 'optout_unknown' && !d({ optedOut: null }).emailFallback, 'opt-out check failed → refuses (fails closed)');
ok(d({ wrongNumber: true }).reason === 'wrong_number', 'wrong number → nothing');
ok(d({ capability: 'not_on_whatsapp' }).emailFallback && d({ capability: 'not_mobile' }).emailFallback && d({ hasPhone: false }).emailFallback, 'no WhatsApp / landline / no phone → email offered');
ok(!d({}).emailFallback && !d({ lastInboundAt: null }).emailFallback, 'email is NOT offered when WhatsApp is the route or only the template is missing');
for (const r of ['template_not_approved', 'template_not_wired'] as const) ok(/Copy the WhatsApp message/.test(d(r === 'template_not_wired' ? { lastInboundAt: null, templateStatus: 'APPROVED' } : { lastInboundAt: null }).say), `${r}: the sentence tells Paul to copy the message`);
ok(isColdOutreachTemplate(null) === true, '(note) isColdOutreachTemplate is only ever asked about a TEMPLATE name — a free-text send never reaches it');

console.log('── the hub action ──');
const hub = read('supabase/functions/paid-client-hub/index.ts');
const block = hub.slice(hub.indexOf('if (action === "welcome_pack_status" || action === "welcome_pack_send")'), hub.indexOf('SECTION 5 — EVERYTHING'));
ok(block.length > 0, 'the send action exists');
ok(/callSender\(\{ mode: "test_send", body: /.test(block) && !/test_send[^\n]*phone/.test(block), 'a test goes through the sender\'s test_send (destination = its secret), with no phone from here');
ok(block.indexOf('if (isTest) {') < block.indexOf('record(') && /if \(isTest\) \{[\s\S]*?return json\(\{ ok: true, test: true/.test(block), 'a test returns before anything is recorded');
ok(/test_number_not_configured[\s\S]*Needs you/.test(block), 'no stored test number → "Needs you"');
ok(/callSender\(\{ phone: L\.phone, country: L\.country \?\? null, lead_id: L\.id, body: message \}\)/.test(block), 'a real send is free text through fn send-whatsapp-message (its rules decide last)');
ok(/if \(d\.route !== "text"\) return json\(/.test(block), 'nothing goes on WhatsApp unless the decision is free text');
ok(/if \(out\.simulated\)/.test(block), 'a simulated (test-mode / QA) send is not recorded as sent');
ok(/channel === "whatsapp"/.test(block) && /body\.channel === "email" \? "email" : "whatsapp"/.test(block), 'WhatsApp is the default channel');
ok(/if \(!d\.emailFallback && body\.whatsapp_failed !== true\)/.test(block), 'email only as the fallback');
ok(/prior && body\.resend !== true/.test(block) && /qaEmailHold\(/.test(block) && /carriesMoney\(L\)/.test(block) && /if \(closed && !isTest\)/.test(block), 'resend, QA sink, paid and ended/refunded guards');
ok(/channel: via/.test(block), 'the send record says which route it went by');
ok(!/setInterval|cron|setTimeout/.test(block), 'nothing in the send path runs on its own');

console.log('── the sender\'s test mode ──');
const swm = read('supabase/functions/send-whatsapp-message/index.ts');
const ts = swm.slice(swm.indexOf('if (body.mode === "test_send")'), swm.indexOf('if (!text && !templateName) return json'));
ok(/const dest = toWhatsAppNumber\(Deno\.env\.get\("WHATSAPP_TEST_NUMBER"\)/.test(ts) && ts.indexOf('const dest') < ts.indexOf('if (!templateName && text)'), 'free-text test_send uses the same secret destination, checked first');
ok(/if \(!templateName && text\) \{[\s\S]*textPayload\(text\)/.test(ts) && !/whatsapp_messages|from\("whatsapp_sends"\)/.test(ts), 'free-text test is lead-free: no message row, no send row');
ok(/BUILD_ID = "2026-10-29b-test-send-text"/.test(swm), 'BUILD_ID bumped');

console.log('── the email fallback ──');
const m = welcomePackEmail({ businessName: 'Leeds Boilers', contactName: 'Sam Jones', url });
ok(m.text.startsWith('Hello Sam,') && m.text.includes(url) && GBP_PACK_STEPS.every((s) => m.text.includes(s)), 'the fallback email still carries the link and the Google steps');
ok(WELCOME_PACK_REPLY_TO === 'paul@findable.live' && WELCOME_PACK_FROM === 'Findable <alerts@findable.live>' && sendableEmail('nope') === null, 'sender, reply-to and address check');
const mig = read('supabase/migrations/20261130110000_welcome_pack_sends.sql') + read('supabase/migrations/20261130120000_welcome_pack_sends_channel.sql');
ok(/enable row level security/.test(mig) && !/create policy/i.test(mig) && /channel in \('whatsapp', 'email'\)/.test(mig), 'the send log stays server-only and records its channel');

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
