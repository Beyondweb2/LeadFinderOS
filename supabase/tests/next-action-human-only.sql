-- Next Action is human-set only (2026-09-28). RUN AGAINST THE LIVE DATABASE; ALWAYS ROLLED BACK.
-- The last statement raises an exception carrying the results as JSON, so the transaction can never
-- commit: every fixture (fake auth users on example.invalid, roles, claims, edits) disappears.
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
set local statement_timeout = '20s';
create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated; grant usage, select on sequence t_results_n_seq to authenticated;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('cccccccc-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-na-a@example.invalid', '{}', '{}', now(), now()),
  ('cccccccc-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-na-b@example.invalid', '{}', '{}', now(), now());
insert into public.user_roles (user_id, role) values ('cccccccc-0000-4000-8000-00000000000a', 'sales'), ('cccccccc-0000-4000-8000-00000000000b', 'sales');
insert into public.team_members (user_id, display_name) values ('cccccccc-0000-4000-8000-00000000000a', 'NA A'), ('cccccccc-0000-4000-8000-00000000000b', 'NA B');
create temp table t_fx as select
  (select l.id from public.outreach_leads l
    where l.assigned_to_user_id is null and l.is_archived is not true and l.status = 'not_contacted'
      and not public.lead_is_client(l.amount_paid, l.status) and public.lead_first_contact_at(l.id) is null
    order by l.created_at desc limit 1) as mine,
  (select l.id from public.outreach_leads l where l.assigned_to_user_id = l.user_id and not public.lead_is_client(l.amount_paid, l.status) order by l.created_at limit 1) as pauls,
  (select user_id from public.team_members where is_book_owner limit 1) as admin_id;
grant select on t_fx to authenticated;
insert into t_results (name, ok, detail) select 'fixtures', mine is not null and pauls is not null and admin_id is not null, null from t_fx;

-- The schema: default 'none', and no trigger on outreach_leads mentions next_action.
insert into t_results (name, ok, detail) select 'the column default is none',
  (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'outreach_leads' and column_name = 'next_action') = '''none''::next_action_type', null;
insert into t_results (name, ok, detail) select 'no trigger on outreach_leads writes next_action',
  not exists (select 1 from pg_trigger t where t.tgrelid = 'public.outreach_leads'::regclass and not t.tgisinternal and pg_get_functiondef(t.tgfoid) ~* 'next_action'),
  (select string_agg(tgname, ', ') from pg_trigger where tgrelid = 'public.outreach_leads'::regclass and not tgisinternal);
insert into t_results (name, ok, detail) select 'no scheduled job mentions next_action', not exists (select 1 from cron.job where command ~* 'next_action'), null;
insert into t_results (name, ok, detail) select 'only lead_set_follow_up sets a chosen next action',
  (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and pg_get_functiondef(p.oid) ~* 'next_action\s*=\s*(?!''none'')') <@ array['lead_set_call_booked', 'lead_set_follow_up']
  and 'lead_set_follow_up' = any (select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and pg_get_functiondef(p.oid) ~* 'next_action\s*=\s*(?!''none'')'),
  (select string_agg(p.proname::text, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and pg_get_functiondef(p.oid) ~* 'next_action\s*=\s*(?!''none'')');
/* 2026-10-02: lead_set_call_booked never writes the type itself — it either delegates to lead_set_follow_up (the one
   write, migration 20261002180000_one_next_action) or, in the older form, only moves an existing Meeting's day and
   time (its next_action = 'meeting' is the WHERE clause). */
insert into t_results (name, ok, detail) select 'lead_set_call_booked never sets a type itself',
  pg_get_functiondef('public.lead_set_call_booked'::regproc) !~* 'set\s+next_action\s*='
  and (pg_get_functiondef('public.lead_set_call_booked'::regproc) ~* 'return public\.lead_set_follow_up\('
       or pg_get_functiondef('public.lead_set_call_booked'::regproc) ~* 'where id = _lead_id and next_action = ''meeting'''), null;

-- ── as Sales A ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-00000000000a', true);
do $$ declare r jsonb; v record; begin
  r := public.claim_lead((select mine from t_fx));
  select next_action::text a, next_action_date d into v from public.sales_leads where id = (select mine from t_fx);
  insert into t_results (name, ok, detail) values ('claiming does NOT set a next action', (r ->> 'ok')::boolean and v.a = 'none' and v.d is null, v.a || ' ' || coalesce(v.d::text, '-'));

  r := public.lead_set_stage((select mine from t_fx), 'price_given');
  select next_action::text a, next_action_date d into v from public.sales_leads where id = (select mine from t_fx);
  insert into t_results (name, ok, detail) values ('a status change does NOT set a next action', (r ->> 'ok')::boolean and v.a = 'none' and v.d is null, v.a);
  r := public.lead_mark_interested((select mine from t_fx), true);
  select next_action::text a into v from public.sales_leads where id = (select mine from t_fx);
  insert into t_results (name, ok, detail) values ('starring does NOT set a next action', v.a = 'none', v.a);

  r := public.lead_set_follow_up((select mine from t_fx), 'call', current_date + 2, 'ring after 10');
  select next_action::text a, next_action_date d, next_action_note nn into v from public.sales_leads where id = (select mine from t_fx);
  insert into t_results (name, ok, detail) values ('Sales SETS a next action on own lead', (r ->> 'ok')::boolean and v.a = 'call' and v.d = current_date + 2, r::text);
  r := public.lead_set_follow_up((select mine from t_fx), 'send_follow_up', current_date + 5, 'ring after 10');
  select next_action::text a, next_action_date d, next_action_note nn into v from public.sales_leads where id = (select mine from t_fx);
  insert into t_results (name, ok, detail) values ('Sales CHANGES it', v.a = 'send_follow_up' and v.d = current_date + 5, v.a);
  insert into t_results (name, ok, detail) values ('…and the follow-up note stays intact', v.nn = 'ring after 10', v.nn);
  r := public.lead_set_follow_up((select mine from t_fx), 'none', null, 'ring after 10');
  select next_action::text a, next_action_date d, next_action_note nn into v from public.sales_leads where id = (select mine from t_fx);
  /* 2026-10-02 (Paul): Clear takes the Next Action's note with it (History keeps it). */
  insert into t_results (name, ok, detail) values ('Sales CLEARS it (and its note)', v.a = 'none' and v.d is null and v.nn is null, v.a);
  insert into t_results (name, ok, detail) values ('status and owner untouched by the follow-up edits',
    (select status from public.sales_leads where id = (select mine from t_fx)) = 'price_given'
    and (select assigned_to_user_id from public.sales_leads where id = (select mine from t_fx)) = 'cccccccc-0000-4000-8000-00000000000a', null);
  begin perform public.lead_set_follow_up((select pauls from t_fx), 'call', current_date, null); insert into t_results (name, ok) values ('Sales cannot set one on Pauls lead', false);
  exception when others then insert into t_results (name, ok, detail) values ('Sales cannot set one on Pauls lead', sqlerrm = 'not_your_lead', sqlerrm); end;
end $$;
reset role;

-- ── as Sales B: A's lead is not theirs ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-00000000000b', true);
do $$ begin
  begin perform public.lead_set_follow_up((select mine from t_fx), 'call', current_date, null); insert into t_results (name, ok) values ('another rep cannot edit A''s next action', false);
  exception when others then insert into t_results (name, ok, detail) values ('another rep cannot edit A''s next action', sqlerrm = 'not_your_lead', sqlerrm); end;
end $$;
reset role;

-- ── as the admin ──
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from t_fx), 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', (select admin_id::text from t_fx), true);
do $$ declare r jsonb; v record; begin
  r := public.lead_set_follow_up((select pauls from t_fx), 'follow_up', current_date + 1, null);
  select next_action::text a, next_action_date d into v from public.outreach_leads where id = (select pauls from t_fx);
  insert into t_results (name, ok, detail) values ('Admin SETS a next action', (r ->> 'ok')::boolean and v.a = 'follow_up' and v.d = current_date + 1, r::text);
  update public.outreach_leads set next_action = 'call', next_action_date = current_date + 3 where id = (select pauls from t_fx);
  select next_action::text a, next_action_date d into v from public.outreach_leads where id = (select pauls from t_fx);
  insert into t_results (name, ok, detail) values ('Admin CHANGES it (the Outreach editor''s direct write)', v.a = 'call' and v.d = current_date + 3, v.a);
  update public.outreach_leads set next_action = 'none', next_action_date = null where id = (select pauls from t_fx);
  select next_action::text a, next_action_date d into v from public.outreach_leads where id = (select pauls from t_fx);
  insert into t_results (name, ok, detail) values ('Admin CLEARS it', v.a = 'none' and v.d is null, v.a);
end $$;
reset role;

do $$ begin
  raise exception 'RESULTS %', (select json_agg(json_build_object('n', n, 'ok', ok, 'name', name, 'detail', detail) order by n) from t_results);
end $$;
