/* ════════════════════════════════════════════════════════════════════════════════════════════════
   A REGISTERED TEMPLATE IS NOT A SENDABLE ONE — the server-side approval gate (2026-09-23).

   🔴 THE HOLE THIS CLOSES, FOUND WHILE VERIFYING THE DEPLOY. AI_SITE_FINDINGS_V2_APPROVED was read in
   exactly one place — getTemplateSendability, which the Inbox's MANUAL picker calls. Two things did
   not call it:
     · the Inbox's AUTO-SEND dropdown, which lists every entry in WHATSAPP_TEMPLATES;
     · the queue's set_first_reply_template / set_audit_complete_template, which validated only that
       the name existed in WA_TEMPLATES.
   Before this deploy the template was not registered, so the setting was refused as unknown_template.
   Registering it removed that refusal, and one click in the dropdown would then have had the queue
   auto-send an unapproved template to every lead that replied — each send failing at Meta in front
   of a real prospect. Nothing had been configured that way; the live setting was audit_followup.

   ⛔ SO THE GATE NOW LIVES AT THE ONE DOOR EVERY SEND WALKS THROUGH — claimTemplatePayload — and the
   two auto-send settings refuse the name at the moment it is chosen. This file drives both for real.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import {
  WA_TEMPLATES,
  claimTemplatePayload,
  templateAwaitingApproval,
} from '../supabase/functions/_shared/whatsapp-send.ts';
import { AI_SITE_FINDINGS_V2, AI_SITE_FINDINGS_V2_APPROVED } from '../src/lib/siteFindings.ts';
import { STALE_OFFER_TEMPLATES } from '../src/lib/findableOffer.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/* Every variable the templates below declare, filled with a value that passes — so a refusal below
   can only be the APPROVAL gate, never a missing-variable hold wearing its clothes. */
const FULL = {
  trade: 'locksmith', town: 'Wisbech', rivals: ['A1 Locks', 'Fenland Security', 'Key Masters'],
  competitors: 'A1 Locks, Fenland Security and Key Masters', auditUrl: 'https://findable.live/r/abc123',
  siteFault: 'x', siteFindings: 'One thing that stood out is your sitemap is pointing at a different web address. It can give conflicting information.',
};

console.log('── 1. THE SWITCH IS ON — APPROVED AT META 2026-09-25 ──');
ok(AI_SITE_FINDINGS_V2_APPROVED === true, 'AI_SITE_FINDINGS_V2_APPROVED is true');
ok(AI_SITE_FINDINGS_V2 in WA_TEMPLATES, 'the template IS registered');

console.log('── 2. THE ONE DOOR NOW BUILDS IT ──');
ok(templateAwaitingApproval(AI_SITE_FINDINGS_V2) === false, 'the approved template is no longer awaiting approval');
let built: unknown = null;
try {
  built = claimTemplatePayload(AI_SITE_FINDINGS_V2, WA_TEMPLATES[AI_SITE_FINDINGS_V2].lang, 'MC Locksmiths', '', FULL);
} catch (e) { built = (e as Error).message; }
ok(typeof built === 'object' && built !== null && (built as { type?: string }).type === 'template',
  `its payload builds (got ${typeof built === 'string' ? built : 'a payload'})`);

console.log('── 3. NOTHING ELSE IS TOUCHED ──');
/* 🔴 THE REGRESSION THAT WOULD MATTER MOST. Every live template must build exactly as it did. */
/* The ONLY other deliberate holds: templates whose Meta body quotes a retired offer (2026-09-23). */
for (const t of STALE_OFFER_TEMPLATES) {
  ok(t in WA_TEMPLATES && templateAwaitingApproval(t), `${t}: held — its registered body quotes the retired £29.99 offer`);
  let msg = '';
  try { claimTemplatePayload(t, WA_TEMPLATES[t].lang, 'MC Locksmiths', 'https://findable.live/onboarding/x', FULL); } catch (e) { msg = (e as Error).message; }
  ok(msg.startsWith('unsafe_template_var:template_not_approved:'), `${t}: refused at the one door with the readable-hold prefix`);
}
const others = Object.keys(WA_TEMPLATES).filter((t) => t !== AI_SITE_FINDINGS_V2 && !STALE_OFFER_TEMPLATES.has(t));
ok(others.length >= 10, `${others.length} other registered templates checked`);
ok(others.every((t) => templateAwaitingApproval(t) === false), 'NO other registered template is held by the approval gate');
for (const t of ['initial_opener_v2', 'audit_followup_fault', 'audit_followup', 'audit_reply']) {
  if (!WA_TEMPLATES[t]) { ok(false, `${t} is registered`); continue; }
  ok(!templateAwaitingApproval(t), `${t}: not held by the approval gate`);
}
/* And the approved siblings still BUILD — the gate is not a change to how payloads are made. */
let opener: unknown = null;
try { opener = claimTemplatePayload('initial_opener_v2', WA_TEMPLATES.initial_opener_v2.lang, 'MC Locksmiths', '', { contactName: 'Mark' }); }
catch (e) { opener = (e as Error).message; }
ok(typeof opener === 'object' && opener !== null && (opener as { type?: string }).type === 'template',
  'initial_opener_v2 still builds its payload exactly as before');
let fault: unknown = null;
try { fault = claimTemplatePayload('audit_followup_fault', WA_TEMPLATES.audit_followup_fault.lang, 'MC Locksmiths', '', FULL); }
catch (e) { fault = (e as Error).message; }
ok(typeof fault === 'object' && fault !== null, 'audit_followup_fault (its approved sibling) still builds');
ok(!templateAwaitingApproval('not_a_real_template'), 'an unknown name is not "awaiting approval" — unknown_template stays its own refusal');

console.log('── 4. THE AUTO-SEND SETTINGS REFUSE IT WHEN IT IS CHOSEN ──');
/* The queue's handler needs a database to drive end to end, so these are source guards on the exact
   lines — but on the CALL, not on a comment: the check is that each setting's handler invokes the
   shared rule between its unknown_template check and its database write. */
const queue = read('supabase/functions/process-whatsapp-queue/index.ts');
for (const mode of ['set_first_reply_template', 'set_audit_complete_template']) {
  const at = queue.indexOf(`if (mode === "${mode}")`);
  ok(at > 0, `${mode}: handler found`);
  const block = queue.slice(at, queue.indexOf('return json({ ok: true', at));
  const unknownAt = block.indexOf('unknown_template');
  const gateAt = block.indexOf('templateAwaitingApproval(next)');
  const writeAt = block.indexOf('.update(');
  ok(gateAt > 0, `${mode}: calls templateAwaitingApproval`);
  ok(unknownAt > 0 && gateAt > unknownAt && gateAt < writeAt,
    `${mode}: the approval refusal sits AFTER the unknown check and BEFORE the database write`);
  ok(/template_not_approved/.test(block), `${mode}: refuses with template_not_approved`);
}
ok(/import \{[^}]*\btemplateAwaitingApproval\b[^}]*\} from "\.\.\/_shared\/whatsapp-send\.ts"/.test(queue),
  'the queue imports the SHARED rule, not a copy of it');

console.log('── 5. ONE RULE, ONE PLACE ──');
/* ⛔ No sender may re-derive "is this approved" itself. A second copy is how the manual picker and
   the auto-send dropdown came to disagree in the first place. */
const send = read('supabase/functions/_shared/whatsapp-send.ts');
ok((send.match(/AI_SITE_FINDINGS_V2_APPROVED/g) ?? []).filter(Boolean).length >= 1, 'whatsapp-send.ts reads the switch');
ok(/export function templateAwaitingApproval/.test(send), '…through one exported rule');
for (const fn of ['process-whatsapp-queue', 'send-whatsapp-message', 'stripe-webhook']) {
  const src = read(`supabase/functions/${fn}/index.ts`).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok(!/AI_SITE_FINDINGS_V2_APPROVED/.test(src), `${fn}: does not read the switch directly (it asks the shared rule)`);
}

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILED`);
if (f) process.exit(1);
