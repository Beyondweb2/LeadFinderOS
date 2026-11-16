-- supabase/tests/team-visibility.sql — run with: npx supabase db query --remote=<ref> --yes -o json -f <this file>
-- Expected (2026-11-16): lookup A owned/contacted, B owned/opted_out, C owned/archived, D protected/do_not_contact,
-- E new; ids masked; claim already_owned; add exists; queue skipped not_yours; 0 rows readable directly.
-- A BRAND-NEW SALESPERSON, END TO END ON THE SERVER — ALWAYS ROLLED BACK.
-- Everything happens inside one DO block that finishes by RAISING an exception carrying the results, so Postgres rolls
-- back every write (the temporary user, role, team row, suppression row, any rate-limit row). Nothing is kept or sent.
do $$
declare
  v_uid uuid := gen_random_uuid();
  v_a record; v_b record; v_c record;
  v_e164 text := public.phone_e164_key('07700900123');
  v_out jsonb := '{}'::jsonb;
  v_r jsonb;
  v_n bigint;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zzqa-new-rep-' || v_uid || '@leadfinder.invalid', now(), now());
  insert into public.user_roles (user_id, role) values (v_uid, 'sales');
  insert into public.team_members (user_id, display_name, status) values (v_uid, 'ZZ QA new rep', 'active');
  insert into public.contact_suppressions (phone_e164, reason, source) values (v_e164, 'zz qa test', 'zz-qa-rolled-back');

  -- A: someone else's active lead with a phone. B: an opted-out lead. C: an archived ZZ QA fixture.
  select id, place_id, phone, google_maps_url into v_a from public.outreach_leads
   where assigned_to_user_id is not null and not is_archived and phone is not null and status <> 'opted_out' order by created_at limit 1;
  select id, place_id, phone, google_maps_url into v_b from public.outreach_leads where status = 'opted_out' order by created_at limit 1;
  select id, place_id, phone, google_maps_url into v_c from public.outreach_leads where is_archived and place_id is not null order by created_at limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_uid::text, true);
  v_out := v_out || jsonb_build_object('my_role', public.my_role());

  select jsonb_agg(to_jsonb(x) - 'owner_name' - 'added_by_name' || jsonb_build_object('has_owner_name', x.owner_name is not null, 'has_added_by', x.added_by_name is not null)) into v_r
  from public.lead_identity_lookup(jsonb_build_array(
    jsonb_build_object('k', 'A_owned', 'place_id', v_a.place_id, 'phone', v_a.phone, 'maps_url', v_a.google_maps_url),
    jsonb_build_object('k', 'A_by_phone_only', 'phone', v_a.phone),
    jsonb_build_object('k', 'B_opted_out', 'place_id', v_b.place_id, 'phone', v_b.phone, 'maps_url', v_b.google_maps_url),
    jsonb_build_object('k', 'C_archived_fixture', 'place_id', v_c.place_id, 'phone', v_c.phone, 'maps_url', v_c.google_maps_url),
    jsonb_build_object('k', 'D_dnc_phone_no_lead', 'place_id', 'zzqa-no-such-place-1', 'phone', '07700 900123', 'name', 'ZZ QA nobody'),
    jsonb_build_object('k', 'E_brand_new', 'place_id', 'zzqa-no-such-place-2', 'name', 'ZZ QA brand new business')
  )) x;
  

  v_out := v_out || jsonb_build_object('lookup', (select jsonb_agg(jsonb_build_object('k', e->'k', 's', e->'state', 'st', e->'lead_status', 'id', e->'lead_id' is not null and e->>'lead_id' is not null, 'own', e->'has_owner_name')) from jsonb_array_elements(v_r) e));
  v_out := v_out || jsonb_build_object('claim_someone_elses', public.claim_lead(v_a.id));
  v_out := v_out || jsonb_build_object('add_duplicate', public.sales_add_lead(jsonb_build_object(
    'business_name', 'ZZ QA dup attempt', 'place_id', v_a.place_id, 'phone', v_a.phone, 'google_maps_url', v_a.google_maps_url, 'search_keyword', 'plumbers')));
  v_out := v_out || jsonb_build_object('queue_someone_elses', public.sales_queue_opener(array[v_a.id], 'initial_contact', null));

  set local role authenticated;
  select count(*) into v_n from public.sales_leads;           v_out := v_out || jsonb_build_object('sales_leads_visible', v_n);
  select count(*) into v_n from public.outreach_leads;        v_out := v_out || jsonb_build_object('outreach_leads_visible', v_n);
  select count(*) into v_n from public.search_history;        v_out := v_out || jsonb_build_object('search_history_direct', v_n);
  reset role;

  raise exception 'ROLLED_BACK_RESULT %', v_out::text;
end
$$;
