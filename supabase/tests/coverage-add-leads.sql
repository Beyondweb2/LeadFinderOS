-- LIVE TEST of coverage_add_leads (migration 20261031090000). ALWAYS ROLLS BACK: it ends by raising.
-- Fixture names are "ZZ QA …"; no phone, no message, nothing kept. Expected (one line, in the raised text):
--   anon_blocked=t  sales_preview=new,skipped:exists_unassigned|owned_by_other|already_yours,skipped:duplicate_in_batch,invalid
--   other_campaign=unknown_campaign  sales_commit_created=1  owner_ok=t  fields_ok=t  history=1  activity=1  run_credit=t
--   again=already_yours  admin_created=1  admin_owner_ok=t  same_name=same_name  no_role=raised
do $$
declare
  sales uuid := 'c6e21a37-e342-4b99-9cf6-0489cb9af775';   -- "test1" salesperson (a metric_exclusions test account)
  other uuid := '7d8ada5f-cce1-459c-a2ae-43fe4c69e117';   -- another salesperson (only owns a campaign here)
  admin uuid := '9d5a7629-3171-4091-b3a4-43010a1d424d';   -- the admin / book owner
  gone  uuid := '262c1d64-05ad-42e8-a81b-7d25553aeff3';   -- a disabled account: no role
  existing_pid text;
  my_camp uuid; their_camp uuid; run_id uuid;
  pid text := 'ZZQA' || replace(gen_random_uuid()::text, '-', '');
  rows jsonb; res jsonb; r text := ''; v record; got text;
begin
  select place_id into existing_pid from outreach_leads where place_id is not null order by created_at limit 1;
  insert into campaigns (name, created_by) values ('ZZ QA coverage multi-town ' || pid, sales) returning id into my_camp;
  insert into campaigns (name, created_by) values ('ZZ QA other owner ' || pid, other) returning id into their_camp;
  insert into search_history (user_id, keyword, location, radius, results_count, no_website_count, found_with_website, found_without_website, found_keys)
    values (sales, 'plumbers', 'rugby', 50000, 1, 1, 0, 1, jsonb_build_object(pid, true)) returning id into run_id;

  rows := jsonb_build_array(
    jsonb_build_object('k', 'a', 'business_name', 'ZZ QA Plumbing ' || pid, 'place_id', pid, 'google_maps_url', 'https://maps.google.com/?cid=' || pid,
                       'search_keyword', 'plumbers', 'search_location', 'Rugby', 'country', 'UK', 'derived_town', 'Rugby', 'town_checked', true,
                       'rating', 4.5, 'review_count', 12, 'search_run_id', run_id, 'search_key', pid, 'without_website', true),
    jsonb_build_object('k', 'b', 'business_name', 'ZZ QA Existing', 'place_id', existing_pid, 'search_keyword', 'plumbers', 'search_location', 'Rugby'),
    jsonb_build_object('k', 'c', 'business_name', 'ZZ QA Plumbing again', 'place_id', pid, 'search_keyword', 'plumbers', 'search_location', 'Rugby'),
    jsonb_build_object('k', 'd', 'business_name', 'ZZ QA No Trade', 'place_id', pid || 'x', 'search_location', 'Rugby'));

  -- anon has no EXECUTE.
  r := r || 'anon_blocked=' || (not has_function_privilege('anon', 'public.coverage_add_leads(jsonb,uuid,boolean)', 'execute'))::text || ' ';

  perform set_config('request.jwt.claims', json_build_object('sub', sales, 'role', 'authenticated')::text, true);
  res := public.coverage_add_leads(rows, null, false);
  select string_agg(x ->> 'outcome' || coalesce(':' || (x -> 'reasons' ->> 0), ''), ',' order by (x ->> 'i')::int) into got from jsonb_array_elements(res -> 'rows') x;
  r := r || 'sales_preview=' || got || ' ';
  r := r || 'other_campaign=' || coalesce(public.coverage_add_leads(rows, their_camp, true) ->> 'error', 'ACCEPTED!') || ' ';
  res := public.coverage_add_leads(rows, my_camp, true);
  r := r || 'sales_commit_created=' || (res -> 'counts' ->> 'created') || ' ';
  select * into v from outreach_leads where place_id = pid;
  r := r || 'owner_ok=' || (v.user_id = admin and v.assigned_to_user_id = sales and v.added_by_user_id = sales)::text || ' ';
  r := r || 'fields_ok=' || (v.campaign_id = my_camp and v.search_keyword = 'plumbers' and v.search_location = 'Rugby' and v.derived_town = 'Rugby'
                              and v.town_fetched_at is not null and v.rating = 4.5 and v.review_count = 12 and v.lead_source is null and v.import_batch is null
                              and v.list_type = 'no_website' and v.status = 'not_contacted' and v.country = 'UK')::text || ' ';
  r := r || 'history=' || (select count(*) from outreach_history where business_name = 'ZZ QA Plumbing ' || pid) || ' ';
  r := r || 'activity=' || (select count(*) from lead_activity where lead_id = v.id and kind = 'lead_added') || ' ';
  r := r || 'run_credit=' || coalesce((select (added_keys ->> pid) from search_history where id = run_id), 'none') || ' ';
  res := public.coverage_add_leads(jsonb_build_array(rows -> 0), null, false);
  r := r || 'again=' || (res -> 'rows' -> 0 -> 'reasons' ->> 0) || ' ';

  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  res := public.coverage_add_leads(jsonb_build_array(jsonb_build_object('k', 'z', 'business_name', 'ZZ QA Admin ' || pid, 'place_id', pid || 'adm',
                                   'search_keyword', 'plumbers', 'search_location', 'Klang, Malaysia', 'country', 'Malaysia')), null, true);
  r := r || 'admin_created=' || (res -> 'counts' ->> 'created') || ' ';
  r := r || 'admin_owner_ok=' || (select user_id = admin and assigned_to_user_id = admin and country = 'Malaysia' from outreach_leads where place_id = pid || 'adm')::text || ' ';
  res := public.coverage_add_leads(jsonb_build_array(jsonb_build_object('k', 'y', 'business_name', 'ZZ QA Admin ' || pid, 'place_id', pid || 'adm2',
                                   'search_keyword', 'plumbers', 'search_location', 'Klang, Malaysia', 'country', 'Malaysia')), null, false);
  r := r || 'same_name=' || (res -> 'rows' -> 0 -> 'reasons' ->> 0) || ' ';

  perform set_config('request.jwt.claims', json_build_object('sub', gone, 'role', 'authenticated')::text, true);
  begin
    perform public.coverage_add_leads(rows, null, false);
    r := r || 'no_role=ACCEPTED!';
  exception when others then
    r := r || 'no_role=raised';
  end;
  raise exception 'ROLLBACK_ONLY %', r;
end $$;
