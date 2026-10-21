-- Rolled-back live test of the ONE status rule + the Visible flag (migration 20261118090000, 2026-10-21).
-- Run through the Management API AFTER the migration (or, before approval, appended to the migration text in ONE call:
-- the final RAISE rolls the migration back too). Output: QA_RESULT [ {check: bool}, ... ].
-- Every lead here is a ZZ QA fixture (metric_exclusions 'lead' row, 07700 900xxx numbers). Nothing is sent: rows only.
do $$
declare
  paul uuid := '9d5a7629-3171-4091-b3a4-43010a1d424d';
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); d uuid := gen_random_uuid();
  e uuid := gen_random_uuid(); f uuid := gen_random_uuid(); g uuid := gen_random_uuid(); h uuid := gen_random_uuid();
  v uuid := gen_random_uuid();
  m1 uuid; m2 uuid; m3 uuid;
  st text; n int; n2 int; res jsonb := '[]'::jsonb;
  t0 timestamptz := now() - interval '3 hours';
begin
  insert into public.outreach_leads (id, user_id, business_name, status, phone, assigned_to_user_id) values
    (a, paul, 'ZZ QA status replied flow',  'initial_contact', '+447700900301', paul),
    (b, paul, 'ZZ QA status yes it is',     'initial_contact', '+447700900302', paul),
    (c, paul, 'ZZ QA status auto-reply',    'initial_contact', '+447700900303', paul),
    (d, paul, 'ZZ QA status deal',          'payment_received', '+447700900304', paul),
    (e, paul, 'ZZ QA status not interested','not_interested',  '+447700900305', paul),
    (f, paul, 'ZZ QA status report',        'initial_contact', '+447700900306', paul),
    (g, paul, 'ZZ QA status sms',           'initial_contact', '+447700900307', paul),
    (h, paul, 'ZZ QA status repair',        'initial_contact', '+447700900308', paul),
    (v, paul, 'ZZ QA visible',              'replied',         '+447700900309', paul);
  insert into public.metric_exclusions (kind, value, reason)
    select 'lead', x::text, 'ZZ QA lead-status-from-messages' from unnest(array[a, b, c, d, e, f, g, h, v]) x;

  -- the senders write as the service role
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

  -- 1. opener only: Contacted stays Contacted
  insert into whatsapp_messages (lead_id, user_id, phone, direction, status, created_at, test_mode, template_name, message_type)
    values (a, paul, '+447700900301', 'outbound', 'read', t0, true, 'initial_contact', 'template');
  res := res || jsonb_build_object('opener only: stays Contacted', (select status from outreach_leads where id = a) = 'initial_contact');
  -- 2. their reply: Replied, at once, from the message itself
  insert into whatsapp_messages (lead_id, user_id, phone, direction, status, created_at, test_mode, body)
    values (a, paul, '+447700900301', 'inbound', 'received', t0 + interval '10 minutes', true, 'what is this about?');
  res := res || jsonb_build_object('their reply: Replied', (select status from outreach_leads where id = a) = 'replied');
  -- 3. a QUEUED Inbox message is not a send (it is not in whatsapp_messages until it goes; an accepted row does not count)
  insert into whatsapp_messages (lead_id, user_id, phone, direction, status, created_at, test_mode)
    values (a, paul, '+447700900301', 'outbound', 'accepted', t0 + interval '20 minutes', true) returning id into m1;
  res := res || jsonb_build_object('a not-yet-sent row: still Replied', (select status from outreach_leads where id = a) = 'replied');
  -- 4. it goes (accepted -> sent): You replied
  update whatsapp_messages set status = 'sent' where id = m1;
  res := res || jsonb_build_object('our free text goes: You replied', (select status from outreach_leads where id = a) = 'awaiting_reply');
  -- 5. delivered / read receipts change nothing
  update whatsapp_messages set status = 'delivered' where id = m1;
  update whatsapp_messages set status = 'read' where id = m1;
  res := res || jsonb_build_object('receipts: still You replied', (select status from outreach_leads where id = a) = 'awaiting_reply');
  -- 6. the late-write race: they reply, THEN the sender's old "You replied" write lands — the messages win
  insert into whatsapp_messages (lead_id, user_id, phone, direction, status, created_at, test_mode, body)
    values (a, paul, '+447700900301', 'inbound', 'received', t0 + interval '30 minutes', true, 'ok how much');
  res := res || jsonb_build_object('their next reply: Replied', (select status from outreach_leads where id = a) = 'replied');
  update outreach_leads set status = 'awaiting_reply' where id = a and status = 'replied';
  res := res || jsonb_build_object('a late sender write cannot say You replied over their newer message', (select status from outreach_leads where id = a) = 'replied');
  res := res || jsonb_build_object('…and that refusal is logged', exists (select 1 from lead_status_sync_log where lead_id = a and source = 'sender_guard'));
  -- 7. a voice note (AI or a person) is a send like any other
  insert into whatsapp_messages (lead_id, user_id, phone, direction, status, created_at, test_mode, message_type, sent_by_ai)
    values (a, paul, '+447700900301', 'outbound', 'sent', t0 + interval '40 minutes', true, 'audio', true) returning id into m2;
  res := res || jsonb_build_object('a voice note / AI-sent reply: You replied', (select status from outreach_leads where id = a) = 'awaiting_reply');
  -- 8. that send FAILS afterwards (Meta's failure receipt): back to Replied — they are still waiting on us
  update whatsapp_messages set status = 'failed' where id = m2;
  res := res || jsonb_build_object('our send failed: back to Replied', (select status from outreach_leads where id = a) = 'replied');
  -- 9. a burst: three messages from them, one status
  insert into whatsapp_messages (lead_id, user_id, phone, direction, status, created_at, test_mode, body) values
    (a, paul, '+447700900301', 'inbound', 'received', t0 + interval '50 minutes', true, 'hello'),
    (a, paul, '+447700900301', 'inbound', 'received', t0 + interval '50 minutes 5 seconds', true, 'are you there'),
    (a, paul, '+447700900301', 'inbound', 'received', t0 + interval '50 minutes 9 seconds', true, '?');
  res := res || jsonb_build_object('a burst: Replied', (select status from outreach_leads where id = a) = 'replied');
  -- 10. a message we sent that arrives with no lead attached and is linked later (the echo / post-call matcher case)
  insert into whatsapp_messages (lead_id, user_id, phone, direction, status, created_at, test_mode, body)
    values (null, paul, '+447700900301', 'outbound', 'sent', t0 + interval '55 minutes', true, 'sent from elsewhere') returning id into m3;
  res := res || jsonb_build_object('an unlinked send moves nothing yet', (select status from outreach_leads where id = a) = 'replied');
  update whatsapp_messages set lead_id = a where id = m3;
  res := res || jsonb_build_object('linked later: You replied', (select status from outreach_leads where id = a) = 'awaiting_reply');

  -- 11. a bare "yes it is" (Paul, 20 Oct: not a reply) — tagged by ai-reply-drafts → back to Contacted…
  insert into whatsapp_messages (lead_id, user_id, phone, direction, status, created_at, test_mode, template_name, message_type)
    values (b, paul, '+447700900302', 'outbound', 'read', t0, true, 'initial_contact', 'template');
  insert into whatsapp_messages (lead_id, user_id, phone, direction, status, created_at, test_mode, body)
    values (b, paul, '+447700900302', 'inbound', 'received', t0 + interval '5 minutes', true, 'Hi yes it is') returning id into m1;
  res := res || jsonb_build_object('yes it is: Replied until it is read', (select status from outreach_leads where id = b) = 'replied');
  update whatsapp_messages set reply_kind = 'confirmed' where id = m1;
  res := res || jsonb_build_object('yes it is, tagged: back to Contacted', (select status from outreach_leads where id = b) = 'initial_contact');
  -- …and when we answer it, You replied (the "stays on Contacted" fault)
  insert into whatsapp_messages (lead_id, user_id, phone, direction, status, created_at, test_mode, body)
    values (b, paul, '+447700900302', 'outbound', 'sent', t0 + interval '15 minutes', true, 'Thanks! quick one…');
  res := res || jsonb_build_object('we answer their yes: You replied', (select status from outreach_leads where id = b) = 'awaiting_reply');
  -- …and their real answer: Replied
  insert into whatsapp_messages (lead_id, user_id, phone, direction, status, created_at, test_mode, body)
    values (b, paul, '+447700900302', 'inbound', 'received', t0 + interval '25 minutes', true, 'how much is it');
  res := res || jsonb_build_object('their answer after that: Replied', (select status from outreach_leads where id = b) = 'replied');

  -- 12. an auto-responder: tagged → Contacted; our no-reply follow-up template after it stays Contacted (not You replied)
  insert into whatsapp_messages (lead_id, user_id, phone, direction, status, created_at, test_mode, template_name, message_type)
    values (c, paul, '+447700900303', 'outbound', 'read', t0, true, 'initial_contact', 'template');
  insert into whatsapp_messages (lead_id, user_id, phone, direction, status, created_at, test_mode, body)
    values (c, paul, '+447700900303', 'inbound', 'received', t0 + interval '1 minute', true, 'Thank you for your message, we are away') returning id into m1;
  update whatsapp_messages set reply_kind = 'auto' where id = m1;
  res := res || jsonb_build_object('auto-reply: Contacted', (select status from outreach_leads where id = c) = 'initial_contact');
  insert into whatsapp_messages (lead_id, user_id, phone, direction, status, created_at, test_mode, template_name, message_type)
    values (c, paul, '+447700900303', 'outbound', 'sent', t0 + interval '2 hours', true, 'contact_followup', 'template');
  res := res || jsonb_build_object('follow-up after an auto-reply: still Contacted, never You replied', (select status from outreach_leads where id = c) = 'initial_contact');

  -- 13. deals and people's outcomes are never touched
  insert into whatsapp_messages (lead_id, user_id, phone, direction, status, created_at, test_mode, body)
    values (d, paul, '+447700900304', 'inbound', 'received', t0, true, 'thanks');
  res := res || jsonb_build_object('a paid client stays Paid', (select status from outreach_leads where id = d) = 'payment_received');
  insert into whatsapp_messages (lead_id, user_id, phone, direction, status, created_at, test_mode, body)
    values (e, paul, '+447700900305', 'outbound', 'sent', t0, true, 'no worries');
  res := res || jsonb_build_object('Not interested stays Not interested on our send', (select status from outreach_leads where id = e) = 'not_interested');

  -- 14. a pitch template: the sender's own Report sent write stands; their reply moves it to Replied
  insert into whatsapp_messages (lead_id, user_id, phone, direction, status, created_at, test_mode, body)
    values (f, paul, '+447700900306', 'inbound', 'received', t0, true, 'yes go on');
  insert into whatsapp_messages (lead_id, user_id, phone, direction, status, created_at, test_mode, template_name, message_type)
    values (f, paul, '+447700900306', 'outbound', 'sent', t0 + interval '5 minutes', true, 'audit_reply', 'template');
  update outreach_leads set status = 'report_sent' where id = f;
  res := res || jsonb_build_object('a pitch: Report sent stands', (select status from outreach_leads where id = f) = 'report_sent');
  insert into whatsapp_messages (lead_id, user_id, phone, direction, status, created_at, test_mode, body)
    values (f, paul, '+447700900306', 'inbound', 'received', t0 + interval '30 minutes', true, 'interesting');
  res := res || jsonb_build_object('their reply to the pitch: Replied', (select status from outreach_leads where id = f) = 'replied');

  -- 15. SMS is the same rule (the SMS sender wrote nothing before)
  insert into sms_messages (lead_id, user_id, phone, direction, status, created_at, test_mode, body)
    values (g, paul, '+447700900307', 'inbound', 'received', t0, true, 'who is this');
  res := res || jsonb_build_object('a text reply: Replied', (select status from outreach_leads where id = g) = 'replied');
  insert into sms_messages (lead_id, user_id, phone, direction, status, created_at, test_mode, body)
    values (g, paul, '+447700900307', 'outbound', 'delivered', t0 + interval '3 minutes', true, 'Paul from Findable');
  res := res || jsonb_build_object('our text: You replied', (select status from outreach_leads where id = g) = 'awaiting_reply');

  -- 16. a person's own status choice is never second-guessed
  perform set_config('request.jwt.claims', json_build_object('sub', paul, 'role', 'authenticated')::text, true);
  update outreach_leads set status = 'replied' where id = g;
  res := res || jsonb_build_object('a person sets Replied: it stands', (select status from outreach_leads where id = g) = 'replied');
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

  -- 17. the repair: a stale status is put right, logged, and nothing else moves
  insert into whatsapp_messages (lead_id, user_id, phone, direction, status, created_at, test_mode, body)
    values (h, paul, '+447700900308', 'inbound', 'received', t0, true, 'tell me more');
  insert into whatsapp_messages (lead_id, user_id, phone, direction, status, created_at, test_mode, body)
    values (h, paul, '+447700900308', 'outbound', 'read', t0 + interval '1 hour', true, 'sure');
  perform set_config('lfos.status_sync', 'on', true);
  update outreach_leads set status = 'replied' where id = h;   -- the stale state (as before the rule existed)
  perform set_config('lfos.status_sync', 'off', true);
  select count(*) into n from ai_reply_drafts where lead_id = h;
  select count(*) into n2 from inbox_scheduled_sends where lead_id = h;
  res := res || jsonb_build_object('repair preview lists it and changes nothing',
    exists (select 1 from repair_lead_statuses_from_messages(false, h) r where r.lead_id = h and r.to_status = 'awaiting_reply')
    and (select status from outreach_leads where id = h) = 'replied');
  perform repair_lead_statuses_from_messages(true, h);
  res := res || jsonb_build_object('repair applied: You replied', (select status from outreach_leads where id = h) = 'awaiting_reply');
  res := res || jsonb_build_object('repair is logged', exists (select 1 from lead_status_sync_log where lead_id = h and source = 'repair' and to_status = 'awaiting_reply'));
  res := res || jsonb_build_object('repair writes no draft, no queued send, no message',
    (select count(*) from ai_reply_drafts where lead_id = h) = n and (select count(*) from inbox_scheduled_sends where lead_id = h) = n2
    and (select count(*) from whatsapp_messages where lead_id = h) = 2);
  res := res || jsonb_build_object('repair never moves a lead into Contacted', not exists (select 1 from repair_lead_statuses_from_messages(false, b) r where r.to_status = 'initial_contact'));

  -- 18. Visible: set cancels the queued follow-ups, clear restores nothing, the status is untouched
  update outreach_leads set hook_followup_queued_at = now(), contact_followup_queued_at = now() where id = v;
  insert into whatsapp_auto_replies (lead_id, phone, status, reason, fire_after) values (v, '+447700900309', 'pending', 'QA', now());
  insert into whatsapp_messages (lead_id, user_id, phone, direction, status, created_at, test_mode, body)
    values (v, paul, '+447700900309', 'inbound', 'received', t0, true, 'what is the price') returning id into m1;
  insert into ai_reply_drafts (user_id, lead_id, phone, inbound_message_id, inbound_at, kind, status)
    values (paul, v, '+447700900309', m1, t0, 'needs_you', 'pending');
  perform apply_lead_visible(v, true, null, 'either');
  res := res || jsonb_build_object('visible: flagged', (select ai_visible_at is not null from outreach_leads where id = v));
  res := res || jsonb_build_object('visible: follow-up markers cleared', (select hook_followup_queued_at is null and contact_followup_queued_at is null from outreach_leads where id = v));
  res := res || jsonb_build_object('visible: waiting pitch cancelled', not exists (select 1 from whatsapp_auto_replies where lead_id = v and status in ('awaiting_audit', 'pending')));
  res := res || jsonb_build_object('visible: no open Needs you', not exists (select 1 from ai_reply_drafts where lead_id = v and status = 'pending'));
  res := res || jsonb_build_object('visible: not a pipeline stage (status unchanged)', (select status from outreach_leads where id = v) = 'replied');
  perform apply_lead_visible(v, false, null, 'either');
  res := res || jsonb_build_object('visible cleared: flag gone, nothing restored',
    (select ai_visible_at is null from outreach_leads where id = v) and (select hook_followup_queued_at is null from outreach_leads where id = v));
  res := res || jsonb_build_object('visible changes are logged', (select count(*) from lead_status_sync_log where lead_id = v and source = 'visible') = 2);

  -- 19. the rule setting is admin-only
  perform set_config('request.jwt.claims', json_build_object('sub', '262c1d64-05ad-42e8-a81b-7d25553aeff3', 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', '262c1d64-05ad-42e8-a81b-7d25553aeff3', true);
  begin
    perform set_inbox_visible_rule('off'); st := 'ran';
  exception when others then st := sqlerrm;
  end;
  res := res || jsonb_build_object('a salesperson cannot change the Visible rule', st <> 'ran' and inbox_visible_rule() = 'either');

  raise exception 'QA_RESULT %', res;
end $$;
