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
-- CAMPAIGN OWNERSHIP + GLOBAL NAME UNIQUENESS — the live proof (2026-10-03). Run through the Management API
-- query endpoint; it ends in RAISE, so EVERYTHING is rolled back (fixture leads, campaigns, activity). Read the
-- QA_RESULT json: every cross-owner call must say not_found / unknown_campaign / 0 rows, every duplicate
-- variant name_taken, and no answer to a salesperson may carry an owner field.
do $$
declare r jsonb := '{}'; a jsonb;
  adm uuid := '9d5a7629-3171-4091-b3a4-43010a1d424d'; ua uuid := '262c1d64-05ad-42e8-a81b-7d25553aeff3'; ub uuid := 'c6e21a37-e342-4b99-9cf6-0489cb9af775';
  cp uuid; ca uuid; cb uuid; la uuid := '10400000-0000-4000-8000-0000000004a1'; lb uuid := '10400000-0000-4000-8000-0000000004b1'; n int;
begin
  insert into outreach_leads (id, user_id, business_name, status, assigned_to_user_id, search_keyword, search_location) values
    (la, adm, 'ZZ QA camp lead A', 'not_contacted', ua, 'roofer', 'Leeds'), (lb, adm, 'ZZ QA camp lead B', 'not_contacted', ub, 'roofer', 'Leeds');
  -- Paul creates P
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  a := campaign_create('ZZ QA Roofers - Manchester'); cp := (a->>'id')::uuid; r := r || jsonb_build_object('P_create', a->'ok');
  execute 'reset role';
  -- A
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  r := r || jsonb_build_object('A_dup_of_P', campaign_create(' zz qa roofers  -  MANCHESTER '));
  r := r || jsonb_build_object('A_avail_P_name', campaign_name_available('ZZ QA Roofers - Manchester '));
  a := campaign_create('ZZ QA Electricians - Leeds'); ca := (a->>'id')::uuid; r := r || jsonb_build_object('A_create', a->'ok');
  r := r || jsonb_build_object('A_rename_own_variant', campaign_rename(ca, 'zz qa electricians - leeds'));
  r := r || jsonb_build_object('A_add_own_lead', campaign_add_leads(ca, array[la]));
  r := r || jsonb_build_object('A_launch_own', campaign_launch(ca));
  execute 'reset role';
  -- B
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  r := r || jsonb_build_object('B_dup_of_A', campaign_create('ZZ QA  ELECTRICIANS - leeds'));
  a := campaign_create('ZZ QA Plumbers - London'); cb := (a->>'id')::uuid; r := r || jsonb_build_object('B_create', a->'ok');
  r := r || jsonb_build_object('B_list', (select jsonb_agg(x->>'name') from jsonb_array_elements(my_campaigns()->'campaigns') x));
  r := r || jsonb_build_object('B_open_A', campaign_detail(ca)->>'error', 'B_leads_A', campaign_leads(ca)->>'error', 'B_rename_A', campaign_rename(ca, 'x')->>'error', 'B_stop_A', campaign_stop(ca)->>'error', 'B_launch_A', campaign_launch(ca)->>'error', 'B_delete_A', campaign_delete(ca)->>'error', 'B_add_to_A', campaign_add_leads(ca, array[lb])->>'error');
  execute 'reset role';
  -- A again: everything against B and P
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  r := r || jsonb_build_object('A_list', (select jsonb_agg(x->>'name') from jsonb_array_elements(my_campaigns()->'campaigns') x));
  r := r || jsonb_build_object('A_list_has_owner_field', (my_campaigns()->'campaigns'->0) ? 'owner_name');
  r := r || jsonb_build_object('A_open_B', campaign_detail(cb)->>'error', 'A_open_P', campaign_detail(cp)->>'error',
    'A_rename_B', campaign_rename(cb, 'hijack')->>'error', 'A_rename_P', campaign_rename(cp, 'hijack')->>'error',
    'A_stop_B', campaign_stop(cb)->>'error', 'A_delete_B', campaign_delete(cb)->>'error', 'A_delete_P', campaign_delete(cp)->>'error',
    'A_launch_P', campaign_launch(cp)->>'error', 'A_leads_B', campaign_leads(cb)->>'error', 'A_cands_B', campaign_candidates(cb)->>'error');
  r := r || jsonb_build_object('A_lead_into_P', lead_set_campaign(la, cp)->>'error', 'A_bulk_into_B', leads_set_campaign(array[la], cb)->>'error');
  select count(*) into n from campaigns where id in (cb, cp); r := r || jsonb_build_object('A_table_reads_B_or_P', n);
  update campaigns set name = 'hijack' where id = cb; get diagnostics n = row_count; r := r || jsonb_build_object('A_table_update_B', n);
  r := r || jsonb_build_object('A_sales_add_lead_into_P', sales_add_lead(jsonb_build_object('business_name', 'ZZ QA x', 'search_keyword', 'roofer', 'search_location', 'Leeds', 'campaign_id', cp))->>'error');
  execute 'reset role';
  -- admin sees all three with owners
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  r := r || jsonb_build_object('ADMIN_list', (select jsonb_agg(jsonb_build_object('n', x->>'name', 'owner', x->>'owner_name', 'mine', x->'is_mine')) from jsonb_array_elements(my_campaigns()->'campaigns') x where x->>'name' ilike 'ZZ QA%'));
  r := r || jsonb_build_object('ADMIN_open_A', campaign_detail(ca)->'ok');
  execute 'reset role';
  raise exception 'QA_RESULT %', r::text;
end $$;
