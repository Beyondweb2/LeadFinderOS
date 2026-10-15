-- send-error-capture (2026-10-15): re-runnable, ALWAYS rolled back (it ends in an exception that carries the results).
-- Proves on the live database: the per-country auto switch-off (trial rule, 131026 exception), the Malaysia / Singapore
-- no-auto-retry hand-back (and that the UK still retries), and the pause log. Run after the migration is applied:
--   POST /v1/projects/<ref>/database/query with this file's text. Nothing is kept; no message is sent.
begin;
do $$
declare
  v_owner uuid := (select user_id from public.outreach_leads where user_id is not null order by created_at desc limit 1);
  v_my uuid; v_uk uuid;
  r1 jsonb; r2 jsonb; r3 jsonb;
  v_my_status text; v_uk_status text; v_log jsonb;
begin
  -- 1. a fresh Malaysia switch-on, then: one good send, one 131026 failure (stays on), one 131049 failure (off).
  update public.outreach_country_settings set whatsapp_on = false where country = 'MY';
  update public.outreach_country_settings set whatsapp_on = true where country = 'MY';
  insert into public.whatsapp_sends (template, phone, business_name, claim_url, test_mode, message_id, delivery_status)
  values ('initial_contact', '60123456789', 'ZZ QA rollback', '', false, 'wamid.zzqa1', 'sent');
  insert into public.whatsapp_sends (template, phone, business_name, claim_url, test_mode, message_id, delivery_status, error_code)
  values ('initial_contact', '60123456788', 'ZZ QA rollback', '', false, null, 'failed_temporary', 131026);
  r1 := jsonb_build_object('on', (select whatsapp_on from public.outreach_country_settings where country = 'MY'));
  insert into public.whatsapp_sends (template, phone, business_name, claim_url, test_mode, message_id, delivery_status, error_code)
  values ('initial_contact', '60123456787', 'ZZ QA rollback', '', false, null, 'failed_temporary', 131049);
  r2 := (select jsonb_build_object('on', whatsapp_on, 'reason', whatsapp_auto_pause_reason) from public.outreach_country_settings where country = 'MY');
  -- a TEST send never counts
  update public.outreach_country_settings set whatsapp_on = true where country = 'SG';
  insert into public.whatsapp_sends (template, phone, business_name, claim_url, test_mode, message_id, delivery_status)
  values ('initial_contact', '6591234567', 'ZZ QA rollback', '', true, null, 'failed_temporary');
  r3 := jsonb_build_object('sg_on_after_test_failure', (select whatsapp_on from public.outreach_country_settings where country = 'SG'));

  -- 2. no auto-retry: a MY lead re-queued by a failure is handed back; a UK lead still retries.
  insert into public.outreach_leads (user_id, business_name, phone, country, status, whatsapp_attempts)
  values (v_owner, 'ZZ QA rollback MY', '+60 12-345 6786', 'MY', 'queued', 0) returning id into v_my;
  insert into public.outreach_leads (user_id, business_name, phone, country, status, whatsapp_attempts)
  values (v_owner, 'ZZ QA rollback UK', '07700 900999', 'UK', 'queued', 0) returning id into v_uk;
  update public.outreach_leads set status = 'queued', whatsapp_delivery_status = 'failed_temporary', whatsapp_attempts = 1 where id in (v_my, v_uk);
  select status into v_my_status from public.outreach_leads where id = v_my;
  select status into v_uk_status from public.outreach_leads where id = v_uk;

  -- 3. the pause log: a write that does not say who → auto; a person's write → person.
  update public.whatsapp_outreach_state set paused = not paused where id = 1;
  update public.whatsapp_outreach_state set paused = not paused, pause_changed_at = now() + interval '1 second',
         pause_changed_by = v_owner, pause_changed_source = 'person' where id = 1;
  select jsonb_agg(jsonb_build_object('action', action, 'source', source, 'by', by_user_id is not null) order by id)
    into v_log from (select * from public.whatsapp_queue_pause_log order by id desc limit 2) x;

  raise exception 'SEND_ERROR_CAPTURE_TEST %', jsonb_build_object(
    'trial_131026_stays_on', r1, 'second_failure_switches_off', r2, 'test_send_ignored', r3,
    'my_lead', v_my_status, 'uk_lead', v_uk_status, 'pause_log', v_log);
end $$;
rollback;
