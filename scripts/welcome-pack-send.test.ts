/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SENDING THE WELCOME PACK (Paul, 2026-10-29) — WhatsApp by default (src/lib/welcomePackWhatsApp.ts): free text inside
   the 24 hours, the welcome_pack_ready template outside them (registered in _shared/whatsapp-send.ts as a CONTINUATION,
   variables resolved by the sender, Meta's live status first). Email only as the fallback (src/lib/welcomePackEmail.ts).
   Sending stays manual; a test goes to Paul's own WhatsApp test number only and is never recorded.
   Run: npx tsx scripts/welcome-pack-send.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { sendableEmail, welcomePackEmail, WELCOME_PACK_FROM, WELCOME_PACK_REPLY_TO } from '../src/lib/welcomePackEmail.ts';
import { GBP_PACK_STEPS } from '../src/lib/welcomePackHtml.ts';
import {
  decideWelcomePackWhatsApp, isWelcomePackUrl, welcomePackGreeting, welcomePackWhatsAppText, WELCOME_PACK_TEMPLATE_BODY,
  WELCOME_PACK_TEMPLATE_LANG, WELCOME_PACK_TEMPLATE_NAME, WELCOME_PACK_TEMPLATE_WIRED, type WelcomePackWaFacts,
} from '../src/lib/welcomePackWhatsApp.ts';
import { CONTINUATION_TEMPLATES, isColdOutreachTemplate } from '../src/lib/coldOutreach.ts';
import { WA_TEMPLATES, claimTemplatePayload, renderTemplateBody } from '../supabase/functions/_shared/whatsapp-send.ts';
import { LEGACY_WHATSAPP_TEMPLATES, WHATSAPP_TEMPLATES } from '../src/types/outreach.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const url = 'https://findable.live/w/abc123';
const LINK = 'https://findable.live/w/abc234';

console.log('── the WhatsApp message (Paul\'s words) ──');
const msg = welcomePackWhatsAppText({ contactName: 'Sam Jones', businessName: 'Leeds Boilers', url });
ok(msg === `Hi Sam, welcome to Findable! Your welcome pack for Leeds Boilers is ready: ${url}. One thing I need from you: please add paul@findable.live as a Manager of your Google Business Profile (the steps are on the first page of the pack). Any questions, just reply here. Paul`, 'exactly Paul\'s wording');
ok(welcomePackWhatsAppText({ businessName: 'X', url }).startsWith('Hi there,'), 'no name → "Hi there"');
ok(WELCOME_PACK_TEMPLATE_BODY === welcomePackWhatsAppText({ contactName: '{{1}}', businessName: '{{2}}', url: '{{3}}' }), 'the template body is the same words with {{1}} {{2}} {{3}}');
const doc = read('docs/welcome-pack-whatsapp-template.md');
ok(doc.includes(WELCOME_PACK_TEMPLATE_BODY) && doc.includes('`welcome_pack_ready`') && /Utility/.test(doc) && doc.includes('https://findable.live/w/abc123'), 'the Meta doc carries the body, name, category and sample values');
ok(WELCOME_PACK_TEMPLATE_NAME === 'welcome_pack_ready' && WELCOME_PACK_TEMPLATE_LANG === 'en_GB' && WELCOME_PACK_TEMPLATE_WIRED === true, 'name and language settings (default en_GB); wired');

console.log('── the decision ──');
const NOW = Date.parse('2026-10-29T12:00:00Z');
const base: WelcomePackWaFacts = { hasPhone: true, capability: 'verified', optedOut: false, wrongNumber: false, lastInboundAt: '2026-10-29T09:00:00Z', sendHoursOpen: true, templateStatus: 'NOT_FOUND', templateWired: true };
const d = (o: Partial<WelcomePackWaFacts>) => decideWelcomePackWhatsApp({ ...base, ...o }, NOW);
const out24 = { lastInboundAt: '2026-10-27T09:00:00Z' };
ok(d({}).route === 'text', 'messaged within 24 hours → free text (even with the template approved)');
ok(d({ ...out24, templateStatus: 'APPROVED' }).route === 'template', 'outside 24 hours, approved → the template');
ok(d({ ...out24, templateStatus: 'UNKNOWN' }).route === 'template', 'status unreadable → attempted (Meta decides on the send)');
for (const s of ['PENDING', 'REJECTED', 'PAUSED', 'NOT_FOUND']) ok(d({ ...out24, templateStatus: s }).reason === 'template_not_approved', `${s} → nothing, with a reason`);
ok(d({ ...out24, templateStatus: 'APPROVED', templateWired: false }).reason === 'template_not_wired', 'the wired gate still exists');
ok(d({ ...out24, templateStatus: 'APPROVED', sendHoursOpen: false }).reason === 'outside_hours' && d({ sendHoursOpen: false }).reason === 'outside_hours', 'send hours hold both routes');
ok(d({ ...out24, templateStatus: 'APPROVED', optedOut: true }).reason === 'opted_out' && d({ optedOut: true }).emailFallback, 'opted out → nothing on WhatsApp (template too), email offered');
ok(d({ optedOut: null }).reason === 'optout_unknown' && !d({ optedOut: null }).emailFallback, 'opt-out check failed → refuses (fails closed)');
ok(d({ ...out24, templateStatus: 'APPROVED', wrongNumber: true }).reason === 'wrong_number', 'wrong number → nothing');
ok(d({ ...out24, templateStatus: 'APPROVED', capability: 'not_on_whatsapp' }).reason === 'no_whatsapp' && d({ capability: 'not_mobile' }).emailFallback && d({ hasPhone: false }).emailFallback, 'no WhatsApp / landline / no phone → nothing, email offered');
ok(!d({}).emailFallback && !d({ ...out24 }).emailFallback, 'email is NOT offered when WhatsApp is the route or only the template is missing');
ok(/Copy the WhatsApp message/.test(d({ ...out24 }).say), 'not approved: the sentence tells Paul to copy the message');

console.log('── the sender registry ──');
const swmSrc = read('supabase/functions/_shared/whatsapp-send.ts');
ok(swmSrc.includes(`${WELCOME_PACK_TEMPLATE_NAME}: { lang: "${WELCOME_PACK_TEMPLATE_LANG}", vars: ["greeting_name", "business_name", "welcome_pack_url"] }`), 'registered under the setting\'s name and language, three variables in the doc\'s order');
ok(JSON.stringify(WA_TEMPLATES.welcome_pack_ready.vars) === '["greeting_name","business_name","welcome_pack_url"]', 'registry vars');
ok(CONTINUATION_TEMPLATES.has('welcome_pack_ready') && !isColdOutreachTemplate('welcome_pack_ready'), 'a CONTINUATION: never cold, never cold-opener volume');
ok(!WHATSAPP_TEMPLATES.some((t) => t.value === 'welcome_pack_ready') && !LEGACY_WHATSAPP_TEMPLATES.some((t) => t.value === 'welcome_pack_ready') && /welcome_pack_ready: 'Welcome pack link \(paid client\)'/.test(read('src/types/outreach.ts')), 'server-only: never in the picker, so no campaign or the bulk queue (RED pause, daily cap) ever sends it');
const pay = claimTemplatePayload('welcome_pack_ready', 'en_GB', 'Leeds Boilers', '', { greetingName: 'Sam', welcomePackUrl: LINK }) as { template: { name: string; language: { code: string }; components: { parameters: { text: string }[] }[] } };
ok(pay.template.name === 'welcome_pack_ready' && pay.template.language.code === 'en_GB', 'sent under its exact name, in the given language');
ok(JSON.stringify(pay.template.components[0].parameters.map((p) => p.text)) === JSON.stringify(['Sam', 'Leeds Boilers', LINK]), 'payload: {{1}} first name, {{2}} business, {{3}} the link');
let bad = ''; try { claimTemplatePayload('welcome_pack_ready', 'en_GB', 'B', '', { greetingName: 'Sam', welcomePackUrl: 'https://checkout.stripe.com/x' }); } catch (e) { bad = (e as Error).message; }
ok(/not_a_welcome_pack_link/.test(bad), 'any link but findable.live/w/<code> is refused');
let noName = ''; try { claimTemplatePayload('welcome_pack_ready', 'en_GB', '', '', { greetingName: 'Sam', welcomePackUrl: LINK }); } catch (e) { noName = (e as Error).message; }
ok(/no_business_name/.test(noName), 'a blank business name is refused');
ok(renderTemplateBody('welcome_pack_ready', 'Leeds Boilers', LINK, undefined, undefined, 'Sam') === welcomePackWhatsAppText({ contactName: 'Sam', businessName: 'Leeds Boilers', url: LINK }), 'the stored transcript is the same words as the free-text message');
ok(isWelcomePackUrl(LINK) && !isWelcomePackUrl(LINK + '/x') && welcomePackGreeting(null) === 'there' && welcomePackGreeting('Sam Jones') === 'Sam', 'link shape and greeting');

console.log('── the sender ──');
const swm = read('supabase/functions/send-whatsapp-message/index.ts');
const wb = swm.slice(swm.indexOf('if (templateName === WELCOME_PACK_TEMPLATE_NAME) {'), swm.indexOf('} else if (linkKind) {'));
ok(wb.length > 100, 'the welcome-pack branch exists');
ok(/actor\.role !== "admin"/.test(wb) && /templateAvailability\(service, templateName\)/.test(wb) && /"PENDING"/.test(wb) && wb.indexOf('templateAvailability') < wb.indexOf('claimTemplatePayload'), 'admin only; Meta\'s live status BEFORE the payload');
ok(/resolveWelcomePackVars\(service, resolvedLeadId\)/.test(wb) && /pitchEverSent/.test(wb) && /if \(avail\.language\) lang = avail\.language/.test(wb), 'server-resolved variables, one per client unless resent, Meta\'s registered language');
const ts = swm.slice(swm.indexOf('if (body.mode === "test_send")'), swm.indexOf('if (!text && !templateName) return json'));
ok(/const dest = toWhatsAppNumber\(Deno\.env\.get\("WHATSAPP_TEST_NUMBER"\)/.test(ts) && ts.indexOf('const dest') < ts.indexOf('auto_window'), 'test_send: the secret destination is resolved first');
ok(/body\.auto_window === true/.test(ts) && /\.eq\("phone", dest\)/.test(ts), 'auto mode reads the TEST number\'s own 24-hour window');
ok(!/\.insert\(/.test(ts) && /textPayload\(text\)/.test(ts), 'test mode writes nothing (no message row, no send row)');
ok(/welcomePackUrl: v\.welcome_pack_url/.test(ts) && /templateName === WELCOME_PACK_TEMPLATE_NAME/.test(ts), 'a template test checks Meta\'s status and carries the three values');
ok(/BUILD_ID = "2026-10-29c-welcome-pack-template"/.test(swm), 'BUILD_ID bumped');
const vars = read('supabase/functions/_shared/welcome-pack-vars.ts');
ok(/carriesMoney\(lead\) \|\| clientClosed\(lead\)/.test(vars) && /welcomePackReadiness/.test(vars) && /isWelcomePackUrl/.test(vars), 'variables only for a current paying client with a ready pack and a valid link');

console.log('── the hub action ──');
const hub = read('supabase/functions/paid-client-hub/index.ts');
const block = hub.slice(hub.indexOf('if (action === "welcome_pack_status" || action === "welcome_pack_send")'), hub.indexOf('SECTION 5 — EVERYTHING'));
const real = block.slice(block.indexOf('REAL, ON WHATSAPP'));
ok(block.length > 0, 'the send action exists');
ok(/mode: "test_send", auto_window: true/.test(block) && !/test_send[^\n]*phone/.test(block), 'a test goes through the sender\'s test_send (destination = its secret; the sender picks text or template)');
ok(block.indexOf('if (isTest) {') < block.indexOf('return await record(') && /if \(isTest\) \{[\s\S]*?return json\(\{ ok: true, test: true/.test(block), 'a test returns before anything is recorded');
ok(/test_number_not_configured[\s\S]*Needs you/.test(block), 'no stored test number → "Needs you"');
ok(/\{ phone: L\.phone, country: L\.country \?\? null, lead_id: L\.id, body: message \}/.test(real) && /template_name: WELCOME_PACK_TEMPLATE_NAME/.test(real) && !/welcome_pack_url/.test(real), 'a real send: free text inside 24 hours, else the template with NO variables from here');
ok(/if \(d\.route === "none"\) return json\(/.test(real), 'nothing goes on WhatsApp when the decision is none');
ok(/notApproved \? "template_not_approved"/.test(real) && real.indexOf('if (!res.ok || !out.ok) {') < real.indexOf('return await record('), 'a Meta refusal returns before anything is recorded (the row stays on What needs you)');
ok(/if \(out\.simulated\)/.test(real), 'a simulated (test-mode / QA) send is not recorded as sent');
ok(/body\.channel === "email" \? "email" : "whatsapp"/.test(block) && /if \(!d\.emailFallback && body\.whatsapp_failed !== true\)/.test(block), 'WhatsApp is the default; email only as the fallback');
ok(/prior && body\.resend !== true/.test(block) && /qaEmailHold\(/.test(block) && /carriesMoney\(L\)/.test(block) && /if \(closed && !isTest\)/.test(block), 'resend, QA sink, paid and ended/refunded guards');
ok(/channel: via/.test(block) && !/setInterval|cron|setTimeout/.test(block), 'the record says which route; nothing runs on its own');

console.log('── the email fallback ──');
const m = welcomePackEmail({ businessName: 'Leeds Boilers', contactName: 'Sam Jones', url });
ok(m.text.startsWith('Hello Sam,') && m.text.includes(url) && GBP_PACK_STEPS.every((s) => m.text.includes(s)), 'the fallback email still carries the link and the Google steps');
ok(WELCOME_PACK_REPLY_TO === 'paul@findable.live' && WELCOME_PACK_FROM === 'Findable <alerts@findable.live>' && sendableEmail('nope') === null, 'sender, reply-to and address check');
const mig = read('supabase/migrations/20261130110000_welcome_pack_sends.sql') + read('supabase/migrations/20261130120000_welcome_pack_sends_channel.sql');
ok(/enable row level security/.test(mig) && !/create policy/i.test(mig) && /channel in \('whatsapp', 'email'\)/.test(mig), 'the send log stays server-only and records its channel');

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
