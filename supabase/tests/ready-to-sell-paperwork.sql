-- READY TO SELL WITHOUT SALESPERSON PAPERWORK (migration 20261010140000, Paul 2026-10-05).
-- RUN AGAINST THE LIVE DATABASE; ALWAYS ROLLED BACK (the last statement raises the results). Before the migration is
-- applied, prepend it after `begin;`. Fake users on example.invalid.
-- R1 = practical items complete, NO agreement / privacy notice recorded. R2 = the same but no bank details. R3 = no record.
begin;
create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to service_role; grant usage, select on sequence t_results_n_seq to service_role;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('dddddddd-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-rts-r1@example.invalid', '{}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-rts-r2@example.invalid', '{}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-rts-r3@example.invalid', '{}', '{}', now(), now());
insert into public.user_roles (user_id, role) select u, 'sales' from unnest(array['dddddddd-0000-4000-8000-0000000000a1', 'dddddddd-0000-4000-8000-0000000000a2', 'dddddddd-0000-4000-8000-0000000000a3']::uuid[]) u;
insert into public.team_members (user_id, display_name) values ('dddddddd-0000-4000-8000-0000000000a1', 'RTS R1'), ('dddddddd-0000-4000-8000-0000000000a2', 'RTS R2'), ('dddddddd-0000-4000-8000-0000000000a3', 'RTS R3');
insert into public.salesperson_onboarding (user_id, age_18_confirmed_on, rtw_method, rtw_checked_on, rtw_checked_by, rtw_result, rtw_evidence_ref,
  bank_details_received_on, vat_registered, contractor_type, start_date, team_guide_version, team_guide_acknowledged_on)
select u, '2026-10-06', 'manual_video_call', '2026-10-06', 'Paul James Sales', 'pass', 'Secure folder / RTW / QA',
  case when u = 'dddddddd-0000-4000-8000-0000000000a2'::uuid then null else '2026-10-06'::date end, false, 'individual', '2026-10-01', 'team-guide-2026-10-02', '2026-10-06'
  from unnest(array['dddddddd-0000-4000-8000-0000000000a1', 'dddddddd-0000-4000-8000-0000000000a2']::uuid[]) u;

insert into t_results (name, ok, detail) select 'the live rule no longer reads the contractor agreement or privacy notice',
  position('''agreement''' in prosrc) = 0 and position('''privacy_notice''' in prosrc) = 0 and position('contractor_agreement' in prosrc) = 0, null
  from pg_proc where proname = 'salesperson_onboarding_missing';
insert into t_results (name, ok, detail) select 'only DRAFT agreement / notice exist (none approved)',
  not exists (select 1 from public.salesperson_document_versions where kind in ('contractor_agreement', 'privacy_notice') and status = 'approved'), null;
insert into t_results (name, ok, detail) select 'R1: practical items complete, NO agreement or notice recorded → READY TO SELL',
  public.salesperson_ready_to_sell('dddddddd-0000-4000-8000-0000000000a1'), public.salesperson_onboarding_missing('dddddddd-0000-4000-8000-0000000000a1')::text;
insert into t_results (name, ok, detail) select 'R2: bank details missing → NOT ready, and that is the only thing listed',
  public.salesperson_onboarding_missing('dddddddd-0000-4000-8000-0000000000a2') = array['bank_details'], public.salesperson_onboarding_missing('dddddddd-0000-4000-8000-0000000000a2')::text;
insert into t_results (name, ok, detail) select 'R3: no record → the practical items are listed, never agreement / privacy_notice',
  not (m && array['agreement', 'privacy_notice']) and m @> array['age_18', 'right_to_work', 'bank_details', 'vat', 'contractor_status', 'start_date', 'team_guide'], m::text
  from (select public.salesperson_onboarding_missing('dddddddd-0000-4000-8000-0000000000a3') m) x;
-- The absent-value case: everything else complete, contractor status never recorded → NOT ready.
update public.salesperson_onboarding set contractor_type = null where user_id = 'dddddddd-0000-4000-8000-0000000000a1';
insert into t_results (name, ok, detail) select 'contractor status never recorded (NULL) → NOT ready, contractor_status listed',
  public.salesperson_onboarding_missing('dddddddd-0000-4000-8000-0000000000a1') = array['contractor_status'], public.salesperson_onboarding_missing('dddddddd-0000-4000-8000-0000000000a1')::text;
update public.salesperson_onboarding set contractor_type = 'individual' where user_id = 'dddddddd-0000-4000-8000-0000000000a1';

set local role service_role;
insert into t_results (name, ok, detail) select 'FIND LEADS: a fully onboarded rep (no paperwork recorded) may search',
  coalesce(r ->> 'reason', '') <> 'not_onboarded' and (r ->> 'ok')::boolean, r::text
  from (select public.guard_action('dddddddd-0000-4000-8000-0000000000a1', 'lead_search', null, 0, 1, 'qa') r) x;
insert into t_results (name, ok, detail) select 'FIND LEADS: a rep missing a practical item is refused (not_onboarded)',
  r ->> 'reason' = 'not_onboarded' and not (r ->> 'ok')::boolean, r::text
  from (select public.guard_action('dddddddd-0000-4000-8000-0000000000a2', 'lead_search', null, 0, 1, 'qa') r) x;
insert into t_results (name, ok, detail) select '…and so are claims, prospect checks, WhatsApp sends and queueing',
  bool_and(r ->> 'reason' = 'not_onboarded'), string_agg(a || '=' || coalesce(r ->> 'reason', 'ok'), ', ')
  from (select a, public.guard_action('dddddddd-0000-4000-8000-0000000000a2', a, null, 0, 1, 'qa') r from unnest(array['claim', 'sales_check', 'whatsapp_send', 'whatsapp_queue']) a) x;
insert into t_results (name, ok, detail) select 'the ready rep is not refused for onboarding on any of them',
  bool_and(coalesce(r ->> 'reason', '') <> 'not_onboarded'), string_agg(a || '=' || coalesce(r ->> 'reason', 'ok'), ', ')
  from (select a, public.guard_action('dddddddd-0000-4000-8000-0000000000a1', a, null, 0, 1, 'qa') r from unnest(array['claim', 'sales_check', 'whatsapp_send', 'whatsapp_queue']) a) x;
insert into t_results (name, ok, detail) select 'Paul (admin) is never refused for onboarding',
  coalesce(r ->> 'reason', '') <> 'not_onboarded', r::text
  from (select public.guard_action((select user_id from public.team_members where is_book_owner limit 1), 'lead_search', null, 0, 1, 'qa') r) x;
reset role;
insert into t_results (name, ok, detail) select 'the live test reps (Test, test1) are still not ready — their practical onboarding is not recorded',
  bool_and(not public.salesperson_ready_to_sell(tm.user_id)), string_agg(tm.display_name || '=' || public.salesperson_onboarding_missing(tm.user_id)::text, '; ')
  from public.team_members tm join public.user_roles r on r.user_id = tm.user_id and r.role = 'sales' where tm.display_name in ('Test', 'test1');
insert into t_results (name, ok, detail) select 'signed-in users still cannot call the readiness rule for someone else',
  not has_function_privilege('authenticated', 'public.salesperson_onboarding_missing(uuid)', 'execute'), null;

do $$ declare r jsonb; begin
  select jsonb_build_object('passed', count(*) filter (where ok), 'failed', count(*) filter (where not ok or ok is null),
    'results', jsonb_agg(jsonb_build_object('n', n, 'ok', ok, 'name', name, 'detail', detail) order by n)) into r from t_results;
  raise exception 'QA_RESULT %', r::text;
end $$;
