/* ============================================================
   THE REAL SEND ERROR, AND SAFER SENDING (2026-10-15, feat/send-error-capture).

   Pins: Meta's raw error code / title / details are pulled from both answer shapes and never carry a token; every
   code shows (meaning or not); every failed-send writer stores the three columns; the per-country auto switch-off
   rule (TS mirror ↔ SQL), including 14 Oct's one-of-one failures; Malaysia / Singapore never auto-retried; who paused
   the queue; the Call-campaign confirm; and the held whatsapp-status webhook untouched.

   Run: npx tsx scripts/send-error-capture.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import {
  maskSecrets, META_ERROR_MEANINGS, metaErrorParts, metaErrorPartsFromResponse, partsFromStoredError, sendErrorLine,
  sendErrorMeaning, TWILIO_ERROR_MEANINGS,
} from '../src/lib/sendErrorMeaning.ts';
import {
  COUNTRY_AUTO_PAUSE_FAILS, COUNTRY_AUTO_PAUSE_WINDOW, COUNTRY_TRIAL_SENDS, countryAutoPauseVerdict, NOT_ON_WHATSAPP_CODE,
} from '../src/lib/countryAutoPause.ts';
import { conversationState, messageErrorParts } from '../src/lib/conversationState.ts';
import { pauseChangeLine } from '../src/lib/queuePauseChange.ts';
import { QUEUE_SKIP_LABEL } from '../src/lib/salesCrm.ts';
import { leadsInCallCampaigns, callCampaignQuestion } from '../src/lib/callCampaignGuard.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let failures = 0;
function ok(cond: unknown, label: string) {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}
const MIG = read('supabase/migrations/20261029090000_send_error_capture.sql');

console.log('\n── 1. Meta\'s error, split out of both answer shapes ──');
{
  const send = { error: { message: '(#131049) This message was not delivered to maintain healthy ecosystem engagement.', type: 'OAuthException', code: 131049,
    error_data: { messaging_product: 'whatsapp', details: 'In order to maintain a healthy ecosystem engagement, the message failed to be delivered.' }, fbtrace_id: 'Abc' } };
  const p = metaErrorPartsFromResponse(send);
  ok(p.code === 131049, 'send response: the raw code');
  ok(p.title === 'This message was not delivered to maintain healthy ecosystem engagement.', 'send response: title = message without the "(#code)" prefix');
  ok(p.details?.startsWith('In order to maintain'), 'send response: details = error_data.details');
  const cb = metaErrorParts({ code: 131026, title: 'Message undeliverable', message: 'Message undeliverable', error_data: { details: 'Message Undeliverable.' } });
  ok(cb.code === 131026 && cb.title === 'Message undeliverable' && cb.details === 'Message Undeliverable.', 'status callback errors[0]: code, title, details');
  ok(metaErrorParts(null).code === null && metaErrorParts('x').title === null, 'nothing → no parts, never a guess');
  const leak = metaErrorParts({ code: 190, message: 'Invalid token EAAGm0PX4ZCpsBAKZCZBzZAqWbZCxyz1234567890abcdef' });
  ok(!/EAAGm0/.test(JSON.stringify(leak)) && /\[token\]/.test(leak.title ?? ''), 'a token-shaped string inside Meta\'s text is masked');
  ok(maskSecrets('Bearer abcdefghijklmnopqrstuvwxyz') === 'Bearer [token]', 'a bearer value is masked');
  const old = partsFromStoredError(JSON.stringify(send.error));
  ok(old.code === 131049, 'an old row\'s stored error JSON is read back to its code');
  ok(partsFromStoredError('network error').code === null, 'non-JSON stored text → no code');
}

console.log('\n── 2. every code shows; the meaning only when known (built from the official lists, 2026-10-15) ──');
{
  for (const c of [131026, 131049, 131047, 130497, 131048, 131050, 132001, 132015, 130429, 131000, 368, 131031]) {
    ok(typeof META_ERROR_MEANINGS[c] === 'string' && META_ERROR_MEANINGS[c].length > 10, `Meta ${c} has a plain meaning`);
  }
  for (const c of [30003, 30005, 30006, 30007, 21211, 21610, 21614]) ok(!!TWILIO_ERROR_MEANINGS[c], `Twilio ${c} has a plain meaning`);
  ok(sendErrorLine('whatsapp', { code: 999999, title: 'Something new', details: null }) === 'Meta 999999 — Something new', 'an unknown code still shows its raw number, with Meta\'s own title');
  ok(sendErrorLine('whatsapp', { code: 999999, title: null, details: null })!.startsWith('Meta 999999'), 'an unknown code with no title still shows the number');
  ok(sendErrorLine('sms', { code: 30003, title: null, details: null })!.startsWith('Twilio 30003 — The phone could not be reached'), 'a text shows Twilio\'s code');
  ok(sendErrorMeaning('whatsapp', 250) === META_ERROR_MEANINGS[200], 'the 200-299 permission range');
  ok(sendErrorLine('whatsapp', null) === null && sendErrorLine('whatsapp', { code: null, title: null, details: null }) === null, 'no error → nothing drawn');
  const src = read('src/lib/sendErrorMeaning.ts');
  ok(src.includes('developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes') && src.includes('twilio.com/docs/api/errors'), 'the source lists are named in the file');
  ok(!/^import /m.test(src), 'sendErrorMeaning is an import-free leaf (edge-reachable)');
}

console.log('\n── 3. every failed-send writer stores the three columns ──');
{
  const ws = read('supabase/functions/_shared/whatsapp-send.ts');
  ok(/errorParts = metaErrorPartsFromResponse\(data\)/.test(ws) && /export function errorColumns/.test(ws), 'sendViaGraph returns the parts; errorColumns maps them');
  ok(/maskSecrets\(JSON\.stringify\(data\?\.error \?\? data\)\)/.test(ws), 'the stored error text is masked too');
  const q = read('supabase/functions/process-whatsapp-queue/index.ts');
  ok((q.match(/\.\.\.errorColumns\(/g) ?? []).length >= 5, `the queue: auto-reply (2), hook, contact and opener lanes spread errorColumns (${(q.match(/\.\.\.errorColumns\(/g) ?? []).length})`);
  ok(/sendParts = metaErrorPartsFromResponse\(data\);/.test(q), 'the opener lane (its own inline fetch) reads the parts');
  ok(/whatsapp_error_code: sendParts\.code, whatsapp_error_title: sendParts\.title, whatsapp_error_at: nowIso/.test(q) && q.includes('hasPriorSuccess), ...leadErrorCols })'), 'the queue row (the lead) carries the last failure');
  const m = read('supabase/functions/send-whatsapp-message/index.ts');
  ok((m.match(/\.\.\.errorColumns\(sendParts\)/g) ?? []).length === 2, 'the Inbox send: message row AND send row');
  for (const t of ['whatsapp_sends', 'whatsapp_messages']) {
    for (const c of ['error_code integer', 'error_title text', 'error_details text']) ok(MIG.includes(`alter table public.${t} add column if not exists ${c}`.replace(/ +/g, ' ')) || new RegExp(`alter table public\\.${t}\\s+add column if not exists ${c}`).test(MIG), `${t}.${c.split(' ')[0]}`);
  }
  ok(/alter table public\.outreach_leads\s+add column if not exists whatsapp_error_code integer/.test(MIG), 'outreach_leads.whatsapp_error_code');
}

console.log('\n── 4. the held whatsapp-status webhook is untouched ──');
{
  const w = read('supabase/functions/whatsapp-status/index.ts');
  ok(!/errorColumns|sendErrorMeaning|error_code/.test(w), 'whatsapp-status does not import or write the new columns (it is held; not deployed)');
  ok(!/sendErrorMeaning|countryAutoPause/.test(read('supabase/functions/_shared/whatsapp-failure.ts')), 'its failure module is unchanged in meaning');
}

console.log('\n── 5. the per-country auto switch-off (TS mirror ↔ SQL) ──');
{
  const at = (n: number) => new Date(Date.UTC(2026, 9, 14, 9, n)).toISOString();
  ok(countryAutoPauseVerdict([{ at: at(26), failed: true, code: null }]).switchOff, '14 Oct: one send, failed, no code → switched off');
  ok(!countryAutoPauseVerdict([{ at: at(1), failed: true, code: NOT_ON_WHATSAPP_CODE }]).switchOff, 'a first send that fails 131026 (that number is not on WhatsApp) does not switch the country off');
  ok(countryAutoPauseVerdict([{ at: at(1), failed: true, code: 131026 }, { at: at(2), failed: true, code: 131026 }]).switchOff, '…but two of them do (2 of 5)');
  const sixOk = Array.from({ length: 6 }, (_, i) => ({ at: at(i), failed: false, code: null }));
  ok(!countryAutoPauseVerdict(sixOk).switchOff, 'all good → stays on');
  ok(!countryAutoPauseVerdict([...sixOk, { at: at(10), failed: true, code: 131049 }]).switchOff, 'after the trial, one failure in the last 5 → stays on');
  ok(countryAutoPauseVerdict([...sixOk, { at: at(10), failed: true, code: 131049 }, { at: at(11), failed: true, code: 131049 }]).switchOff, 'after the trial, 2 of the last 5 → off');
  ok(!countryAutoPauseVerdict([{ at: at(1), failed: true, code: 131049 }, { at: at(2), failed: true, code: 131049 }, ...Array.from({ length: 5 }, (_, i) => ({ at: at(20 + i), failed: false, code: null }))]).switchOff,
    'old failures outside the last 5 no longer count');
  ok(COUNTRY_TRIAL_SENDS === 5 && COUNTRY_AUTO_PAUSE_WINDOW === 5 && COUNTRY_AUTO_PAUSE_FAILS === 2, 'the three numbers');
  ok(MIG.includes('select * from per order by at desc limit 5') && MIG.includes('(v_all <= 5 and v_trial_fail >= 1) or v_failed >= 2')
    && MIG.includes('code is distinct from 131026'), 'the SQL rule says the same (5 / trial any non-131026 / 2 of 5)');
  ok(/create trigger trg_whatsapp_sends_country_check after insert or update of delivery_status on public\.whatsapp_sends/.test(MIG)
    && /create trigger trg_whatsapp_messages_country_check after insert or update of status on public\.whatsapp_messages/.test(MIG),
    'it fires on every failed write, whoever wrote it (queue, Inbox, the delivery-report webhook)');
  ok(/exception when others then\s+raise warning/.test(MIG), 'the check can never break the write it rides on');
  ok(/whatsapp_on and not coalesce\(old\.whatsapp_on, false\)/.test(MIG) && MIG.includes('new.whatsapp_auto_pause_reason := null'), 'switching back on starts the count again and clears the note');
  ok(!/set whatsapp_on = true/.test(MIG) && MIG.includes("country not in ('MY', 'SG')") === false && MIG.includes("_market not in ('MY', 'SG')"), 'it only ever switches OFF, and only Malaysia / Singapore');
  ok(MIG.includes("select public.country_whatsapp_auto_pause('MY');") && MIG.includes("select public.country_whatsapp_auto_pause('SG');"), 'applied once to what already happened');
  const ui = read('src/components/CountrySendingSettings.tsx');
  ok(/country-auto-off-/.test(ui) && /whatsapp_auto_pause_reason/.test(ui), 'the banner says why, in the stored words');
  ok(read('src/lib/whatsappPace.ts').includes('AUTO_PAUSE_MIN_ATTEMPTS = 8'), 'the existing queue auto-pause (UK) is unchanged');
}

console.log('\n── 6. Malaysia / Singapore are never retried automatically ──');
{
  ok(/create trigger trg_whatsapp_my_sg_no_auto_retry before update on public\.outreach_leads/.test(MIG)
    && MIG.includes("when (new.status = 'queued' and new.whatsapp_delivery_status = 'failed_temporary')")
    && MIG.includes("new.status := 'whatsapp_failed'") && MIG.includes('coalesce(new.whatsapp_attempts, 0) > coalesce(old.whatsapp_attempts, 0)'),
    'a re-queue after a failure (queue OR webhook) becomes whatsapp_failed for a MY / SG mobile; a person re-queueing (attempts reset) is not touched');
  const q = read('supabase/functions/process-whatsapp-queue/index.ts');
  ok((q.match(/else if \(isNoAutoRetryMarket\(to\)\) \{/g) ?? []).length === 2, 'the hook and contact follow-up lanes hand a MY / SG failure back');
}

console.log('\n── 7. who paused the queue ──');
{
  const q = read('supabase/functions/process-whatsapp-queue/index.ts');
  ok(/pause_changed_at: changedAt, pause_changed_by: callerId, pause_changed_source: "person"/.test(q), 'the pause button records the person and the time, in the same write');
  ok(/pause_changed_by: null, pause_changed_source: "auto"/.test(q), 'the auto-pause records itself');
  ok(/create table if not exists public\.whatsapp_queue_pause_log/.test(MIG) && /revoke all on public\.whatsapp_queue_pause_log from anon, authenticated/.test(MIG), 'an append-only log, service role only');
  ok(pauseChangeLine({ at: '2026-10-15T08:28:00Z', byUserId: 'u', byName: 'Paul', source: 'person' }, true) === 'Paused by Paul 15 Oct, 09:28', 'Paused by Paul 15 Oct, 09:28');
  ok(pauseChangeLine({ at: '2026-10-15T08:28:00Z', byUserId: null, byName: null, source: 'auto' }, true)!.startsWith('Paused automatically'), 'Paused automatically');
  ok(/not recorded/.test(pauseChangeLine(null, true) ?? ''), 'an older pause says it was not recorded, never a guess');
}

console.log('\n── 8. Call campaign: WhatsApp only when the person confirms ──');
{
  ok(MIG.includes('_confirm_call_campaign boolean default false') && MIG.includes("v_reason := 'call_campaign'"), 'sales_queue_opener refuses a Call campaign lead without the confirm');
  ok(MIG.includes('drop function if exists public.sales_queue_opener(uuid[], text);'), 'the old two-argument version is replaced (no ambiguous overload)');
  ok(!!QUEUE_SKIP_LABEL.call_campaign, 'the skip is worded');
  const leads = [{ id: 'a', campaign_id: 'call1' }, { id: 'b', campaign_id: 'wa1' }, { id: 'c', campaign_id: null }];
  ok(JSON.stringify(leadsInCallCampaigns(leads, new Set(['call1'])).map((l) => l.id)) === '["a"]', 'the screens find the Call-campaign leads');
  ok(/Call campaign/.test(callCampaignQuestion(3)), 'the question');
  const t = read('src/components/OutreachTable.tsx');
  ok(/if \(!opts\.callCampaignConfirmed\) \{\s+const cc = await callCampaignLeads/.test(t) && /queue-call-campaign-confirm/.test(t), 'Outreach bulk queue asks first (both roles; fails closed)');
  ok(/await callCampaignAnswer\(\) === null/.test(read('src/components/WhatsAppLeadControls.tsx')), 'the one-lead WhatsApp controls ask first');
}

console.log('\n── 9. the Inbox shows the code next to Send failed ──');
{
  const msgs = [{ direction: 'outbound', status: 'failed', created_at: '2026-10-14T09:26:06Z', body: 'x', error_code: 131049, error_title: 't', error_details: null }];
  const s = conversationState({ messages: msgs, lastReadAt: null, nowMs: Date.parse('2026-10-15T00:00:00Z') });
  ok(s.failed && s.failedError?.code === 131049, 'the state carries the failed send\'s code');
  ok(messageErrorParts({ direction: 'outbound', status: 'failed', created_at: '', body: '', error: JSON.stringify({ code: 131026, message: 'x' }) })?.code === 131026, 'an old row\'s stored JSON still shows its code');
  const chip = read('src/components/ConvStateChip.tsx');
  ok(/sendFailedLabel\(channel, state\.failedError\)/.test(chip), 'the chip says "Send failed · Meta 131049"');
  const inbox = read('src/pages/Inbox.tsx');
  ok(/<SendErrorNote channel=\{channel\} parts=\{messageErrorParts\(m\)\}/.test(inbox), 'the failed bubble shows the code and meaning (both channels, one component)');
  ok(/<RecentSendFailures \/>/.test(read('src/components/WhatsAppQueuePanel.tsx')), 'the queue panel lists failed sends with their codes');
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
