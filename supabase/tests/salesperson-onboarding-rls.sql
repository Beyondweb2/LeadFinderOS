-- Salesperson onboarding, TPS/CTPS state and business type (2026-10-05, migration 20261010120000).
-- RUN AGAINST THE LIVE DATABASE; ALWAYS ROLLED BACK — the last statement raises the results as JSON, so
-- nothing commits (fake users on example.invalid; two real leads borrowed and changed only inside this
-- transaction). Before the migration is applied, prepend the migration's text after `begin;` — DDL is
-- transactional, so it is rolled back with everything else.
begin;
create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated, anon, service_role; grant usage, select on sequence t_results_n_seq to authenticated, anon, service_role;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('ffffffff-0000-4000-8000-0000000005a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-onb-a@example.invalid', '{}', '{}', now(), now()),
  ('ffffffff-0000-4000-8000-0000000005b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-onb-b@example.invalid', '{}', '{}', now(), now());
insert into public.user_roles (user_id, role) values ('ffffffff-0000-4000-8000-0000000005a1', 'sales'), ('ffffffff-0000-4000-8000-0000000005b1', 'sales');
insert into public.team_members (user_id, display_name) values ('ffffffff-0000-4000-8000-0000000005a1', 'ONB A'), ('ffffffff-0000-4000-8000-0000000005b1', 'ONB B');

create temp table t_fx as select
  (select id from public.outreach_leads l where l.assigned_to_user_id is null and l.is_archived is not true and not public.lead_is_client(l.amount_paid, l.status) order by created_at limit 1) as lead_a,
  (select id from public.outreach_leads l where l.assigned_to_user_id is null and l.is_archived is not true and not public.lead_is_client(l.amount_paid, l.status) order by created_at limit 1 offset 1) as lead_b,
  (select user_id from public.team_members where is_book_owner limit 1) as admin_id;
grant select on t_fx to authenticated, anon, service_role;
update public.outreach_leads set assigned_to_user_id = 'ffffffff-0000-4000-8000-0000000005a1', assigned_at = now() where id = (select lead_a from t_fx);
update public.outreach_leads set assigned_to_user_id = 'ffffffff-0000-4000-8000-0000000005b1', assigned_at = now() where id = (select lead_b from t_fx);
insert into t_results (name, ok) select 'fixtures: two leads, the admin', lead_a is not null and lead_b is not null and admin_id is not null from t_fx;

-- ── what admin-users does (service role): write both onboarding records, and two genuine-looking TPS rows ──
set local role service_role;
insert into public.salesperson_onboarding (user_id, agreement_version, agreement_signed_on, rtw_method, rtw_result, rtw_evidence_ref, vat_registered, updated_by)
values ('ffffffff-0000-4000-8000-0000000005a1', 'contractor-agreement-v2', '2026-10-06', 'video_call_original_not_held', 'pass', 'Secure folder / RTW / A', false, (select admin_id from t_fx)),
       ('ffffffff-0000-4000-8000-0000000005b1', 'contractor-agreement-v2', '2026-10-06', null, null, null, true, (select admin_id from t_fx));
insert into t_results (name, ok, detail) values ('service role (admin-users) reads every onboarding record', (select count(*) from public.salesperson_onboarding where user_id::text like 'ffffffff-0000-4000-8000-0000000005%') = 2, null);
update public.salesperson_onboarding set start_date = '2026-10-07', updated_by = (select admin_id from t_fx) where user_id = 'ffffffff-0000-4000-8000-0000000005a1';
insert into t_results (name, ok, detail) select 'every change is logged (insert + update), with who and which fields',
  count(*) = 2 and bool_and(actor_user_id = (select admin_id from t_fx)) and bool_or(changed ? 'start_date' and not changed ? 'agreement_version'), string_agg(changed::text, ' | ')
  from public.salesperson_onboarding_log where user_id = 'ffffffff-0000-4000-8000-0000000005a1';
do $$ begin
  begin
    update public.salesperson_onboarding_log set changed = '{}' where user_id = 'ffffffff-0000-4000-8000-0000000005a1';
    insert into t_results (name, ok) values ('the change log cannot be edited', false);
  exception when others then insert into t_results (name, ok, detail) values ('the change log cannot be edited', sqlerrm like '%append-only%', sqlerrm); end;
  begin
    insert into public.salesperson_onboarding (user_id, vat_number, vat_registered) values ('ffffffff-0000-4000-8000-0000000005b1', 'GB123456789', false)
      on conflict (user_id) do update set vat_number = excluded.vat_number, vat_registered = excluded.vat_registered;
    insert into t_results (name, ok) values ('the database refuses a VAT number on someone not VAT registered', false);
  exception when others then insert into t_results (name, ok, detail) values ('the database refuses a VAT number on someone not VAT registered', sqlstate = '23514', sqlerrm); end;
  begin
    update public.salesperson_onboarding set end_date = '2026-11-01' where user_id = 'ffffffff-0000-4000-8000-0000000005a1';
    insert into t_results (name, ok) values ('the database refuses an end date without a reason', false);
  exception when others then insert into t_results (name, ok, detail) values ('the database refuses an end date without a reason', sqlstate = '23514', sqlerrm); end;
  begin
    insert into public.phone_tps_checks (lead_id, phone, register, result, provider, provider_reference) values ((select lead_a from t_fx), '+441234567890', 'tps', 'not_registered', 'test-provider', '');
    insert into t_results (name, ok) values ('the database refuses a TPS answer with no provider reference', false);
  exception when others then insert into t_results (name, ok, detail) values ('the database refuses a TPS answer with no provider reference', sqlstate = '23514', sqlerrm); end;
end $$;
update public.salesperson_onboarding set end_date = '2026-11-01', end_reason = 'resigned', updated_by = (select admin_id from t_fx) where user_id = 'ffffffff-0000-4000-8000-0000000005b1';
insert into t_results (name, ok) values ('a leaver (end date + reason) is recorded', (select end_reason from public.salesperson_onboarding where user_id = 'ffffffff-0000-4000-8000-0000000005b1') = 'resigned');
insert into public.phone_tps_checks (lead_id, phone, register, result, provider, provider_reference)
values ((select lead_a from t_fx), '+441111111111', 'tps', 'not_registered', 'test-provider', 'QA-A'),
       ((select lead_b from t_fx), '+442222222222', 'tps', 'not_registered', 'test-provider', 'QA-B');
reset role;

-- ── as Sales A ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ffffffff-0000-4000-8000-0000000005a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'ffffffff-0000-4000-8000-0000000005a1', true);
do $$ declare r jsonb; begin
  begin
    perform 1 from public.salesperson_onboarding where user_id = 'ffffffff-0000-4000-8000-0000000005b1';
    insert into t_results (name, ok) values ('Sales A cannot read Sales B''s onboarding record', false);
  exception when others then insert into t_results (name, ok, detail) values ('Sales A cannot read Sales B''s onboarding record', sqlstate = '42501', sqlerrm); end;
  begin
    perform 1 from public.salesperson_onboarding where user_id = 'ffffffff-0000-4000-8000-0000000005a1';
    insert into t_results (name, ok) values ('Sales A cannot read even its own onboarding record', false);
  exception when others then insert into t_results (name, ok, detail) values ('Sales A cannot read even its own onboarding record', sqlstate = '42501', sqlerrm); end;
  begin
    perform 1 from public.salesperson_onboarding_log;
    insert into t_results (name, ok) values ('Sales A cannot read the onboarding change log', false);
  exception when others then insert into t_results (name, ok, detail) values ('Sales A cannot read the onboarding change log', sqlstate = '42501', sqlerrm); end;
  begin
    update public.salesperson_onboarding set rtw_result = 'pass' where user_id = 'ffffffff-0000-4000-8000-0000000005a1';
    insert into t_results (name, ok) values ('Sales A cannot tick its own onboarding', false);
  exception when others then insert into t_results (name, ok, detail) values ('Sales A cannot tick its own onboarding', sqlstate = '42501', sqlerrm); end;
  begin
    insert into public.phone_tps_checks (lead_id, phone, register, result, provider, provider_reference) values ((select lead_a from t_fx), '+441234567890', 'ctps', 'not_registered', 'test-provider', 'FAKE');
    insert into t_results (name, ok) values ('Sales A cannot write a TPS/CTPS answer (not even on its own lead)', false);
  exception when others then insert into t_results (name, ok, detail) values ('Sales A cannot write a TPS/CTPS answer (not even on its own lead)', sqlstate = '42501', sqlerrm); end;
  insert into t_results (name, ok, detail) values ('Sales A reads its own lead''s TPS answer and not Sales B''s',
    (select count(*) from public.phone_tps_checks where provider_reference = 'QA-A') = 1 and (select count(*) from public.phone_tps_checks where provider_reference = 'QA-B') = 0, null);
  r := public.lead_record_business_type((select lead_a from t_fx), 'sole_trader', 'stated_by_business', 'told me on the call');
  insert into t_results (name, ok, detail) values ('Sales A records a business type on its own lead, with evidence', (r ->> 'ok')::boolean, r::text);
  r := public.lead_record_business_type((select lead_a from t_fx), 'limited_company', 'website', '');
  insert into t_results (name, ok, detail) values ('a business type with no evidence note is refused', r ->> 'error' = 'evidence_needed', r::text);
  begin
    r := public.lead_record_business_type((select lead_b from t_fx), 'sole_trader', 'stated_by_business', 'x');
    insert into t_results (name, ok, detail) values ('Sales A cannot record a business type on Sales B''s lead', false, r::text);
  exception when others then insert into t_results (name, ok, detail) values ('Sales A cannot record a business type on Sales B''s lead', sqlstate = '42501', sqlerrm); end;
  insert into t_results (name, ok, detail) values ('the record carries Sales A as the recorder and the database time',
    exists (select 1 from public.lead_business_type_records where lead_id = (select lead_a from t_fx) and recorded_by = 'ffffffff-0000-4000-8000-0000000005a1'), null);
  begin
    insert into public.lead_business_type_records (lead_id, business_type, source, evidence_note) values ((select lead_a from t_fx), 'llp', 'website', 'direct');
    insert into t_results (name, ok) values ('Sales A cannot write business-type records directly (only through the function)', false);
  exception when others then insert into t_results (name, ok, detail) values ('Sales A cannot write business-type records directly (only through the function)', sqlstate = '42501', sqlerrm); end;
end $$;
reset role;

-- ── as Sales B: never sees A's business-type record ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ffffffff-0000-4000-8000-0000000005b1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'ffffffff-0000-4000-8000-0000000005b1', true);
insert into t_results (name, ok, detail) values ('Sales B cannot see the business type recorded on Sales A''s lead',
  (select count(*) from public.lead_business_type_records where lead_id = (select lead_a from t_fx)) = 0, null);
reset role;

-- ── as the admin (a signed-in session): reads lead facts; onboarding only through admin-users ──
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from t_fx), 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', (select admin_id::text from t_fx), true);
do $$ begin
  insert into t_results (name, ok, detail) values ('the admin reads every lead''s TPS answers and business-type records',
    (select count(*) from public.phone_tps_checks where provider_reference in ('QA-A', 'QA-B')) = 2
    and (select count(*) from public.lead_business_type_records where lead_id = (select lead_a from t_fx)) = 1, null);
  begin
    perform 1 from public.salesperson_onboarding;
    insert into t_results (name, ok) values ('even the admin''s browser session cannot read onboarding directly (only fn admin-users)', false);
  exception when others then insert into t_results (name, ok, detail) values ('even the admin''s browser session cannot read onboarding directly (only fn admin-users)', sqlstate = '42501', sqlerrm); end;
end $$;
reset role;

-- ── anon ──
set local role anon;
do $$ begin
  begin perform 1 from public.salesperson_onboarding; insert into t_results (name, ok) values ('anon cannot read onboarding', false);
  exception when others then insert into t_results (name, ok, detail) values ('anon cannot read onboarding', sqlstate = '42501', sqlerrm); end;
  begin perform 1 from public.phone_tps_checks; insert into t_results (name, ok) values ('anon cannot read TPS answers', false);
  exception when others then insert into t_results (name, ok, detail) values ('anon cannot read TPS answers', sqlstate = '42501', sqlerrm); end;
  begin perform 1 from public.lead_business_type_records; insert into t_results (name, ok) values ('anon cannot read business-type records', false);
  exception when others then insert into t_results (name, ok, detail) values ('anon cannot read business-type records', sqlstate = '42501', sqlerrm); end;
end $$;
reset role;

insert into t_results (name, ok, detail) select 'no policy exists on salesperson_onboarding or its log', count(*) = 0, string_agg(policyname, ', ')
  from pg_policies where schemaname = 'public' and tablename in ('salesperson_onboarding', 'salesperson_onboarding_log');

do $$ declare r jsonb; begin
  select jsonb_build_object('passed', count(*) filter (where ok), 'failed', count(*) filter (where not ok or ok is null),
    'results', jsonb_agg(jsonb_build_object('n', n, 'ok', ok, 'name', name, 'detail', detail) order by n)) into r from t_results;
  raise exception 'QA_RESULT %', r::text;
end $$;
