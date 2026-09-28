-- Sales readiness (2026-09-28). RUN AGAINST THE LIVE DATABASE; ALWAYS ROLLED BACK.
-- The last statement raises an exception carrying the results as JSON, so the transaction can never
-- commit: every fixture (fake auth users on example.invalid, roles, messages, events, leads) disappears.
-- How to run: see docs/multi-user.md ("Re-running the security tests").
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated, anon; grant usage, select on sequence t_results_n_seq to authenticated, anon;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('dddddddd-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-sr-a@example.invalid', '{}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-sr-b@example.invalid', '{}', '{}', now(), now());
insert into public.user_roles (user_id, role) values ('dddddddd-0000-4000-8000-00000000000a', 'sales'), ('dddddddd-0000-4000-8000-00000000000b', 'sales');
insert into public.team_members (user_id, display_name) values ('dddddddd-0000-4000-8000-00000000000a', 'SR A'), ('dddddddd-0000-4000-8000-00000000000b', 'SR B');
create temp table t_fx as select
  (select l.id from public.outreach_leads l
    where l.assigned_to_user_id is null and l.is_archived is not true and l.status = 'not_contacted'
      and not public.lead_is_client(l.amount_paid, l.status) and public.lead_first_contact_at(l.id) is null
    order by l.created_at desc limit 1) as mine,
  (select l.id from public.outreach_leads l
    where l.assigned_to_user_id is null and l.is_archived is not true and l.status = 'not_contacted'
      and not public.lead_is_client(l.amount_paid, l.status) and public.lead_first_contact_at(l.id) is null
    order by l.created_at desc offset 1 limit 1) as unassigned,
  (select l.id from public.outreach_leads l
    where l.assigned_to_user_id is null and l.is_archived is not true and l.status = 'not_contacted'
      and not public.lead_is_client(l.amount_paid, l.status) and public.lead_first_contact_at(l.id) is null
    order by l.created_at desc offset 2 limit 1) as trig,
  (select l.id from public.outreach_leads l where l.assigned_to_user_id = l.user_id and not public.lead_is_client(l.amount_paid, l.status) and l.phone is not null order by l.created_at limit 1) as pauls,
  (select l.phone from public.outreach_leads l where l.assigned_to_user_id = l.user_id and not public.lead_is_client(l.amount_paid, l.status) and l.phone is not null order by l.created_at limit 1) as pauls_phone,
  (select user_id from public.team_members where is_book_owner limit 1) as admin_id;
grant select on t_fx to authenticated, anon;
insert into t_results (name, ok, detail) select 'fixtures', mine is not null and unassigned is not null and trig is not null and pauls is not null and admin_id is not null, null from t_fx;

-- ── the WhatsApp trigger records a link SEND, and never blocks a message (as the service would) ──
do $$ declare v_mine uuid := (select trig from t_fx); v_n int; v_id uuid; begin
  insert into public.whatsapp_messages (direction, phone, body, status, lead_id, test_mode)
  values ('outbound', '447000000001', 'Here you go https://findable.live/onboarding/x/?lead=' || v_mine || ' thanks', 'sent', v_mine, true);
  select count(*) into v_n from public.onboarding_link_events where lead_id = v_mine and kind = 'sent' and channel = 'whatsapp';
  insert into t_results (name, ok, detail) values ('a sent WhatsApp carrying the link is recorded as SENT', v_n = 1, v_n::text);
  insert into public.whatsapp_messages (direction, phone, body, status, lead_id, test_mode)
  values ('outbound', '447000000001', 'Details: https://findable.live/onboarding/x/?lead=' || v_mine || '&q2=9bc30aa9-0150-42d3-bab6-75aac7f6f334', 'sent', v_mine, true);
  select count(*) into v_n from public.onboarding_link_events where lead_id = v_mine and kind = 'sent';
  insert into t_results (name, ok, detail) values ('the post-payment re-entry link (&q2=) is not a send', v_n = 1, v_n::text);
  insert into public.whatsapp_messages (direction, phone, body, status, lead_id, test_mode)
  values ('outbound', '447000000001', 'https://findable.live/onboarding/?lead=' || v_mine, 'failed', v_mine, true) returning id into v_id;
  select count(*) into v_n from public.onboarding_link_events where lead_id = v_mine and kind = 'sent';
  insert into t_results (name, ok, detail) values ('a FAILED send is not a send', v_n = 1, v_n::text);
  update public.whatsapp_messages set status = 'delivered' where id = v_id;
  select count(*) into v_n from public.onboarding_link_events where lead_id = v_mine and kind = 'sent';
  insert into t_results (name, ok, detail) values ('…until Meta reports it delivered', v_n = 2, v_n::text);
  insert into public.whatsapp_messages (direction, phone, body, status, test_mode)
  values ('outbound', '447000000001', 'https://findable.live/onboarding/?lead=00000000-0000-4000-8000-000000000000', 'sent', true) returning id into v_id;
  insert into t_results (name, ok, detail) values ('a link to no lead records nothing and the message still saves', v_id is not null and not exists (select 1 from public.onboarding_link_events where message_id = v_id), null);
end $$;

-- ── as Sales A, on a lead they claimed ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'dddddddd-0000-4000-8000-00000000000a', true);
do $$ declare r jsonb; v record; v_mine uuid := (select mine from t_fx); v_n int; begin
  r := public.claim_lead(v_mine);
  insert into t_results (name, ok, detail) values ('A claims a lead', (r ->> 'ok')::boolean, r::text);
  r := public.lead_log_contact(v_mine, 'call', 'no_answer', null);
  insert into t_results (name, ok, detail) values ('own lead: a call is logged', (r ->> 'ok')::boolean, r::text);
  r := public.lead_log_contact(v_mine, 'linkedin', 'spoke_to_owner', 'said to ring Tuesday');
  insert into t_results (name, ok, detail) values ('own lead: a LinkedIn contact is logged', (r ->> 'ok')::boolean, r::text);
  select count(*) filter (where kind = 'call_outcome' and data ->> 'channel' = 'call') a, count(*) filter (where kind = 'contact_logged' and data ->> 'channel' = 'linkedin' and body = 'said to ring Tuesday') b into v
    from public.lead_activity where lead_id = v_mine;
  insert into t_results (name, ok, detail) values ('…as a call outcome and a contact, channel and note kept', v.a = 1 and v.b = 1, v.a || '/' || v.b);
  select next_action::text na, status into v from public.sales_leads where id = v_mine;
  insert into t_results (name, ok, detail) values ('logging a contact sets NO next action and no status', v.na = 'none' and v.status = 'not_contacted', v.na || ' ' || v.status);
  r := public.lead_log_contact(v_mine, 'fax', 'no_answer', null);
  insert into t_results (name, ok, detail) values ('an unknown channel is refused', r ->> 'error' = 'bad_channel', r::text);
  r := public.lead_log_contact(v_mine, 'call', 'sold_it', null);
  insert into t_results (name, ok, detail) values ('an unknown outcome is refused', r ->> 'error' = 'bad_outcome', r::text);
  begin perform public.lead_log_contact((select pauls from t_fx), 'call', 'no_answer', null); insert into t_results (name, ok) values ('A cannot log on Paul''s lead', false);
  exception when others then insert into t_results (name, ok, detail) values ('A cannot log on Paul''s lead', sqlerrm = 'not_your_lead', sqlerrm); end;
  begin perform public.lead_log_contact((select unassigned from t_fx), 'call', 'no_answer', null); insert into t_results (name, ok) values ('A cannot log on an unassigned lead', false);
  exception when others then insert into t_results (name, ok, detail) values ('A cannot log on an unassigned lead', sqlerrm = 'not_your_lead', sqlerrm); end;

  r := public.lead_onboarding_link_event(v_mine, 'generated', null);
  insert into t_results (name, ok, detail) values ('own lead: a copy is recorded as generated', (r ->> 'ok')::boolean and r ->> 'deduped' is null, r::text);
  r := public.lead_onboarding_link_event(v_mine, 'generated', null);
  insert into t_results (name, ok, detail) values ('…and a second copy within 10 minutes is not a second row', (r ->> 'deduped')::boolean, r::text);
  r := public.lead_onboarding_link_event(v_mine, 'sent', 'email');
  insert into t_results (name, ok, detail) values ('own lead: "sent by email" is recorded', (r ->> 'ok')::boolean, r::text);
  r := public.lead_onboarding_link_event(v_mine, 'sent', 'whatsapp');
  insert into t_results (name, ok, detail) values ('a hand-logged WhatsApp send is refused (the trigger counts those)', r ->> 'error' = 'bad_channel', r::text);
  select count(*) into v_n from public.onboarding_link_events where lead_id = v_mine;
  insert into t_results (name, ok, detail) values ('A reads the link events on their own lead (copy + email)', v_n = 2, v_n::text);
  select count(*) into v_n from public.onboarding_link_events where lead_id <> v_mine;
  insert into t_results (name, ok, detail) values ('…and none on anyone else''s', v_n = 0, v_n::text);
  begin insert into public.onboarding_link_events (lead_id, kind, channel) values (v_mine, 'sent', 'email'); insert into t_results (name, ok) values ('A cannot write link events directly', false);
  exception when others then insert into t_results (name, ok, detail) values ('A cannot write link events directly', true, sqlerrm); end;

  r := public.sales_add_lead(jsonb_build_object('business_name', 'SR Test Plumbing', 'search_keyword', 'plumber', 'search_location', 'Leeds',
        'phone', '07700 900987', 'lead_source', 'linkedin', 'contact_name', 'Sam', 'list_type', 'manual', 'note', 'met at the expo'));
  insert into t_results (name, ok, detail) values ('A adds a self-sourced lead', (r ->> 'ok')::boolean, r::text);
  select lead_source, assigned_to_user_id::text a, list_type, contact_name into v from public.sales_leads where id = (r ->> 'lead_id')::uuid;
  insert into t_results (name, ok, detail) values ('…source linkedin, assigned to A, manual, contact name kept', v.lead_source = 'linkedin' and v.a = 'dddddddd-0000-4000-8000-00000000000a' and v.list_type = 'manual' and v.contact_name = 'Sam', row_to_json(v)::text);
  insert into t_results (name, ok, detail) values ('…with its first note in the activity', exists (select 1 from public.lead_activity where lead_id = (r ->> 'lead_id')::uuid and kind = 'note' and body = 'met at the expo'), null);
  r := public.sales_add_lead(jsonb_build_object('business_name', 'SR Test Plumbing Again', 'search_keyword', 'plumber', 'phone', '+44 7700 900987', 'lead_source', 'referral'));
  insert into t_results (name, ok, detail) values ('the same business again (same phone) is refused', r ->> 'error' = 'exists', r::text);
  r := public.sales_add_lead(jsonb_build_object('business_name', 'Not Pauls', 'search_keyword', 'plumber', 'phone', (select pauls_phone from t_fx), 'lead_source', 'referral'));
  insert into t_results (name, ok, detail) values ('Paul''s lead cannot be re-added by its phone (no stealing)', r ->> 'error' = 'exists', r::text);
  r := public.sales_add_lead(jsonb_build_object('business_name', 'Bad Source Ltd', 'search_keyword', 'plumber', 'phone', '07700 900111', 'lead_source', 'carrier_pigeon'));
  insert into t_results (name, ok, detail) values ('an unknown source is refused', r ->> 'error' = 'bad_source', r::text);
  select count(*) into v_n from public.sales_leads where amount_paid is not null;
  insert into t_results (name, ok, detail) values ('the view never carries an amount', v_n = 0, v_n::text);
end $$;
reset role;

-- ── as Sales B: A's lead is not theirs ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'dddddddd-0000-4000-8000-00000000000b', true);
do $$ declare v_n int; begin
  begin perform public.lead_log_contact((select mine from t_fx), 'call', 'no_answer', null); insert into t_results (name, ok) values ('another rep cannot log on A''s lead', false);
  exception when others then insert into t_results (name, ok, detail) values ('another rep cannot log on A''s lead', sqlerrm = 'not_your_lead', sqlerrm); end;
  begin perform public.lead_onboarding_link_event((select mine from t_fx), 'sent', 'email'); insert into t_results (name, ok) values ('another rep cannot record a link send on A''s lead', false);
  exception when others then insert into t_results (name, ok, detail) values ('another rep cannot record a link send on A''s lead', sqlerrm = 'not_your_lead', sqlerrm); end;
  select count(*) into v_n from public.onboarding_link_events where lead_id = (select mine from t_fx);
  insert into t_results (name, ok, detail) values ('another rep reads none of A''s link events', v_n = 0, v_n::text);
  select count(*) into v_n from public.lead_activity where lead_id = (select mine from t_fx);
  insert into t_results (name, ok, detail) values ('…and none of A''s activity', v_n = 0, v_n::text);
end $$;
reset role;

-- ── anon ──
set local role anon;
do $$ begin
  begin perform public.lead_log_contact((select mine from t_fx), 'call', 'no_answer', null); insert into t_results (name, ok) values ('anon cannot call lead_log_contact', false);
  exception when others then insert into t_results (name, ok, detail) values ('anon cannot call lead_log_contact', sqlstate = '42501', sqlerrm); end;
  begin perform public.lead_onboarding_link_event((select mine from t_fx), 'generated', null); insert into t_results (name, ok) values ('anon cannot call lead_onboarding_link_event', false);
  exception when others then insert into t_results (name, ok, detail) values ('anon cannot call lead_onboarding_link_event', sqlstate = '42501', sqlerrm); end;
  begin perform 1 from public.onboarding_link_events limit 1; insert into t_results (name, ok) values ('anon cannot read link events', false);
  exception when others then insert into t_results (name, ok, detail) values ('anon cannot read link events', sqlstate = '42501', sqlerrm); end;
end $$;
reset role;

-- ── the admin ──
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from t_fx), 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', (select admin_id::text from t_fx), true);
do $$ declare r jsonb; v_n int; begin
  r := public.lead_log_contact((select pauls from t_fx), 'in_person', 'meeting_booked', null);
  insert into t_results (name, ok, detail) values ('the admin logs a contact on any lead', (r ->> 'ok')::boolean, r::text);
  select count(*) into v_n from public.onboarding_link_events where lead_id = (select mine from t_fx);
  insert into t_results (name, ok, detail) values ('the admin reads every lead''s link events', v_n = 2, v_n::text);
end $$;
reset role;

do $$ begin
  raise exception 'RESULTS %', (select json_agg(json_build_object('n', n, 'ok', ok, 'name', name, 'detail', detail) order by n) from t_results);
end $$;
