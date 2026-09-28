-- Sales flow reliability (2026-09-28): campaign on own lead, the claim pool, the Sales add keeping the
-- Google details. RUN AGAINST THE LIVE DATABASE; ALWAYS ROLLED BACK — the last statement raises the
-- results as JSON, so nothing (fake users on example.invalid, claims, adds, campaign changes) commits.
-- How to run: send this file as one query to the Management API (docs/multi-user.md §6).
begin;
-- sales_pool lost its authenticated grant on 2026-09-29 (no caller; it paged the whole pool). This suite still
-- uses it as the oracle for "is this lead in the claimable pool" -- a TEST-ONLY grant, rolled back with the rest.
grant execute on function public.sales_pool(text, integer, integer) to authenticated;
create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated, anon; grant usage, select on sequence t_results_n_seq to authenticated, anon;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('cccccccc-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-sfr-a@example.invalid', '{}', '{}', now(), now()),
  ('cccccccc-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-sfr-b@example.invalid', '{}', '{}', now(), now());
insert into public.user_roles (user_id, role) values ('cccccccc-0000-4000-8000-00000000000a', 'sales'), ('cccccccc-0000-4000-8000-00000000000b', 'sales');
insert into public.team_members (user_id, display_name) values ('cccccccc-0000-4000-8000-00000000000a', 'SFR A'), ('cccccccc-0000-4000-8000-00000000000b', 'SFR B');
create temp table t_fx as select
  (select l.id from public.outreach_leads l
    where l.assigned_to_user_id is null and l.is_archived is not true and l.status = 'not_contacted'
      and not public.lead_is_client(l.amount_paid, l.status) and public.lead_first_contact_at(l.id) is null
    order by l.created_at limit 1) as mine,
  (select l.id from public.outreach_leads l
    where l.assigned_to_user_id is null and l.is_archived is not true and l.status = 'not_contacted'
      and not public.lead_is_client(l.amount_paid, l.status) and public.lead_first_contact_at(l.id) is null
    order by l.created_at offset 1 limit 1) as touched,
  (select l.id from public.outreach_leads l where l.assigned_to_user_id = l.user_id and not public.lead_is_client(l.amount_paid, l.status) order by l.created_at limit 1) as pauls,
  (select l.id from public.outreach_leads l where public.lead_is_client(l.amount_paid, l.status) order by l.created_at limit 1) as client,
  (select id from public.campaigns order by created_at limit 1) as camp,
  (select id from public.campaigns order by created_at offset 1 limit 1) as camp2,
  (select user_id from public.team_members where is_book_owner limit 1) as admin_id,
  (select count(*) from public.outreach_leads) as leads_before;
alter table t_fx add column mine_name text, add column touched_name text, add column pauls_name text;
update t_fx set mine_name = (select business_name from public.outreach_leads where id = mine),
  touched_name = (select business_name from public.outreach_leads where id = touched),
  pauls_name = (select business_name from public.outreach_leads where id = pauls);
-- Start the claimable lead with NO campaign, so the first set is a real change.
update public.outreach_leads set campaign_id = null where id = (select mine from t_fx);
grant select on t_fx to authenticated, anon;
insert into t_results (name, ok, detail) select 'fixtures', mine is not null and touched is not null and pauls is not null and client is not null
  and camp is not null and camp2 is not null and admin_id is not null, null from t_fx;
insert into t_results (name, ok, detail) select 'anon cannot execute ' || f, not has_function_privilege('anon', f, 'execute'), null
  from unnest(array['public.lead_set_campaign(uuid, uuid)', 'public.sales_add_lead(jsonb)']) f;
insert into t_results (name, ok, detail) select 'signed-in users may execute ' || f, has_function_privilege('authenticated', f, 'execute'), null
  from unnest(array['public.lead_set_campaign(uuid, uuid)', 'public.sales_add_lead(jsonb)']) f;

-- A genuinely CONTACTED lead that nobody owns: an outbound message, then the owner stamp the message
-- trigger wrote is taken off again, so the only thing protecting it is "contacted".
insert into public.whatsapp_messages (user_id, lead_id, direction, status, body, phone, test_mode, created_at)
  select l.user_id, l.id, 'outbound', 'delivered', 'sfr test', coalesce(l.phone, '447700900999'), false, now() from public.outreach_leads l where l.id = (select touched from t_fx);
update public.outreach_leads set assigned_to_user_id = null, assigned_at = null where id = (select touched from t_fx);
insert into t_results (name, ok, detail) select 'fixture: the touched lead is contacted and unassigned',
  public.lead_first_contact_at(touched) is not null and (select assigned_to_user_id from public.outreach_leads where id = touched) is null, null from t_fx;

-- ── as Sales A ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-00000000000a', true);
do $$ declare r jsonb; begin
  -- AVAILABLE TO CLAIM
  insert into t_results (name, ok, detail) values ('pool: an unassigned, never-contacted lead is listed',
    exists (select 1 from public.sales_pool((select mine_name from t_fx), 200, 0) p where p.id = (select mine from t_fx)), null);
  insert into t_results (name, ok, detail) values ('pool: a contacted lead is never listed',
    not exists (select 1 from public.sales_pool((select touched_name from t_fx), 200, 0) p where p.id = (select touched from t_fx)), null);
  insert into t_results (name, ok, detail) values ('pool: an owned lead is never listed',
    not exists (select 1 from public.sales_pool((select pauls_name from t_fx), 200, 0) p where p.id = (select pauls from t_fx)), null);
  r := public.claim_lead((select touched from t_fx));
  insert into t_results (name, ok, detail) values ('claim: a contacted lead cannot be claimed', not coalesce((r ->> 'ok')::boolean, false) and r ->> 'error' = 'already_contacted', r::text);
  r := public.claim_lead((select pauls from t_fx));
  insert into t_results (name, ok, detail) values ('claim: an owned lead cannot be taken', not coalesce((r ->> 'ok')::boolean, false), r::text);
  r := public.claim_lead((select mine from t_fx));
  insert into t_results (name, ok, detail) values ('claim: A claims the unassigned lead', (r ->> 'ok')::boolean, r::text);
  insert into t_results (name, ok, detail) values ('claim: the SAME record becomes A''s (no new row)',
    (select assigned_to_user_id from public.sales_leads where id = (select mine from t_fx)) = 'cccccccc-0000-4000-8000-00000000000a'
    and (select count(*) from public.sales_leads where id = (select mine from t_fx)) = 1, null);
  insert into t_results (name, ok, detail) values ('claim: history stays on the record',
    exists (select 1 from public.lead_activity where lead_id = (select mine from t_fx) and kind = 'lead_claimed'), null);

  -- CAMPAIGN ON OWN LEAD
  r := public.lead_set_campaign((select mine from t_fx), (select camp from t_fx));
  insert into t_results (name, ok, detail) values ('campaign: A sets a campaign on own lead', (r ->> 'ok')::boolean
    and (select campaign_id from public.sales_leads where id = (select mine from t_fx)) = (select camp from t_fx), r::text);
  insert into t_results (name, ok, detail) values ('campaign: the change is on the timeline',
    exists (select 1 from public.lead_activity where lead_id = (select mine from t_fx) and kind = 'details_set' and data ->> 'campaign_id' = (select camp::text from t_fx)), null);
  r := public.lead_set_campaign((select mine from t_fx), (select camp from t_fx));
  insert into t_results (name, ok, detail) values ('campaign: setting the same one is a no-op', (r ->> 'unchanged')::boolean, r::text);
  r := public.lead_set_campaign((select mine from t_fx), (select camp2 from t_fx));
  insert into t_results (name, ok, detail) values ('campaign: A changes it', (r ->> 'ok')::boolean
    and (select campaign_id from public.sales_leads where id = (select mine from t_fx)) = (select camp2 from t_fx), r::text);
  r := public.lead_set_campaign((select mine from t_fx), '00000000-0000-4000-8000-000000000000');
  insert into t_results (name, ok, detail) values ('campaign: an unknown campaign is refused', r ->> 'error' = 'unknown_campaign', r::text);
  r := public.lead_set_campaign((select mine from t_fx), null);
  insert into t_results (name, ok, detail) values ('campaign: "No campaign" clears it', (r ->> 'ok')::boolean
    and (select campaign_id from public.sales_leads where id = (select mine from t_fx)) is null, r::text);
  begin perform public.lead_set_campaign((select pauls from t_fx), (select camp from t_fx)); insert into t_results (name, ok) values ('campaign: A cannot set Pauls lead', false);
  exception when others then insert into t_results (name, ok, detail) values ('campaign: A cannot set Pauls lead', sqlerrm = 'not_your_lead', sqlerrm); end;
  begin perform public.lead_set_campaign((select client from t_fx), (select camp from t_fx)); insert into t_results (name, ok) values ('campaign: A cannot set a client', false);
  exception when others then insert into t_results (name, ok, detail) values ('campaign: A cannot set a client', sqlerrm = 'not_your_lead', sqlerrm); end;
  update public.outreach_leads set campaign_id = (select camp from t_fx) where id = (select mine from t_fx);
  insert into t_results (name, ok, detail) values ('campaign: a direct table write changes nothing',
    (select campaign_id from public.sales_leads where id = (select mine from t_fx)) is null, null);

  -- THE SALES ADD KEEPS WHAT GOOGLE RETURNED
  r := public.sales_add_lead(jsonb_build_object(
    'business_name', 'SFR Test Plumbing Cleethorpes', 'phone', '07700 900851', 'google_maps_url', 'https://maps.google.com/?cid=sfr-test-1',
    'address', '1 Test Street, Cleethorpes DN35 0AA', 'category', 'Plumber', 'search_keyword', 'Mobile mechanics', 'search_location', 'Cleethorpes',
    'place_id', 'sfr-test-place-1', 'country', 'UK', 'list_type', 'no_website', 'campaign_id', (select camp from t_fx),
    'rating', 4.7, 'review_count', 23, 'derived_town', 'Cleethorpes', 'town_checked', true, 'town_fetch_note', null));
  insert into t_results (name, ok, detail) values ('add: A adds a search result', (r ->> 'ok')::boolean, r::text);
  insert into t_results (name, ok, detail) select 'add: phone, address, trade, town, place id, campaign all carried',
    phone = '07700 900851' and address like '1 Test Street%' and search_keyword = 'Mobile mechanics' and search_location = 'Cleethorpes'
    and place_id = 'sfr-test-place-1' and campaign_id = (select camp from t_fx) and assigned_to_user_id = 'cccccccc-0000-4000-8000-00000000000a',
    row_to_json(s)::text from public.sales_leads s where s.id = (r ->> 'lead_id')::uuid;
  insert into t_results (name, ok, detail) select 'add: rating, reviews and the looked-up town carried',
    rating = 4.7 and review_count = 23 and derived_town = 'Cleethorpes', null from public.sales_leads where id = (r ->> 'lead_id')::uuid;
  r := public.sales_add_lead(jsonb_build_object('business_name', 'SFR Other Name', 'phone', '+44 7700 900851', 'search_keyword', 'plumbers', 'place_id', 'sfr-test-place-2'));
  insert into t_results (name, ok, detail) values ('add: the same phone again is refused (one business, one record)', r ->> 'error' = 'exists', r::text);
  r := public.sales_add_lead(jsonb_build_object('business_name', 'SFR No Lookup', 'phone', '07700 900852', 'search_keyword', 'plumbers', 'place_id', 'sfr-test-place-3',
    'rating', 'five stars', 'review_count', -4, 'derived_town', 'Nowhere'));
  insert into t_results (name, ok, detail) values ('add: a bad rating / count is dropped, never a failed add', (r ->> 'ok')::boolean
    and (select rating is null and review_count is null from public.sales_leads where id = (r ->> 'lead_id')::uuid), r::text);
end $$;
reset role;
insert into t_results (name, ok, detail) values ('add: no lookup reported → town_fetched_at stays empty (read as postgres)',
  (select town_fetched_at is null from public.outreach_leads where place_id = 'sfr-test-place-3'), null);
insert into t_results (name, ok, detail) values ('add: a lookup reported → town_fetched_at stamped',
  (select town_fetched_at is not null from public.outreach_leads where place_id = 'sfr-test-place-1'), null);

-- ── as Sales B: A's lead is not theirs ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-00000000000b', true);
do $$ begin
  begin perform public.lead_set_campaign((select mine from t_fx), (select camp from t_fx)); insert into t_results (name, ok) values ('campaign: B cannot set A''s lead', false);
  exception when others then insert into t_results (name, ok, detail) values ('campaign: B cannot set A''s lead', sqlerrm = 'not_your_lead', sqlerrm); end;
end $$;
reset role;

-- ── as the admin ──
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from t_fx), 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', (select admin_id::text from t_fx), true);
do $$ declare r jsonb; before uuid; begin
  before := (select campaign_id from public.outreach_leads where id = (select pauls from t_fx));
  r := public.lead_set_campaign((select pauls from t_fx), (select camp2 from t_fx));
  insert into t_results (name, ok, detail) values ('campaign: the admin sets any lead', (r ->> 'ok')::boolean
    and (select campaign_id from public.outreach_leads where id = (select pauls from t_fx)) = (select camp2 from t_fx), r::text);
  r := public.lead_set_campaign((select mine from t_fx), (select camp from t_fx));
  insert into t_results (name, ok, detail) values ('campaign: the admin sets a rep''s lead (same column)', (r ->> 'ok')::boolean
    and (select campaign_id from public.outreach_leads where id = (select mine from t_fx)) = (select camp from t_fx), r::text);
end $$;
reset role;

do $$ begin
  raise exception 'RESULTS %', (select json_agg(json_build_object('n', n, 'ok', ok, 'name', name, 'detail', detail) order by n) from t_results);
end $$;
