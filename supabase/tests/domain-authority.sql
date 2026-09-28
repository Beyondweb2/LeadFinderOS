-- The domain rule (2026-09-28). RUN AGAINST THE LIVE DATABASE; ALWAYS ROLLED BACK (the last statement raises).
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated, anon; grant usage, select on sequence t_results_n_seq to authenticated, anon;
create temp table t_ids (k text primary key, val uuid);
grant all on t_ids to authenticated, anon;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('ffffffff-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-da-a@example.invalid', '{}', '{}', now(), now()),
  ('ffffffff-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-da-b@example.invalid', '{}', '{}', now(), now());
insert into public.user_roles (user_id, role) values ('ffffffff-0000-4000-8000-00000000000a', 'sales'), ('ffffffff-0000-4000-8000-00000000000b', 'sales');
insert into public.team_members (user_id, display_name) values ('ffffffff-0000-4000-8000-00000000000a', 'DA A'), ('ffffffff-0000-4000-8000-00000000000b', 'DA B');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ffffffff-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'ffffffff-0000-4000-8000-00000000000a', true);
do $$ declare r jsonb; v record; n int; begin
  r := public.sales_add_lead(jsonb_build_object('business_name', 'QA Domain Rule Plumbing', 'search_keyword', 'plumber', 'phone', '07700 900851', 'lead_source', 'referral'));
  insert into t_ids values ('a_lead', (r ->> 'lead_id')::uuid);
  insert into t_results (name, ok, detail) values ('fixture: A adds a lead', (r ->> 'ok')::boolean, r::text);
  r := public.lead_set_domain_control((select val from t_ids where k = 'a_lead'), 'client_owns_agency_manages');
  select domain_control into v from public.sales_leads where id = (select val from t_ids where k = 'a_lead');
  insert into t_results (name, ok, detail) values ('Sales records the domain situation on their own lead (B: owns, agency manages)', (r ->> 'ok')::boolean and v.domain_control = 'client_owns_agency_manages', r::text);
  r := public.lead_set_domain_control((select val from t_ids where k = 'a_lead'), 'the_agency_i_think');
  insert into t_results (name, ok, detail) values ('an unknown value is refused', r ->> 'error' = 'bad_value', r::text);
  select count(*) into n from public.lead_activity where lead_id = (select val from t_ids where k = 'a_lead') and kind = 'details_set' and data ? 'domain_control';
  insert into t_results (name, ok, detail) values ('…and it is on the lead''s history', n = 1, n::text);
end $$;
do $$ declare n int; begin
  update public.outreach_leads set service_terminated_at = now(), service_termination_reason = 'domain_authority_dispute' where id = (select val from t_ids where k = 'a_lead');
  get diagnostics n = row_count;
  insert into t_results (name, ok, detail) values ('Sales cannot end a service (direct update writes nothing)', n = 0, n::text);
end $$;

select set_config('request.jwt.claims', '{"sub":"ffffffff-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'ffffffff-0000-4000-8000-00000000000b', true);
do $$ begin
  begin perform public.lead_set_domain_control((select val from t_ids where k = 'a_lead'), 'third_party_owns'); insert into t_results (name, ok) values ('B cannot set A''s domain situation', false);
  exception when others then insert into t_results (name, ok, detail) values ('B cannot set A''s domain situation', sqlerrm = 'not_your_lead', sqlerrm); end;
end $$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin perform public.lead_set_domain_control((select val from t_ids where k = 'a_lead'), 'client_owns'); insert into t_results (name, ok) values ('anon cannot call lead_set_domain_control', false);
  exception when others then insert into t_results (name, ok, detail) values ('anon cannot call lead_set_domain_control', sqlstate = '42501', sqlerrm); end;
end $$;

reset role;
do $$ declare ok1 boolean := false; begin
  begin
    insert into public.onboarding_responses (lead_id, status, domain_owned) values ((select val from t_ids where k = 'a_lead'), 'submitted', 'probably');
  exception when check_violation then ok1 := true; end;
  insert into t_results (name, ok, detail) values ('the onboarding answers only take the known values (CHECK)', ok1, null);
  begin
    update public.outreach_leads set service_termination_reason = 'we_felt_like_it' where id = (select val from t_ids where k = 'a_lead');
    insert into t_results (name, ok) values ('only the domain dispute is a recorded termination reason', false);
  exception when check_violation then insert into t_results (name, ok) values ('only the domain dispute is a recorded termination reason', true); end;
end $$;

do $$ begin
  raise exception 'RESULTS %', (select json_agg(json_build_object('n', n, 'ok', ok, 'name', name, 'detail', detail) order by n) from t_results);
end $$;
rollback;
