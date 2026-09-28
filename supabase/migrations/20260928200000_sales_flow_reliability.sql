-- Sales flow reliability pass (2026-09-28). Additive only: one new function, one function extended.
-- Applied one statement at a time and read back (CLAUDE.md §2). No RLS policy changes, no data rewrite.

-- 1. lead_set_campaign — put a lead into an existing campaign (or none), for both roles.
--    ⛔ THE SAME COLUMN THE ADMIN'S BULK "MOVE TO CAMPAIGN" WRITES (outreach_leads.campaign_id); no
--    second campaign field. _require_work: the admin may set any lead; a salesperson only a lead
--    assigned to them that is not a client. The campaign must already exist — nothing here creates,
--    renames or deletes a campaign. The change is logged as a 'details_set' activity row (the existing
--    kind for "a detail of the lead changed", so the lead_activity CHECK is untouched).
create or replace function public.lead_set_campaign(_lead_id uuid, _campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_from uuid;
  v_name text;
begin
  perform public._require_work(_lead_id);
  if _campaign_id is not null then
    select name into v_name from public.campaigns where id = _campaign_id;
    if not found then return jsonb_build_object('ok', false, 'error', 'unknown_campaign'); end if;
  end if;
  select campaign_id into v_from from public.outreach_leads where id = _lead_id for update;
  if v_from is not distinct from _campaign_id then return jsonb_build_object('ok', true, 'unchanged', true); end if;
  update public.outreach_leads set campaign_id = _campaign_id where id = _lead_id;
  insert into public.lead_activity (lead_id, actor_user_id, kind, data)
  values (_lead_id, auth.uid(), 'details_set',
          jsonb_build_object('campaign_id', _campaign_id, 'campaign_name', v_name, 'from_campaign_id', v_from));
  return jsonb_build_object('ok', true);
end $function$;

-- 2.
revoke all on function public.lead_set_campaign(uuid, uuid) from public, anon;

-- 3.
grant execute on function public.lead_set_campaign(uuid, uuid) to authenticated;

-- 4. sales_add_lead — unchanged rules; now also keeps what the Place Details lookup returned.
--    ⛔ WHY: Google's text search returns NO phone number. The admin's add fetches Place Details after
--    the insert and writes phone / address / rating / reviews / town onto the row directly; a
--    salesperson cannot write outreach_leads, so for them that step never ran and every lead they
--    added from Find Leads arrived with no phone. The browser now looks the place up FIRST (the same
--    google-place-details call, role-checked) and sends the values here, so the phone also takes part
--    in the phone dedupe below. Only the lookup's own fields are new; every refusal is as before.
create or replace function public.sales_add_lead(_lead jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_role text := public.my_role();
  v_uid uuid := auth.uid();
  v_owner uuid := public.book_owner_id();
  v_pid text := nullif(btrim(_lead->>'place_id'), '');
  v_pk text := public.phone_key(_lead->>'phone');
  v_mu text := nullif(btrim(_lead->>'google_maps_url'), '');
  v_site text := nullif(btrim(_lead->>'website'), '');
  v_name text := nullif(btrim(_lead->>'business_name'), '');
  v_trade text := nullif(btrim(_lead->>'search_keyword'), '');
  v_src text := nullif(btrim(_lead->>'lead_source'), '');
  v_note text := nullif(btrim(_lead->>'note'), '');
  v_rating numeric;
  v_reviews integer;
  v_town text := nullif(btrim(_lead->>'derived_town'), '');
  v_town_note text := nullif(btrim(_lead->>'town_fetch_note'), '');
  v_town_checked boolean := coalesce((_lead->>'town_checked')::boolean, false);
  v_services text[];
  v_areas text[];
  v_hit record;
  v_id uuid;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if v_owner is null then return jsonb_build_object('ok', false, 'error', 'no_book_owner'); end if;
  if v_name is null then return jsonb_build_object('ok', false, 'error', 'no_name'); end if;
  if v_trade is null then return jsonb_build_object('ok', false, 'error', 'no_trade'); end if;
  if v_src is not null and v_src not in ('linkedin', 'facebook', 'referral', 'networking', 'google_maps', 'social',
       'email_research', 'ai_research', 'cold_research', 'existing_relationship', 'other') then
    return jsonb_build_object('ok', false, 'error', 'bad_source');
  end if;
  /* The lookup's numbers, only when they ARE numbers — a bad value is dropped, never a failed add. */
  if jsonb_typeof(_lead->'rating') = 'number' and (_lead->>'rating')::numeric between 0 and 5 then
    v_rating := (_lead->>'rating')::numeric;
  end if;
  if jsonb_typeof(_lead->'review_count') = 'number' and (_lead->>'review_count')::numeric between 0 and 10000000 then
    v_reviews := floor((_lead->>'review_count')::numeric)::integer;
  end if;
  if length(v_town) > 200 then v_town := null; end if;
  if length(v_town_note) > 100 then v_town_note := null; end if;
  if jsonb_typeof(_lead->'services') = 'array' then
    v_services := public.clean_label_list(array(select jsonb_array_elements_text(_lead->'services')));
  end if;
  if jsonb_typeof(_lead->'service_areas') = 'array' then
    v_areas := public.clean_label_list(array(select jsonb_array_elements_text(_lead->'service_areas')));
  end if;
  if coalesce(array_length(v_services, 1), 0) > 30 or coalesce(array_length(v_areas, 1), 0) > 30 then
    return jsonb_build_object('ok', false, 'error', 'too_many_items');
  end if;
  if v_pk is not null then perform pg_advisory_xact_lock(hashtextextended('outreach_leads.phone_key:' || v_pk, 0)); end if;
  select * into v_hit from public.lead_identity_lookup(jsonb_build_array(jsonb_build_object(
    'k', '1', 'place_id', v_pid, 'phone', _lead->>'phone', 'maps_url', v_mu)));
  if v_hit.lead_id is not null then
    return jsonb_build_object('ok', false, 'error', 'exists', 'state', v_hit.state, 'lead_id', v_hit.lead_id,
                              'owner_name', v_hit.owner_name, 'added_at', v_hit.added_at);
  end if;
  /* ⚠️ THE WEBSITE IS A WARNING, NEVER A REFUSAL. Chains share one domain (measured 2026-09-28: 149
     own-site hosts on 2+ leads — lockfit.co.uk 24 branches, cityplumbing.co.uk 20), so a hard match
     would refuse a genuine second branch; ambiguity creates a new record rather than matching wrongly
     (CLAUDE.md §6). The person is told who has that website and may confirm it is a different branch.
     Place id, phone and Maps link above stay hard refusals. */
  if public.website_identity(v_site) is not null and coalesce((_lead->>'confirm_site_match')::boolean, false) is not true then
    select l.id, l.created_at, t.display_name as owner_name,
           case when l.assigned_to_user_id = v_uid then 'yours' when l.assigned_to_user_id is not null then 'owned' else 'unassigned' end as state
      into v_hit
      from public.outreach_leads l left join public.team_members t on t.user_id = l.assigned_to_user_id
     where l.website is not null and public.website_identity(l.website) = public.website_identity(v_site)
     order by l.created_at limit 1;
    if v_hit.id is not null then
      return jsonb_build_object('ok', false, 'error', 'site_match', 'state', v_hit.state,
                                'owner_name', v_hit.owner_name, 'added_at', v_hit.created_at);
    end if;
  end if;
  begin
    insert into public.outreach_leads (
      user_id, added_by_user_id, assigned_to_user_id, assigned_at, business_name, phone, google_maps_url,
      address, category, search_keyword, search_location, website, status, next_action, country, list_type,
      campaign_id, place_id, lead_source, contact_name, email, services_included, service_areas,
      rating, review_count, derived_town, town_fetched_at, town_fetch_note)
    values (
      v_owner, v_uid, v_uid, now(), v_name, nullif(btrim(_lead->>'phone'), ''), v_mu,
      nullif(btrim(_lead->>'address'), ''), nullif(btrim(_lead->>'category'), ''), v_trade,
      nullif(btrim(_lead->>'search_location'), ''), v_site, 'not_contacted', 'none',
      coalesce(nullif(btrim(_lead->>'country'), ''), 'UK'),
      case when _lead->>'list_type' in ('no_website', 'broken_website', 'manual') then _lead->>'list_type' else 'no_website' end,
      nullif(_lead->>'campaign_id', '')::uuid, v_pid, v_src,
      nullif(btrim(_lead->>'contact_name'), ''), nullif(btrim(_lead->>'email'), ''),
      nullif(v_services, '{}'::text[]), nullif(v_areas, '{}'::text[]),
      v_rating, v_reviews, v_town,
      /* Stamped ONLY when the lookup actually reported on the town — the admin's rule
         (applyPlaceDetailsToLead): a stamp without a lookup would poison place-town's 30-day cache. */
      case when v_town_checked then now() end,
      case when v_town_checked then v_town_note end)
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'exists', 'state', 'owned');
  end;
  insert into public.lead_activity (lead_id, actor_user_id, kind, data)
  values (v_id, v_uid, 'lead_added', case when v_src is null then '{}'::jsonb else jsonb_build_object('source', v_src) end);
  if v_note is not null then
    insert into public.lead_activity (lead_id, actor_user_id, kind, body) values (v_id, v_uid, 'note', left(v_note, 4000));
  end if;
  return jsonb_build_object('ok', true, 'lead_id', v_id);
end $function$;

-- 5. (privileges carry over on CREATE OR REPLACE; restated so a rebuild from migrations matches)
revoke all on function public.sales_add_lead(jsonb) from public, anon;

-- 6.
grant execute on function public.sales_add_lead(jsonb) to authenticated;
