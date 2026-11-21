/* ============================================================
   gone_cold — "Hey, did you get my last message?" (Paul, 2026-11-21, Meta template 2575430126271853, in review).
   English, Marketing, NO variables. Manual only, only to a lead we messaged who has not replied (outside the 24h window).

   Pins: blocked while not approved (picker + the one server door + the sender gate order); blocked for an opt-out and for
   Do Not Contact; allowed when approved for a lead that went cold; the thread rules; manual only (queue, bulk, settings);
   the exact body in both body tables; zero variables in both registries; the status sync's known business id.

   Run: npx tsx scripts/gone-cold-template.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { WA_TEMPLATES, WA_TEMPLATE_BODIES, templateAwaitingApproval } from '../supabase/functions/_shared/whatsapp-send.ts';
import { READABLE_TEMPLATE_BODIES } from '../src/lib/templateBodies.ts';
import { WHATSAPP_TEMPLATES } from '../src/types/outreach.ts';
import { getTemplateSendability } from '../src/lib/whatsappTemplates.ts';
import { isColdOutreachTemplate, NEEDS_PRIOR_WHATSAPP } from '../src/lib/coldOutreach.ts';
import { isServiceTemplate } from '../src/lib/marketingConsent.ts';
import { planBulkSend } from '../src/lib/inboxBulkSend.ts';
import {
  GONE_COLD_APPROVED, GONE_COLD_TEMPLATE, GONE_COLD_WAITING_REASON, MANUAL_ONLY_TEMPLATES, goneColdBody, goneColdRefusal,
  type GoneColdFacts, type GoneColdMessage,
} from '../src/lib/goneCold.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const BODY = 'Hey, did you get my last message?\n\nNot sure it sent properly';
const NOW = Date.parse('2026-11-21T12:00:00Z');
const h = (hoursAgo: number) => new Date(NOW - hoursAgo * 3600_000).toISOString();
const out = (hoursAgo: number, extra: Partial<GoneColdMessage> = {}): GoneColdMessage => ({ direction: 'outbound', created_at: h(hoursAgo), status: 'delivered', template_name: 'initial_contact', ...extra });
const inn = (hoursAgo: number): GoneColdMessage => ({ direction: 'inbound', created_at: h(hoursAgo) });
const cold = (over: Partial<GoneColdFacts> = {}): GoneColdFacts => ({ approved: true, optedOut: false, doNotContact: false, thread: [out(72)], now: NOW, ...over });

console.log('── the template ──');
ok(GONE_COLD_TEMPLATE === 'gone_cold', 'name matches Meta exactly');
ok(goneColdBody() === BODY, 'body byte for byte as submitted');
ok(WA_TEMPLATE_BODIES.gone_cold?.('', '') === BODY && READABLE_TEMPLATE_BODIES.gone_cold?.('', '') === BODY, 'both body tables carry the same words');
ok(WA_TEMPLATES.gone_cold?.lang === 'en' && WA_TEMPLATES.gone_cold.vars.length === 0, 'English, zero variables (sender registry)');
ok(/gone_cold: \{ lang: "en", vars: \[\] \}/.test(read('supabase/functions/process-whatsapp-queue/index.ts')), 'queue mirror: English, zero variables');
ok(WHATSAPP_TEMPLATES.some((t) => t.value === 'gone_cold'), 'one more choice in the existing picker list');
ok(!isColdOutreachTemplate('gone_cold') && NEEDS_PRIOR_WHATSAPP.has('gone_cold'), 'a follow-up: never a first touch');
ok(!isServiceTemplate('gone_cold'), 'marketing: an opt-out blocks it (not a service template)');

console.log('── 1. blocked while Meta has not approved ──');
ok(GONE_COLD_APPROVED === false, 'the switch is off (in review at Meta)');
const pick = getTemplateSendability('gone_cold', { shareToken: null }, { goneCold: { ok: true } });
ok(!pick.ok && pick.reason === GONE_COLD_WAITING_REASON && GONE_COLD_WAITING_REASON === 'Waiting for Meta approval', 'picker: greyed "Waiting for Meta approval" even for a lead that went cold');
ok(templateAwaitingApproval('gone_cold'), 'the one server door (claimTemplatePayload) refuses it');
ok(goneColdRefusal(cold({ approved: false }))?.code === 'template_waiting_meta', 'rule: not approved refuses first');
const sender = read('supabase/functions/send-whatsapp-message/index.ts');
const gate = sender.slice(sender.indexOf('if (templateName === GONE_COLD_TEMPLATE) {'));
ok(/if \(GONE_COLD_APPROVED\) \{\s+const gcAvail = await templateAvailability\(service, templateName\);\s+if \(gcAvail\.status !== "APPROVED"\)/.test(gate), 'sender: Meta\'s LIVE status must be APPROVED (UNKNOWN refuses too)');
ok(sender.indexOf('if (templateName === GONE_COLD_TEMPLATE) {') < sender.indexOf('if (dryRun) {'), 'sender: the gate runs before the dry-run return and the payload');

console.log('── 2. blocked for opt-out and Do Not Contact ──');
ok(goneColdRefusal(cold({ optedOut: true }))?.code === 'opted_out', 'opted out → refused');
ok(goneColdRefusal(cold({ optedOut: null }))?.code === 'opted_out', 'opt-out unreadable → refused (fails closed)');
ok(goneColdRefusal(cold({ doNotContact: true }))?.code === 'do_not_contact', 'Do Not Contact → refused');
ok(goneColdRefusal(cold({ doNotContact: null }))?.code === 'do_not_contact', 'Do Not Contact unreadable → refused (fails closed)');
ok(/checkSuppressed\(service, \{ phone: "\+" \+ to, leadId: resolvedLeadId \}\)/.test(gate) && /GONE_COLD_STOP_STATUSES\.has\(gcStatus\)/.test(gate), 'sender: any suppression row or a stopped lead status is Do Not Contact');

console.log('── 3. allowed when approved, for a lead that went cold ──');
ok(goneColdRefusal(cold()) === null, 'approved + messaged 3 days ago + no reply → allowed');
ok(goneColdRefusal(cold({ thread: [inn(100), out(72)] })) === null, 'they wrote once long ago, we messaged since, no reply → allowed');
ok(goneColdRefusal(cold({ thread: [out(72, { status: 'failed' }), out(48)] })) === null, 'a failed send does not count as our last message');

console.log('── the thread rules ──');
ok(goneColdRefusal(cold({ thread: [] }))?.code === 'gone_cold_never_messaged', 'never messaged → refused');
ok(goneColdRefusal(cold({ thread: [out(72, { status: 'failed' })] }))?.code === 'gone_cold_never_messaged', 'only failed sends → refused');
ok(goneColdRefusal(cold({ thread: [out(72), inn(60)] }))?.code === 'gone_cold_they_replied', 'they replied after our last message → refused');
ok(goneColdRefusal(cold({ thread: [inn(5), out(2)] }))?.code === 'gone_cold_window_open', 'inbound within 24h (window open) → refused');
ok(goneColdRefusal(cold({ thread: [out(72), out(30, { template_name: 'gone_cold' })] }))?.code === 'gone_cold_already_sent', 'our last message was already gone_cold → refused');
ok(goneColdRefusal(cold({ thread: null }))?.code === 'contact_guard_unreadable', 'thread unreadable → refused');

console.log('── manual only ──');
ok(MANUAL_ONLY_TEMPLATES.has('gone_cold'), 'gone_cold is manual only');
ok(!getTemplateSendability('gone_cold', { shareToken: null }, {}).ok, 'no thread verdict (bulk, queue, other screens) → not offered');
const bulk = planBulkSend([{ key: 'k', label: 'ZZ QA', leadId: 'l1', phone: '+447700900000' }], 'gone_cold', { auditByLeadId: {} });
ok(bulk.send.length === 0 && bulk.skipped.length === 1, 'Inbox bulk send skips it');
const queue = read('supabase/functions/process-whatsapp-queue/index.ts');
ok(/if \(MANUAL_ONLY_TEMPLATES\.has\(requestedTemplate\)\)/.test(queue), 'queue drip refuses it');
ok((queue.match(/if \(next && MANUAL_ONLY_TEMPLATES\.has\(next\)\)/g) ?? []).length === 2, 'auto-send settings (audit-complete, first-reply) refuse it');
ok(/if \(MANUAL_ONLY_TEMPLATES\.has\(templateName\)\) \{ await finish\("flagged_error"/.test(queue), 'first-reply lane refuses it');
const table = read('src/components/OutreachTable.tsx');
ok(/disabled=\{blocked \|\| stale \|\| manual\}/.test(table) && /manualOnly\(queueTemplate\)/.test(table), 'Outreach queue dialog: greyed and the Queue button disabled');
const inbox = read('src/pages/Inbox.tsx');
ok(/goneColdRefusal\(\{ approved: GONE_COLD_APPROVED/.test(inbox) && /hasSiteFindingsLeadIds\.has\(active\.leadId\) : false, goneCold \}\)/.test(inbox), 'Inbox one-lead picker supplies the thread verdict');

console.log('── the status sync ──');
ok(/KNOWN_BUSINESS_IDS: readonly string\[\] = \["1693100295675184"\]/.test(read('supabase/functions/_shared/template-status.ts')), 'status sync also looks in the Move37 business (owning-number check still decides)');

console.log(f ? `\n${f} FAILED` : '\nall passed');
process.exit(f ? 1 : 0);
