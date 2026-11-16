/* ============================================================
   polite_hook + polite_hook2 — short follow-ups to a web developer who has replied, NO variables (Paul, 2026-11-16).
   Set up exactly like webdev_hook.

   Pins, for each: the exact body in BOTH body tables (sent == shown), zero variables in BOTH sender registries, a FOLLOW-UP
   (continuation + NEEDS_PRIOR_WHATSAPP at both senders), Meta's LIVE status read first at both senders, in the picker (no link,
   no audit needed), labelled in the Inbox, "Put in message box" / in-window free text gets the whole wording.

   Run: npx tsx scripts/polite-hook-templates.test.ts
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
import { POLITE_HOOK_TEMPLATE, POLITE_HOOK2_TEMPLATE } from '../src/lib/webdevReport.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

/* As approved in Meta (Paul's text, 2026-11-16). */
const CASES: Array<{ name: string; constant: string; label: string; body: string }> = [
  {
    name: 'polite_hook',
    constant: POLITE_HOOK_TEMPLATE,
    label: "polite_hook: 'Polite hook",
    body: `Ah nice, this actually might be useful to you then, built it myself

https://leadfinderos.com

All the best
Paul✌️`,
  },
  {
    name: 'polite_hook2',
    constant: POLITE_HOOK2_TEMPLATE,
    label: "polite_hook2: 'Polite hook 2",
    body: `Ah nice, I'm actually a web dev myself

Thought this might be useful for you. It runs AI visibility audits on any business so you can show them they're not coming up when people search on AI.

Going in with that angle has worked really well for me

https://leadfinderos.com

Paul✌️`,
  },
];

const q = read('supabase/functions/process-whatsapp-queue/index.ts');
const s = read('supabase/functions/send-whatsapp-message/index.ts');
const inbox = read('src/pages/Inbox.tsx');

for (const { name: NAME, constant, label, body: BODY } of CASES) {
  console.log(`\n── ${NAME}`);
  ok(constant === NAME, 'the constant is the Meta name exactly');
  ok(WA_TEMPLATES[NAME]?.lang === 'en', 'sender registry: English');
  ok(JSON.stringify(WA_TEMPLATES[NAME]?.vars) === '[]', 'sender registry: zero variables');
  ok(new RegExp(`\\n {2}${NAME}: \\{ lang: "en", vars: \\[\\] \\},`).test(q), 'queue mirror: zero variables');
  ok(new RegExp(`META_STATUS_GATED[^\\n]*"${NAME}"`).test(q), "queue reads Meta's live status first");
  ok(s.includes(`templateName === "${NAME}"`) && s.includes('templateAvailability(service, templateName)'), "Inbox sender reads Meta's live status first");

  ok(WA_TEMPLATE_BODIES[NAME]?.('Acme Web Design', '') === BODY, 'sent body is the registered text, byte for byte');
  ok(renderTemplateBody(NAME, 'Acme Web Design', '') === BODY, 'renderTemplateBody: nothing inserted');
  ok(readableTemplateBody(null, NAME, { businessName: 'Acme Web Design', sentAt: new Date().toISOString() }) === BODY, 'shown body === sent body');
  const ftv = freeTextVersionOf({ template: { components: [] } }, renderTemplateBody(NAME, 'Acme Web Design', ''));
  ok(ftv.ok && ftv.text === BODY && !ftv.videoUrl, '"Put in message box" / in-window free text gets the full wording');

  ok(!isInitialOpener(NAME), 'NOT an opener');
  ok(!isColdOutreachTemplate(NAME), 'a continuation');
  ok(NEEDS_PRIOR_WHATSAPP.has(NAME), 'never a first touch: needs a prior WhatsApp message (both senders read this set)');
  ok(!isServiceTemplate(NAME), 'marketing: an opt-out blocks it');

  ok(WHATSAPP_TEMPLATES.some((t) => t.value === NAME), 'in the template picker (Outreach and Inbox share it)');
  ok(!WA_TEMPLATE_REQS[NAME]?.needsUrl && WA_TEMPLATE_REQS[NAME]?.needsAudit === false, 'needs no link and no audit');
  ok(getTemplateSendability(NAME, { shareToken: null }, {}).ok, 'sendable in the picker');
  ok(inbox.includes(label), 'Inbox labels past sends');
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall passed');
