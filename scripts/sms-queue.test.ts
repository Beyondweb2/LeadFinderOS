/* ═══════════════════════════════════════════════════════════
   SMS QUEUE + TEXT BUTTON + ONE INBOX + CONTACT METHOD (2026-10-09, feat/sms-queue-and-method).
   Pins: the queue is a lane (never a status), every skip names its reason, the drip sends one text per tick through the ONE
   guarded sender as the person who queued, the cold text has the cold rules, the Inbox follows a lead's Contact Method, the
   salesperson's nav says Inbox. Provider calls are never made; server code and SQL are asserted on their text.
   ═══════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { SMS_COLD_TEMPLATES, SMS_CONVERSATION_TEMPLATES, SMS_TEMPLATE_NAMES, SMS_TEMPLATES_NEEDING_REAL_NAME, isColdSmsTemplate, smsTextFromWhatsAppBody, SMS_QUEUE_SKIP_WORDS, SMS_QUEUE_DAILY_CAP, SMS_QUEUE_WINDOW, smsWindowOpen, londonDayStartUtc } from '../src/lib/smsMessages.ts';
import { decideContactRoute } from '../src/lib/contactRouting.ts';
import { smsPreview, smsTemplateLabel } from '../src/lib/smsPreview.ts';
import { renderTemplateBody } from '../supabase/functions/_shared/whatsapp-send.ts';
import { smsSize } from '../src/lib/channelCosts.ts';
import { WHATSAPP_TEMPLATES } from '../src/types/outreach.ts';
import { INITIAL_OPENERS } from '../src/lib/openerVariant.ts';

let f = 0;
const ok = (c: unknown, msg: string) => { if (c) console.log('  ✓ ' + msg); else { f++; console.log('  ✗ ' + msg); } };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (src: string) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*--.*$/gm, '');

console.log('1. SMS reuses the WhatsApp templates — no copy of its own');
{
  ok(JSON.stringify([...SMS_COLD_TEMPLATES]) === JSON.stringify([...INITIAL_OPENERS]), 'the cold templates ARE the two WhatsApp openers (initial_contact, initial_opener_v2), from the one opener list');
  const labelled = new Set(WHATSAPP_TEMPLATES.map((t) => t.value));
  ok(SMS_TEMPLATE_NAMES.filter((n) => n !== 'findable_signup_link').every((n) => labelled.has(n)), 'every SMS template is a template in the WhatsApp picker list (findable_signup_link is the Quick Close link template)');
  ok(SMS_CONVERSATION_TEMPLATES.every((n) => !isColdSmsTemplate(n)) && !isColdSmsTemplate('video_template') && !isColdSmsTemplate('findable_signup_link'), 'only the two openers are cold');
  ok(!SMS_TEMPLATE_NAMES.some((n) => /audit|video|competitor|explain|ai_site/.test(n)), 'audit-driven and long WhatsApp templates are not offered by SMS');
  ok(SMS_TEMPLATES_NEEDING_REAL_NAME.has('book_call') && SMS_TEMPLATES_NEEDING_REAL_NAME.has('re_engage_49'), 'the greeting-name rule carries over');
  // EXACT parity: the text the server sends == the preview the screen shows, and both are the WhatsApp body, word for word
  for (const n of SMS_TEMPLATE_NAMES.filter((x) => x !== 'findable_signup_link')) {
    for (const biz of ['Smith & Sons Plumbing', 'Beeson Plumbing & Heating Ltd', 'MCLocksmiths']) {
      const wa = renderTemplateBody(n, biz, '', undefined, undefined, undefined, 'Leeds');
      const server = smsTextFromWhatsAppBody(n, wa);
      ok(smsPreview(n as never, { business_name: biz, derived_town: 'Leeds' }) === server, `${n} / ${biz}: the preview equals what the server sends`);
      ok(server === wa.trim(), `${n} / ${biz}: the SMS is the WhatsApp body word for word — nothing added`);
      ok(!/opt out|STOP|Findable/i.test(server.replace(wa.trim(), '')), `${n} / ${biz}: no suffix, no identification, no extra wording`);
    }
  }
  const a = smsTextFromWhatsAppBody('initial_contact', renderTemplateBody('initial_contact', 'Smith & Sons Plumbing', ''));
  ok(a === 'Hi, is this Smith & Sons Plumbing?\n\nCheers', 'initial_contact reads exactly as on WhatsApp');
  ok(smsTextFromWhatsAppBody('initial_opener_v2', renderTemplateBody('initial_opener_v2', 'X', '')) === 'Hey, are you taking on more jobs atm? Cheers', 'initial_opener_v2 reads exactly as on WhatsApp');
  // segments: every offered template (with a realistic link for the link template)
  const agree = 'https://findable.live/agree/' + 'a1'.repeat(32);
  const link = smsTextFromWhatsAppBody('findable_signup_link', renderTemplateBody('findable_signup_link', 'Sam', agree));
  const sizes = Object.fromEntries(SMS_TEMPLATE_NAMES.map((n) => [n, smsSize(n === 'findable_signup_link' ? link : smsPreview(n as never, { business_name: 'Beeson Plumbing & Heating Ltd', derived_town: 'Leeds' })).segments]));
  ok(SMS_COLD_TEMPLATES.every((n) => sizes[n] === 1), 'both openers fit ONE text segment');
  console.log('    segments per template:', JSON.stringify(sizes));
  ok(smsTemplateLabel('initial_contact') === WHATSAPP_TEMPLATES.find((t) => t.value === 'initial_contact')!.label, 'labels come from the WhatsApp list');
}

console.log('2. schedule rules');
{
  ok(SMS_QUEUE_WINDOW.startHour === 9 && SMS_QUEUE_WINDOW.endHour === 20 && SMS_QUEUE_DAILY_CAP > 0, 'a narrower window than WhatsApp, and a daily cap');
  ok(smsWindowOpen(new Date('2026-10-09T10:00:00Z')) && !smsWindowOpen(new Date('2026-10-09T05:00:00Z')) && !smsWindowOpen(new Date('2026-10-09T20:30:00Z')) && smsWindowOpen(new Date('2026-12-09T09:30:00Z')), 'open 09:00-20:00 London (BST and GMT)');
  const d = londonDayStartUtc(new Date('2026-10-09T10:15:30Z'));
  ok(d.toISOString() === '2026-10-08T23:00:00.000Z', 'London midnight in BST is 23:00 UTC the day before');
  ok(londonDayStartUtc(new Date('2026-12-09T10:15:30Z')).toISOString() === '2026-12-09T00:00:00.000Z', '…and 00:00 UTC in winter');
}

console.log('3. the queue is a lane, not a status; every skip has its reason');
{
  const m1 = code(read('supabase/migrations/20261019090000_sms_queue_and_method.sql'));
  const m = code(read('supabase/migrations/20261019100000_sms_queue_template.sql'));
  const q = m.slice(m.indexOf('function public.queue_sms_openers'), m.indexOf('function public.unqueue_sms'));
  ok(/set sms_queued_at = now\(\), sms_queued_by_user_id = v_uid, sms_queued_template = v_template, sms_attempts = 0, contact_method = 'sms'/.test(q) && !/set status/.test(q), 'queueing sets the sms marker and the Text method — it never changes the lead\'s status');
  ok(/can_work_lead\(v_id\)/.test(q) && /lead_is_client/.test(q), 'a salesperson queues only their own, non-client leads');
  const reasons = [...q.matchAll(/v_reason := '([a-z_]+)'/g)].map((x) => x[1]).concat(['contacted_by_phone', 'contacted_logged']);
  for (const k of new Set(reasons)) ok(k in SMS_QUEUE_SKIP_WORDS, `skip reason ${k} has words`);
  ok(/'\^7\[0-9\]\{9\}\$'|\^7\[0-9\]\{9\}\$/.test(q) && !/\^91/.test(q), 'UK mobiles only (India / Australia off)');
  ok(/contact_suppressions/.test(q) && /sms_messages m where m\.direction = 'outbound'/.test(q) && /whatsapp_messages w/.test(q) && /opener_contact_block\(v_id\)/.test(q), 'opt-out, already texted, WhatsApp conversation and logged conversation all refuse');
  ok(/guard_action\(v_uid, 'sms_send'/.test(q) && /array_length\(_lead_ids, 1\) > 200/.test(q), 'rate limited and capped at 200 a time');
  ok(/v_template not in \('initial_contact', 'initial_opener_v2'\)/.test(q) && /drop function if exists public\.queue_sms_openers\(uuid\[\]\)/.test(m), 'the queue takes the template and accepts ONLY the two WhatsApp openers');
  ok(/revoke all on function public\.queue_sms_openers\(uuid\[\], text\) from public, anon/.test(m) && /grant execute on function public\.queue_sms_openers\(uuid\[\], text\) to authenticated/.test(m), 'signed-in callers only');
  ok(/lead_set_contact_method[\s\S]*_method not in \('call', 'whatsapp', 'sms'\)/.test(m1), 'a rep may set Text as the Contact Method');
  ok(/enable row level security/.test(m1) && !/create policy[^;]*sms_queue_state/.test(m1), 'the queue state table has no browser policy');
  ok(/my_role\(\) = 'sales' and l\.assigned_to_user_id = auth\.uid\(\)/.test(m), 'a salesperson sees only their own queue');
  ok(/sms_queue_set_paused[\s\S]{0,260}admin_only/.test(m1), 'only the admin pauses it');
}

console.log('4. the drip: one text per tick, as the person who queued, through the one guarded sender');
{
  const d = code(read('supabase/functions/process-sms-queue/index.ts'));
  ok(d.indexOf('isInternalCall(req)') > 0 && d.indexOf('isInternalCall(req)') < d.indexOf('st.paused'), 'the cron secret (or an admin Send now) is checked before anything is read; nobody else may call it');
  const order = ['paused === true', 'smsWindowOpen()', 'st.next_send_at &&', '>= SMS_QUEUE_DAILY_CAP', 'sendSmsToLead('].map((x) => d.indexOf(x));
  ok(order.every((n, i) => n > 0 && (i === 0 || n > order[i - 1])), 'order: paused -> window -> pacing -> daily cap -> send');
  ok((d.match(/sendSmsToLead\(/g) ?? []).length === 1, 'one send site, so at most one text per tick');
  ok(/template: lead\.sms_queued_template as never/.test(d) && /isColdSmsTemplate\(lead\.sms_queued_template\)/.test(d) && /source: "queue"/.test(d), 'sends the template stored on the lead, only if it is a cold opener, marked as queue');
  ok(/lead\.sms_queued_by_user_id/.test(d) && /user_roles/.test(d), 'sent AS the person who queued, with their role read fresh');
  ok(/qaSendVerdict\(qa/.test(d) && /\.kind !== "refuse"/.test(d) && /suspended\.has/.test(d), 'test-account-held and suspended-rep leads are skipped, never dropped');
  ok(/idempotencyKey: `smsq:\$\{lead\.id\}:\$\{String\(lead\.sms_queued_at\)\}`/.test(d), 'a retried tick cannot text twice (per lead, per queueing)');
  ok(/SMS_QUEUE_MAX_ATTEMPTS/.test(d) && /transient/.test(d), 'a transient failure retries a bounded number of times');
  ok(/sms_delivery_status: r\.error/.test(d), 'a refusal leaves its reason on the lead');
  ok(/\[functions\.process-sms-queue\]\s*\nverify_jwt = false/.test(read('supabase/config.toml')), 'config.toml entry (internal caller)');
  const cron = read('supabase/migrations/20261019090100_sms_queue_cron.sql');
  ok(/'sms-queue-run', '\* \* \* \* \*'/.test(cron) && /x-cron-secret/.test(cron), 'one-minute cron with the cron secret');
}

console.log('5. the guarded sender: cold rules, method, no double text');
{
  const s = code(read('supabase/functions/_shared/twilio-sms.ts'));
  ok(/isCold = isColdSmsTemplate\(a\.template\)/.test(s), 'cold is a property of the template (the two WhatsApp openers)');
  ok(/already_texted/.test(s) && /in_whatsapp_conversation/.test(s) && /contacted_logged/.test(s), 'cold rules: never texted, not in WhatsApp, not spoken to');
  ok(/const gate = isCold \|\| smsGateOpen\(/.test(s), 'only the cold text skips the conversation gate');
  ok(/if \(!simulated && status !== "failed"\)[\s\S]{0,400}contact_method: "sms"/.test(s), 'a real text moves the Contact Method to Text; a simulated or failed one does not');
  ok(/source\?: 'manual' \| 'queue'/.test(read('supabase/functions/_shared/twilio-sms.ts')), 'the sender knows whether it is the drip');
  const fn = code(read('supabase/functions/twilio-sms-send/index.ts'));
  ok(/template === SMS_LINK_TEMPLATE/.test(fn), 'the Inbox endpoint still refuses the sign-up link template');
}

console.log('6. routing: the intro text opens SMS for a message, never for a link');
{
  const base = { phone: '07911 123456', country: 'UK', email: null, smsConfigured: true, smsAllowed: false, coldTextOpen: true };
  const msg = decideContactRoute(base, 'message').options.find((o) => o.channel === 'sms')!;
  ok(msg.available && /intro text/.test(msg.reason), 'a message to a never-texted lead: SMS is available (intro text)');
  ok(!decideContactRoute(base, 'link').options.find((o) => o.channel === 'sms')!.available, 'a LINK still needs the conversation');
  ok(!decideContactRoute({ ...base, coldTextOpen: false }, 'message').options.find((o) => o.channel === 'sms')!.available, 'once texted / WhatsApped / spoken to, no second cold text');
  ok(!decideContactRoute({ ...base, optedOut: true }, 'message').options.find((o) => o.channel === 'sms')!.available, 'opted out: never');
}

console.log('7. the buttons, the panel, the nav');
{
  const t = read('src/components/OutreachTable.tsx');
  ok(/data-testid="outreach-sms"/.test(t) && /setSmsDialogLead\(lead\)/.test(t), 'an SMS icon beside the WhatsApp icon on every row');
  ok(/onSmsClick=\{\(\) => setSmsDialogLead\(lead\)\}/.test(t) && /data-testid="outreach-sms-mobile"/.test(read('src/components/OutreachMobileCard.tsx')), '…and on the phone-width card');
  ok(/data-testid="queue-sms-button"/.test(t) && /<QueueSmsDialog /.test(t), 'a "Queue text" bulk button');
  const dlg = read('src/components/QueueSmsDialog.tsx');
  ok(/queue_sms_openers/.test(dlg) && /_template: template/.test(dlg) && /queue-sms-example/.test(dlg) && /smsPreview\(template, sample/.test(dlg) && /SMS_QUEUE_SKIP_WORDS/.test(dlg) && /queue-sms-size/.test(dlg), 'the dialog picks the opener, shows the exact text with its segments and cost, calls the queue, and names every skip');
  ok(/<SmsQueuePanel \/>/.test(read('src/pages/WhatsAppQueue.tsx')), 'the text queue is on the queue page for both roles');
  const p = read('src/components/SmsQueuePanel.tsx');
  ok(/my_sms_queue/.test(p) && /unqueue_sms/.test(p) && /sms_queue_set_paused/.test(p), 'rows, Remove, and the admin pause');
  const side = read('src/components/AppSidebar.tsx');
  ok(/title: 'Inbox', url: '\/inbox'/.test(side) && !/title: role === 'sales' \? 'WhatsApp'/.test(side), 'the salesperson\'s nav says Inbox, not WhatsApp');
  ok(/title: 'Inbox', url: '\/inbox'/.test(read('src/components/MobileBottomNav.tsx')), '…on the phone nav too');
  ok(/useAllInboxUnread/.test(side) && /useAllInboxUnread/.test(read('src/components/MobileBottomNav.tsx')), 'the badge counts WhatsApp and text conversations together');
  ok(/label: 'Inbox'/.test(read('src/lib/shortcuts.ts')), 'the shortcut says Inbox');
}

console.log('8. a lead keeps its channel in the Inbox');
{
  const sw = read('src/components/InboxChannelSwitch.tsx');
  ok(/useLeadContactMethod\(!explicit && lead \? lead : null\)/.test(sw) && /method === 'sms' \? 'sms' : 'whatsapp'/.test(sw), 'with no channel in the address, the lead\'s Contact Method picks the tab');
  ok(/explicit === 'sms'\) return 'sms'/.test(sw) && /explicit === 'whatsapp'\) return 'whatsapp'/.test(sw), 'an explicit channel always wins (the switch works)');
  ok(/channel/.test(read('src/components/InboxChannelSwitch.tsx')), 'the Inbox channel switch exists (the SMS tab matches WhatsApp and no longer repeats the Contact Method badge)');
  ok(/'call', 'whatsapp', 'sms'/.test(read('src/lib/salesPatchPlan.ts')), 'a rep can set Text by hand');
  ok(/notifyLeadChanged\(leadId\)/.test(read('src/components/LeadSmsPanel.tsx')), 'sending a text refreshes every screen\'s copy of the lead');
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall passed');
