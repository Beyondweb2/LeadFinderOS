/* ============================================================
   THE INITIAL OPENER IS ONE SELECTED TEMPLATE — NO 50/50 SPLIT (2026-09-23).

   Replaces opener-variant.test.ts (which tested the lead-id hash split, now deleted). Pins: the
   original opener is selected; every new lead gets exactly the selected one; nothing alternates; the
   newer opener is kept but unsendable while unselected; the queue sends what was stored (retries and
   delays cannot switch it); Outreach, the per-lead picker and the Inbox share one rule; an
   unavailable selection fails closed instead of falling back; changing or reading the setting sends
   nothing; sent history is untouched.

   Run: npx tsx scripts/initial-opener-select.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_INITIAL_OPENER, INITIAL_OPENER_A, INITIAL_OPENER_B, INITIAL_OPENERS,
  isInitialOpener, openerSelectable, openerSendability, resolveSelectedOpener,
} from '../src/lib/openerVariant.ts';
import { WHATSAPP_TEMPLATES } from '../src/types/outreach.ts';
import { WA_TEMPLATE_REQS, getTemplateSendability } from '../src/lib/whatsappTemplates.ts';
import { READABLE_TEMPLATE_BODIES } from '../src/lib/templateBodies.ts';
import { isColdOutreachTemplate } from '../src/lib/coldOutreach.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let failures = 0;
function ok(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; }
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const V2_BODY = 'Hey, are you taking on more jobs atm? Cheers';
/** What the Outreach queue stores for one lead, given the dialog's choice and the stored selection —
 *  the exact two lines of handleQueueForWhatsApp (asserted against the source below). */
const queueFor = (template: string, selected: string | null | undefined) =>
  openerSendability(template, selected).ok ? template : null;

console.log('\n── THE TWO OPENERS (names match Meta exactly) ──');
ok(INITIAL_OPENER_A === 'initial_contact' && INITIAL_OPENER_B === 'initial_opener_v2', 'original = initial_contact, newer = initial_opener_v2');
ok(isInitialOpener(INITIAL_OPENER_A) && isInitialOpener(INITIAL_OPENER_B) && !isInitialOpener('audit_reply') && !isInitialOpener(null), 'only those two are openers');

console.log('\n── 1. THE ORIGINAL OPENER IS SELECTED ──');
{
  ok(DEFAULT_INITIAL_OPENER === INITIAL_OPENER_A, '1. the default is the original');
  ok(resolveSelectedOpener(null).template === INITIAL_OPENER_A && resolveSelectedOpener('initial_contact').template === INITIAL_OPENER_A, '1. nothing stored or "initial_contact" stored → the original');
  const mig = fs.readdirSync(path.join(ROOT, 'supabase/migrations')).find((m) => /initial_opener_template/.test(m));
  ok(!!mig && /add column if not exists initial_opener_template text default 'initial_contact'/i.test(read(`supabase/migrations/${mig}`)), `1. the column defaults to the original (${mig})`);
}

console.log('\n── 2/3/4. EVERY NEW LEAD GETS THE SELECTED OPENER, NOTHING ALTERNATES ──');
{
  const ids = [...Array(100)].map(() => randomUUID());
  const picked = ids.map(() => queueFor(INITIAL_OPENER_A, 'initial_contact'));
  ok(picked.every((t) => t === INITIAL_OPENER_A), '2/3. 100 new leads queued with the original → 100 × initial_contact');
  ok(ids.every(() => queueFor(INITIAL_OPENER_B, 'initial_contact') === null), '4. the newer opener is never queued while the original is selected');
  const lib = strip(read('src/lib/openerVariant.ts'));
  ok(!/Math\.random|fnv1a|hash|openerArmFor|openerTemplateFor|% 2|& 1/.test(lib), '3. no coin flip, hash or alternation left in the opener rule');
  const table = read('src/components/OutreachTable.tsx');
  ok(/whatsapp_template: template,\n/.test(table) && !/openerTemplateFor/.test(table), '2. the queue dialog stores the chosen template exactly — no substitute');
  ok(/const openerCheck = openerSendability\(template, opener\.selected\);\n\s+if \(!openerCheck\.ok\) \{ toast\(/.test(table), '2/4. …and refuses an opener that is not the selected one before queueing anything');
  for (const f of ['src/components/OutreachTable.tsx', 'src/components/WhatsAppLeadControls.tsx', 'src/pages/Inbox.tsx', 'supabase/functions/process-whatsapp-queue/index.ts', 'supabase/functions/send-whatsapp-message/index.ts']) {
    ok(!/openerArmFor|openerTemplateFor|INITIAL_OPENER_B\b/.test(strip(read(f))), `3. ${f} has no opener split or hard-coded v2 branch`);
  }
}

console.log('\n── 5. THE NEWER OPENER IS KEPT ──');
{
  ok(WHATSAPP_TEMPLATES.some((t) => t.value === INITIAL_OPENER_B) && WA_TEMPLATE_REQS[INITIAL_OPENER_B]?.group === 'opener', '5. still in the template list, grouped as an opener');
  ok(/initial_opener_v2: \{ lang: "en", vars: \[\] \}/.test(read('supabase/functions/_shared/whatsapp-send.ts')) && /initial_opener_v2: \{ lang: "en", vars: \[\] \}/.test(read('supabase/functions/process-whatsapp-queue/index.ts')), '5. still registered in both sender registries');
  ok(READABLE_TEMPLATE_BODIES[INITIAL_OPENER_B]?.('Acme', '') === V2_BODY, '5. its Meta body still renders (past threads read correctly)');
  ok(openerSelectable(INITIAL_OPENER_B), '5. it can be selected later');
  ok(queueFor(INITIAL_OPENER_B, 'initial_opener_v2') === INITIAL_OPENER_B && queueFor(INITIAL_OPENER_A, 'initial_opener_v2') === null, '5/9. if Paul selects it, it — and only it — is queued');
  ok(isColdOutreachTemplate(INITIAL_OPENER_B) && isColdOutreachTemplate(INITIAL_OPENER_A), 'both keep the cold-outreach safeguards');
}

console.log('\n── 6/7. RETRIES, DELAYS AND THE QUEUE NEVER SWITCH A STORED TEMPLATE ──');
{
  const queue = read('supabase/functions/process-whatsapp-queue/index.ts');
  ok(/const requestedTemplate = \(\(lead\.whatsapp_template as string \| null\) \?\? ""\)\.trim\(\);/.test(queue), '7. the queue sends the template stored on the lead row');
  ok(/let templateName = requestedTemplate;/.test(queue), '7. …exactly as stored');
  const send = queue.slice(queue.indexOf('const requestedTemplate'), queue.indexOf('let templateName = requestedTemplate;'));
  ok(!/openerSendability|readSelectedOpener|initial_opener_template/.test(send), '6/7. the send path never re-reads the selection — changing it cannot switch a queued lead');
  ok(/error: "unknown_template"/.test(send) && /Nothing else was sent in its place/.test(send), '11. an unregistered stored template is refused, never substituted');
  const lib = read('src/lib/openerVariant.ts');
  ok(/AN ASSIGNMENT IS FROZEN AT QUEUE TIME/.test(lib), '6. the rule is written where the next reader will look');
}

console.log('\n── 8. ONE RULE: OUTREACH, THE PER-LEAD PICKER AND THE INBOX ──');
{
  ok(/const opener = openerSendability\(template, opts\.selectedOpener\);\n\s+if \(!opener\.ok\) return opener;/.test(read('src/lib/whatsappTemplates.ts')), '8. getTemplateSendability applies openerSendability first');
  const inbox = read('src/pages/Inbox.tsx');
  ok(/\{ selectedOpener: selectedOpener\.selected \}\);/.test(inbox) && /const selectedOpener = useSelectedOpener\(\);/.test(inbox), '8. the Inbox composer passes the selected opener into getTemplateSendability');
  ok(/openerSendability\(t\.value, opener\.selected\)/.test(read('src/components/WhatsAppLeadControls.tsx')), '8. the per-lead picker disables a non-selected opener');
  ok(/const o = openerSendability\(t\.value, opener\.selected\);/.test(read('src/components/OutreachTable.tsx')), '8. the Outreach queue dialog disables a non-selected opener');
  const sender = read('supabase/functions/send-whatsapp-message/index.ts');
  ok(/const notSelected = await openerRefusal\(service, templateName\);\n\s+if \(notSelected\) return json\(\{ ok: false, error: "opener_not_selected"/.test(sender), '8. send-whatsapp-message refuses a non-selected opener on the server');
  ok(sender.indexOf('openerRefusal(service, templateName)') < sender.lastIndexOf('sendViaGraph(') && sender.indexOf('openerRefusal(service, templateName)') < sender.indexOf('mode: "dry_run",'), '8. …before the prospect send reaches Meta, and before the dry-run return (a preview reports it too)');
  /* A later build (2026-09-25a, ai_site_findings_v2 approved) supersedes 23b; what matters is that
     the marker is at or after the build that shipped this refusal, and names the capability. */
  ok((sender.match(/BUILD_ID = "(\d{4}-\d{2}-\d{2}[a-z])"/)?.[1] ?? '') >= '2026-09-23b' && /"selected_opener"/.test(sender), 'the sender build marker was bumped with the change');
  ok(getTemplateSendability(INITIAL_OPENER_A, { shareToken: null }, {}, { selectedOpener: 'initial_contact' }).ok, '8. selected original → sendable');
  ok(!getTemplateSendability(INITIAL_OPENER_B, { shareToken: null }, {}, { selectedOpener: 'initial_contact' }).ok, '8. unselected v2 → refused');
  ok(getTemplateSendability('audit_reply', { shareToken: null }, { reportSlug: 'x' }, {}).ok, '8. a non-opener ignores the rule entirely');
  ok(getTemplateSendability('contact_followup', { shareToken: null }, {}).ok, '8. follow-ups are unchanged');
}

console.log('\n── 9. CHANGING THE SELECTION CHANGES FUTURE SENDS ONLY ──');
{
  ok(queueFor(INITIAL_OPENER_A, 'initial_contact') === 'initial_contact' && queueFor(INITIAL_OPENER_B, 'initial_opener_v2') === 'initial_opener_v2', '9. the next queueing follows the new selection');
  const q = read('supabase/functions/process-whatsapp-queue/index.ts');
  const setter = q.slice(q.indexOf('if (mode === "set_initial_opener_template")'), q.indexOf('/* ══ mode \'contact_check\''));
  ok(/\.update\(\{ initial_opener_template: raw, updated_at: new Date\(\)\.toISOString\(\) \}\)\s*\n\s*\.eq\("id", 1\)/.test(setter), '9. the setter writes only the settings row');
  ok(!/outreach_leads|whatsapp_messages|whatsapp_sends/.test(setter), '9/10. …and touches no lead, no queued row and no sent message');
}

console.log('\n── 10. PREVIOUSLY SENT MESSAGES ARE UNTOUCHED ──');
{
  const changed = ['src/lib/openerVariant.ts', 'supabase/functions/_shared/initial-opener.ts', 'src/hooks/useSelectedOpener.ts'].map(read).join('\n');
  ok(!/whatsapp_messages|whatsapp_sends/.test(strip(changed)), '10. the new rule reads and writes no message table');
  ok(!/\.update\(|\.delete\(|\.insert\(/.test(strip(read('supabase/functions/_shared/initial-opener.ts'))), '10. the shared reader only reads');
}

console.log('\n── 11. AN UNAVAILABLE SELECTION FAILS CLOSED — NEVER THE OTHER OPENER ──');
{
  for (const bad of ['initial_opener_v3', 'audit_reply', 'garbage']) {
    const r = resolveSelectedOpener(bad);
    ok(!r.ok && r.template === null, `11. stored "${bad}" → unavailable, no template substituted`);
    ok(INITIAL_OPENERS.every((o) => !openerSendability(o, bad).ok), `11. …and NEITHER opener is sendable`);
  }
  ok(INITIAL_OPENERS.every((o) => !openerSendability(o, undefined).ok), '11. selection not readable (undefined) → no opener is sendable');
  ok(!getTemplateSendability(INITIAL_OPENER_A, { shareToken: null }, {}).ok, '11. a caller that never read the selection cannot send an opener');
  const reader = read('supabase/functions/_shared/initial-opener.ts');
  ok(/if \(error \|\| !data\) return undefined;/.test(reader) && /catch \{\n\s+return undefined;/.test(reader), '11. a failed read on the server is "unknown" (refuse), never the default');
  const q = read('supabase/functions/process-whatsapp-queue/index.ts');
  ok(/if \(!openerSelectable\(raw\) \|\| templateAwaitingApproval\(raw\)\) return json\(\{ ok: false, error: "template_not_approved"/.test(q), '11. an unapproved opener cannot be selected');
  ok(/if \(!isInitialOpener\(raw\) \|\| !WA_TEMPLATES\[raw\]\) return json\(\{ ok: false, error: "not_an_initial_opener"/.test(q), '11. a non-opener cannot be selected');
}

console.log('\n── 12. READING OR CHANGING THE SETTING SENDS NOTHING ──');
{
  const q = read('supabase/functions/process-whatsapp-queue/index.ts');
  const setterAt = q.indexOf('if (mode === "set_initial_opener_template")');
  const statusAt = q.indexOf('if (mode === "status") return json(');
  const firstSend = q.indexOf('sendViaGraph(', setterAt);
  ok(statusAt > 0 && setterAt > statusAt && firstSend > setterAt, '12. "status" and the setter both return before any send code');
  const setter = q.slice(setterAt, q.indexOf('/* ══ mode \'contact_check\''));
  ok(/return json\(\{ ok: true, \.\.\.statusPayload, initialOpenerTemplate: raw \}\);/.test(setter) && !/sendViaGraph|fetch\(/.test(setter), '12. the setter returns without sending');
  const hook = read('src/hooks/useSelectedOpener.ts');
  ok(/mode: 'status'/.test(hook) && /mode: 'set_initial_opener_template'/.test(hook) && !/mode: 'tick'|mode: 'auto_replies'/.test(hook), '12. the UI only ever calls "status" and the setter');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll passed.');
process.exit(failures ? 1 : 0);
