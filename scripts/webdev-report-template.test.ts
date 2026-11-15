/* ============================================================
   webdev_report — the app pitch to a web developer / SEO person with their own report link (Paul, 2026-11-15).

   Pins: the exact body in BOTH body tables (sent == shown), {{1}} name + {{2}} report link in BOTH sender registries, routed to
   the audit branch (the report link comes from the lead's audit), LINK-ONLY at the resolver (no competitor rules) with the
   "Run an audit first" refusal, a FOLLOW-UP like initial_question (continuation + NEEDS_PRIOR_WHATSAPP at both senders), Meta's
   LIVE status read first at both senders, greyed in the picker without a report, in the picker, labelled, report opens counted.

   Run: npx tsx scripts/webdev-report-template.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { WA_TEMPLATES, WA_TEMPLATE_BODIES, renderTemplateBody, templateBodyParams } from '../supabase/functions/_shared/whatsapp-send.ts';
import { readableTemplateBody } from '../src/lib/templateBodies.ts';
import { isInitialOpener } from '../src/lib/openerVariant.ts';
import { WHATSAPP_TEMPLATES } from '../src/types/outreach.ts';
import { WA_TEMPLATE_REQS, getTemplateSendability } from '../src/lib/whatsappTemplates.ts';
import { isColdOutreachTemplate, NEEDS_PRIOR_WHATSAPP } from '../src/lib/coldOutreach.ts';
import { isServiceTemplate } from '../src/lib/marketingConsent.ts';
import { buildsFromAudit, unsuppliedVars } from '../src/lib/templateRouting.ts';
import { REPORT_LINK_TEMPLATES } from '../src/lib/templateAttribution.ts';
import { nameStyleFor } from '../src/lib/displayName.ts';
import { freeTextVersionOf } from '../src/lib/inWindowFreeText.ts';
import { NO_REPORT_REASON, REPORT_LINK_ONLY_TEMPLATES, WEBDEV_REPORT_TEMPLATE } from '../src/lib/webdevReport.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const NAME = 'webdev_report';
const LINK = 'https://findable.live/r/abc123';
/* As submitted to Meta (Paul's text, 2026-11-15), with {{1}} = Acme Web Design and {{2}} = the link. */
const BODY = `Cool, if you've got space for more clients this might help

The AI visibility angle is very unsaturated atm. When a business finds out AI names their competitors instead, it gets their attention

I use this, it finds local businesses, runs SEO and AI audits on them, then lets you SMS, WhatsApp or call them in the app and send them their report

Then pitch an AI optimised website and run monthly audits to show the difference

I ran one on Acme Web Design so you can see what it looks like: ${LINK}

Free to try if you wanna test it out :)

https://leadfinderos.com

Paul✌️`;

ok(WEBDEV_REPORT_TEMPLATE === NAME, 'the constant is the Meta name exactly');
ok(WA_TEMPLATES[NAME]?.lang === 'en', 'sender registry: English');
ok(JSON.stringify(WA_TEMPLATES[NAME]?.vars) === '["name","audit_url"]', 'sender registry: {{1}} name, {{2}} report link');
const q = read('supabase/functions/process-whatsapp-queue/index.ts');
ok(/\n {2}webdev_report: \{ lang: "en", vars: \["name", "audit_url"\] \},/.test(q), 'queue mirror: same two variables');
ok(/META_STATUS_GATED[^\n]*"webdev_report"/.test(q), "queue reads Meta's live status first");
const s = read('supabase/functions/send-whatsapp-message/index.ts');
ok(s.includes('templateName === "webdev_report"') && s.includes('templateAvailability(service, templateName)'), "Inbox sender reads Meta's live status first");

/* The variables: built from the audit, both supplied, filled in order. */
ok(buildsFromAudit(WA_TEMPLATES[NAME].vars), 'routed to the audit branch (the link is the audit report)');
ok(unsuppliedVars(WA_TEMPLATES[NAME].vars).length === 0, 'the audit branch supplies both variables');
const params = (templateBodyParams(WA_TEMPLATES[NAME].vars, 'Acme Web Design', LINK, { templateName: NAME, auditUrl: LINK }) as Array<{ parameters: Array<{ text?: string }> }>)[0]?.parameters;
ok(Array.isArray(params) && params.length === 2 && params[0]?.text === 'Acme Web Design' && params[1]?.text === LINK, 'Meta parameters: {{1}} the name, {{2}} the report link');
let threw = false;
try { templateBodyParams(WA_TEMPLATES[NAME].vars, 'Acme Web Design', '', { templateName: NAME, auditUrl: '' }); } catch { threw = true; }
ok(threw, 'a blank report link never reaches Meta (the builder refuses)');

/* The body: sent == shown, the name kept whole ("I ran one on Leeds" would be wrong). */
ok(nameStyleFor(NAME) === 'identify', 'the business name is kept whole, not peeled to a greeting');
ok(WA_TEMPLATE_BODIES[NAME]?.('Acme Web Design', LINK) === BODY, 'sent body is the registered text, byte for byte');
ok(renderTemplateBody(NAME, 'Acme Web Design', LINK) === BODY, 'renderTemplateBody fills {{1}} and {{2}}');
ok(readableTemplateBody(null, NAME, { businessName: 'Acme Web Design', url: LINK, sentAt: new Date().toISOString() }) === BODY, 'shown body === sent body');

/* Inbox "Put in message box" (24 hours open): the sender turns the built template into free text of the same words. */
const ftv = freeTextVersionOf({ template: { components: [{ type: 'body', parameters: params }] } }, renderTemplateBody(NAME, 'Acme Web Design', LINK));
ok(ftv.ok && ftv.text === BODY && !ftv.videoUrl, '"Put in message box" gets the full wording with both variables filled');

/* The resolver: link-only, and the no-report refusal. */
ok(REPORT_LINK_ONLY_TEMPLATES.has(NAME), 'link-only at the resolver');
const ar = read('supabase/functions/_shared/audit-reply.ts');
const linkOnlyAt = ar.indexOf('if (linkOnly) {');
ok(linkOnlyAt > 0 && linkOnlyAt < ar.indexOf('hookForbidsAbsenceCopy(hookState)') && linkOnlyAt < ar.indexOf('if (!competitors)'), 'link-only returns before every competitor / absence rule');
ok(ar.includes('if (linkOnly && (!audit || !run)) return { ok: false, reason: NO_REPORT_REASON };'), 'no report: refused with the plain reason');
ok(/^Run an audit first/.test(NO_REPORT_REASON) && NO_REPORT_REASON.includes('Nothing was sent'), 'the reason says run an audit first and that nothing went');

/* A follow-up, never a first message — the same setup as initial_question. */
ok(!isInitialOpener(NAME), 'NOT an opener');
ok(!isColdOutreachTemplate(NAME), 'a continuation');
ok(NEEDS_PRIOR_WHATSAPP.has(NAME), 'never a first touch: needs a prior WhatsApp message (both senders read this set)');
ok(!isServiceTemplate(NAME), 'marketing: an opt-out blocks it');

/* The picker. */
ok(WHATSAPP_TEMPLATES.some((t) => t.value === NAME), 'in the template picker');
ok(WA_TEMPLATE_REQS[NAME]?.needsAudit === true && !WA_TEMPLATE_REQS[NAME].needsUrl, 'needs a report, not a site link');
const noReport = getTemplateSendability(NAME, { shareToken: null }, {});
ok(!noReport.ok && /Run an audit/.test(noReport.reason ?? ''), 'greyed with "Run an audit…" when the lead has no report');
ok(getTemplateSendability(NAME, { shareToken: null }, { reportSlug: 'abc' }).ok, 'sendable once the lead has a report');
ok(read('src/pages/Inbox.tsx').includes("webdev_report: 'Web dev report"), 'Inbox labels past sends');
ok(REPORT_LINK_TEMPLATES.has(NAME), 'report opens after it are counted');

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall passed');
