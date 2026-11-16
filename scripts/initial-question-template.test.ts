/* ============================================================
   initial_question — the "do you build websites or do SEO or AI visibility?" opener (Paul, 2026-11-15).

   Pins: the exact body in BOTH body tables (sent == shown), zero variables in BOTH sender registries,
   a FOLLOW-UP (Paul, 2026-11-15: "a follow-up, not an opener"): a continuation that only goes to a number already messaged
   (NEEDS_PRIOR_WHATSAPP, both senders), never swapped by coldOpenerFor; cold rules stop once the prospect has replied; Meta's LIVE
   status read first at BOTH senders, and a Meta refusal worded for the person (never silent).

   Run: npx tsx scripts/initial-question-template.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { WA_TEMPLATES, WA_TEMPLATE_BODIES, renderTemplateBody } from '../supabase/functions/_shared/whatsapp-send.ts';
import { readableTemplateBody } from '../src/lib/templateBodies.ts';
import { INITIAL_OPENER_D, INITIAL_OPENERS, WHATSAPP_OPENERS, coldOpenerFor, isInitialOpener, openerApproved } from '../src/lib/openerVariant.ts';
import { WHATSAPP_TEMPLATES } from '../src/types/outreach.ts';
import { WA_TEMPLATE_REQS, getTemplateSendability } from '../src/lib/whatsappTemplates.ts';
import { coldRulesApply, isColdOutreachTemplate, NEEDS_PRIOR_WHATSAPP } from '../src/lib/coldOutreach.ts';
import { isServiceTemplate } from '../src/lib/marketingConsent.ts';
import { openerPurpose } from '../src/lib/campaignRules.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const NAME = 'initial_question';
const BODY = 'Hi mate, do you build websites or do SEO or AI visibility?';

ok(INITIAL_OPENER_D === NAME, 'the constant is the Meta name exactly');
ok(WA_TEMPLATES[NAME]?.lang === 'en', 'sender registry: English');
ok(Array.isArray(WA_TEMPLATES[NAME]?.vars) && WA_TEMPLATES[NAME].vars.length === 0, 'sender registry: ZERO variables');
const q = read('supabase/functions/process-whatsapp-queue/index.ts');
ok(/\n {2}initial_question: \{ lang: "en", vars: \[\] \},/.test(q), 'queue mirror: English, zero variables');
ok(/META_STATUS_GATED[^\n]*"initial_question"/.test(q), "queue reads Meta's live status first");
const s = read('supabase/functions/send-whatsapp-message/index.ts');
ok(s.includes('templateName === "initial_question"') && s.includes('templateAvailability(service, templateName)'), "Inbox sender reads Meta's live status first");

ok(WA_TEMPLATE_BODIES[NAME]?.('Acme Ltd', '') === BODY, 'sent body is the registered text, byte for byte');
ok(renderTemplateBody(NAME, 'Acme Ltd', '') === BODY, 'renderTemplateBody: no name inserted');
ok(readableTemplateBody(null, NAME, { businessName: 'Acme Ltd', sentAt: new Date().toISOString() }) === BODY, 'shown body === sent body');

ok(!isInitialOpener(NAME) && !(WHATSAPP_OPENERS as readonly string[]).includes(NAME), 'NOT an opener (a follow-up)');
ok(!(INITIAL_OPENERS as readonly string[]).includes(NAME), 'WhatsApp-only (not in the SMS lane)');
ok(openerApproved(NAME), 'treated as approved (Meta live status decides server-side)');
ok(coldOpenerFor(NAME) === NAME, 'not swapped for initial_contact');
ok(!isColdOutreachTemplate(NAME), 'a continuation (the phone-history seatbelt would refuse it for every lead it is for)');
ok(NEEDS_PRIOR_WHATSAPP.has(NAME), 'never a first touch: needs a prior WhatsApp message');
const sw = read('supabase/functions/send-whatsapp-message/index.ts'), qw = read('supabase/functions/process-whatsapp-queue/index.ts');
ok(sw.includes('NEEDS_PRIOR_WHATSAPP.has(templateName) && !prospectReplied') && sw.includes('"follow_up_needs_contact"'), 'Inbox sender refuses it to a number never messaged');
ok(qw.includes('NEEDS_PRIOR_WHATSAPP.has(templateName)') && qw.includes('skipped: "follow_up_needs_contact"'), 'queue refuses it to a number never messaged');

/* The Eon Graphics bug (2026-11-15): cold rules never block once the prospect has replied. */
ok(coldRulesApply('initial_contact', false) && !coldRulesApply('initial_contact', true), 'cold opener: cold rules apply only before any reply');
ok(!coldRulesApply('audit_reply', false), 'a continuation never gets cold rules');
ok(!sw.includes('isColdOutreachTemplate(templateName)') && sw.split('if (coldSend').length - 1 >= 4, 'Inbox sender: every cold check reads coldSend (reply-aware)');
ok(sw.includes('coldRulesApply(usedTemplate, lastInboundAt != null)'), 'Inbox sender: the cold cap/gap is reply-aware too');
ok(sw.indexOf('optOutBlocksTemplate(templateName') > 0 && sw.indexOf('optOutBlocksTemplate(templateName') < sw.indexOf('const coldSend'), 'opt-outs still checked first, for every template');
ok(!isServiceTemplate(NAME), 'marketing: an opt-out blocks it');
ok(WHATSAPP_TEMPLATES.some((t) => t.value === NAME), 'in the template picker');
ok(WA_TEMPLATE_REQS[NAME]?.group === 'followup' && !WA_TEMPLATE_REQS[NAME].needsUrl && !WA_TEMPLATE_REQS[NAME].needsAudit, 'needs no link and no audit');
ok(getTemplateSendability(NAME, { shareToken: null }, {}).ok, 'sendable in the picker');
ok(openerPurpose(NAME, '') !== '', 'campaign wording names its purpose');
ok(read('src/pages/Inbox.tsx').includes("initial_question: 'Initial question"), 'Inbox labels past sends');

/* A Meta refusal is worded, never silent: the shared browser call turns Meta's code into words. */
const req = read('src/lib/whatsAppSendRequest.ts');
ok(req.includes("sendErrorMeaning('whatsapp', failCode)") && req.includes('Not sent: '), 'Meta refusal code becomes a plain reason');

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall passed');
