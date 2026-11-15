/* ============================================================
   webdev_hook — the app pitch to a web developer / SEO person, NO variables (Paul, 2026-11-15).

   Pins: the exact body in BOTH body tables (sent == shown), zero variables in BOTH sender registries, a FOLLOW-UP like
   webdev_report (continuation + NEEDS_PRIOR_WHATSAPP at both senders), Meta's LIVE status read first at both senders,
   in the picker (no link, no audit needed), labelled in the Inbox, "Put in message box" gets the whole wording.

   Run: npx tsx scripts/webdev-hook-template.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { WA_TEMPLATES, WA_TEMPLATE_BODIES, renderTemplateBody } from '../supabase/functions/_shared/whatsapp-send.ts';
import { readableTemplateBody } from '../src/lib/templateBodies.ts';
import { isInitialOpener } from '../src/lib/openerVariant.ts';
import { WHATSAPP_TEMPLATES } from '../src/types/outreach.ts';
import { WA_TEMPLATE_REQS, getTemplateSendability } from '../src/lib/whatsappTemplates.ts';
import { isColdOutreachTemplate, NEEDS_PRIOR_WHATSAPP } from '../src/lib/coldOutreach.ts';
import { isServiceTemplate } from '../src/lib/marketingConsent.ts';
import { freeTextVersionOf } from '../src/lib/inWindowFreeText.ts';
import { WEBDEV_HOOK_TEMPLATE } from '../src/lib/webdevReport.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const NAME = 'webdev_hook';
/* As submitted to Meta (Paul's text, 2026-11-15). */
const BODY = `Cool, if you've got space for more clients this might help

I've found going in from the AI visibility angle is very unsaturated atm

When a business finds out AI names their competitors instead, it gets their attention

I use this - It finds local businesses, runs SEO and AI visibility audits on them, then lets you SMS, whatsapp or call them on the app and send them their AI audit report

Then you can pitch an "AI optimised website" and run monthly Audits on them to measure the difference

Just passing it on incase you wanna test it out while its free :)

https://leadfinderos.com

Paul✌️`;

ok(WEBDEV_HOOK_TEMPLATE === NAME, 'the constant is the Meta name exactly');
ok(WA_TEMPLATES[NAME]?.lang === 'en', 'sender registry: English');
ok(JSON.stringify(WA_TEMPLATES[NAME]?.vars) === '[]', 'sender registry: zero variables');
const q = read('supabase/functions/process-whatsapp-queue/index.ts');
ok(/\n {2}webdev_hook: \{ lang: "en", vars: \[\] \},/.test(q), 'queue mirror: zero variables');
ok(/META_STATUS_GATED[^\n]*"webdev_hook"/.test(q), "queue reads Meta's live status first");
const s = read('supabase/functions/send-whatsapp-message/index.ts');
ok(s.includes('templateName === "webdev_hook"') && s.includes('templateAvailability(service, templateName)'), "Inbox sender reads Meta's live status first");

ok(WA_TEMPLATE_BODIES[NAME]?.('Acme Web Design', '') === BODY, 'sent body is the registered text, byte for byte');
ok(renderTemplateBody(NAME, 'Acme Web Design', '') === BODY, 'renderTemplateBody: nothing inserted');
ok(readableTemplateBody(null, NAME, { businessName: 'Acme Web Design', sentAt: new Date().toISOString() }) === BODY, 'shown body === sent body');
const ftv = freeTextVersionOf({ template: { components: [] } }, renderTemplateBody(NAME, 'Acme Web Design', ''));
ok(ftv.ok && ftv.text === BODY && !ftv.videoUrl, '"Put in message box" gets the full wording');

ok(!isInitialOpener(NAME), 'NOT an opener');
ok(!isColdOutreachTemplate(NAME), 'a continuation');
ok(NEEDS_PRIOR_WHATSAPP.has(NAME), 'never a first touch: needs a prior WhatsApp message (both senders read this set)');
ok(!isServiceTemplate(NAME), 'marketing: an opt-out blocks it');

ok(WHATSAPP_TEMPLATES.some((t) => t.value === NAME), 'in the template picker (Outreach and Inbox share it)');
ok(!WA_TEMPLATE_REQS[NAME]?.needsUrl && WA_TEMPLATE_REQS[NAME]?.needsAudit === false, 'needs no link and no audit');
ok(getTemplateSendability(NAME, { shareToken: null }, {}).ok, 'sendable in the picker');
ok(read('src/pages/Inbox.tsx').includes("webdev_hook: 'Web dev hook"), 'Inbox labels past sends');

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall passed');
