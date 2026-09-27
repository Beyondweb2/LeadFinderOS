/* ============================================================
   CHOOSE A TEMPLATE → SEND. NO SELECTED OPENER, NO SPLIT (Paul, 2026-09-27).

   Replaces the 2026-09-23 "one selected opener" suite. Pins:
     · both approved openers (initial_contact, initial_opener_v2) are ordinary templates in every
       picker — neither blocks the other, and nothing reads a global selection;
     · no hidden deterministic choice (no hash, no alternation, no substitution) anywhere;
     · the send path refuses nothing for "not selected" (opener_not_selected is gone), and the build
       marker says so;
     · the old setter is refused explicitly and writes nothing;
     · bulk initial outreach stores THE TEMPLATE CHOSEN FOR THE BATCH on each lead — the admin's
       queue write and the salesperson's sales_queue_opener both — and the queue sends that exact
       stored value;
     · the Meta approval gate, the cold-outreach phone-history rule and duplicate protection stay;
     · audit_followup's Google AI waiver (Paul's approval, 2026-09-27) is unchanged.

   Run: npx tsx scripts/initial-opener-select.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import * as OV from '../src/lib/openerVariant.ts';
import { INITIAL_OPENER_A, INITIAL_OPENER_B, INITIAL_OPENERS, isInitialOpener, openerApproved } from '../src/lib/openerVariant.ts';
import { WHATSAPP_TEMPLATES } from '../src/types/outreach.ts';
import { getTemplateSendability } from '../src/lib/whatsappTemplates.ts';
import { isColdOutreachTemplate } from '../src/lib/coldOutreach.ts';
import { TEMPLATE_ENGINE_CLAIM_WAIVED, templateEngineConflict } from '../src/lib/rivalHook.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const exists = (p: string) => fs.existsSync(path.join(ROOT, p));
let failures = 0;
function ok(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; }
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const walk = (dir: string, out: string[] = []) => {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
};
const code = [...walk('src'), ...walk('supabase/functions')];

console.log('\n── both openers are ordinary, approved choices ──');
ok(INITIAL_OPENER_A === 'initial_contact' && INITIAL_OPENER_B === 'initial_opener_v2', 'names match Meta exactly');
ok(INITIAL_OPENERS.every((o) => isInitialOpener(o)) && !isInitialOpener('audit_reply'), 'only those two are openers');
ok(INITIAL_OPENERS.every((o) => openerApproved(o)), 'both are approved at Meta');
ok(INITIAL_OPENERS.every((o) => WHATSAPP_TEMPLATES.some((t) => t.value === o)), 'both are in the one sendable list');
ok(INITIAL_OPENERS.every((o) => getTemplateSendability(o, { shareToken: null }, {}).ok), 'both are sendable from every picker, with no selection passed');
ok(getTemplateSendability.length <= 3, 'getTemplateSendability takes no "selected opener" argument any more');
ok(INITIAL_OPENERS.every((o) => isColdOutreachTemplate(o)), 'both are still COLD templates (the phone-history rule still applies)');

console.log('\n── no global selection, no split, anywhere ──');
ok(!('openerSendability' in OV) && !('resolveSelectedOpener' in OV) && !('DEFAULT_INITIAL_OPENER' in OV), 'the selection rule is gone from the leaf');
ok(!exists('src/hooks/useSelectedOpener.ts') && !exists('supabase/functions/_shared/initial-opener.ts'), 'the selection reader (SPA hook + edge helper) is deleted');
const readers = code.filter((p) => /\binitial_opener_template\b/.test(strip(read(p))));
ok(readers.length === 0, `no code reads the stored selection (${readers.join(', ') || 'none'})`);
const hashers = code.filter((p) => /openerTemplateFor|openerVariantFor|opener_arm/.test(strip(read(p))));
ok(hashers.length === 0, 'no deterministic opener split survives (no openerTemplateFor / arm)');
const uiRefs = code.filter((p) => /Initial outreach template/.test(strip(read(p))));
ok(uiRefs.length === 0, `no "Initial outreach template" control in any screen (${uiRefs.join(', ') || 'none'})`);

console.log('\n── the send path ──');
const sender = read('supabase/functions/send-whatsapp-message/index.ts');
ok(!/opener_not_selected|openerRefusal/.test(strip(sender)), 'send-whatsapp-message has no "not the selected opener" refusal');
ok((sender.match(/BUILD_ID = "(\d{4}-\d{2}-\d{2}[a-z])"/)?.[1] ?? '') >= '2026-09-27c' && /"any_approved_opener"/.test(sender) && !/"selected_opener"/.test(sender), 'the sender build marker was bumped with the change');
ok(/templateAwaitingApproval/.test(read('supabase/functions/_shared/whatsapp-send.ts')), 'the Meta approval gate is still on the send side');

console.log('\n── the old setter is refused and writes nothing ──');
const q = read('supabase/functions/process-whatsapp-queue/index.ts');
const setAt = q.indexOf('if (mode === "set_initial_opener_template")');
const setter = q.slice(setAt, q.indexOf('\n    }\n', setAt));
ok(setAt > 0 && /error: "mode_removed"/.test(setter) && /410\)/.test(setter), 'set_initial_opener_template answers mode_removed (410)');
ok(!/\.update\(|sendViaGraph|fetch\(/.test(setter), '…and touches nothing');
ok(!/initialOpenerTemplate/.test(strip(q)), 'the queue status no longer reports a selected opener');

console.log('\n── bulk: the template chosen for the batch is the template stored and sent ──');
const table = strip(read('src/components/OutreachTable.tsx'));
ok(/whatsapp_template: template,/.test(table), "the admin's queue write stores the dialog's template as chosen");
ok(/if \(!perms\.queueControls\) \{ await handleSalesQueue\(template\); return; \}/.test(table) && /salesQueueOpener\(ids, template\)/.test(table), "a salesperson's batch goes to sales_queue_opener with the chosen template");
ok(/disabled=\{(!listComplete \|\| )?!queueTemplate \|\| openerBlocked\(queueTemplate\)\}/.test(table), 'nothing is queued until a template is chosen (no default)');
const mig = read('supabase/migrations/20260927140000_sales_shared_workflow.sql');
const two = mig.slice(mig.indexOf('create or replace function public.sales_queue_opener(_lead_ids uuid[], _template text)'), mig.indexOf('revoke all on function public.sales_queue_opener(uuid[], text)'));
ok(two.length > 0 && /v_template text := btrim\(coalesce\(_template, ''\)\);/.test(two), 'sales_queue_opener takes the template as an argument');
ok(!/initial_opener_template/.test(two), '…and never reads a stored selection');
ok(/if v_template not in \('initial_contact', 'initial_opener_v2'\)/.test(two) && /'template_required'/.test(two), '…refuses a blank or non-opener template');
ok(/whatsapp_template = v_template/.test(two), '…stores exactly that template on each lead');
for (const guard of ["'not_yours'", "'archived'", "'client'", "'not_new'", "'already_contacted'", "'not_a_uk_mobile'", "'opted_out'", "'daily_limit'"]) {
  ok(two.includes(guard), `…keeps the ${guard} check`);
}
const oneAt = mig.indexOf('create or replace function public.sales_queue_opener(_lead_ids uuid[])\n');
const one = mig.slice(oneAt, mig.indexOf('$$;', oneAt));
ok(/'template_required'/.test(one) && !/initial_opener_template/.test(one) && !/update public\.outreach_leads/.test(one), 'the old one-argument form refuses and writes nothing');
ok(/never swaps it/.test(read('src/lib/openerVariant.ts')), 'the leaf still states the queue sends what was stored');
const drip = strip(q);
ok(!/whatsapp_template\s*=\s*INITIAL_OPENER|whatsapp_template:\s*INITIAL_OPENER/.test(drip), 'the queue never rewrites a lead to an opener of its own choosing');

console.log('\n── the per-lead picker and the Inbox ──');
const controls = strip(read('src/components/WhatsAppLeadControls.tsx'));
ok(!/useSelectedOpener|openerSendability/.test(controls) && /salesQueueOpener\(\[lead\.id\], template\)/.test(controls), 'the per-lead control offers both openers and queues the chosen one');
const inbox = strip(read('src/pages/Inbox.tsx'));
ok(!/useSelectedOpener|selectedOpener/.test(inbox), 'the Inbox composer passes no selection');

console.log('\n── audit_followup: Google AI hooks still allowed (unchanged) ──');
ok(templateEngineConflict('audit_followup', 'gemini') === null, 'audit_followup may carry a Google AI hook');
ok(templateEngineConflict('audit_followup', 'chatgpt') === null, '…and a ChatGPT one');
ok(TEMPLATE_ENGINE_CLAIM_WAIVED.size === 1 && TEMPLATE_ENGINE_CLAIM_WAIVED.has('audit_followup'), 'the waiver still names audit_followup and nothing else');

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log('\nALL PASS');
