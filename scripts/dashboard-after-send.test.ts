/* What a "What needs you" row shows after its send button, and the no-double-send guard (Paul, 2026-10-26).
   Pure + source checks; nothing is read from or sent to anyone. Run: npx tsx scripts/dashboard-after-send.test.ts */
import { readFileSync } from 'node:fs';
import {
  HANDLED_FOR_MS, mergeSendState, rowHandled, sendLockedReason, sendStateLine, storedSendState, withSendStates,
  type DashboardQueuedFact, type DashboardSentFact, type RowSendState,
} from '../src/lib/dashboardSendState.ts';
import {
  DASHBOARD_RESEND_WINDOW_MS, DASHBOARD_TEMPLATE_NAMES, DASHBOARD_TEMPLATE_WORDING, NO_DOUBLE_SEND_TEMPLATES, PICK_UP_CONVERSATION_BODY,
  dashboardTemplatePreview, dashboardTemplateTranscript, dashboardTranscriptView, fillDashboardWording, noDoubleSendTemplate,
} from '../src/lib/dashboardTemplates.ts';
import { NEEDS_TEMPLATES } from '../src/lib/needsMeTemplates.ts';
import type { NeedsRow } from '../src/lib/needsMe.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const NOW = Date.parse('2026-10-26T14:30:00Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const MIN = 60_000;
const msg = (o: Partial<DashboardSentFact>): DashboardSentFact => ({ id: 'm' + Math.random(), lead_id: 'L1', template_name: 're_engage_49', status: 'sent', created_at: iso(2 * MIN), ...o });
const q = (o: Partial<DashboardQueuedFact>): DashboardQueuedFact => ({ id: 'q' + Math.random(), lead_id: 'L1', template_name: 'nudge_24h', status: 'scheduled', send_at: '2026-10-27T08:00:00Z', tz: 'Europe/London', created_at: iso(MIN), ...o });
const row = (o: Partial<NeedsRow> = {}): NeedsRow => ({ key: 'followup:L1', kind: 'follow_up', kindLabel: 'Follow-up due', group: 'urgent', leadId: 'L1', business: 'ZZ QA Plumbing', why: 'x', action: 'Chase', template: 're_engage_49', sinceIso: iso(60 * MIN), open: { kind: 'lead' }, ...o });

console.log('1. the stored state is the Inbox\'s facts');
{
  ok(storedSendState('L1', [], []) === null, 'nothing sent → no state');
  ok(storedSendState(null, [msg({})], []) === null, 'a row with no lead has no state');
  ok(storedSendState('L1', [msg({ lead_id: 'L2' })], []) === null, "another lead's send is not this row's");
  ok(storedSendState('L1', [msg({ template_name: 'initial_contact' })], []) === null, 'a template the row does not send is ignored');
  ok(storedSendState('L1', [msg({ status: 'sent' })], [])?.phase === 'sent', 'sent');
  ok(storedSendState('L1', [msg({ status: 'delivered' })], [])?.phase === 'delivered', 'delivered');
  ok(storedSendState('L1', [msg({ status: 'read' })], [])?.phase === 'read', 'read');
  ok(storedSendState('L1', [msg({ status: null })], [])?.phase === 'sent', 'an unknown status reads as sent (never as nothing)');
  const failed = storedSendState('L1', [msg({ status: 'failed', error_code: 131049, error_title: 'Healthy ecosystem' })], []);
  ok(failed?.phase === 'failed' && failed.reason.includes('131049'), "failed carries Meta's code and reason");
  ok(storedSendState('L1', [msg({ status: 'failed', created_at: iso(MIN) }), msg({ status: 'delivered', created_at: iso(5 * MIN) })], [])?.phase === 'failed', 'the newest send wins');
  const qs = storedSendState('L1', [msg({})], [q({})]);
  ok(qs?.phase === 'queued' && qs.template === 'nudge_24h', 'a pending queued send wins over an older message');
  ok(storedSendState('L1', [], [q({ status: 'cancelled' })]) === null, 'a cancelled queued send is nothing');
  ok(storedSendState('L1', [], [q({ status: 'sending' })])?.phase === 'sending', "the drain's in-progress row is Sending…");
}

console.log('2. the line on the row');
{
  ok(sendStateLine({ phase: 'sending', template: 'nudge_24h', at: iso(0) }) === 'Sending…', 'Sending…');
  ok(sendStateLine({ phase: 'queued', template: 'nudge_24h', at: iso(0), sendAt: '2026-10-27T08:00:00Z', tz: 'Europe/London' }).startsWith('Queued, sends at 08:00'), 'Queued, sends at their time');
  ok(/^Sent \d\d:\d\d/.test(sendStateLine({ phase: 'sent', template: 'nudge_24h', at: new Date().toISOString() })), 'Sent [time]');
  ok(sendStateLine({ phase: 'delivered', template: 'nudge_24h', at: new Date().toISOString() }).startsWith('Delivered'), 'Delivered');
  ok(sendStateLine({ phase: 'failed', template: 'nudge_24h', at: iso(0), reason: 'Meta 131049 — x' }) === 'Failed: Meta 131049 — x', "Failed: Meta's reason");
}

console.log('3. handled rows move to Waiting on them; failed rows stay');
{
  const r = row();
  ok(rowHandled(r, { phase: 'sending', template: 're_engage_49', at: iso(0) }, NOW), 'sending is handled');
  ok(rowHandled(r, { phase: 'queued', template: 're_engage_49', at: iso(0), sendAt: iso(-MIN), tz: 'Europe/London' }, NOW), 'queued is handled');
  ok(rowHandled(r, { phase: 'sent', template: 're_engage_49', at: iso(MIN) }, NOW), 'sent after the row started is handled');
  ok(!rowHandled(r, { phase: 'failed', template: 're_engage_49', at: iso(MIN), reason: 'x' }, NOW), 'failed is never handled');
  ok(!rowHandled(r, { phase: 'sent', template: 're_engage_49', at: iso(2 * 60 * MIN) }, NOW), 'a send BEFORE the row started (they wrote again since) does not hide it');
  ok(!rowHandled(r, { phase: 'delivered', template: 're_engage_49', at: iso(HANDLED_FOR_MS) }, NOW), 'after HANDLED_FOR_MS the row comes back');
  const [moved] = withSendStates([r], () => ({ phase: 'sent', template: 're_engage_49', at: iso(MIN) }), NOW);
  ok(moved.group === 'waiting' && moved.sendState?.phase === 'sent', 'withSendStates moves a handled row to waiting with its state');
  const [stays] = withSendStates([r], () => ({ phase: 'failed', template: 're_engage_49', at: iso(MIN), reason: 'x' }), NOW);
  ok(stays.group === 'urgent' && stays.sendState?.phase === 'failed', 'a failed row keeps its group and shows the reason');
  const [plain] = withSendStates([r], () => null, NOW);
  ok(plain.group === 'urgent' && plain.sendState === null, 'no send → unchanged');
}

console.log('4. the button lock');
{
  ok(sendLockedReason({ phase: 'sending', template: 're_engage_49', at: iso(0) }, 're_engage_49', NOW) === 'Sending…', 'off while sending');
  ok(!!sendLockedReason({ phase: 'queued', template: 're_engage_49', at: iso(0), sendAt: iso(-MIN), tz: 'Europe/London' }, 're_engage_49', NOW), 'off while queued');
  ok(!!sendLockedReason({ phase: 'sent', template: 're_engage_49', at: iso(MIN) }, 're_engage_49', NOW), 'off just after the same template went');
  ok(sendLockedReason({ phase: 'sent', template: 're_engage_49', at: iso(DASHBOARD_RESEND_WINDOW_MS + MIN) }, 're_engage_49', NOW) === null, 'usable again after the window');
  ok(sendLockedReason({ phase: 'sent', template: 'nudge_24h', at: iso(MIN) }, 're_engage_49', NOW) === null, 'a different template is not held');
  ok(sendLockedReason({ phase: 'failed', template: 're_engage_49', at: iso(0), reason: 'x' }, 're_engage_49', NOW) === null, 'usable again at once after a failure');
  ok(sendLockedReason(null, 're_engage_49', NOW) === null, 'nothing sent → usable');
}

console.log('5. the press vs the database');
{
  const sending: RowSendState = { phase: 'sending', template: 'nudge_24h', at: iso(0) };
  ok(mergeSendState(sending, { phase: 'sent', template: 'nudge_24h', at: iso(MIN) }) === sending, 'Sending… wins while the request is out');
  const local: RowSendState = { phase: 'sent', template: 'nudge_24h', at: iso(0) };
  const stored: RowSendState = { phase: 'delivered', template: 'nudge_24h', at: iso(10_000) };
  ok(mergeSendState(local, stored) === stored, 'the stored row takes over once re-read (Delivered)');
  ok(mergeSendState(local, { phase: 'delivered', template: 'nudge_24h', at: iso(30 * MIN) }) === local, 'an older stored send does not hide a newer press');
  ok(mergeSendState(null, stored) === stored, 'no press → stored');
}

console.log('6. one list of guarded templates, shared by the browser and the sender');
{
  for (const k of Object.keys(NEEDS_TEMPLATES)) ok(noDoubleSendTemplate(k), `${k} (a row's template) is guarded`);
  ok(DASHBOARD_TEMPLATE_NAMES.every((n) => NO_DOUBLE_SEND_TEMPLATES.includes(n)), 'every dashboard template is in the list');
  ok(!noDoubleSendTemplate('initial_contact') && !noDoubleSendTemplate(null), 'nothing else is');
  const s = read('supabase/functions/send-whatsapp-message/index.ts');
  ok(/if \(resolvedLeadId && noDoubleSendTemplate\(templateName\)\) \{\n\s+const recent = await recentDashboardSend\(service, resolvedLeadId, templateName, sched \? sched\.row\.id : null\);/.test(s), 'the sender runs the guard for every guarded template, excluding only the drain\'s own row');
  const fn = s.slice(s.indexOf('async function recentDashboardSend'), s.indexOf('function json('));
  ok(fn.includes('.or("status.is.null,status.neq.failed")'), 'a NULL status counts as sent (never .neq alone, which drops NULLs)');
  ok(fn.includes('DASHBOARD_RESEND_WINDOW_MS') && fn.includes('DASHBOARD_PENDING_QUEUE_STATUSES'), 'the window and the queued states come from the shared constants');
  ok((fn.match(/return "recent_check_failed"/g) ?? []).length === 2, 'both reads fail closed');
  ok(s.indexOf('noDoubleSendTemplate(templateName)') < s.indexOf('if (linkKind) {'), 'the guard runs before any template branch');
  ok(/const BUILD_ID = "2026-10-2[6-9][a-z]-[a-z-]+"/.test(s), 'BUILD_ID bumped since 2026-10-26b (x-swm-build proves the deploy)');
}

console.log('7. the row sends only through the one sender, and is locked against a double press');
{
  const s = read('src/components/admin/NeedsMeList.tsx');
  ok((s.match(/sendWhatsAppRequest\(/g) ?? []).length === 1 && s.includes("via: 'lead_panel'"), 'one send call, through sendWhatsAppRequest with the send hours');
  ok(/if \(inFlight\.current \|\| locked\) return;\n\s+inFlight\.current = true;/.test(s), 'a synchronous in-flight lock before any await');
  ok(s.includes('data-send-locked="true"') && /disabled/.test(s), 'a locked button is disabled and says why');
  const h = read('src/hooks/useDashboardSends.ts');
  ok(!/\.(insert|update|upsert|delete)\(/.test(h) && !/functions\.invoke|sendWhatsApp/.test(h), 'the state read writes and sends nothing');
}

console.log('8. the Inbox shows a dashboard template as Meta\'s words or a template card, never the stored line');
{
  const line = dashboardTemplateTranscript('agreement_next_steps', { business: 'ZZ QA Plumbing', greeting: 'Ian' });
  const v = dashboardTranscriptView('agreement_next_steps', line);
  ok(v?.label === 'Agreement & next steps' && v.who === 'Ian' && v.neededItem === null, 'label and who read back from the stored line');
  ok(DASHBOARD_TEMPLATE_WORDING.agreement_next_steps ? v?.words?.includes('Ian') : v?.words === null, 'words only when Paul pasted the wording');
  const n = dashboardTranscriptView('needs_from_you', dashboardTemplateTranscript('needs_from_you', { business: 'B', greeting: 'Jo', neededItem: 'your logo. And photos' }));
  ok(n?.who === 'Jo' && n.neededItem === 'your logo. And photos', 'needs_from_you keeps who and the item (an item with a full stop too)');
  const p = dashboardTranscriptView('pick_up_conversation', dashboardTemplateTranscript('pick_up_conversation', { business: 'B' }));
  ok(p === null, 'pick_up_conversation is already its real words: shown as stored');
  ok(dashboardTranscriptView('re_engage_49', 'x') === null && dashboardTranscriptView(null, line) === null, 'not a dashboard template → untouched');
  ok(fillDashboardWording('Hi {{1}}, send {{2}}. {{1}}', 'Jo', 'a logo') === 'Hi Jo, send a logo. Jo', 'every {{1}} / {{2}} filled');
  ok(PICK_UP_CONVERSATION_BODY('B').startsWith('Hi B, thanks for getting back to me'), "pick_up_conversation's words unchanged");
  ok(v?.words === 'Hi Ian, your agreement is ready. Have you had a chance to read it?', "agreement_next_steps shows Meta's words with the first name");
  ok(n?.words === 'Hi Jo, to get started I just need your logo. And photos. Could you send that over here?', 'needs_from_you fills {{1}} and {{2}}');
  const nudge = dashboardTranscriptView('nudge_24h', dashboardTemplateTranscript('nudge_24h', { business: 'ZZ QA Roofing' }));
  ok(nudge?.words === 'Hi ZZ QA Roofing, just checking you saw my last message. Is now still a good time to get this started?', 'a business-name template fills the business name');
  for (const k of DASHBOARD_TEMPLATE_NAMES) {
    const w = DASHBOARD_TEMPLATE_WORDING[k];
    ok(!!w && w.includes('{{1}}') && (w.includes('{{2}}') === (k === 'needs_from_you')), `${k}: wording pasted, with exactly the variables it declares`);
  }
  ok(dashboardTemplatePreview('agency_access', { business: 'B', greeting: 'Ann' })?.startsWith('Hi Ann, you mentioned an agency') === true, 'the confirm / picker preview fills the first name');
  ok(dashboardTemplatePreview('questionnaire_domain_help', { business: 'ZZ QA Joinery', greeting: 'Ian' })?.startsWith('Hi ZZ QA Joinery, thanks for filling in') === true, 'a business-name template previews the business, not the first name');
  const ib = read('src/pages/Inbox.tsx');
  ok(ib.includes('data-testid="picker-dashboard-words"'), 'the Inbox picker shows the words before sending');
  ok(/dashboardTranscriptView\(m\.template_name, templateSnapshot\?\.body \?\? m\.body\)/.test(ib) && ib.includes('<DashboardTemplateBubble view={dashView} />'), 'the Inbox bubble uses it');
}

console.log(f ? `\n${f} FAILED` : '\nALL PASS');
process.exit(f ? 1 : 0);
