/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ONE REAL-CONTACT GUARD FOR EVERY COLD OPENER (2026-10-05) — docs/pre-sales-certification/sales-workspace-v2.md §12.
   "Has this prospect already had a genuine conversation with us?" is answered by ONE function, SQL
   opener_contact_block (on lead_reached_contact, whose outcome list = CONVERSATION_OUTCOMES), and every
   cold-opener door asks it: campaign launch + the sales queues (sales_queue_opener), the admin's Outreach bulk
   queue and per-lead toggle (contact_check → opener_contact_blocks), the drip at send time, and the one-off
   template send (send-whatsapp-message). Continuations and in-window replies never reach it.
   The live behaviour (each outcome against the real function) is proved by a rolled-back probe recorded in the doc.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { CONVERSATION_OUTCOMES, reachedInConversation } from '../src/lib/leadState.ts';
import { isColdOutreachTemplate } from '../src/lib/coldOutreach.ts';
import { QUEUE_SKIP_LABEL } from '../src/lib/salesCrm.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const root = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '').replace(/\/\/.*$/gm, '');
const row = (kind: string, data: Record<string, unknown>) => ({ kind, created_at: '2026-10-05T10:00:00Z', data } as never);

const GUARD = read('supabase/migrations/20261008110000_opener_contact_guard.sql');
const V2 = read('supabase/migrations/20261008100000_sales_workspace_v2.sql');
const queue = read('supabase/functions/process-whatsapp-queue/index.ts');
const sender = read('supabase/functions/send-whatsapp-message/index.ts');
const table = read('src/components/OutreachTable.tsx');
const controls = read('src/components/WhatsAppLeadControls.tsx');

console.log('── 1. what is (and is not) a genuine conversation — the one rule ──');
{
  ok(reachedInConversation([]) === null, 'tapping Call / opening tel: writes nothing → no contact → the opener is NOT suppressed');
  ok(!/executeContact|logAttempt|updateLead/.test(strip(table.slice(table.indexOf('const handleCallClick'), table.indexOf('}, [onContactGated, onContactMethodChange]);')))), '…and the Call tap records no contact (it sets only the Contact Method pill, which the opener guard never reads)');
  ok(reachedInConversation([row('call_outcome', { outcome: 'no_answer' })]) === null, 'no answer does NOT suppress the opener');
  ok(reachedInConversation([row('call_outcome', { outcome: 'left_voicemail' })]) === null, 'voicemail does NOT suppress the opener');
  ok(reachedInConversation([row('marked_interested', { on: true }), row('state_changed', { to: 'interested', from: 'new', outcome: 'interested' })]) === null, 'the Interested star alone does NOT suppress the opener (it is not a logged contact)');
  for (const o of ['spoke_to_owner', 'interested', 'call_back', 'meeting_booked', 'not_interested', 'agency_controls_site'])
    ok(reachedInConversation([row('call_outcome', { outcome: o })]) === 'phone', `a logged call "${o}" suppresses the cold opener (contacted by phone)`);
  ok(reachedInConversation([row('contact_logged', { outcome: 'interested', channel: 'email' })]) === 'other', 'a logged conversation on another channel → contacted (logged)');
  const sqlList = [...(V2.match(/select array\[([^\]]+)\]/)?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort().join();
  ok(sqlList === [...CONVERSATION_OUTCOMES].sort().join(), 'ONE list: SQL lead_conversation_outcomes() = CONVERSATION_OUTCOMES');
  const block = GUARD.slice(GUARD.indexOf('function public.opener_contact_block('), GUARD.indexOf('$function$;', GUARD.indexOf('function public.opener_contact_block(')));
  ok(/public\.lead_reached_contact\(_lead_id\)/.test(block) && /'contacted_by_phone'/.test(block) && /'contacted_logged'/.test(block), 'opener_contact_block is lead_reached_contact, in two words — no second list');
  ok(/grant execute on function public\.opener_contact_block\(uuid\) to service_role/.test(GUARD) && /revoke all on function public\.opener_contact_block\(uuid\) from public, anon, authenticated/.test(GUARD), 'server-only: the edge functions may call it, a browser may not');
}

console.log('\n── 2. every cold-opener door asks the SAME function ──');
{
  const sqo = strip(GUARD.slice(GUARD.indexOf('function public.sales_queue_opener'), GUARD.indexOf('$function$;', GUARD.indexOf('function public.sales_queue_opener'))));
  ok(/v_reason := public\.opener_contact_block\(v_id\);/.test(sqo) && !/lead_reached_contact/.test(sqo), 'campaign launch + the sales queues (sales_queue_opener) → opener_contact_block');
  ok(/elsif public\.lead_first_contact_at\(v_id\) is not null then v_reason := 'already_contacted';/.test(sqo) && /guard_action\(v_uid, 'whatsapp_queue'/.test(sqo) && /'not_a_uk_mobile'/.test(sqo) && /'opted_out'/.test(sqo) && /'daily_limit'/.test(sqo), '…its other reasons unchanged, in the same order');
  const cc = strip(queue.slice(queue.indexOf('if (mode === "contact_check") {'), queue.indexOf('/* ══ mode \'suppress_lead\''))) ;
  ok(/service\.rpc\("opener_contact_blocks", \{ _lead_ids: ids \}\)/.test(cc) && /conversation\[b\.lead_id\] = b\.reason/.test(cc) && /error: "contact_check_failed"/.test(cc), 'the Outreach pre-check (contact_check) → opener_contact_blocks, failing closed');
  ok(/eq\("assigned_to_user_id", salesActor\.id\)/.test(cc), '…a salesperson is answered only for their own leads');
  ok(/return json\(\{ ok: true, mode, contacted: \[\], suppressed: \[\], conversation \}\)/.test(cc) && /conversation,\n\s*\}\);/.test(cc), '…and the answer travels back on both return paths');
  const drip = queue.slice(queue.indexOf('THE REAL-CONTACT GUARD AT SEND TIME'), queue.indexOf('// Already-contacted guard: NEVER re-send'));
  ok(/if \(isColdOutreachTemplate\(templateName\)\) \{\s*const \{ data: block, error: blockErr \} = await service\.rpc\("opener_contact_block", \{ _lead_id: lead\.id \}\);/.test(drip), 'the drip, at send time (the server enforcement for EVERY way a lead reaches the queue) → opener_contact_block');
  ok(/skipped: "contact_guard_unreadable"/.test(drip) && drip.indexOf('contact_guard_unreadable') < drip.indexOf('.update('), '…an unreadable answer sends nothing and changes nothing (fails closed)');
  const send = sender.slice(sender.indexOf('THE REAL-CONTACT GUARD (2026-10-05'), sender.indexOf('let tvars'));
  ok(/if \(isColdOutreachTemplate\(templateName\) && resolvedLeadId\) \{\s*const \{ data: block, error: blockErr \} = await service\.rpc\("opener_contact_block", \{ _lead_id: resolvedLeadId \}\);/.test(send) && !/allowResend/.test(strip(send)), 'the one-off template send (send-whatsapp-message) → opener_contact_block, and allow_resend cannot talk it round');
  ok(/error: "contact_guard_unreadable"/.test(send), '…an unreadable answer refuses the cold send');
  /* The marker moves on with every later change (2026-10-07a: the link templates); the contact guard must still be in it. */
  ok(/BUILD_ID = "2026-10-(0[5-9]|1[0-9])[a-z]-[a-z-]+"/.test(sender) && /opener_contact_block/.test(sender), 'send-whatsapp-message BUILD_ID bumped (the deploy marker) and the contact guard still present');
  ok(/body: \{ mode: 'contact_check', phones, \.\.\.\(wantsColdGuard \? \{ lead_ids: ids \} : \{\}\) \}/.test(table) && /if \(wantsColdGuard && conversation\[id\]\) \{ blockedConversation\+\+; return false; \}/.test(table), 'Outreach bulk queue (admin) asks it for a cold template and does not queue those leads');
  ok(/if \(isColdOutreachTemplate\(template\)\) \{[\s\S]{0,400}mode: 'contact_check', phones: \[\], lead_ids: \[lead\.id\]/.test(controls) && /if \(chkErr \|\| !res\?\.ok\) \{ toast\(\{ title: 'Not queued'/.test(controls), 'the per-lead queue toggle (admin) asks it too, failing closed');
  ok(/salesQueueOpener\(\[lead\.id\], template\)/.test(controls) && /handleSalesQueue|salesQueueOpener/.test(table), 'a salesperson\'s per-lead and bulk queue still go through sales_queue_opener (the same function)');
  ok(/campaign_launch[\s\S]*v_r := public\.sales_queue_opener\(v_chunk, v_template\);/.test(V2), 'campaign launch still goes through sales_queue_opener → therefore the campaign and Outreach decisions are the same function');
}

console.log('\n── 3. said plainly; nothing else about the lead changes ──');
{
  ok(QUEUE_SKIP_LABEL.contacted_by_phone === 'already contacted by phone — initial opener not queued' && /\$\{QUEUE_SKIP_LABEL\.contacted_by_phone\}/.test(table), 'Outreach says "already contacted by phone — initial opener not queued" (the shared wording)');
  ok(/Already contacted by phone" : "Already in conversation \(a logged contact\)"\} — initial opener not queued\./.test(queue), 'the drip records the same words');
  const upd = queue.slice(queue.indexOf('if (block === "contacted_by_phone" || block === "contacted_logged") {'), queue.indexOf('return json({', queue.indexOf('if (block === "contacted_by_phone" || block === "contacted_logged") {')));
  ok(/status: back, previous_status: null, queued_at: null, whatsapp_delivery_status: block, contact_method: null/.test(upd), 'a refused lead leaves the queue exactly as it was before it was queued (previous status)');
  ok(!/campaign_id|next_action|is_archived|assigned_to/.test(upd), '…its campaign, Next Action, archive and owner are not touched — no artificial Next Action');
  const cb = table.slice(table.indexOf('const queueable = ids.filter'), table.indexOf('const skipped = ids.length - queueable.length;'));
  ok(!/onUpdateLead|update\(/.test(cb), 'Outreach writes nothing to a skipped lead (it stays in the CRM and its campaign, status unchanged)');
}

console.log('\n── 4. a real conversation can still continue ──');
{
  for (const t of ['audit_reply', 'audit_reply_warm', 'audit_followup', 'audit_followup_call', 'audit_followup_fault', 'explain_offer', 'explain_offer_v2', 'report_followup', 'contact_followup', 'onboarding_followup', 're_engage_49'])
    ok(!isColdOutreachTemplate(t), `${t} is a continuation — never reaches the guard`);
  for (const t of ['initial_contact', 'initial_opener_v2', 'video_template', 'competitor_hook'])
    ok(isColdOutreachTemplate(t), `${t} is a cold opener — guarded`);
  const send = sender.slice(sender.indexOf('THE REAL-CONTACT GUARD (2026-10-05'), sender.indexOf('let tvars'));
  ok(/isColdOutreachTemplate\(templateName\)/.test(send) && /Free-form replies and continuations never reach this/.test(send), 'a free-form reply in the open 24-hour window is not a template — untouched');
  ok(!/opener_contact_block/.test(queue.slice(0, queue.indexOf('if (mode === "contact_check") {'))), 'the reply rules / first-reply lane before contact_check do not read the guard');
}

if (f) { console.log(`\n${f} FAILURE(S)`); process.exit(1); }
console.log('\nALL PASS');
