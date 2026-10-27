-- MULTI-USER SAFETY (2026-10-27, migration 20261128090000, docs/multi-user.md §10). RUN AGAINST THE LIVE DATABASE; ALWAYS
-- ROLLED BACK: the last statement raises the results, so nothing commits. Two FAKE salespeople (auth users on example.invalid)
-- and "ZZ QA" leads with no phone exist only inside this transaction. No message is sent or queued.
-- Two users, the same lead: A adds it; B is told "already added — added by A" for the same place, the same name and the same
-- website, exactly where the add itself refuses; B cannot read, claim or add it; a reply after A leaves notifies the book owner.
begin;
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

set local lock_timeout = '3s';
set local statement_timeout = '60s';
create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated, anon; grant usage, select on sequence t_results_n_seq to authenticated, anon;
create temp table t_ids (k text primary key, val text);
grant all on t_ids to authenticated, anon;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('eeeeeeee-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-mus-a@example.invalid', '{}', '{}', now(), now()),
  ('eeeeeeee-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-mus-b@example.invalid', '{}', '{}', now(), now());
insert into public.user_roles (user_id, role) values ('eeeeeeee-0000-4000-8000-0000000000a1', 'sales'), ('eeeeeeee-0000-4000-8000-0000000000b1', 'sales');
insert into public.team_members (user_id, display_name) values ('eeeeeeee-0000-4000-8000-0000000000a1', 'QA Rep A'), ('eeeeeeee-0000-4000-8000-0000000000b1', 'QA Rep B');
insert into t_ids values
  ('pid', 'ZZQA' || replace(gen_random_uuid()::text, '-', '')),
  ('admin', (select user_id::text from public.team_members where is_book_owner limit 1));
insert into t_ids select 'name', 'ZZ QA Multi User Plumbing ' || val from t_ids where k = 'pid';
insert into t_ids select 'site', 'https://www.zz-qa-mus-' || lower(val) || '.example/' from t_ids where k = 'pid';

-- ── A adds the lead through Find Leads' one add path ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
do $$ declare res jsonb; begin
  res := public.coverage_add_leads(jsonb_build_array(jsonb_build_object('k', 'a',
    'business_name', (select val from t_ids where k = 'name'), 'place_id', (select val from t_ids where k = 'pid'),
    'website', (select val from t_ids where k = 'site'), 'search_keyword', 'plumbers', 'search_location', 'Rugby', 'country', 'UK')), null, true);
  insert into t_results (name, ok, detail) values ('A adds a lead', (res -> 'counts' ->> 'created') = '1', res::text);
  insert into t_ids select 'lead', id::text from public.sales_leads where place_id = (select val from t_ids where k = 'pid');
  insert into t_results (name, ok, detail) values ('…and sees it as theirs', (select count(*) from t_ids where k = 'lead') = 1, null);
end $$;

-- ── B: the same business, four ways ──
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
do $$ declare got text; res jsonb; items jsonb; begin
  items := jsonb_build_array(
    jsonb_build_object('k', 'place', 'place_id', (select val from t_ids where k = 'pid'), 'name', 'Anything', 'country', 'UK'),
    jsonb_build_object('k', 'name', 'place_id', 'ZZQA-other-place', 'name', (select val from t_ids where k = 'name'), 'country', 'UK'),
    jsonb_build_object('k', 'site', 'place_id', 'ZZQA-third-place', 'name', 'ZZ QA A Different Name', 'website', (select val from t_ids where k = 'site') || 'contact', 'country', 'UK'),
    jsonb_build_object('k', 'new', 'place_id', 'ZZQA-new-place', 'name', 'ZZ QA Never Seen ' || gen_random_uuid(), 'country', 'UK'));
  select string_agg(k || '=' || state || ':' || coalesce(added_by_name, '-') || ':' || (lead_id is null)::text || ':' || (owner_id is null)::text, ' ' order by k)
    into got from public.lead_identity_lookup(items);
  insert into t_results (name, ok, detail) values ('B is told "Added by QA Rep A" for the same place, name and website; the new one is new; no ids leak',
    got = 'name=owned:QA Rep A:true:true new=new:-:true:true place=owned:QA Rep A:true:true site=owned:QA Rep A:true:true', got);
  -- The marker and the add agree: everything the lookup calls already-added, the add refuses.
  res := public.coverage_add_leads(jsonb_build_array(
    jsonb_build_object('k', 'place', 'business_name', 'Anything', 'place_id', (select val from t_ids where k = 'pid'), 'search_keyword', 'plumbers', 'search_location', 'Rugby'),
    jsonb_build_object('k', 'name', 'business_name', (select val from t_ids where k = 'name'), 'place_id', 'ZZQA-other-place', 'search_keyword', 'plumbers', 'search_location', 'Rugby'),
    jsonb_build_object('k', 'site', 'business_name', 'ZZ QA A Different Name', 'place_id', 'ZZQA-third-place', 'website', (select val from t_ids where k = 'site') || 'contact', 'search_keyword', 'plumbers', 'search_location', 'Rugby')), null, true);
  insert into t_results (name, ok, detail) values ('B''s add of all three is refused; nothing created',
    (res -> 'counts' ->> 'created') = '0'
    and (select string_agg(x ->> 'outcome' || ':' || (x -> 'reasons' ->> 0), ',' order by (x ->> 'i')::int) from jsonb_array_elements(res -> 'rows') x)
        = 'skipped:owned_by_other,skipped:same_name,skipped:same_website', res::text);
  res := public.sales_add_lead(jsonb_build_object('business_name', 'X', 'search_keyword', 'plumbers', 'place_id', (select val from t_ids where k = 'pid')));
  insert into t_results (name, ok, detail) values ('B''s single add is refused as owned (no id)', res ->> 'error' = 'exists' and res ->> 'state' = 'owned' and res ->> 'lead_id' is null, res::text);
  insert into t_results (name, ok, detail) values ('B cannot read A''s lead', (select count(*) from public.sales_leads where id = (select val from t_ids where k = 'lead')::uuid) = 0, null);
  insert into t_results (name, ok, detail) values ('B cannot read A''s lead in the table', (select count(*) from public.outreach_leads where id = (select val from t_ids where k = 'lead')::uuid) = 0, null);
  begin
    res := public.claim_lead((select val from t_ids where k = 'lead')::uuid);
    insert into t_results (name, ok, detail) values ('B cannot claim A''s lead', coalesce((res ->> 'ok')::boolean, false) = false, res::text);
  exception when others then insert into t_results (name, ok, detail) values ('B cannot claim A''s lead', true, sqlerrm);
  end;
  update public.outreach_leads set assigned_to_user_id = 'eeeeeeee-0000-4000-8000-0000000000b1' where id = (select val from t_ids where k = 'lead')::uuid;
  insert into t_results (name, ok, detail) values ('B''s direct reassign is a 0-row no-op',
    not exists (select 1 from public.sales_leads where id = (select val from t_ids where k = 'lead')::uuid), null);
end $$;

-- ── anon ──
reset role;
insert into t_results (name, ok, detail) values ('anon cannot run the lookup', not has_function_privilege('anon', 'public.lead_identity_lookup(jsonb)', 'execute'), null);
insert into t_results (name, ok, detail) values ('a signed-in user can', has_function_privilege('authenticated', 'public.lead_identity_lookup(jsonb)', 'execute'), null);

-- ── the admin sees the lead id and the owner ──
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select val from t_ids where k = 'admin'), 'role', 'authenticated')::text, true);
do $$ declare got record; begin
  select * into got from public.lead_identity_lookup(jsonb_build_array(jsonb_build_object('k', '1', 'place_id', (select val from t_ids where k = 'pid'))));
  insert into t_results (name, ok, detail) values ('admin: owned by A, added by A, with the lead id',
    got.state = 'owned' and got.added_by_name = 'QA Rep A' and got.owner_name = 'QA Rep A' and got.lead_id::text = (select val from t_ids where k = 'lead'), row_to_json(got)::text);
end $$;

-- ── A leaves: a reply on their lead notifies the book owner ──
reset role;
do $$ declare before uuid; after uuid; begin
  before := public.lead_recipient((select val from t_ids where k = 'lead')::uuid);
  update public.team_members set status = 'disabled', disabled_at = now() where user_id = 'eeeeeeee-0000-4000-8000-0000000000a1';
  after := public.lead_recipient((select val from t_ids where k = 'lead')::uuid);
  insert into t_results (name, ok, detail) values ('reply notification: A while active, the book owner once A is disabled',
    before = 'eeeeeeee-0000-4000-8000-0000000000a1' and after::text = (select val from t_ids where k = 'admin'), before || ' → ' || after);
end $$;

do $$ begin
  raise exception 'RESULTS %', (select json_agg(json_build_object('n', n, 'ok', ok, 'name', name, 'detail', detail) order by n) from t_results);
end $$;
rollback;
