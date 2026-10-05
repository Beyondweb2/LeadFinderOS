-- Multi-user security tests (2026-09-27). RUN AGAINST THE LIVE DATABASE; ALWAYS ROLLED BACK.
-- The last statement raises an exception carrying the results as JSON, so the transaction can never
-- commit: every fixture (fake auth users on example.invalid, roles, claims, notes) disappears.
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

create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated; grant usage, select on sequence t_results_n_seq to authenticated;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-sales-a@example.invalid', '{}', '{}', now(), now());
insert into public.user_roles (user_id, role) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'sales');
insert into public.team_members (user_id, display_name, daily_send_limit) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Sales A', 2);
create temp table t_fx as select array(
  select l.id from public.outreach_leads l
  where l.assigned_to_user_id is null and l.is_archived is not true and l.status = 'not_contacted'
    and not public.lead_is_client(l.amount_paid, l.status) and public.phone_key(l.phone) ~ '^7[0-9]{9}$'
    and public.lead_first_contact_at(l.id) is null
  order by l.created_at limit 3) as mob,
  (select l.id from public.outreach_leads l where l.assigned_to_user_id = l.user_id order by l.created_at limit 1) as pauls;
-- 2026-09-27: no global selected opener — the batch is queued with the template chosen for it. The
-- NEWER opener is chosen here on purpose, to prove nothing substitutes the original.
alter table t_fx add column opener text;
update t_fx set opener = 'initial_opener_v2';
grant select on t_fx to authenticated;
insert into t_results (name, ok, detail) select 'fixtures', array_length(mob, 1) = 3, array_length(mob, 1)::text from t_fx;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-00000000000a', true);
do $$ declare r jsonb; i int; begin
  for i in 1..3 loop perform public.claim_lead((select mob[i] from t_fx)); end loop;
  r := public.sales_queue_opener((select mob from t_fx), '');
  insert into t_results (name, ok, detail) values ('queue: no template chosen is refused', r ->> 'error' = 'template_required' and (select count(*) from public.lead_activity where kind = 'bulk_queued') = 0, r::text);
  r := public.sales_queue_opener((select mob from t_fx), 'audit_reply');
  insert into t_results (name, ok, detail) values ('queue: a non-opener is refused', r ->> 'error' = 'not_an_initial_opener', r::text);
  r := public.sales_queue_opener((select mob || array[pauls] from t_fx), (select opener from t_fx));
  insert into t_results (name, ok, detail) values ('queue: 2 queued (daily limit 2)', (r ->> 'queued')::int = 2, r::text);
  insert into t_results (name, ok, detail) values ('queue: 1 over the limit', (r -> 'skipped' ->> 'daily_limit')::int = 1, r::text);
  insert into t_results (name, ok, detail) values ('queue: Pauls lead refused', (r -> 'skipped' ->> 'not_yours')::int = 1, r::text);
  insert into t_results (name, ok, detail) values ('queue: template is the one chosen for the batch', r ->> 'template' = 'initial_opener_v2', r::text);
  insert into t_results (name, ok, detail) values ('queue: that exact template is stored on the lead', (select whatsapp_template from public.sales_leads where id = (select mob[1] from t_fx)) = 'initial_opener_v2', null);
  insert into t_results (name, ok, detail) values ('queue: lead shows queued', (select status from public.sales_leads where id = (select mob[1] from t_fx)) = 'queued', null);
  r := public.sales_queue_opener((select array[mob[1]] from t_fx), 'initial_contact');
  insert into t_results (name, ok, detail) values ('queue: requeue refused', (r ->> 'queued')::int = 0, r::text);
  insert into t_results (name, ok, detail) values ('queue: activity logged', (select count(*) from public.lead_activity where kind = 'bulk_queued') = 2, null);
end $$;
reset role;
do $$ begin
  raise exception 'RESULTS %', (select json_agg(json_build_object('n', n, 'ok', ok, 'name', name, 'detail', detail) order by n) from t_results);
end $$;
