-- ══ MALAYSIA / SINGAPORE: IMPORTED LEADS COUNT AS ALREADY ADDED (2026-10-19, feat/malaysia-coverage-cleanup) ══════
-- Ethan's leads came in by FILE: no Google place id, no Maps link, the phone stored +60… (my_sg_e164) while Google gives
-- 03-… / 012-…, and a name written differently ("… Sdn Bhd", a branch in brackets). The one identity lookup
-- (_lead_identity_rows: Find Leads' markers AND coverage_add_leads' duplicate check) matched none of them.
--
-- ⛔ ADDITIVE ONLY: two new IMMUTABLE text helpers; _lead_identity_rows keeps its signature, its three checks and their
--    order, and gains three checks that run ONLY for an item whose country is given and is not the UK:
--      4. the phone in the country's own E.164 form (my_sg_e164 → phone_key, the indexed key);
--      5. the website's identity (website_identity, indexed), same country;
--      6. the business-name key + the town (the searched town inside the lead's town / address text, or the lead's town
--         inside the result's address), same country.
--    A UK item (country absent or UK) runs exactly the old three checks — the UK is unchanged.
-- ⛔ TENANCY UNCHANGED: the same table, the same security definer, the same role check; lead_identity_lookup still masks
--    for Sales. Nothing here reads a row the old lookup could not.
-- ⛔ NO DATA WRITTEN. Applied once, by hand (CLAUDE.md §2).

create or replace function public.place_text_key(_s text)
returns text language sql immutable parallel safe as $$
  select nullif(btrim(regexp_replace(lower(coalesce(_s, '')), '[^a-z0-9]+', ' ', 'g')), '')
$$;

-- A lead's town for matching: the first piece of derived_town (else search_location), before , ( / ;
create or replace function public.lead_town_key(_derived text, _searched text)
returns text language sql immutable parallel safe as $$
  select case when length(k) >= 3 then k end
  from (select public.place_text_key(split_part(regexp_replace(coalesce(nullif(btrim(_derived), ''), _searched, ''), '[(/;]', ',', 'g'), ',', 1)) as k) x
$$;

-- A business name for matching: lower case, brackets and punctuation gone, company suffixes gone; under 4 characters
-- is no key (too short to identify a business).
create or replace function public.business_name_key(_name text)
returns text language sql immutable parallel safe as $$
  select case when length(k) >= 4 then k end
  from (select btrim(regexp_replace(regexp_replace(regexp_replace(
                 lower(regexp_replace(coalesce(_name, ''), '\([^)]*\)', ' ', 'g')),
               '[^a-z0-9]+', ' ', 'g'),
             '\m(sdn bhd|sdn|bhd|berhad|plt|pte ltd|pte|ltd|limited|llp)\M', ' ', 'g'),
           '\s+', ' ', 'g')) as k) x
$$;

create or replace function public._lead_identity_rows(_items jsonb)
 returns table(k text, lead_id uuid, state text, owner_id uuid, owner_name text, added_at timestamp with time zone)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_role text := public.my_role();
  v_uid uuid := auth.uid();
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if jsonb_typeof(_items) is distinct from 'array' or jsonb_array_length(_items) > 500 then
    raise exception 'bad_items' using errcode = '22023';
  end if;
  return query
  with it0 as (
    select x->>'k' as ik,
           nullif(btrim(x->>'place_id'), '') as pid,
           public.phone_key(x->>'phone') as pk,
           nullif(btrim(x->>'maps_url'), '') as mu,
           nullif(btrim(x->>'country'), '') as ctry,
           x
    from jsonb_array_elements(_items) x
  ), it as (
    select it0.ik, it0.pid, it0.pk, it0.mu, it0.ctry,
           -- The extra keys are used only for a non-UK item.
           (it0.ctry is not null and upper(it0.ctry) not in ('UK', 'GB', 'UNITED KINGDOM')) as abroad,
           public.phone_key(public.my_sg_e164(it0.x->>'phone', it0.ctry)) as mpk,
           public.website_identity(it0.x->>'website') as sid,
           public.business_name_key(it0.x->>'name') as nkey,
           public.place_text_key(split_part(regexp_replace(coalesce(it0.x->>'town', ''), '[(/;]', ',', 'g'), ',', 1)) as tkey,
           ' ' || coalesce(public.place_text_key(it0.x->>'address'), '') || ' ' as akey
    from it0
  ), m as (
    select it.ik, coalesce(
      (select l.id from public.outreach_leads l where it.pid is not null and l.place_id = it.pid order by l.created_at limit 1),
      (select l.id from public.outreach_leads l where it.pk is not null and public.phone_key(l.phone) = it.pk order by l.created_at limit 1),
      (select l.id from public.outreach_leads l where it.mu is not null and l.google_maps_url = it.mu order by l.created_at limit 1),
      (select l.id from public.outreach_leads l where it.abroad and it.mpk is not null and it.mpk is distinct from it.pk
         and public.phone_key(l.phone) = it.mpk order by l.created_at limit 1),
      (select l.id from public.outreach_leads l where it.abroad and it.sid is not null and l.website is not null
         and public.website_identity(l.website) = it.sid and l.country = it.ctry order by l.created_at limit 1),
      (select l.id from public.outreach_leads l where it.abroad and it.nkey is not null and l.country = it.ctry
         and public.business_name_key(l.business_name) = it.nkey
         and (
           (it.tkey is not null and position(' ' || it.tkey || ' ' in
              ' ' || coalesce(public.place_text_key(concat_ws(' ', l.derived_town, l.search_location, l.address)), '') || ' ') > 0)
           or (public.lead_town_key(l.derived_town, l.search_location) is not null
               and position(' ' || public.lead_town_key(l.derived_town, l.search_location) || ' ' in it.akey) > 0)
         )
         order by l.created_at limit 1)
    ) as lid
    from it
  )
  select m.ik, l.id,
         case
           when l.id is null then 'new'
           when l.assigned_to_user_id = v_uid then 'yours'
           when l.assigned_to_user_id is not null then 'owned'
           when public.lead_claim_block(l.id, v_uid) is not null then 'protected'
           else 'claimable'
         end,
         l.assigned_to_user_id, t.display_name, l.created_at
  from m
  left join public.outreach_leads l on l.id = m.lid
  left join public.team_members t on t.user_id = l.assigned_to_user_id;
end
$function$;

-- coverage_add_leads: the live definition (read back 2026-10-19), with ONE change — the identity items carry the
-- country, website, name, searched town and address (see the comment at the items line).
CREATE OR REPLACE FUNCTION public.coverage_add_leads(_rows jsonb, _campaign_id uuid DEFAULT NULL::uuid, _commit boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text := public.my_role();
  v_uid uuid := auth.uid();
  v_book uuid := public.book_owner_id();
  v_max constant integer := 500;
  v_commit boolean := coalesce(_commit, false);
  v_n integer;
  v_g jsonb;
  x jsonb;
  i integer := 0;
  o jsonb;
  k text;
  rows_out jsonb := '[]'::jsonb;
  v_valid jsonb := '{}'::jsonb;
  v_items jsonb := '[]'::jsonb;
  seen jsonb := '{}'::jsonb;
  v_hits jsonb := '{}'::jsonb;
  v_names jsonb := '{}'::jsonb;
  v_hist_names jsonb := '{}'::jsonb;
  v_hist_maps jsonb := '{}'::jsonb;
  v_sites jsonb := '{}'::jsonb;
  h record;
  v_key text;
  v_dup boolean;
  v_outcome text;
  v_reason text;
  v_limited boolean := false;
  v_id uuid;
  v_created integer := 0;
  v_cnt jsonb;
  -- one row's cleaned values
  c_name text; c_pid text; c_maps text; c_site text; c_phone text; c_pk text; c_trade text; c_town text; c_country text;
  c_errs text[];
  v_rating numeric; v_reviews integer; v_dtown text; v_dnote text; v_checked boolean;
begin
  if v_role is null or v_uid is null then raise exception 'no_role' using errcode = '42501'; end if;
  if v_book is null then return jsonb_build_object('ok', false, 'error', 'no_book_owner'); end if;
  if jsonb_typeof(_rows) is distinct from 'array' then return jsonb_build_object('ok', false, 'error', 'bad_rows'); end if;
  v_n := jsonb_array_length(_rows);
  if v_n = 0 then return jsonb_build_object('ok', false, 'error', 'no_rows'); end if;
  if v_n > v_max then return jsonb_build_object('ok', false, 'error', 'too_many_rows', 'max', v_max); end if;
  if _campaign_id is not null and not public.campaign_usable(_campaign_id) then
    return jsonb_build_object('ok', false, 'error', 'unknown_campaign');
  end if;
  if not v_commit then
    -- The preview is a lookup of whether businesses exist: logged (and, for a salesperson, limited) as one.
    v_g := public.guard_action(v_uid, 'lead_lookup', null, 0, v_n, 'coverage_add_leads_preview');
    if not coalesce((v_g ->> 'ok')::boolean, false) then
      return jsonb_build_object('ok', false, 'error', 'usage_paused', 'reason', case when v_role = 'admin' then v_g ->> 'reason' end);
    end if;
  end if;

  -- ── 1. Clean and validate; hard repeats inside the call ─────────────────────────────────────────────────
  for x in select value from jsonb_array_elements(_rows) loop
    i := i + 1;
    c_errs := '{}';
    if jsonb_typeof(x) is distinct from 'object' then
      rows_out := rows_out || jsonb_build_object('i', i, 'outcome', 'invalid', 'reasons', jsonb_build_array('bad_row'));
      continue;
    end if;
    c_name := nullif(btrim(regexp_replace(coalesce(x ->> 'business_name', ''), '\s+', ' ', 'g')), '');
    c_pid := nullif(btrim(coalesce(x ->> 'place_id', '')), '');
    c_maps := nullif(btrim(coalesce(x ->> 'google_maps_url', '')), '');
    c_site := nullif(btrim(coalesce(x ->> 'website', '')), '');
    c_phone := nullif(btrim(coalesce(x ->> 'phone', '')), '');
    c_pk := public.phone_key(c_phone);
    c_trade := nullif(btrim(regexp_replace(coalesce(x ->> 'search_keyword', ''), '\s+', ' ', 'g')), '');
    c_town := nullif(btrim(regexp_replace(coalesce(x ->> 'search_location', ''), '\s+', ' ', 'g')), '');
    c_country := coalesce(nullif(btrim(coalesce(x ->> 'country', '')), ''), 'UK');
    if c_name is null then c_errs := c_errs || 'missing_business_name'::text;
    elsif length(c_name) > 200 then c_errs := c_errs || 'too_long:business_name'::text; end if;
    -- addLead's rule: no trade, no lead (it could never be audited). And the town it was searched in, so it can be.
    if c_trade is null then c_errs := c_errs || 'no_trade'::text; elsif length(c_trade) > 100 then c_errs := c_errs || 'too_long:trade'::text; end if;
    if c_town is null then c_errs := c_errs || 'no_town'::text; elsif length(c_town) > 200 then c_errs := c_errs || 'too_long:town'::text; end if;
    if c_pid is not null and (c_pid !~ '^[A-Za-z0-9_-]+$' or length(c_pid) not between 10 and 300) then c_errs := c_errs || 'invalid_place_id'::text; end if;
    if c_maps is not null and (length(c_maps) > 1000 or c_maps !~* '^https?://') then c_errs := c_errs || 'invalid_maps_link'::text; end if;
    if length(c_site) > 500 then c_errs := c_errs || 'too_long:website'::text; end if;
    -- The country Google resolved the search to (or the Coverage country); the table's own rules still apply on insert.
    if length(c_country) > 40 or c_country !~ '^[A-Za-z]+$' then c_errs := c_errs || 'invalid_country'::text; end if;
    if cardinality(c_errs) > 0 then
      rows_out := rows_out || jsonb_build_object('i', i, 'k', x ->> 'k', 'business_name', left(coalesce(c_name, ''), 200),
                                                 'outcome', 'invalid', 'reasons', to_jsonb(c_errs));
      continue;
    end if;
    v_dup := false;
    foreach v_key in array array_remove(array['g:' || c_pid, 'p:' || c_pk, 'm:' || c_maps], null) loop
      if seen ? v_key then v_dup := true; exit; end if;
    end loop;
    if v_dup then
      rows_out := rows_out || jsonb_build_object('i', i, 'k', x ->> 'k', 'business_name', c_name,
                                                 'outcome', 'skipped', 'reasons', jsonb_build_array('duplicate_in_batch'));
      continue;
    end if;
    foreach v_key in array array_remove(array['g:' || c_pid, 'p:' || c_pk, 'm:' || c_maps], null) loop
      seen := seen || jsonb_build_object(v_key, i);
    end loop;
    -- The lookup's numbers only when they ARE numbers (sales_add_lead's rule) — a bad value is dropped, never a failure.
    v_rating := case when jsonb_typeof(x -> 'rating') = 'number' and (x ->> 'rating')::numeric between 0 and 5 then (x ->> 'rating')::numeric end;
    v_reviews := case when jsonb_typeof(x -> 'review_count') = 'number' and (x ->> 'review_count')::numeric between 0 and 10000000
                      then floor((x ->> 'review_count')::numeric)::integer end;
    v_dtown := nullif(btrim(coalesce(x ->> 'derived_town', '')), '');
    if length(v_dtown) > 200 then v_dtown := null; end if;
    v_dnote := nullif(btrim(coalesce(x ->> 'town_fetch_note', '')), '');
    if length(v_dnote) > 100 then v_dnote := null; end if;
    v_checked := coalesce((x ->> 'town_checked')::boolean, false);
    v_valid := v_valid || jsonb_build_object(i::text, jsonb_build_object(
      'i', i, 'k', x ->> 'k', 'business_name', c_name, 'place_id', c_pid, 'google_maps_url', c_maps, 'website', c_site,
      'site_id', public.website_identity(c_site), 'phone', c_phone, 'pk', c_pk, 'email', nullif(btrim(coalesce(x ->> 'email', '')), ''),
      'address', nullif(btrim(coalesce(x ->> 'address', '')), ''), 'category', nullif(btrim(coalesce(x ->> 'category', '')), ''),
      'search_keyword', c_trade, 'search_location', c_town, 'country', c_country,
      'rating', v_rating, 'review_count', v_reviews, 'derived_town', v_dtown, 'town_fetch_note', v_dnote, 'town_checked', v_checked,
      'search_run_id', nullif(btrim(coalesce(x ->> 'search_run_id', '')), ''), 'search_key', left(nullif(btrim(coalesce(x ->> 'search_key', '')), ''), 300),
      'without_website', case when jsonb_typeof(x -> 'without_website') = 'boolean' then (x ->> 'without_website')::boolean end));
    -- 2026-10-19: also the country, website, name, searched town and address, so a Malaysian / Singapore lead that came
    -- in by FILE (no place id, phone stored +60) is recognised (_lead_identity_rows). A UK row (country UK) is unchanged.
    v_items := v_items || jsonb_build_object('k', i::text, 'place_id', c_pid, 'phone', c_phone, 'maps_url', c_maps,
      'country', c_country, 'website', c_site, 'name', c_name, 'town', c_town, 'address', nullif(btrim(coalesce(x ->> 'address', '')), ''));
  end loop;

  -- ── 2. What the book already holds ──────────────────────────────────────────────────────────────────────
  if jsonb_array_length(v_items) > 0 then
    if v_commit then
      -- The lock sales_add_lead and the CSV import take, in key order, held to commit.
      perform pg_advisory_xact_lock(hashtextextended('outreach_leads.phone_key:' || pk, 0))
         from (select distinct value ->> 'pk' as pk from jsonb_each(v_valid) where value ->> 'pk' is not null order by 1) s;
    end if;
    for h in select * from public._lead_identity_rows(v_items) loop
      if h.lead_id is not null then
        v_hits := v_hits || jsonb_build_object(h.k, jsonb_build_object('state', h.state, 'owner_name', h.owner_name));
      end if;
    end loop;
    -- Same name, same country (addLead's check; a null country is the UK default).
    select coalesce(jsonb_object_agg(nk, true), '{}'::jsonb) into v_names
      from (select distinct coalesce(l.country, 'UK') || ':' || l.business_name as nk
              from public.outreach_leads l
             where l.business_name in (select value ->> 'business_name' from jsonb_each(v_valid))) s;
    select coalesce(jsonb_object_agg(nk, true), '{}'::jsonb) into v_hist_names
      from (select distinct coalesce(h2.country, 'UK') || ':' || h2.business_name as nk
              from public.outreach_history h2
             where h2.business_name in (select value ->> 'business_name' from jsonb_each(v_valid))) s;
    select coalesce(jsonb_object_agg(mu, true), '{}'::jsonb) into v_hist_maps
      from (select distinct h2.google_maps_url as mu from public.outreach_history h2
             where h2.google_maps_url in (select value ->> 'google_maps_url' from jsonb_each(v_valid) where value ->> 'google_maps_url' is not null)) s;
    select coalesce(jsonb_object_agg(sid, true), '{}'::jsonb) into v_sites
      from (select distinct public.website_identity(l.website) as sid from public.outreach_leads l
             where l.website is not null
               and public.website_identity(l.website) in (select value ->> 'site_id' from jsonb_each(v_valid) where value ->> 'site_id' is not null)) s;
  end if;

  -- ── 3. Decide, and (on commit) write — each row in its own sub-transaction ─────────────────────────────
  for k, o in select key, value from jsonb_each(v_valid) order by (key)::integer loop
    v_outcome := 'new'; v_reason := null; v_id := null;
    if v_hits ? k then
      v_outcome := 'skipped';
      v_reason := case v_hits -> k ->> 'state' when 'yours' then 'already_yours' when 'owned' then 'owned_by_other' else 'exists_unassigned' end;
    elsif v_names ? ((o ->> 'country') || ':' || (o ->> 'business_name')) then
      v_outcome := 'skipped'; v_reason := 'same_name';
    elsif v_hist_names ? ((o ->> 'country') || ':' || (o ->> 'business_name'))
          or (o ->> 'google_maps_url' is not null and v_hist_maps ? (o ->> 'google_maps_url')) then
      v_outcome := 'skipped'; v_reason := 'previously_added';
    elsif o ->> 'site_id' is not null and v_sites ? (o ->> 'site_id') then
      v_outcome := 'skipped'; v_reason := 'same_website';
    end if;

    if v_commit and v_outcome = 'new' then
      if v_limited then
        v_outcome := 'limit';
      else
        v_g := public.guard_action(v_uid, 'lead_add', null, 0, 1, 'coverage_add_leads');
        if not coalesce((v_g ->> 'ok')::boolean, false) then
          v_limited := true; v_outcome := 'limit';
          v_reason := case when v_role = 'admin' then v_g ->> 'reason' end;
        end if;
      end if;
    end if;

    if v_commit and v_outcome = 'new' then
      begin
        insert into public.outreach_leads (
          user_id, added_by_user_id, assigned_to_user_id, assigned_at, business_name, phone, email, google_maps_url,
          address, category, search_keyword, search_location, website, status, next_action, country, list_type,
          campaign_id, place_id, rating, review_count, derived_town, town_fetched_at, town_fetch_note)
        values (
          v_book, v_uid, v_uid, now(), o ->> 'business_name', o ->> 'phone', o ->> 'email', o ->> 'google_maps_url',
          o ->> 'address', o ->> 'category', o ->> 'search_keyword', o ->> 'search_location', o ->> 'website',
          'not_contacted', 'none', o ->> 'country', 'no_website',
          _campaign_id, o ->> 'place_id', (o ->> 'rating')::numeric, (o ->> 'review_count')::integer,
          o ->> 'derived_town',
          case when (o ->> 'town_checked')::boolean then now() end,
          case when (o ->> 'town_checked')::boolean then o ->> 'town_fetch_note' end)
        returning id into v_id;
        insert into public.lead_activity (lead_id, actor_user_id, kind, data)
        values (v_id, v_uid, 'lead_added', jsonb_build_object('via', 'coverage_multi_town'));
        insert into public.outreach_history (user_id, business_name, google_maps_url, country, phone)
        values (v_book, o ->> 'business_name', o ->> 'google_maps_url', o ->> 'country', o ->> 'phone');
        -- Coverage: Found vs Added — record_search_addition's own update and owner check.
        if o ->> 'search_run_id' is not null and o ->> 'search_key' is not null and o ->> 'without_website' is not null then
          update public.search_history
             set added_keys = coalesce(added_keys, '{}'::jsonb) || jsonb_build_object(o ->> 'search_key', (o ->> 'without_website')::boolean)
           where id::text = o ->> 'search_run_id' and user_id = v_uid and found_keys is not null;
        end if;
        v_outcome := 'created';
        v_created := v_created + 1;
      exception when others then
        v_outcome := 'failed';
        v_reason := case when sqlstate = '23505' then 'duplicate_race' when sqlstate = '42501' then 'refused' else 'write_failed' end;
        v_id := null;
      end;
    end if;

    rows_out := rows_out || jsonb_strip_nulls(jsonb_build_object(
      'i', (o ->> 'i')::integer, 'k', o ->> 'k', 'business_name', o ->> 'business_name', 'outcome', v_outcome,
      'reasons', case when v_reason is null then null else jsonb_build_array(v_reason) end,
      -- The owner's NAME only for the admin; a salesperson is never told whose lead it is.
      'owner_name', case when v_role = 'admin' and v_reason = 'owned_by_other' then v_hits -> k ->> 'owner_name' end,
      'lead_id', case when v_outcome = 'created' then v_id end));
  end loop;

  select jsonb_build_object(
    'rows', v_n,
    'new', count(*) filter (where r ->> 'outcome' = 'new'),
    'created', count(*) filter (where r ->> 'outcome' = 'created'),
    'skipped', count(*) filter (where r ->> 'outcome' = 'skipped'),
    'invalid', count(*) filter (where r ->> 'outcome' = 'invalid'),
    'limit', count(*) filter (where r ->> 'outcome' = 'limit'),
    'failed', count(*) filter (where r ->> 'outcome' = 'failed'))
    into v_cnt
    from jsonb_array_elements(rows_out) r;

  return jsonb_build_object('ok', true, 'committed', v_commit, 'role', v_role, 'counts', v_cnt,
                            'campaign_id', _campaign_id,
                            'rows', (select jsonb_agg(r order by (r ->> 'i')::integer) from jsonb_array_elements(rows_out) r));
end $function$;
