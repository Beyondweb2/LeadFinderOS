-- Self-sourced prospects + paid-client handoff (2026-09-28). RUN AGAINST THE LIVE DATABASE; ALWAYS ROLLED BACK.
-- The last statement raises an exception carrying the results as JSON, so the transaction can never
-- commit: every fixture (fake auth users on example.invalid, roles, leads, audits, messages) disappears.
-- How to run: see docs/multi-user.md ("Re-running the security tests").
begin;
-- READY-TO-SELL FIXTURE (2026-10-05, E2E certification; inside this suite's own rolled-back transaction). Since
-- migration 20261010120000 a salesperson who has not finished onboarding is refused claims, calls, campaigns and
-- queueing, so this suite could no longer reach its own rules. The readiness rule itself is tested by
-- salesperson-onboarding-rls.sql and ready-to-sell-paperwork.sql. Here: every FAKE salesperson the suite creates
-- (auth.users email ending .invalid) is onboarded complete, so pre-gate suites exercise their own rules again.
create function public.qa_tmp_autoonboard() returns trigger language plpgsql security definer set search_path = public as $q$
begin
  if new.role = 'sales' and exists (select 1 from auth.users u where u.id = new.user_id and u.email like '%.invalid') then
    insert into public.salesperson_onboarding (user_id, age_18_confirmed_on, rtw_method, rtw_checked_on, rtw_checked_by, rtw_result,
      rtw_evidence_ref, bank_details_received_on, vat_registered, contractor_type, start_date, team_guide_version, team_guide_acknowledged_on)
    values (new.user_id, current_date, 'manual_video_call', current_date, 'QA', 'pass', 'QA', current_date, false, 'individual', current_date,
      (select id from public.salesperson_document_versions where kind = 'team_guide' and status = 'approved' order by id desc limit 1), current_date)
    on conflict (user_id) do nothing;
  end if;
  return new;
end $q$;
create trigger qa_tmp_autoonboard after insert on public.user_roles for each row execute function public.qa_tmp_autoonboard();
-- Existing sales accounts (Test, test1) made Ready INSIDE this rolled-back transaction only.
insert into public.salesperson_onboarding (user_id, age_18_confirmed_on, rtw_method, rtw_checked_on, rtw_checked_by, rtw_result,
  rtw_evidence_ref, bank_details_received_on, vat_registered, contractor_type, start_date, team_guide_version, team_guide_acknowledged_on)
select r.user_id, current_date, 'manual_video_call', current_date, 'QA', 'pass', 'QA', current_date, false, 'individual', current_date,
  (select id from public.salesperson_document_versions where kind = 'team_guide' and status = 'approved' order by id desc limit 1), current_date
from public.user_roles r where r.role = 'sales'
on conflict (user_id) do update set age_18_confirmed_on = excluded.age_18_confirmed_on, rtw_method = excluded.rtw_method,
  rtw_checked_on = excluded.rtw_checked_on, rtw_checked_by = excluded.rtw_checked_by, rtw_result = excluded.rtw_result,
  rtw_evidence_ref = excluded.rtw_evidence_ref, bank_details_received_on = excluded.bank_details_received_on,
  vat_registered = excluded.vat_registered, contractor_type = excluded.contractor_type, start_date = excluded.start_date,
  team_guide_version = excluded.team_guide_version, team_guide_acknowledged_on = excluded.team_guide_acknowledged_on, end_date = null;

set local lock_timeout = '3s';
set local statement_timeout = '30s';
create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated, anon; grant usage, select on sequence t_results_n_seq to authenticated, anon;
create temp table t_ids (k text primary key, val uuid);
grant all on t_ids to authenticated, anon;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('eeeeeeee-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ss-a@example.invalid', '{}', '{}', now(), now()),
  ('eeeeeeee-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ss-b@example.invalid', '{}', '{}', now(), now());
insert into public.user_roles (user_id, role) values ('eeeeeeee-0000-4000-8000-00000000000a', 'sales'), ('eeeeeeee-0000-4000-8000-00000000000b', 'sales');
insert into public.team_members (user_id, display_name) values ('eeeeeeee-0000-4000-8000-00000000000a', 'SS A'), ('eeeeeeee-0000-4000-8000-00000000000b', 'SS B');
insert into t_ids values
  ('admin', (select user_id from public.team_members where is_book_owner limit 1)),
  ('pauls', (select l.id from public.outreach_leads l where l.assigned_to_user_id = l.user_id and not public.lead_is_client(l.amount_paid, l.status)
              and public.website_identity(l.website) is not null and public.lead_first_contact_at(l.id) is not null order by l.created_at limit 1));
create temp table t_txt as select (select website from public.outreach_leads where id = (select val from t_ids where k = 'pauls')) as pauls_site;
grant select on t_txt to authenticated, anon;
insert into t_results (name, ok, detail) select 'fixtures', (select count(*) from t_ids where val is not null) = 2, null;

-- ── as Sales A: add a self-sourced lead with its profile ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-4000-8000-00000000000a', true);
do $$ declare r jsonb; v record; v_id uuid; begin
  r := public.sales_add_lead(jsonb_build_object('business_name', 'QA Selfsourced Plumbing', 'search_keyword', 'plumber',
        'search_location', 'Wakefield', 'phone', '07700 900401', 'website', 'https://www.qa-selfsourced-plumbing.example',
        'lead_source', 'facebook', 'list_type', 'manual', 'note', 'Met at a networking breakfast',
        'services', jsonb_build_array(' Boiler repair ', 'boiler REPAIR', 'Leak detection', ''),
        'service_areas', jsonb_build_array('Wakefield', 'Ossett', 'wakefield')));
  insert into t_results (name, ok, detail) values ('A adds a lead found on Facebook', (r ->> 'ok')::boolean, r::text);
  v_id := (r ->> 'lead_id')::uuid; insert into t_ids values ('a_lead', v_id);
  select assigned_to_user_id, added_by_user_id, lead_source, services_included, service_areas, status into v from public.sales_leads where id = v_id;
  insert into t_results (name, ok, detail) values ('…owned by A, source saved, services/areas cleaned + deduped',
    v.assigned_to_user_id = 'eeeeeeee-0000-4000-8000-00000000000a' and v.added_by_user_id = v.assigned_to_user_id and v.lead_source = 'facebook'
    and v.services_included = array['Boiler repair', 'Leak detection'] and v.service_areas = array['Wakefield', 'Ossett'] and v.status = 'not_contacted',
    row_to_json(v)::text);
  select count(*) into v from public.lead_activity where lead_id = v_id and ((kind = 'lead_added' and data ->> 'source' = 'facebook') or (kind = 'note' and body like 'Met at%'));
  insert into t_results (name, ok, detail) values ('…with the add and the first note on its history', v.count = 2, v.count::text);
  r := public.sales_add_lead(jsonb_build_object('business_name', 'QA Selfsourced again', 'search_keyword', 'plumber', 'phone', '+44 7700 900401', 'lead_source', 'referral'));
  insert into t_results (name, ok, detail) values ('the same phone again is refused (one business = one record)', r ->> 'error' = 'exists' and r ->> 'state' = 'yours', r::text);
  r := public.sales_add_lead(jsonb_build_object('business_name', 'X', 'search_keyword', 'plumber', 'phone', '07700 900499', 'lead_source', 'tiktok'));
  insert into t_results (name, ok, detail) values ('an unknown source is refused', r ->> 'error' = 'bad_source', r::text);
  r := public.sales_add_lead(jsonb_build_object('business_name', 'X', 'search_keyword', 'plumber', 'phone', '07700 900498', 'lead_source', 'other',
        'website', (select pauls_site from t_txt)));
  insert into t_results (name, ok, detail) values ('a website already in the book WARNS, naming the holder, and adds nothing', r ->> 'error' = 'site_match' and r ->> 'state' = 'owned' and r ->> 'owner_name' is not null, r::text);
  r := public.sales_add_lead(jsonb_build_object('business_name', 'X', 'search_keyword', 'plumber', 'phone', '07700 900497', 'lead_source', 'other', 'website', 'https://facebook.com/somebody'));
  insert into t_results (name, ok, detail) values ('a Facebook page is never a website identity', (r ->> 'ok')::boolean, r::text);
  insert into t_ids values ('a_fb', (r ->> 'lead_id')::uuid);
  -- profile, progressively
  r := public.lead_set_profile((select val from t_ids where k = 'a_lead'), array['Boiler repair', 'Powerflushing'], null, '1 QA Street, Wakefield', null);
  select services_included, service_areas, address into v from public.sales_leads where id = (select val from t_ids where k = 'a_lead');
  insert into t_results (name, ok, detail) values ('A updates services + address; areas left alone (null)', (r ->> 'ok')::boolean
    and v.services_included = array['Boiler repair', 'Powerflushing'] and v.service_areas = array['Wakefield', 'Ossett'] and v.address = '1 QA Street, Wakefield', row_to_json(v)::text);
  r := public.lead_set_profile((select val from t_ids where k = 'a_lead'), null, array[]::text[], null, null);
  select service_areas into v from public.sales_leads where id = (select val from t_ids where k = 'a_lead');
  insert into t_results (name, ok, detail) values ('an empty list clears', (r ->> 'ok')::boolean and v.service_areas is null, row_to_json(v)::text);
  begin perform public.lead_set_profile((select val from t_ids where k = 'pauls'), array['x'], null, null, null); insert into t_results (name, ok) values ('A cannot edit Paul''s lead', false);
  exception when others then insert into t_results (name, ok, detail) values ('A cannot edit Paul''s lead', sqlerrm = 'not_your_lead', sqlerrm); end;
end $$;
do $$ declare n int; begin
  update public.outreach_leads set service_areas = array['hack'] where id = (select val from t_ids where k = 'a_lead');
  get diagnostics n = row_count;
  insert into t_results (name, ok, detail) values ('a direct UPDATE from a sales session writes nothing', n = 0, n::text);
end $$;

-- ── as Sales B ──
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-4000-8000-00000000000b', true);
do $$ declare r jsonb; n int; begin
  r := public.sales_add_lead(jsonb_build_object('business_name', 'QA Selfsourced Plumbing', 'search_keyword', 'plumber', 'phone', '07700900401', 'lead_source', 'linkedin'));
  insert into t_results (name, ok, detail) values ('B cannot re-add A''s lead — told it is with SS A', r ->> 'error' = 'exists' and r ->> 'state' = 'owned' and r ->> 'owner_name' = 'SS A', r::text);
  r := public.claim_lead((select val from t_ids where k = 'a_lead'));
  insert into t_results (name, ok, detail) values ('B cannot claim A''s lead', coalesce((r ->> 'ok')::boolean, false) = false, r::text);
  r := public.sales_add_lead(jsonb_build_object('business_name', 'QA Selfsourced Plumbing Leeds', 'search_keyword', 'plumber', 'phone', '07700 900402',
        'lead_source', 'linkedin', 'website', 'qa-selfsourced-plumbing.example/leeds'));
  insert into t_results (name, ok, detail) values ('B, same website + a different phone: warned (with SS A)', r ->> 'error' = 'site_match' and r ->> 'owner_name' = 'SS A', r::text);
  r := public.sales_add_lead(jsonb_build_object('business_name', 'QA Selfsourced Plumbing Leeds', 'search_keyword', 'plumber', 'phone', '07700 900402',
        'lead_source', 'linkedin', 'website', 'qa-selfsourced-plumbing.example/leeds', 'confirm_site_match', true));
  insert into t_results (name, ok, detail) values ('…and may add it as a different branch once confirmed', (r ->> 'ok')::boolean, r::text);
  begin perform public.lead_set_profile((select val from t_ids where k = 'a_lead'), array['x'], null, null, null); insert into t_results (name, ok) values ('B cannot edit A''s lead', false);
  exception when others then insert into t_results (name, ok, detail) values ('B cannot edit A''s lead', sqlerrm = 'not_your_lead', sqlerrm); end;
  select count(*) into n from public.sales_leads where id = (select val from t_ids where k = 'a_lead');
  insert into t_results (name, ok, detail) values ('B cannot read A''s lead', n = 0, n::text);
end $$;

-- ── the service (as the queue / webhook would): an audit + a WhatsApp carrying its short link ──
reset role;
do $$ declare v_a uuid; v_code text; v_n int; v_msg uuid; begin
  insert into public.ai_audits (user_id, business_name, lead_id, short_code)
  values ((select val from t_ids where k = 'admin'), 'QA Selfsourced Plumbing', (select val from t_ids where k = 'a_lead'), 'qa2x9z')
  returning id, short_code into v_a, v_code;
  insert into t_ids values ('a_audit', v_a);
  insert into public.whatsapp_messages (direction, phone, body, status, lead_id, test_mode, sent_by_user_id)
  values ('outbound', '447700900401', 'Your results: https://findable.live/r/' || v_code || E'\n\n45%', 'sent', (select val from t_ids where k = 'a_lead'), true,
          'eeeeeeee-0000-4000-8000-00000000000a') returning id into v_msg;
  select count(*) into v_n from public.report_link_events where audit_id = v_a and kind = 'sent' and channel = 'whatsapp'
    and actor_user_id = 'eeeeeeee-0000-4000-8000-00000000000a';
  insert into t_results (name, ok, detail) values ('a WhatsApp carrying the short report link is recorded as SENT, by its sender', v_n = 1, v_n::text);
  update public.whatsapp_messages set status = 'read' where id = v_msg;
  select count(*) into v_n from public.report_link_events where audit_id = v_a;
  insert into t_results (name, ok, detail) values ('…once (delivered/read do not count again)', v_n = 1, v_n::text);
  insert into public.whatsapp_messages (direction, phone, body, status, test_mode) values ('outbound', '447700900401', 'findable.live/r/zzzzzz', 'sent', true) returning id into v_msg;
  insert into t_results (name, ok, detail) values ('an unknown code records nothing and the message still saves', v_msg is not null and not exists (select 1 from public.report_link_events where message_id = v_msg), null);
end $$;

-- ── A shares the report another way ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-4000-8000-00000000000a', true);
do $$ declare r jsonb; n int; v_lead uuid := (select val from t_ids where k = 'a_lead'); v_a uuid := (select val from t_ids where k = 'a_audit'); begin
  r := public.lead_report_link_event(v_lead, v_a, 'generated', null);
  insert into t_results (name, ok, detail) values ('A copies the report link (generated)', (r ->> 'ok')::boolean and r ->> 'deduped' is null, r::text);
  r := public.lead_report_link_event(v_lead, v_a, 'generated', null);
  insert into t_results (name, ok, detail) values ('…a second copy within 10 minutes is deduped', (r ->> 'deduped')::boolean, r::text);
  r := public.lead_report_link_event(v_lead, v_a, 'sent', 'linkedin');
  insert into t_results (name, ok, detail) values ('A marks it sent on LinkedIn', (r ->> 'ok')::boolean, r::text);
  select count(*) into n from public.lead_activity where lead_id = v_lead and kind = 'report_link' and data ->> 'channel' = 'linkedin';
  insert into t_results (name, ok, detail) values ('…and it is on the lead''s history', n = 1, n::text);
  r := public.lead_report_link_event(v_lead, v_a, 'sent', 'whatsapp');
  insert into t_results (name, ok, detail) values ('a hand-logged WhatsApp send is refused (the trigger records those)', r ->> 'error' = 'bad_channel', r::text);
  r := public.lead_report_link_event((select val from t_ids where k = 'a_fb'), v_a, 'sent', 'email');
  insert into t_results (name, ok, detail) values ('another lead''s report cannot be logged on this lead', r ->> 'error' = 'not_this_leads_report', r::text);
  select count(*) into n from public.report_link_events where lead_id = v_lead;
  insert into t_results (name, ok, detail) values ('A reads their own report events', n = 3, n::text);
  select count(*) into n from public.report_link_events where lead_id <> v_lead;
  insert into t_results (name, ok, detail) values ('A reads no other lead''s report events', n = 0, n::text);
end $$;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-4000-8000-00000000000b', true);
do $$ declare n int; begin
  begin perform public.lead_report_link_event((select val from t_ids where k = 'a_lead'), (select val from t_ids where k = 'a_audit'), 'sent', 'email');
    insert into t_results (name, ok) values ('B cannot log a share on A''s lead', false);
  exception when others then insert into t_results (name, ok, detail) values ('B cannot log a share on A''s lead', sqlerrm = 'not_your_lead', sqlerrm); end;
  select count(*) into n from public.report_link_events where lead_id = (select val from t_ids where k = 'a_lead');
  insert into t_results (name, ok, detail) values ('B cannot read A''s report events', n = 0, n::text);
end $$;

-- ── anon ──
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin perform public.lead_set_profile((select val from t_ids where k = 'a_lead'), array['x'], null, null, null); insert into t_results (name, ok) values ('anon cannot call lead_set_profile', false);
  exception when others then insert into t_results (name, ok, detail) values ('anon cannot call lead_set_profile', sqlstate = '42501', sqlerrm); end;
  begin perform public.lead_report_link_event((select val from t_ids where k = 'a_lead'), (select val from t_ids where k = 'a_audit'), 'generated', null); insert into t_results (name, ok) values ('anon cannot call lead_report_link_event', false);
  exception when others then insert into t_results (name, ok, detail) values ('anon cannot call lead_report_link_event', sqlstate = '42501', sqlerrm); end;
  begin perform 1 from public.report_link_events limit 1; insert into t_results (name, ok) values ('anon cannot read report events', false);
  exception when others then insert into t_results (name, ok, detail) values ('anon cannot read report events', sqlstate = '42501', sqlerrm); end;
end $$;

-- ── payment (as Mark Paid would, no sign-up): since 2026-10-05 no seller is stamped and the sale is held for review ──
reset role;
do $$ declare v record; v_lead uuid := (select val from t_ids where k = 'a_lead'); begin
  update public.outreach_leads set status = 'payment_received', amount_paid = 99, payment_date = current_date where id = v_lead;
  select sold_by_user_id, sold_at into v from public.outreach_leads where id = v_lead;
  insert into t_results (name, ok, detail) values ('payment with no sign-up creator: NO seller (not the holder), decided once, held for review', v.sold_by_user_id is null and v.sold_at is not null
    and exists (select 1 from public.sale_attribution_reviews r where r.lead_id = v_lead), row_to_json(v)::text);
  update public.outreach_leads set assigned_to_user_id = (select val from t_ids where k = 'admin') where id = v_lead;
  update public.outreach_leads set status = 'in_delivery', sold_by_user_id = (select val from t_ids where k = 'admin') where id = v_lead;
  select sold_by_user_id into v from public.outreach_leads where id = v_lead;
  insert into t_results (name, ok, detail) values ('reassignment and a direct overwrite never set a seller (only Paul''s review does)', v.sold_by_user_id is null, row_to_json(v)::text);
  select count(*) into v from public.outreach_leads where id = (select val from t_ids where k = 'a_fb') and sold_by_user_id is not null;
  insert into t_results (name, ok, detail) values ('a prospect has no sale stamp', v.count = 0, v.count::text);
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-4000-8000-00000000000a', true);
do $$ declare n int; begin
  select count(*) into n from public.sales_leads where id = (select val from t_ids where k = 'a_lead');
  insert into t_results (name, ok, detail) values ('once paid, the client leaves the rep''s view (no payment data reaches Sales)', n = 0, n::text);
  begin perform public.lead_set_profile((select val from t_ids where k = 'a_lead'), array['x'], null, null, null); insert into t_results (name, ok) values ('the rep can no longer edit a client', false);
  exception when others then insert into t_results (name, ok, detail) values ('the rep can no longer edit a client', sqlerrm = 'not_your_lead', sqlerrm); end;
end $$;

-- ── the admin ──
select set_config('request.jwt.claims', json_build_object('sub', (select val from t_ids where k = 'admin'), 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', (select val from t_ids where k = 'admin')::text, true);
do $$ declare r jsonb; n int; begin
  r := public.lead_set_profile((select val from t_ids where k = 'a_fb'), null, array['Leeds'], null, null);
  insert into t_results (name, ok, detail) values ('the admin edits any lead''s profile', (r ->> 'ok')::boolean, r::text);
  select count(*) into n from public.report_link_events where lead_id = (select val from t_ids where k = 'a_lead');
  insert into t_results (name, ok, detail) values ('the admin reads every lead''s report events', n = 3, n::text);
end $$;

reset role;
do $$ begin
  raise exception 'RESULTS %', (select json_agg(json_build_object('n', n, 'ok', ok, 'name', name, 'detail', detail) order by n) from t_results);
end $$;
rollback;
