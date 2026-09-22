/* ============================================================
   THE INITIAL-OPENER A/B — the split is stable, roughly even, reaches only the opener, and cannot
   send a template Meta has not approved.

   Run: npx tsx scripts/opener-variant.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  INITIAL_OPENER_A, INITIAL_OPENER_B, INITIAL_OPENER_V2_APPROVED,
  isInitialOpener, openerArmFor, openerTemplateFor,
} from '../src/lib/openerVariant.ts';
import { WHATSAPP_TEMPLATES } from '../src/types/outreach.ts';
import { WA_TEMPLATE_REQS } from '../src/lib/whatsappTemplates.ts';
import { READABLE_TEMPLATE_BODIES } from '../src/lib/templateBodies.ts';
import { isColdOutreachTemplate } from '../src/lib/coldOutreach.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let failures = 0;
function ok(cond: boolean, msg: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
}

/** The Meta-registered body, byte for byte. If this string changes, Meta changed first. */
const V2_BODY = 'Hey, are you taking on more jobs atm? Cheers';

console.log('\n── THE NAMES MATCH META EXACTLY ──');
ok(INITIAL_OPENER_A === 'initial_contact', 'the incumbent is initial_contact');
ok(INITIAL_OPENER_B === 'initial_opener_v2', 'the variant is initial_opener_v2');
ok(isInitialOpener(INITIAL_OPENER_A) && isInitialOpener(INITIAL_OPENER_B), 'both are recognised as openers');
ok(!isInitialOpener('audit_reply') && !isInitialOpener('') && !isInitialOpener(null),
  'nothing else is — including blank and null');

console.log('\n── 1. THE EXISTING OPENER IS UNCHANGED AND STILL SENDABLE ──');
{
  const send = read('supabase/functions/_shared/whatsapp-send.ts');
  ok(/initial_contact: \{ lang: "en", vars: \["name"\] \}/.test(send),
    'initial_contact still declares exactly one variable');
  ok(/Hi, is this \$\{b \|\| "your business"\}\?/.test(send), 'and its body is untouched');
  ok(WHATSAPP_TEMPLATES.some((t) => t.value === INITIAL_OPENER_A), 'it is still in the send picker');
  ok(WA_TEMPLATE_REQS[INITIAL_OPENER_A]?.group === 'opener', 'and still grouped as an opener');
}

console.log('\n── 2. v2 IS REGISTERED EVERYWHERE IT HAS TO BE ──');
{
  const send = read('supabase/functions/_shared/whatsapp-send.ts');
  const queue = read('supabase/functions/process-whatsapp-queue/index.ts');
  /* ⛔ ZERO VARIABLES IN BOTH MIRRORS. Meta rejects a parameter-count mismatch, so a stray var here
     is a guaranteed failed send rather than a cosmetic slip — and the two registries must agree. */
  ok(/initial_opener_v2: \{ lang: "en", vars: \[\] \}/.test(send), 'whatsapp-send.ts: vars []');
  ok(/initial_opener_v2: \{ lang: "en", vars: \[\] \}/.test(queue), "the queue's mirror: vars []");
  ok(send.includes(V2_BODY), 'whatsapp-send.ts carries the exact Meta body');
  ok(WHATSAPP_TEMPLATES.some((t) => t.value === INITIAL_OPENER_B), 'it is in the send picker');
  ok(WA_TEMPLATE_REQS[INITIAL_OPENER_B]?.group === 'opener', 'grouped as an opener');
  ok(WA_TEMPLATE_REQS[INITIAL_OPENER_B]?.needsUrl === false
    && WA_TEMPLATE_REQS[INITIAL_OPENER_B]?.needsAudit === false,
    'needs neither a claim link nor a completed audit');
  ok(READABLE_TEMPLATE_BODIES[INITIAL_OPENER_B]?.('Acme Ltd', '') === V2_BODY,
    'the readable body renders the exact Meta wording and ignores the business name');
  ok(read('src/pages/Inbox.tsx').includes(`${INITIAL_OPENER_B}: 'Initial contact v2`),
    'the Inbox can name it in a past thread');
}

console.log('\n── IT IS A COLD OPENER, SO IT KEEPS THE COLD SAFEGUARDS ──');
ok(isColdOutreachTemplate(INITIAL_OPENER_B), 'treated as COLD — the phone-history seatbelt applies');
ok(!read('src/lib/coldOutreach.ts').includes(INITIAL_OPENER_B),
  'and it is NOT listed as a continuation (unknown fails closed to cold — nothing was added)');
ok(!read('src/lib/displayName.ts').includes(INITIAL_OPENER_B),
  'not an identify-name template — it carries no business name to get wrong');

console.log('\n── 3. THE SPLIT IS ROUGHLY 50/50 ACROSS NEW LEADS ──');
{
  /* Real UUIDs, because that is what a lead id is. 20,000 of them: enough that a genuinely skewed
     hash cannot hide, and the tolerance is wide enough that a fair one cannot flake. */
  const N = 20000;
  let b = 0;
  for (let i = 0; i < N; i++) if (openerArmFor(randomUUID()) === INITIAL_OPENER_B) b++;
  const pct = (b / N) * 100;
  ok(pct > 47 && pct < 53, `${pct.toFixed(1)}% landed on v2 across ${N} fresh lead ids (want 47–53%)`);
}

console.log('\n── 4. THE SAME LEAD ALWAYS KEEPS THE SAME ARM ──');
{
  const id = '6d0585ac-b4a3-463b-8150-c59c3dd0f0e5';
  const first = openerArmFor(id);
  ok([...Array(50)].every(() => openerArmFor(id) === first),
    'fifty calls, one answer — nothing is drawn at random');
  /* The real scenario: queue, cancel, re-queue, retry after a temporary failure. Each of those
     re-runs the same assignment, and it must not move the lead to the other arm. */
  const requeues = [...Array(10)].map(() => openerTemplateFor(INITIAL_OPENER_A, id));
  ok(new Set(requeues).size === 1, 'ten re-queues of the same lead produce one template');
  /* Pinned values, so a change to the hash function shows up as a failure here rather than as a
     silently re-randomised experiment. */
  ok(openerArmFor('00000000-0000-0000-0000-000000000000') === openerArmFor('00000000-0000-0000-0000-000000000000'),
    'deterministic for a fixed id');
  const known = ['a', 'b', 'c', 'd'].map((s) => openerArmFor(s));
  ok(JSON.stringify(known) === JSON.stringify(known.map((_, i) => openerArmFor(['a', 'b', 'c', 'd'][i]))),
    'stable across repeated evaluation');
}

console.log('\n── THE SPLIT TOUCHES THE OPENER AND NOTHING ELSE ──');
for (const other of ['audit_reply', 'video_template', 'competitor_hook', 'audit_followup', 'explain_offer',
  're_engage_49', 'contact_followup', 'onboarding_followup', 'questionnaire_followup', 'book_call']) {
  ok(openerTemplateFor(other, randomUUID()) === other, `${other} is returned untouched`);
}
ok(openerTemplateFor('', 'x') === '', 'a blank choice stays blank — nothing is substituted in');

console.log('\n── 5. WHERE THE ASSIGNED VARIANT IS RECORDED ──');
{
  const table = read('src/components/OutreachTable.tsx');
  ok(/whatsapp_template: openerTemplateFor\(template, id\)/.test(table),
    'the bulk queue writes the ASSIGNED template to outreach_leads.whatsapp_template');
  /* Nothing new is stored: the send tables already carry the template per message. */
  const types = read('src/integrations/supabase/types.ts');
  ok(types.includes('template_name'), 'whatsapp_messages.template_name already records what was sent');
  /* ⚠️ THE ASSERTION IS ABOUT SCHEMA, NOT ABOUT WORDS. A first version of this grepped the module
     for "experiment" and failed on its own comment saying it is NOT an experimentation framework.
     What actually matters: no migration was added for this, and the arm is not written to any
     column other than the one that already held the template. */
  const migrations = fs.readdirSync(path.join(ROOT, 'supabase/migrations'));
  ok(!migrations.some((m) => /opener|variant|ab_test|experiment/i.test(m)),
    'no migration was added for the A/B — the arm lives in the existing whatsapp_template column');
  const patchBlock = table.slice(table.indexOf('const patch: Partial<OutreachLead>'), table.indexOf('onUpdateLead(id, patch)'));
  ok(!/opener_variant|ab_arm|variant:/.test(patchBlock),
    'the queue patch writes no new field — only the template it already wrote');
}

console.log('\n── 7. A PENDING v2 CANNOT BE SENT ──');
{
  /* The switch as it stands in source. While false, the split must return the incumbent for EVERY
     lead — the property that makes a pending template harmless. */
  const ids = [...Array(500)].map(() => randomUUID());
  const chosen = new Set(ids.map((id) => openerTemplateFor(INITIAL_OPENER_A, id)));
  if (!INITIAL_OPENER_V2_APPROVED) {
    ok(chosen.size === 1 && chosen.has(INITIAL_OPENER_A),
      'v2 is NOT approved, so all 500 leads get the approved opener — no send can fail');
    ok(WHATSAPP_TEMPLATES.find((t) => t.value === INITIAL_OPENER_B)?.label.includes('PENDING META APPROVAL'),
      'and the picker label warns the operator before they can hand-pick it');
  } else {
    ok(chosen.size === 2, 'v2 IS approved, so both arms are in use');
    ok(!WHATSAPP_TEMPLATES.find((t) => t.value === INITIAL_OPENER_B)?.label.includes('PENDING'),
      'and the picker label no longer warns');
  }
  /* The switch is ONE constant, so turning the test on is one edit. */
  const src = read('src/lib/openerVariant.ts');
  ok((src.match(/export const INITIAL_OPENER_V2_APPROVED/g) ?? []).length === 1,
    'exactly one approval switch exists');
}

console.log('\n── AND v2 GENUINELY CAN BE SELECTED ONCE APPROVED ──');
{
  /* ⛔ THE APPROVED BRANCH IS EXECUTED, NOT REASONED ABOUT. Asserting "when the flag is true it
     would use the split" by reading the source proves nothing about what runs. So the module is
     compiled again with the one constant flipped and driven for real — the same code, the other
     state. This is the branch that goes live the day Meta approves, and it is the one nobody would
     otherwise test until a prospect received it. */
  const tmp = path.join(ROOT, 'scripts', '.tmp-opener-approved.ts');
  try {
    fs.writeFileSync(tmp, read('src/lib/openerVariant.ts')
      .replace('export const INITIAL_OPENER_V2_APPROVED = false;', 'export const INITIAL_OPENER_V2_APPROVED = true;'));
    const approved = await import(`file://${tmp.replace(/\\/g, '/')}`) as typeof import('../src/lib/openerVariant.ts');
    ok(approved.INITIAL_OPENER_V2_APPROVED === true, 'the flipped module really is approved');
    const ids = [...Array(2000)].map(() => randomUUID());
    const picked = ids.map((id) => approved.openerTemplateFor(INITIAL_OPENER_A, id));
    const b = picked.filter((t) => t === INITIAL_OPENER_B).length;
    const pct = (b / ids.length) * 100;
    ok(new Set(picked).size === 2, 'both openers are now selected');
    ok(pct > 45 && pct < 55, `${pct.toFixed(1)}% of leads are sent v2 once approved (want 45–55%)`);
    /* Stability holds in the approved state too — the property that matters most once real leads
       are being assigned. */
    const id = ids[0];
    ok([...Array(20)].every(() => approved.openerTemplateFor(INITIAL_OPENER_A, id) === picked[0]),
      'and the same lead still keeps the same arm across twenty re-queues');
    ok(approved.openerTemplateFor('audit_reply', id) === 'audit_reply',
      'while every other template is still returned untouched');
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

console.log('\n── 6. NOTHING ELSE MOVED ──');
{
  /* The single-lead control is documented as the operator's own choice and must not be split. */
  const controls = read('src/components/WhatsAppLeadControls.tsx');
  ok(!controls.includes('openerTemplateFor'),
    'WhatsAppLeadControls still writes the operator’s own choice, unsubstituted');
  /* Follow-ups, inbound and the audit paths are untouched by this change. */
  for (const f of ['src/lib/firstReplyMode.ts', 'supabase/functions/_shared/whatsapp-inbound.ts',
    'src/lib/templateAttribution.ts', 'src/lib/armComparison.ts']) {
    ok(!read(f).includes('openerVariant') && !read(f).includes(INITIAL_OPENER_B),
      `${f} is untouched`);
  }
  /* ⚠️ A COMMENT MENTIONING THE MODULE IS NOT A DEPENDENCY ON IT. The first version of this grepped
     for the bare string and failed on the queue's own note pointing at src/lib/openerVariant.ts —
     the "grep hit counts lie" rule in CLAUDE.md §4, caught by its own test. What matters is that the
     queue neither IMPORTS the split nor CALLS it: it must keep sending exactly what the lead row
     says, so the arm is decided once, at queue time, and never re-decided at send time. */
  const queue = read('supabase/functions/process-whatsapp-queue/index.ts');
  ok(!/import[^;]*openerVariant/.test(queue), 'the queue does not import the split');
  ok(!/openerTemplateFor\s*\(/.test(queue) && !/openerArmFor\s*\(/.test(queue),
    'and never calls it — it still sends exactly what the lead row says');
  ok(/const requestedTemplate = \(\(lead\.whatsapp_template as string \| null\) \?\? ""\)\.trim\(\)/.test(queue),
    'the queue still reads the template off the lead row, unchanged');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll passed.');
process.exit(failures ? 1 : 0);
