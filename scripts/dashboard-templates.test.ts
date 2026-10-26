/* The admin dashboard's six Meta templates (Paul, 2026-10-26): src/lib/dashboardTemplates.ts and their wiring into the
   sender. Pure + source checks; nothing is sent. Run: npx tsx scripts/dashboard-templates.test.ts */
import { readFileSync } from 'node:fs';
import {
  DASHBOARD_TEMPLATES, DASHBOARD_TEMPLATE_NAMES, cleanNeededItem, dashboardGreeting, dashboardTemplateState, dashboardTemplateTranscript,
  isDashboardTemplate, neededItemFromTranscript, RETRY_AFTER_MS,
} from '../src/lib/dashboardTemplates.ts';
import { CONTINUATION_TEMPLATES } from '../src/lib/coldOutreach.ts';
import { READABLE_TEMPLATE_BODIES } from '../src/lib/templateBodies.ts';
import { isServiceTemplate } from '../src/lib/marketingConsent.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };
const read = (p: string) => readFileSync(p, 'utf8');
const H = 3_600_000;

console.log('1. the six, their variables, and nothing else');
{
  ok(DASHBOARD_TEMPLATE_NAMES.sort().join() === 'agency_access,agreement_next_steps,needs_from_you,nudge_24h,questionnaire_domain_help,questionnaire_payment_help', 'exactly the six templates Paul named');
  ok(!isDashboardTemplate('final_nudge') && !isDashboardTemplate('payment_failed'), 'final_nudge and payment_failed are NOT wired');
  const v = (n: keyof typeof DASHBOARD_TEMPLATES) => DASHBOARD_TEMPLATES[n].vars.join();
  ok(v('questionnaire_domain_help') === 'name' && v('questionnaire_payment_help') === 'name' && v('nudge_24h') === 'name', 'domain help, payment help, 24h nudge: {{1}} business name');
  ok(v('needs_from_you') === 'greeting_name,needed_item', 'needs_from_you: {{1}} first name, {{2}} the item needed');
  ok(v('agency_access') === 'greeting_name' && v('agreement_next_steps') === 'greeting_name', 'agency access, agreement & next steps: {{1}} first name');
}

console.log('2. first name, else the business name');
{
  ok(dashboardGreeting('Ian Demo', 'Demo Driving') === 'Ian', 'a contact name → its first word');
  ok(dashboardGreeting('', 'Demo Driving') === 'Demo Driving' && dashboardGreeting(null, 'Demo Driving') === 'Demo Driving', 'no first name → the business name');
}

console.log('3. the item needed: one clean line, never blank or long');
{
  ok(cleanNeededItem('  logo,\n photos\t ').ok && (cleanNeededItem('  logo,\n photos\t ') as { value: string }).value === 'logo, photos', 'new lines and tabs collapse to one line (Meta refuses them)');
  ok(!cleanNeededItem('').ok && !cleanNeededItem('   ').ok && !cleanNeededItem(null).ok, 'blank refuses');
  ok(!cleanNeededItem('x'.repeat(201)).ok, 'over 200 characters refuses');
}

console.log('4. the Inbox transcript says which template went, never invented wording; a queued send gets its item back');
{
  const line = dashboardTemplateTranscript('needs_from_you', { business: 'Demo Accountants', greeting: 'Hana', neededItem: 'logo, photos. Thanks' });
  ok(/needs_from_you/.test(line) && /Meta's approved wording/.test(line) && /Hana/.test(line), 'names the template, says Meta\'s wording went, names who');
  ok(neededItemFromTranscript(line) === 'logo, photos. Thanks', 'the queued drain reads the exact item back (even with a full stop inside)');
  ok(neededItemFromTranscript(dashboardTemplateTranscript('agency_access', { business: 'X', greeting: 'Y' })) === null, 'no item → none read back');
  for (const n of DASHBOARD_TEMPLATE_NAMES) ok(typeof READABLE_TEMPLATE_BODIES[n] === 'function', `${n}: the Inbox can render its row`);
}

console.log('5. on / off is Meta\'s own answer (the last real send)');
{
  const now = Date.parse('2026-11-05T12:00:00Z');
  ok(dashboardTemplateState('questionnaire_domain_help', null, now).ok, 'never sent, not in review → live');
  ok(dashboardTemplateState('needs_from_you', { status: 'read', error_code: null, created_at: '2026-11-05T10:00:00Z' }, now).ok, 'Meta took the last one → live');
  const refused = dashboardTemplateState('agency_access', { status: 'failed', error_code: 132001, error_title: 'Template name does not exist', created_at: '2026-11-05T11:00:00Z' }, now, () => 'The template does not exist in that language, or is not approved.');
  ok(!refused.ok && /not approved/.test(refused.reason ?? ''), 'Meta refused it as a template problem an hour ago → off, with Meta\'s reason');
  ok(dashboardTemplateState('agency_access', { status: 'failed', error_code: '132001', created_at: new Date(now - RETRY_AFTER_MS - 1).toISOString() }, now).ok, 'after the cool-off it is live again, so the next press asks Meta again (switches on by itself once approved)');
  ok(dashboardTemplateState('nudge_24h', { status: 'failed', error_code: 131047, created_at: '2026-11-05T11:30:00Z' }, now).ok, 'a failure that is not about the template (the 24-hour window, the number) never turns it off');
  ok(!dashboardTemplateState('agency_access', null, Date.parse('2026-10-26T20:00:00Z')).ok && !dashboardTemplateState('nudge_24h', null, Date.parse('2026-10-26T20:00:00Z')).ok, 'the two Paul reported In review start off…');
  ok(dashboardTemplateState('agency_access', null, Date.parse('2026-10-28T12:00:00Z')).ok, '…and try again by themselves after the grace period');
  ok(dashboardTemplateState('questionnaire_payment_help', null, Date.parse('2026-10-26T20:00:00Z')).ok, 'the four Paul reported Active are live now');
}

console.log('6. wired into the normal sender, nothing bypassed');
{
  for (const n of DASHBOARD_TEMPLATE_NAMES) {
    ok(CONTINUATION_TEMPLATES.has(n), `${n}: a conversation follow-up (never a cold opener)`);
    ok(!isServiceTemplate(n), `${n}: NOT a service template, so an opt-out still refuses it`);
  }
  const send = read('supabase/functions/_shared/whatsapp-send.ts');
  const queue = read('supabase/functions/process-whatsapp-queue/index.ts');
  for (const n of DASHBOARD_TEMPLATE_NAMES) {
    const vars = DASHBOARD_TEMPLATES[n].vars.map((x) => `"${x}"`).join(', ');
    ok(send.includes(`  ${n}: { lang: "en", vars: [${vars}] },`), `${n}: in WA_TEMPLATES with its exact variables`);
    ok(queue.includes(`  ${n}: { lang: "en", vars: [${vars}] },`), `${n}: mirrored in the queue's registry`);
  }
  ok(/case "needed_item": \{[\s\S]{0,300}cleanNeededItem\(extra\?\.neededItem\)[\s\S]{0,120}throw new Error\(`unsafe_template_var:/.test(send), 'the item is cleaned in the payload builder and a blank refuses as a visible hold');
  const fn = read('supabase/functions/send-whatsapp-message/index.ts');
  const branch = fn.slice(fn.indexOf('} else if (isDashboardTemplate(templateName)) {'), fn.indexOf('} else if (needsContactName) {'));
  ok(branch.length > 200, 'send-whatsapp-message has the dashboard branch, before the contact-name branch');
  ok(/actor\.role !== "admin"/.test(branch), 'admin only');
  ok(/claimTemplatePayload\(templateName, lang, businessName, "", \{ greetingName: greeting, neededItem \}\)/.test(branch), 'the payload is built by the one builder (claimTemplatePayload), never by hand');
  ok(/cleanNeededItem\(templateVars\.needed_item\)/.test(branch) && /dashboardGreeting\(/.test(branch), 'first-name fallback and the cleaned item');
  ok(/neededItemFromTranscript\(r\.body\)/.test(fn), 'a send queued for the lead\'s hours keeps its item');
  ok(/const BUILD_ID = "2026-10-26a-dashboard-templates"/.test(fn), 'BUILD_ID bumped (x-swm-build proves the deploy)');
  const card = read('src/components/admin/NeedsMeList.tsx');
  ok(/sendWhatsAppRequest\(supabase, \{[^}]*via: 'lead_panel'/.test(card), 'the dashboard sends through the one browser send with via lead_panel (send hours → queued)');
  ok(!/functions\.invoke\(/.test(card), 'never its own call');
}

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
process.exit(f ? 1 : 0);
