/* ═══════════════════════════════════════════════════════════
   SMS STATUS, NO-SMS RULES, AND THE SHARED INBOX (2026-10-09). Pins:
   · queued → Queued · delivered → Contacted · failed → SMS Failed · a number that can never receive SMS → No SMS
   · the Twilio error-code map (30003 is a FAILED text, never No SMS)
   · only a REAL provider receipt moves a lead (never "accepted"), only the lead's newest text, only from an early status
   · a non-mobile number is No SMS before anything is queued or sent, and is not offered the SMS option
   · the SMS inbox is the WhatsApp inbox's twin (same shared components), the Best-way panels are gone
   ═══════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { classifySmsFailure, isEarlyStatus, isPlausibleUkMobile, leadSmsStatusFor, smsPillOf, statusAfterSmsDelivered } from '../src/lib/smsStatus.ts';
import { pillStatusOf, salesStateOf } from '../src/lib/leadState.ts';

let f = 0;
const ok = (c: unknown, msg: string) => { if (c) console.log('  ✓ ' + msg); else { f++; console.log('  ✗ ' + msg); } };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const pill = (l: Record<string, unknown>) => pillStatusOf(l.status as never, salesStateOf(l as never));

console.log('1. the pill: queued / failed / no-sms');
{
  ok(smsPillOf({ sms_queued_at: '2026-10-09T10:00:00Z', sms_delivery_status: null }) === 'sms_queued', 'on the queue lane → Queued');
  ok(smsPillOf({ sms_queued_at: null, sms_delivery_status: 'queued' }) === 'sms_queued', 'accepted by Twilio, no receipt yet → still Queued (never Contacted on send)');
  ok(smsPillOf({ sms_queued_at: null, sms_delivery_status: 'sent' }) === 'sms_queued', 'sent to the network, no receipt yet → still Queued');
  ok(smsPillOf({ sms_queued_at: null, sms_delivery_status: 'delivered' }) === null, 'delivered → no pill (the stored status is Contacted)');
  ok(smsPillOf({ sms_queued_at: null, sms_delivery_status: 'sms_failed' }) === 'sms_failed', 'failed → SMS Failed');
  ok(smsPillOf({ sms_queued_at: null, sms_delivery_status: 'no_sms' }) === 'no_sms', 'no_sms → No SMS');
  ok(smsPillOf({ sms_queued_at: null, sms_delivery_status: 'not_uk_mobile' }) === 'no_sms', 'the drip refusal not_uk_mobile → No SMS');
  ok(smsPillOf({ sms_queued_at: null, sms_delivery_status: 'send_failed' }) === 'sms_failed', 'any other drip failure reason → SMS Failed');
  ok(smsPillOf({ sms_queued_at: null, sms_delivery_status: 'already_texted' }) === null && smsPillOf({ sms_queued_at: null, sms_delivery_status: 'opted_out' }) === null, 'a RULE refusal (already texted, opted out) is not a delivery problem → no pill');
  ok(smsPillOf(null) === null && smsPillOf({}) === null, 'absent → no pill');
}

console.log('2. the pill is drawn over EARLY statuses only — never hides a reply, a client or an interested lead');
{
  const base = { sms_queued_at: '2026-10-09T10:00:00Z', sms_delivery_status: null };
  ok(pill({ ...base, status: 'not_contacted' }) === 'sms_queued', 'a new lead on the SMS queue shows Queued');
  ok(pill({ ...base, status: 'replied' }) !== 'sms_queued', 'a lead that has replied never shows the SMS Queued pill');
  ok(pill({ ...base, status: 'payment_received', amount_paid: 99 }) !== 'sms_queued', 'a paying client never shows it');
  ok(!isEarlyStatus('queued'), 'the WhatsApp drip status "queued" is NOT early: SMS never overwrites or draws over it');
}

console.log('3. delivered → Contacted, and only from an early status');
{
  ok(statusAfterSmsDelivered('not_contacted') === 'initial_contact', 'new → Contacted (initial_contact)');
  ok(statusAfterSmsDelivered('no_whatsapp') === 'initial_contact' && statusAfterSmsDelivered('no_whatsapp_needs_sms') === 'initial_contact', 'no-WhatsApp leads texted successfully → Contacted');
  ok(statusAfterSmsDelivered('replied') === null && statusAfterSmsDelivered('interested') === null && statusAfterSmsDelivered('payment_received') === null, 'replied / interested / client are never moved');
  ok(statusAfterSmsDelivered('queued') === null, 'a lead on the WhatsApp drip (status queued) is not moved');
}

console.log('4. Twilio error codes → No SMS vs SMS failed');
{
  ok(['30005', '30006', '21211', '21614'].every((c) => classifySmsFailure(c) === 'no_sms'), '30005 unknown handset, 30006 landline, 21211 invalid number, 21614 not a mobile → No SMS');
  ok(classifySmsFailure('30003') === 'sms_failed', '30003 unreachable handset → SMS FAILED, not No SMS (the phone may be fine — it was off)');
  ok(['30004', '30007', '30008', '30001', '30002', '99999', '', null, undefined].every((c) => classifySmsFailure(c as never) === 'sms_failed'), 'blocked / filtered / unknown / absent codes are a failed text, never No SMS');
  ok(classifySmsFailure('21610') === 'opted_out' && classifySmsFailure(21610) === 'opted_out', '21610 (they replied STOP) is an opt-out, not a delivery failure');
  ok(leadSmsStatusFor('delivered') === 'delivered' && leadSmsStatusFor('sent') === 'sent', 'delivered / sent store as such');
  ok(leadSmsStatusFor('undelivered', '30003') === 'sms_failed' && leadSmsStatusFor('failed', '30006') === 'no_sms', 'undelivered 30003 → sms_failed; failed 30006 → no_sms');
  ok(leadSmsStatusFor('accepted') === 'queued' && leadSmsStatusFor('queued') === 'queued' && leadSmsStatusFor(undefined) === 'queued', 'accepted / queued / unknown NEVER become delivered');
}

console.log('5. the UK-mobile check');
{
  ok(['07700 900123', '+447700900123', '00447700900123', '07911123456'].every(isPlausibleUkMobile), 'UK mobiles pass (07…, +447…, 00447…)');
  ok(!isPlausibleUkMobile('+44 151 555 0123') && !isPlausibleUkMobile('0151 555 0123') && !isPlausibleUkMobile('020 7946 0000'), 'a Liverpool / London landline is not a mobile');
  ok(!isPlausibleUkMobile('+91 98765 43210') && !isPlausibleUkMobile('+61 412 345 678') && !isPlausibleUkMobile('') && !isPlausibleUkMobile(null) && !isPlausibleUkMobile('07700 9001'), 'foreign, empty, absent and too-short numbers are not');
}

console.log('6. the wiring: callbacks → lead, send-time No SMS, queue RPC');
{
  const wh = read('supabase/functions/twilio-webhook/index.ts');
  ok(/syncLeadFromSms\(service/.test(wh) && /select\("id, status, lead_id, phone"\)/.test(wh), 'the Twilio delivery callback updates the LEAD (not only the message row)');
  const sync = read('supabase/functions/_shared/sms-lead-sync.ts');
  ok(/newest\.id !== a\.messageId\) return none/.test(sync), 'only the lead newest text may move the lead (a late receipt of an older text cannot)');
  ok(/statusAfterSmsDelivered/.test(sync) && !/status: ?"queued"/.test(sync.replace(/\/\/.*$/gm, '')), 'delivered moves the lead to Contacted; nothing here ever writes status "queued"');
  ok(/delivered" && \(smsStatus === "sent" \|\| smsStatus === "queued"\)\) return none/.test(sync), 'a late "sent" never walks a delivered lead backwards');
  ok(/recordOptOut/.test(sync), '21610 is recorded as an opt-out');
  const send = read('supabase/functions/_shared/twilio-sms.ts');
  const at = send.indexOf('isUkColdDestination(digits)');
  ok(/markLeadNoSms\(service/.test(send.slice(at, at + 700)), 'a non-mobile number is marked No SMS BEFORE anything is sent');
  ok(/markLeadSmsRefused\(service/.test(send), 'a Twilio refusal at send time is classified by its code');
  const q = read('supabase/functions/process-sms-queue/index.ts');
  ok(/r\.error === "not_uk_mobile" \? \{ sms_delivery_status: "no_sms" \}/.test(q), 'the drip stores No SMS for a non-mobile, and does not overwrite the sender classified failure');
  const mig = read('supabase/migrations/20261019120000_queue_sms_marks_no_sms.sql');
  ok(/v_reason in \('no_phone', 'not_a_uk_mobile'\)/.test(mig) && /sms_delivery_status = 'no_sms'/.test(mig) && /<> 'delivered'/.test(mig), 'queueing a non-mobile marks it No SMS (never overwriting a delivered text) and still refuses to queue it');
  ok(/sms_queued_at,\s*sms_delivery_status/.test(read('supabase/migrations/20261019110000_sms_status_view_and_backfill.sql')), 'the sales view exposes the two SMS columns the pill reads');
}

console.log('7. a landline is not offered the SMS option');
{
  const ot = read('src/components/OutreachTable.tsx');
  ok(/isPlausibleUkMobile\(lead\.phone\) && smsPillOf\(lead\) !== 'no_sms'/.test(ot), 'the Outreach row hides the SMS icon for a non-mobile or No-SMS lead');
}

console.log('8. UI cleanup — the Best-way panels are gone from the Call tab, the SMS modal and the SMS inbox');
{
  const call = read('src/components/CallPanel.tsx');
  ok(!/BestWayToContact/.test(call), 'Call tab: no "Best way to contact" panel');
  ok(/data-testid="call-start-browser"/.test(call) && /data-testid="call-start-whatsapp"/.test(call), 'Call tab: one primary Call in browser + a small Call on WhatsApp');
  ok(!/BestWayToContact/.test(read('src/components/LeadSmsPanel.tsx')), 'SMS modal / panel: no "Best way to contact" section');
  ok(!/BestWayToContact/.test(read('src/components/SmsInbox.tsx')), 'SMS inbox conversation: no chooser');
}

console.log('9. the SMS inbox is the WhatsApp inbox twin');
{
  const s = read('src/components/SmsInbox.tsx');
  for (const c of ['PipelineStatusSelect', 'NextActionEditor', 'NextActionPill', 'ConvStateChip', 'HookVisibilityCard', 'LeadOwnerControl', 'LeadDetailFromInbox', 'CampaignPicker', 'conversationState', 'INBOX_QUICK_FILTERS', 'markLeadInterested', 'setLeadPipelineStatus', 'shownStatusMatches']) {
    ok(new RegExp('\\b' + c + '\\b').test(s), `uses the same ${c} as the WhatsApp inbox`);
  }
  ok(/aria-label="Next action type"/.test(s) && /aria-label="Sort conversations"/.test(s) && /aria-label="Lead status"/.test(s), 'same filter bar (status, next action when/type, sort)');
  ok(/data-testid="sms-send-now"/.test(s) && /data-testid="sms-new"/.test(s) && /sms-queued-count/.test(s), 'same top-bar actions: queued count, Send now, New');
  ok(!/Window open|Window closed/.test(s.replace(/\/\*[\s\S]*?\*\//g, '')), 'no 24-hour window chip on SMS');
  const q = read('supabase/functions/process-sms-queue/index.ts');
  ok(/send_now !== true\) return json\(\{ ok: false, error: "forbidden" \}, 403\)/.test(q) && /who\.actor\.role !== "admin"/.test(q), 'Send now is admin-only on the server, and skips only the pacing wait');
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall passed');
