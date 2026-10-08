/* ═══════════════════════════════════════════════════════════
   WHATSAPP QUEUE → SEND → INBOX RELIABILITY (2026-10-08, fix/whatsapp-queue-send-reliability).

   Pins, in the order Paul listed them:
     · eligibility is ONE rule (coldWhatsAppVerdict) — UK mobile only; India and Australia stay OFF;
     · Contact Method is NOT contact evidence — a Call tap changes nothing the queue reads;
     · a lead the queue learns it cannot WhatsApp is flagged (the existing no_whatsapp_needs_sms marker), never left New;
     · genuine contact reconciles New -> Contacted and NEVER downgrades anything further along;
     · every skip names its own reason (no catch-all), and the SQL's reason keys all have words;
     · Meta acceptance = a message id; a rejection is never Sent and never contact; one outbound row, never two;
     · an outbound-only conversation appears in the Inbox; delivery/read only from webhook evidence.
   ═══════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import {
  coldWhatsAppVerdict, statusWhenWhatsAppUnavailable, statusWithContactEvidence, statusBeforeQueue,
  NO_WHATSAPP_STATUS, COLD_NOT_ELIGIBLE_LABEL,
} from '../src/lib/coldWhatsAppEligibility.ts';
import { isUkColdDestination } from '../src/lib/ukColdDestination.ts';
import { deriveQueue, recordQueueBatch, readQueueBatch, clearQueueBatch } from '../src/lib/whatsappQueueView.ts';
import { QUEUE_SKIP_LABEL } from '../src/lib/salesCrm.ts';
import { LAUNCH_SKIP_TEXT } from '../src/lib/campaignRules.ts';
import { groupInboxMessages, conversationLeadId } from '../src/lib/inboxCache.ts';
import { leadFailurePatch } from '../supabase/functions/_shared/whatsapp-failure.ts';

let f = 0;
const ok = (c: unknown, msg: string) => { if (c) console.log('  ✓ ' + msg); else { f++; console.log('  ✗ ' + msg); } };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (src: string) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*--.*$/gm, '');
const slice = (src: string, from: string, to: string) => { const i = src.indexOf(from); return i < 0 ? '' : src.slice(i, src.indexOf(to, i + from.length)); };

console.log('1. one eligibility rule — UK mobile only');
{
  ok(coldWhatsAppVerdict('07911 123456', 'UK').eligible === true, 'an untouched UK mobile is eligible (1)');
  ok(coldWhatsAppVerdict('+44 7911 123456', null).eligible === true, '…+44 form, blank country');
  const none = coldWhatsAppVerdict('', 'UK'); ok(!none.eligible && !none.eligible && (none as { reason: string }).reason === 'no_phone', 'missing phone -> no_phone (7)');
  ok((coldWhatsAppVerdict(null, 'UK') as { reason: string }).reason === 'no_phone', '…null too');
  ok(!coldWhatsAppVerdict('call us', 'UK').eligible, 'malformed phone is not eligible (7)');
  ok((coldWhatsAppVerdict('01632 960123', 'UK') as { reason: string }).reason === 'landline', 'UK landline -> landline (8)');
  ok((coldWhatsAppVerdict('020 7946 0123', 'UK') as { reason: string }).reason === 'landline', '…London landline');
  ok(!coldWhatsAppVerdict('+91 98765 43210', 'India').eligible, 'an Indian mobile is refused — India stays OFF (9)');
  ok(!coldWhatsAppVerdict('+91 98765 43210', 'UK').eligible, '…even on a lead mislabelled UK (property of the digits, not the country column)');
  ok(!coldWhatsAppVerdict('0412 345 678', 'Australia').eligible, 'an Australian mobile is refused — Australia cold WhatsApp stays OFF (10)');
  ok(!coldWhatsAppVerdict('+61 412 345 678', 'Australia').eligible, '…international form too');
  ok(!coldWhatsAppVerdict('0412 345 678', 'UK').eligible, '…and an Australian mobile stored on a UK lead (04…) is refused, not guessed');
  ok(isUkColdDestination('447911123456') && !isUkColdDestination('919876543210') && !isUkColdDestination('61412345678') && !isUkColdDestination(null), 'the leaf behind it: UK mobile yes, India/AU/null no');
  const reasons = Object.keys(COLD_NOT_ELIGIBLE_LABEL).sort();
  ok(JSON.stringify(reasons) === JSON.stringify(['bad_number', 'landline', 'no_phone', 'not_a_uk_mobile']), 'every not-eligible reason has words');
}

console.log('2. the unreachable lead is flagged, never left New; nothing further along is touched');
{
  ok(NO_WHATSAPP_STATUS === 'no_whatsapp_needs_sms', 'the EXISTING marker is reused (no new status)');
  ok(statusWhenWhatsAppUnavailable('not_contacted') === 'no_whatsapp_needs_sms', 'New -> No WhatsApp');
  ok(statusWhenWhatsAppUnavailable('queued') === 'no_whatsapp_needs_sms' && statusWhenWhatsAppUnavailable(null) === 'no_whatsapp_needs_sms', '…queued / absent too');
  for (const s of ['initial_contact', 'replied', 'interested', 'price_given', 'report_sent', 'in_delivery', 'completed', 'not_interested', 'opted_out']) {
    ok(statusWhenWhatsAppUnavailable(s) === s, `…${s} is left alone`);
  }
  ok(statusBeforeQueue('queued') === 'not_contacted' && statusBeforeQueue(null) === 'not_contacted' && statusBeforeQueue('initial_contact') === 'initial_contact', 'pulled from the queue it returns to its pre-queue status');
}

console.log('3. genuine contact reconciles New -> Contacted; never downgrades');
{
  ok(statusWithContactEvidence('not_contacted', true) === 'initial_contact', 'New + genuine contact -> Contacted (5)');
  ok(statusWithContactEvidence('queued', true) === 'initial_contact' && statusWithContactEvidence(null, true) === 'initial_contact', '…queued / absent too');
  for (const s of ['initial_contact', 'replied', 'interested', 'price_given', 'won_pending_onboarding', 'payment_received', 'in_delivery', 'completed', 'refunded', 'not_interested', 'opted_out', 'no_whatsapp_needs_sms']) {
    ok(statusWithContactEvidence(s, true) === s, `…${s} is NEVER overwritten (6)`);
  }
  ok(statusWithContactEvidence('not_contacted', false) === 'not_contacted', 'no evidence of its own -> left exactly as it was (a duplicate row\'s thread proves nothing)');
}

console.log('4. Contact Method is not contact evidence — a Call tap changes nothing the queue reads');
{
  const table = read('src/components/OutreachTable.tsx');
  const call = slice(table, 'const handleCallClick = useCallback', '}, [onContactGated, onContactMethodChange]);');
  ok(call.length > 100, 'found handleCallClick');
  ok(/onContactMethodChange\?\.\(lead\.id, 'call'/.test(code(call)), 'Call sets Contact Method = call (2)');
  ok(!/executeContact|logAttempt|updateLead|onUpdateLead|last_outreach_attempt_at|outreach_attempts|status:/.test(code(call)), 'Call records no attempt, no status, no history (3, 22)');
  const enqueue = slice(table, 'const handleQueueForWhatsApp = async', '// Archive selected leads');
  ok(enqueue.length > 500, 'found the admin enqueue');
  ok(!/contact_method/.test(code(enqueue).replace(/contact_method: 'whatsapp'[^\n]*/, '')), 'the enqueue filter never reads contact_method (only WRITES whatsapp on a queued lead)');
  for (const fn of ['20261001230000_claim_rule_failed_sends.sql', '20261008110000_opener_contact_guard.sql', '20261017090000_queue_truthful_flags.sql']) {
    const sql = code(read('supabase/migrations/' + fn));
    // the only contact_method occurrences allowed are WRITES on the queued row
    const reads = sql.replace(/contact_method = 'whatsapp'/g, '');
    ok(!/contact_method/.test(reads), `${fn}: no contact-evidence rule reads contact_method`);
  }
  const drip = code(read('supabase/functions/process-whatsapp-queue/index.ts'));
  ok(!/\.eq\("contact_method"|contact_method\s*===|contact_method\s*!==/.test(drip), 'the drip never decides from contact_method');
}

console.log('5. what counts as contact — the one definition, split by reason');
{
  const mig = code(read('supabase/migrations/20261017090000_queue_truthful_flags.sql'));
  ok(/lead_contact_basis/.test(mig) && /'own_message'/.test(mig) && /'sign_up'/.test(mig) && /'attempt'/.test(mig), 'lead_contact_basis names own message / sign-up / attempt / number');
  ok(/when 'own_message' then 'already_contacted'/.test(mig) && /when 'sign_up' then 'sign_up_started'/.test(mig) && /when 'attempt' then 'whatsapp_app_opened'/.test(mig) && /else 'number_already_contacted'/.test(mig), 'each basis has its own skip key');
  ok(/if v_basis = 'own_message' then\s+update public\.outreach_leads set status = 'initial_contact'[^;]*status = 'not_contacted'/.test(mig), 'only a lead\'s OWN message reconciles it, and only from not_contacted');
  ok(!/number_already_contacted[\s\S]{0,200}set status/.test(mig.slice(mig.indexOf("else 'number_already_contacted'"), mig.indexOf("else 'number_already_contacted'") + 120)), 'a duplicate row\'s thread changes no status');
  ok(/v_reason in \('no_phone', 'not_a_uk_mobile'\)[\s\S]{0,200}status = 'no_whatsapp_needs_sms'/.test(mig), 'no phone / not a UK mobile -> No WhatsApp on the lead');
  ok(/\^7\[0-9\]\{9\}\$/.test(mig) && !/91\[6-9\]/.test(mig), 'SQL keeps UK-only: India pattern absent');
  // every reason the SQL can produce has words in BOTH label tables (no raw key shown to a rep)
  const reasons = [...mig.matchAll(/v_reason := '([a-z_]+)'/g)].map((m) => m[1]).concat(['already_contacted', 'sign_up_started', 'whatsapp_app_opened', 'number_already_contacted']);
  const uniq = [...new Set(reasons)];
  ok(uniq.length >= 8, `found the SQL reason keys (${uniq.length})`);
  for (const k of uniq) {
    ok(k in QUEUE_SKIP_LABEL, `QUEUE_SKIP_LABEL has words for ${k}`);
    ok(k in LAUNCH_SKIP_TEXT, `LAUNCH_SKIP_TEXT has words for ${k}`);
  }
  ok(QUEUE_SKIP_LABEL.already_contacted !== QUEUE_SKIP_LABEL.number_already_contacted, 'a duplicate-row skip is not worded as "already contacted"');
}

console.log('6. skip counts match their reasons — no catch-all');
{
  const table = read('src/components/OutreachTable.tsx');
  ok(!/already contacted, queued or suppressed/.test(code(table)), 'the "already contacted, queued or suppressed" catch-all is gone (12)');
  const enqueue = slice(table, 'const handleQueueForWhatsApp = async', '// Archive selected leads');
  for (const k of ['no_whatsapp', 'in_queue', 'already_sent', 'opted_out', 'number_in_conversation', 'logged_conversation']) ok(new RegExp(`skipNames\\.${k}\\.push`).test(enqueue), `bucket ${k} is counted where it is decided`);
  ok(/coldWhatsAppVerdict\(lead\?\.phone, lead\?\.country\)/.test(enqueue) && /statusWhenWhatsAppUnavailable\(lead\?\.status\)/.test(enqueue), 'an unreachable lead is flagged through the shared leaf');
  ok(!/classifyLineType\(lead\?\.phone, lead\?\.country\);\s*\n\s*if \(!whatsappEligible\)/.test(enqueue), 'the old empty-number-is-eligible gate is gone');
  ok(/names: skipNames\[key\]/.test(enqueue), 'the batch note carries business names');
  clearQueueBatch();
  const b = recordQueueBatch(2, [{ n: 3, label: 'x', names: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }, { n: 0, label: 'y' }]);
  ok(b.skipped.length === 1 && b.skipped[0].names?.length === 5, 'a zero bucket is dropped and names are capped');
  ok(readQueueBatch()?.queued === 2, 'the batch is kept for the tab');
  clearQueueBatch();
}

console.log('7. queue panel says so about leads that can never send');
{
  const row = (o: Record<string, unknown>) => ({ id: String(o.id), business_name: 'b', status: 'queued', is_archived: false, queued_at: '2026-10-08T09:00:00Z', whatsapp_template: 'initial_contact', phone: '07911123456', country: 'UK', contact_followup_queued_at: null, hook_followup_queued_at: null, ...o });
  const v = deriveQueue([row({ id: 'a' }), row({ id: 'b', phone: null }), row({ id: 'c', phone: '' }), row({ id: 'd', phone: '+61 412 345 678', country: 'Australia' }), row({ id: 'e', phone: '020 7946 0123' }), row({ id: 'f', is_archived: true, phone: null })] as never);
  ok(v.waiting.length === 5 && v.unsendable === 4, 'no number / blank / Australian / landline are unsendable; archived and the UK mobile are not (4 of 5)');
  const panel = read('src/components/WhatsAppQueuePanel.tsx');
  ok(/queue-test-held/.test(panel) && /testHeldQueuedCount/.test(panel), 'a lead held by a test account is called out, not shown as waiting');
  const drip = read('supabase/functions/process-whatsapp-queue/index.ts');
  ok(/testHeldQueuedCount/.test(drip) && /from\("metric_exclusions"\)\.select\("value"\)\.eq\("kind", "user"\)/.test(drip), 'the server counts them from the same exclusions the sender refuses on');
}

console.log('8. the drip: flagged not New, never downgraded, phoneless sweep');
{
  const drip = code(read('supabase/functions/process-whatsapp-queue/index.ts'));
  ok(/or\("phone\.is\.null,phone\.eq\."\)/.test(drip) && /statusWhenWhatsAppUnavailable\(statusBeforeQueue\(p\.previous_status\)\)/.test(drip), 'a queued lead with no number leaves the queue (it sat 9 days)');
  ok(!/status: "not_contacted", whatsapp_delivery_status: "bad_number"/.test(drip) && !/status: "not_contacted", whatsapp_delivery_status: NOT_A_UK_MOBILE/.test(drip) && !/status: "not_contacted", whatsapp_delivery_status: "phone_already_contacted"/.test(drip), 'no drop-out hard-codes not_contacted over the lead\'s real status any more');
  ok(/statusWithContactEvidence\(statusBeforeQueue\(lead\.previous_status as string \| null\), ownThread\)/.test(drip) && /ownThread = \(prior\[0\] as \{ lead_id\?: string \| null \}\)\.lead_id === lead\.id/.test(drip), 'phone_already_contacted reconciles only on the lead\'s OWN thread');
  ok(/statusWithContactEvidence\(statusBeforeQueue\(lead\.previous_status as string \| null\), true\)/.test(drip), 'a logged conversation reconciles New -> Contacted at the drop-out');
  ok(/isColdOutreachTemplate\(templateName\) && !isUkColdDestination\(toNumber\)/.test(drip), 'the UK-only cold gate is still at send time (India / Australia OFF)');
}

console.log('9. Meta acceptance is the only thing that makes a send "sent"');
{
  const drip = code(read('supabase/functions/process-whatsapp-queue/index.ts'));
  const send = drip.slice(drip.indexOf('if (sendLive) {'), drip.indexOf('// Route the lead by outcome:') > 0 ? drip.indexOf('// Route the lead by outcome:') : drip.indexOf('Route the lead'));
  ok(/res\.ok && data\?\.messages\?\.\[0\]\?\.id/.test(send), 'accepted = HTTP ok AND a Meta message id (13)');
  ok(/messageId = data\.messages\[0\]\.id;\s*outcome = "sent";\s*deliveryStatus = "sent";/.test(send), '…and only then is it "sent" with the id kept (14)');
  ok(/sendError = JSON\.stringify\(data\?\.error \?\? data\)/.test(send) && /classifyFailure\(failCode\) === "permanent" \? "no_whatsapp" : "temporary"/.test(send), 'a rejection keeps Meta\'s error and is permanent or temporary — never sent (15)');
  ok(/catch \(e\)[\s\S]*outcome = "temporary";[\s\S]*deliveryStatus = "failed_temporary"/.test(send), 'a network throw is a temporary failure, never sent');
  const raw = read('supabase/functions/process-whatsapp-queue/index.ts');
  const afterSend = code(raw.slice(raw.indexOf('// Route the lead by outcome:'), raw.indexOf('// Pace the next send after ANY')));
  const sentBranch = afterSend.slice(0, afterSend.lastIndexOf('} else {'));
  const failBranch = afterSend.slice(afterSend.lastIndexOf('} else {'));
  ok(/status: "initial_contact"[\s\S]*whatsapp_sent_at: nowIso[\s\S]*whatsapp_message_id: messageId/.test(sentBranch), 'only the accepted branch marks the lead Contacted and stamps sent_at + message id');
  ok(!/initial_contact|whatsapp_sent_at/.test(failBranch) && /leadFailurePatch\(/.test(failBranch), 'the failure branch never marks contacted (16)');
  for (const [code2, label] of [[131026, 'permanent'], [131000, 'temporary'], [undefined, 'unknown']] as const) {
    const p = leadFailurePatch(code2 as number | undefined, 0, '2026-10-08T09:00:00Z', false);
    ok(!('whatsapp_sent_at' in p) && p.status !== 'initial_contact', `leadFailurePatch(${label}) neither stamps sent_at nor sets Contacted`);
  }
  ok(/whatsapp_sends"\)\.insert\(\{[\s\S]*message_id: messageId, delivery_status: deliveryStatus, error: sendError/.test(drip), 'the audit row keeps message id, status and Meta error');
}

console.log('10. one outbound row, no duplicates; a lost log row is reported, not swallowed');
{
  const drip = code(read('supabase/functions/process-whatsapp-queue/index.ts'));
  const opener = drip.slice(drip.indexOf('if (sendLive) {'));
  const inserts = opener.match(/from\("whatsapp_messages"\)\.insert\(/g) ?? [];
  ok(inserts.length === 1, `one whatsapp_messages insert site in the opener lane's send (found ${inserts.length})`);
  ok(/attempt > 0 && messageId[\s\S]{0,200}eq\("wa_message_id", messageId\)/.test(drip), 'the retry first checks the message id is not already on a row (19)');
  ok(/error_id: "queue_outbound_log_failed"/.test(drip), 'a failed log row leaves a client_error_reports row with the Meta id');
}

console.log('11. an outbound-only conversation appears in the Inbox');
{
  const msgs = [
    { id: '1', created_at: '2026-10-01T15:07:04Z', user_id: 'owner', phone: '447911123456', lead_id: 'lead-1', direction: 'outbound', status: 'sent', wa_message_id: 'wamid.A' },
  ];
  const groups = groupInboxMessages(msgs);
  ok(groups.size === 1, 'one outbound message, no reply -> one conversation (18)');
  const [, g] = [...groups][0];
  ok(conversationLeadId(g) === 'lead-1', '…tied to its lead');
  const inbox = read('src/hooks/useInbox.ts');
  const conv = slice(inbox, 'const conversations = useMemo<WaConversation[]>', 'return out.sort');
  ok(!/lastInbound\s*(?:===|==|!==|!=)|if \(!lastInbound\)|continue;[\s\S]{0,40}inbound/.test(conv.replace(/if \(!leadId \|\| !ownLeadIds\.has\(leadId\)\) continue;/, '')), 'the conversation builder has no "needs an inbound" filter');
  ok(/if \(!leadId \|\| !ownLeadIds\.has\(leadId\)\) continue;/.test(conv), 'the only scope is the lead\'s owner (unarchived, has a phone)');
}

console.log('12. delivery / read come only from webhook evidence');
{
  const drip = code(read('supabase/functions/process-whatsapp-queue/index.ts'));
  const assigned = [...drip.matchAll(/deliveryStatus = "([a-z_]+)"/g)].map((m) => m[1]);
  ok(assigned.every((s) => ['simulated', 'sent', 'no_whatsapp', 'failed_temporary'].includes(s)), `the sender only ever writes simulated/sent/failed (found ${[...new Set(assigned)].join(', ')}) — never delivered/read (20)`);
  const swm = code(read('supabase/functions/send-whatsapp-message/index.ts'));
  ok(!/status: "(delivered|read)"|deliveryStatus = "(delivered|read)"/.test(swm), 'the Inbox sender never claims delivered/read either');
}

console.log('13. Find Leads / import never resets a contacted lead; cancel never fabricates contact');
{
  const hook = read('src/hooks/useOutreach.ts');
  const add = slice(hook, 'const addLead = useCallback', 'const hasTrackedLead') || hook.slice(hook.indexOf('const addLead = useCallback'), hook.indexOf('const addLead = useCallback') + 14000);
  ok(add.length > 3000, 'found addLead');
  ok(!/\.upsert\(/.test(code(add)), 'addLead never upserts over an existing lead (11)');
  ok(/'Previously added'/.test(add) && /fails closed|FAILS CLOSED/.test(add), 'an existing business is refused with its history untouched; the dedupe check fails closed');
  ok(/sales_add_lead/.test(add) && /refuses an existing business/.test(add), 'a salesperson\'s add goes through the server dedupe');
  const unq = code(read('supabase/migrations/20260927100100_multi_user_sales.sql'));
  const panel = read('src/components/WhatsAppQueuePanel.tsx');
  ok(/leadRpc\('lead_unqueue'/.test(panel), 'removing from the queue goes through lead_unqueue');
  ok(!/whatsapp_sent_at|last_outreach_attempt_at|outreach_attempts/.test(code(slice(panel, 'const removeFromQueue = async', 'const removeContactFollowup'))), 'removal writes no sent stamp and no attempt (21)');
  void unq;
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall passed');
