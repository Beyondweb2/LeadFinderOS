/* ============================================================
   polite_hook3 — follow-up hook, no Meta variables, tracked leadfinderos.com/go/<code> link in the free-text version (Paul, 2026-11-23).
   Pins: Meta's body byte for byte (plain link), the tracked free-text body, zero variables in BOTH registries, a follow-up (needs a prior
   WhatsApp), NO Meta status gate (treated as approved), LeadFinderOS-only code (goCodeFor, fail-closed) at BOTH senders, the template path
   keeps the plain words while only the free-text path carries the code, picker / Inbox label, queueable (migration), What's New.

   Run: npx tsx scripts/polite-hook3.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { WA_TEMPLATES, WA_TEMPLATE_BODIES, renderTemplateBody, claimTemplatePayload } from '../supabase/functions/_shared/whatsapp-send.ts';
import { readableTemplateBody } from '../src/lib/templateBodies.ts';
import { POLITE_HOOK3_TEMPLATE, politeHook3Body } from '../src/lib/webdevReport.ts';
import { freeTextVersionOf, inWindowShape } from '../src/lib/inWindowFreeText.ts';
import { isColdOutreachTemplate, NEEDS_PRIOR_WHATSAPP } from '../src/lib/coldOutreach.ts';
import { isInitialOpener } from '../src/lib/openerVariant.ts';
import { WHATSAPP_TEMPLATES } from '../src/types/outreach.ts';
import { WA_TEMPLATE_REQS, getTemplateSendability, templateGroupLabel } from '../src/lib/whatsappTemplates.ts';
import { WHATS_NEW } from '../src/lib/whatsNew.ts';
let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => fs.readFileSync(path.resolve(p), 'utf8').replace(/\r\n/g, '\n');

const META = `Ah nice, this might actually be useful to you then..

It's what I use to find and message clients, it's how I found you - https://leadfinderos.com/

All the best,
Paul`;
const TRACKED = META.replace('https://leadfinderos.com/', 'https://leadfinderos.com/go/ab12cd34');

console.log('── polite_hook3 words');
ok(POLITE_HOOK3_TEMPLATE === 'polite_hook3', 'the constant is the Meta name');
ok(politeHook3Body() === META, "no code: Meta's approved body, byte for byte (plain link)");
ok(politeHook3Body('ab12cd34') === TRACKED, "with the lead's code: the same words, tracked link only");
ok(WA_TEMPLATE_BODIES.polite_hook3?.('Acme', '') === META && renderTemplateBody('polite_hook3', 'Acme', '') === META, 'the sender renders the plain (template) words');
ok(readableTemplateBody(null, 'polite_hook3', { businessName: 'Acme', sentAt: new Date().toISOString() }) === META, 'the SPA mirror shows the approved words');

console.log('── registry');
ok(WA_TEMPLATES.polite_hook3?.lang === 'en' && JSON.stringify(WA_TEMPLATES.polite_hook3?.vars) === '[]', 'English, zero variables (the template link is plain)');
const q = read('supabase/functions/process-whatsapp-queue/index.ts');
const s = read('supabase/functions/send-whatsapp-message/index.ts');
ok(/polite_hook3: \{ lang: "en", vars: \[\] \},/.test(q), 'queue mirror: zero variables');
const payload = claimTemplatePayload('polite_hook3', 'en', 'Acme', '', {}) as { template: { components?: unknown[] } };
ok(!(payload.template.components ?? []).length, 'the Meta payload carries no parameters');
ok(!/META_STATUS_GATED[^\n]*polite_hook3/.test(q) && !/templateName === "polite_hook3"/.test(s), 'NO Meta status gate (treated as approved)');

console.log('── a follow-up, never a first touch');
ok(!isInitialOpener('polite_hook3') && !isColdOutreachTemplate('polite_hook3'), 'a continuation, not an opener');
ok(NEEDS_PRIOR_WHATSAPP.has('polite_hook3'), 'needs a prior WhatsApp message');

console.log('── tracked link only in the free-text version, LeadFinderOS-style only');
ok(/templateName === POLITE_HOOK3_TEMPLATE\) \{\n\s+const gc = await goCodeFor|tvars\.includes\("go_code"\) \|\| templateName === POLITE_HOOK3_TEMPLATE\) \{\n\s+const gc = await goCodeFor/.test(s), 'send-whatsapp-message makes the lead code (goCodeFor: LeadFinderOS-style only, fail-closed)');
ok(/templateName === HOOK3_TEMPLATE\) \{\n\s+const gc = await goCodeFor\(service, lead\.id/.test(q), 'the queue makes it too');
ok(/politeHook3Body\(polite3Code\)/.test(s) && /hook3Words\(templateExtra\.goCode\)/.test(q), 'both senders build the tracked words');
ok(/templateName !== POLITE_HOOK3_TEMPLATE\) storedBody = initialWithLinkBody/.test(s) && /templateName !== HOOK3_TEMPLATE\) campaignBody = initialWithLinkBody/.test(q), 'the template path never stores the tracked words');
ok(/freeWindowSwap\(campaignPayload, swapWords, mainLastInbound\)/.test(q), 'queue: only a window-open swap carries the code');
const open = inWindowShape({ origin: 'inbox', windowOpen: true, allowClosedText: false, typed: false, version: freeTextVersionOf(payload, politeHook3Body('ab12cd34')) });
ok(open.as === 'text' && open.text === TRACKED, 'window open → free text with the tracked link');
const shut = inWindowShape({ origin: 'inbox', windowOpen: false, allowClosedText: false, typed: false, version: freeTextVersionOf(payload, politeHook3Body('ab12cd34')) });
ok(shut.as === 'template', 'window closed → the Meta template');

console.log('── picker, label, queue, notes');
ok(WHATSAPP_TEMPLATES.some((t) => t.value === 'polite_hook3'), 'in the template picker');
ok(!WA_TEMPLATE_REQS.polite_hook3?.needsUrl && WA_TEMPLATE_REQS.polite_hook3?.needsAudit === false, 'needs no link and no audit');
ok(templateGroupLabel('polite_hook3') === templateGroupLabel('polite_hook2'), 'shown as a follow-up like polite_hook2');
ok(getTemplateSendability('polite_hook3', { shareToken: null }, {}).ok, 'sendable in the picker');
ok(read('src/pages/Inbox.tsx').includes('polite_hook3: \'Polite hook 3'), 'Inbox labels past sends');
const mig = read('supabase/migrations/20261227090000_polite_hook3.sql');
ok(/v_followups text\[\] := array\[[^\]]*'polite_hook3'/.test(mig) && mig.includes('v_reason := public.opener_contact_block(v_id);'), 'queueable as a follow-up; opt-out / Do Not Contact block unchanged');
ok(WHATS_NEW[0]?.id === '2026-11-23-polite-hook-3' || WHATS_NEW.some((w) => w.id === '2026-11-23-polite-hook-3'), "a What's New entry");

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall passed');
