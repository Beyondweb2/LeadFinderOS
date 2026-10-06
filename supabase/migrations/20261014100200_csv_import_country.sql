-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CSV IMPORT: THE ROW'S COUNTRY (2026-10-07, improve/au-location-parity).
--
-- public.import_leads (20261010170000) stored EVERY imported lead as country 'UK', repaired every phone the UK
-- way (a 10-digit number got a 0; "+44 (0)" lost its 0), keyed postcodes by the UK pattern and looked for
-- same-name matches among UK leads only. An Australian list therefore landed as UK leads: "Sydney UK" audit
-- questions, the engines asked from Great Britain, and a "0412 345 678" that every WhatsApp path then read as UK.
--
-- This is that function COPIED EXACTLY with only these changes (scripts/au-location-parity.test.ts diffs the two):
--   · an optional 'country' key per row (the import screen's optional Country column): UK / Australia words only;
--     anything else → the row is refused 'invalid_country' (never guessed);
--   · without it the row is Australian when its phone starts +61 / 0061, its address ends in "Australia", or it
--     names an Australian state with a 4-digit postcode ("NSW 2000"); otherwise UK, exactly as before;
--   · the phone repair follows the country (Australia: "+61 (0)" loses the 0, 9 digits starting 2/3/4/7/8 get
--     their 0 back; the UK rule never touches an Australian number);
--   · the possible-match keys follow the country (Australia: state + postcode, a trailing "australia" dropped),
--     and a same-name match is looked for within the row's own country (the name key carries it);
--   · outreach_leads.country and outreach_history.country are the row's country instead of a literal 'UK'.
-- Everything else — the role check, the guard, the allowlist, the identity lookup, the lock, the owner, the
-- outcomes, the counts, the grants — is byte-identical.
-- Additive / idempotent: CREATE OR REPLACE with the same signature.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.import_leads(_rows jsonb, _commit boolean default false, _file_name text default null,
                                               _import_possible boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_role text := public.my_role();
  v_uid uuid := auth.uid();
  v_book uuid := public.book_owner_id();
  v_max constant integer := 500;
  v_n integer;
  v_g jsonb;
  v_import uuid := gen_random_uuid();
  v_file text := left(nullif(btrim(regexp_replace(coalesce(_file_name, ''), '[\r\n\t]+', ' ', 'g')), ''), 200);
  v_commit boolean := coalesce(_commit, false);
  v_confirm boolean := coalesce(_import_possible, false);
  x jsonb;
  i integer := 0;
  rows_out jsonb := '[]'::jsonb;
  -- one row's cleaned values
  c_row integer; c_name text; c_contact text; c_phone text; c_pk text; c_email text; c_site text; c_site_id text;
  c_addr text; c_post text; c_town text; c_trade text; c_notes text; c_maps text; c_cid text; c_pid text; c_errs text[];
  c_nk text; c_pc text; c_ak text;
  c_country text; c_country_in text;   -- 2026-10-07: the row's country (UK or Australia), see below
  -- in-file keys seen so far → first row number
  seen jsonb := '{}'::jsonb;
  v_dup_of integer;
  v_key text;
  v_items jsonb := '[]'::jsonb;
  v_valid jsonb := '{}'::jsonb;   -- k → cleaned row, for valid rows that are not a hard repeat inside the file
  v_hits jsonb := '{}'::jsonb;    -- k → hard identity hit {id, state, owner_name}
  v_cids jsonb := '{}'::jsonb;    -- Maps cid → {id, owner, owner_name}
  v_names jsonb := '{}'::jsonb;   -- normalised name → [{owner, owner_name, town, pc, ak}] (every same-name lead, oldest first)
  v_sites jsonb := '{}'::jsonb;   -- website identity → [{owner, owner_name, town}]
  h record;
  o jsonb;
  m jsonb;
  v_outcome text;
  v_reason text;
  v_match jsonb;
  v_held boolean;
  v_lead record;
  v_fill jsonb;
  v_id uuid;
  v_cnt jsonb;
  k text;
begin
  if v_role is null or v_uid is null then raise exception 'no_role' using errcode = '42501'; end if;
  if v_book is null then return jsonb_build_object('ok', false, 'error', 'no_book_owner'); end if;
  if jsonb_typeof(_rows) is distinct from 'array' then return jsonb_build_object('ok', false, 'error', 'bad_rows'); end if;
  v_n := jsonb_array_length(_rows);
  if v_n = 0 then return jsonb_build_object('ok', false, 'error', 'no_rows'); end if;
  if v_n > v_max then return jsonb_build_object('ok', false, 'error', 'too_many_rows', 'max', v_max); end if;

  -- The guard: logged for both roles; limits and suspension apply to a salesperson. A refusal is an answer, never an
  -- exception (an exception would roll back the guard's own record of it).
  v_g := public.guard_action(v_uid, 'lead_import', null, 0, v_n, case when v_commit then 'import_leads' else 'import_leads_preview' end);
  if not coalesce((v_g ->> 'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'usage_paused', 'reason', case when v_role = 'admin' then v_g ->> 'reason' end);
  end if;

  -- ── 1. Clean and validate every row; hard repeats inside the file ─────────────────────────────────────────
  for x in select value from jsonb_array_elements(_rows) loop
    i := i + 1;
    c_errs := '{}';
    c_row := case when jsonb_typeof(x -> 'row') = 'number' and (x ->> 'row')::numeric between 1 and 1000000
                  then floor((x ->> 'row')::numeric)::integer else i end;
    if jsonb_typeof(x) is distinct from 'object' then
      rows_out := rows_out || jsonb_build_object('i', i, 'row', c_row, 'outcome', 'invalid', 'reasons', jsonb_build_array('bad_row'));
      continue;
    end if;
    -- Whitespace collapsed; blank = absent. Nothing is truncated: a value too long is an error, not a silent cut.
    c_name := nullif(btrim(regexp_replace(coalesce(x ->> 'business_name', ''), '\s+', ' ', 'g')), '');
    c_contact := nullif(btrim(regexp_replace(coalesce(x ->> 'contact_name', ''), '\s+', ' ', 'g')), '');
    c_phone := nullif(btrim(regexp_replace(coalesce(x ->> 'phone', ''), '\s+', ' ', 'g')), '');
    c_email := lower(nullif(btrim(coalesce(x ->> 'email', '')), ''));
    c_site := nullif(btrim(coalesce(x ->> 'website', '')), '');
    c_addr := nullif(btrim(regexp_replace(coalesce(x ->> 'address', ''), '\s+', ' ', 'g')), '');
    c_post := upper(nullif(btrim(regexp_replace(coalesce(x ->> 'postcode', ''), '\s+', ' ', 'g')), ''));
    c_town := nullif(btrim(regexp_replace(coalesce(x ->> 'town', ''), '\s+', ' ', 'g')), '');
    c_trade := nullif(btrim(regexp_replace(coalesce(x ->> 'trade', ''), '\s+', ' ', 'g')), '');
    c_notes := nullif(btrim(replace(coalesce(x ->> 'notes', ''), E'\r\n', E'\n')), '');
    c_maps := nullif(btrim(coalesce(x ->> 'google_maps_url', '')), '');
    c_pid := nullif(btrim(coalesce(x ->> 'place_id', '')), '');
    c_country_in := nullif(btrim(coalesce(x ->> 'country', '')), '');

    -- ── THE ROW'S COUNTRY (2026-10-07). Every import was stored 'UK', so an Australian list got UK phone repair,
    --    UK postcode matching and "Sydney UK" audit questions. Now: an explicit Country column, when mapped, decides
    --    (UK / Australia words only — anything else is refused as invalid_country, never guessed). Without one the
    --    row is Australian when its phone is +61 / 0061, or its address ends in Australia, or names an Australian
    --    state with a 4-digit postcode ("NSW 2000"); otherwise UK, exactly as before.
    c_country := case
      when c_country_in is null then null
      when lower(c_country_in) in ('uk', 'gb', 'united kingdom', 'great britain', 'england', 'scotland', 'wales', 'northern ireland') then 'UK'
      when lower(c_country_in) in ('australia', 'au', 'aus') then 'Australia'
      else 'invalid' end;
    if c_country = 'invalid' then c_errs := c_errs || 'invalid_country'::text; c_country := null; end if;
    if c_country is null then
      c_country := case
        when coalesce(c_phone, '') ~ '^\s*(\+|00)\s*61' then 'Australia'
        when coalesce(c_addr, '') ~* ',\s*australia\s*$' then 'Australia'
        when upper(coalesce(c_addr, '') || ' ' || coalesce(x ->> 'postcode', '')) ~ '\m(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\s*[0-9]{4}\M' then 'Australia'
        else 'UK' end;
    end if;

    if c_name is null then c_errs := c_errs || 'missing_business_name'::text;
    elsif length(c_name) > 200 then c_errs := c_errs || 'too_long:business_name'::text; end if;
    if length(c_contact) > 120 then c_errs := c_errs || 'too_long:contact_name'::text; end if;
    if length(c_addr) > 300 then c_errs := c_errs || 'too_long:address'::text; end if;
    if length(c_post) > 12 then c_errs := c_errs || 'too_long:postcode'::text; end if;
    if length(c_town) > 100 then c_errs := c_errs || 'too_long:town'::text; end if;
    if length(c_trade) > 100 then c_errs := c_errs || 'too_long:trade'::text; end if;
    if length(c_notes) > 2000 then c_errs := c_errs || 'too_long:notes'::text; end if;

    -- Phone: "+44 (0)…" loses the (0); ten digits starting 1-9 (a spreadsheet dropped the leading 0) gets it back.
    -- Anything with letters, or whose canonical key is not 9–15 digits, is refused — never guessed.
    if c_phone is not null then
      if c_country = 'Australia' then
        -- Australia: "+61 (0)4…" loses the (0); nine digits starting 2/3/4/7/8 (a spreadsheet dropped the 0) gets it
        -- back. Never the UK rule — a UK 0 or 44 is never added to an Australian number.
        c_phone := regexp_replace(c_phone, '^\+?61\s*\(0\)\s*', '+61 ');
        if c_phone ~ '^[23478][0-9]{8}$' then c_phone := '0' || c_phone; end if;
      else
        c_phone := regexp_replace(c_phone, '^\+?44\s*\(0\)\s*', '+44 ');
        if c_phone ~ '^[1-9][0-9]{9}$' then c_phone := '0' || c_phone; end if;
      end if;
      c_pk := public.phone_key(c_phone);
      if c_phone ~ '[A-Za-z]' or c_pk is null or length(c_pk) not between 9 and 15 or length(c_phone) > 40 then
        c_errs := c_errs || 'invalid_phone'::text;
      end if;
    else
      c_pk := null;
    end if;
    if c_email is not null and (length(c_email) > 254 or c_email !~ '^[^@\s,;<>]+@[^@\s,;<>]+\.[a-z]{2,}$') then
      c_errs := c_errs || 'invalid_email'::text;
    end if;
    if c_site is not null then
      if c_site !~* '^https?://' then c_site := 'https://' || c_site; end if;
      if length(c_site) > 500 or c_site ~ '\s' or c_site !~* '^https?://[^/?#]+\.[a-z]{2,}' then
        c_errs := c_errs || 'invalid_website'::text;
      end if;
    end if;
    if c_maps is not null and (length(c_maps) > 1000 or c_maps !~* '^https?://\S+$') then
      c_errs := c_errs || 'invalid_maps_link'::text;
    end if;
    -- A Google Place ID is an opaque token (letters, digits, - and _). Anything else is refused, never guessed.
    if c_pid is not null and (c_pid !~ '^[A-Za-z0-9_-]+$' or length(c_pid) not between 10 and 300) then c_errs := c_errs || 'invalid_place_id'::text; end if;
    -- The admin's add rule, kept: a business with neither a phone nor an email is not added.
    if c_phone is null and c_email is null then c_errs := c_errs || 'no_phone_or_email'::text; end if;

    if cardinality(c_errs) > 0 then
      rows_out := rows_out || jsonb_build_object('i', i, 'row', c_row, 'business_name', left(coalesce(c_name, ''), 200),
                                                 'outcome', 'invalid', 'reasons', to_jsonb(c_errs));
      continue;
    end if;

    -- The Maps listing's own number: our stored links are ?cid=…&g_mp=… with a g_mp that changes per search, so
    -- the same listing is compared by its cid, not by the whole text.
    c_cid := substring(c_maps from '[?&]cid=([0-9]+)');
    -- HARD repeat inside the file: the same Place ID, phone or Maps listing as an earlier valid row. Nothing else
    -- (a name, a website or an email alone is never a hard repeat).
    v_dup_of := null;
    foreach v_key in array array_remove(array['g:' || c_pid, 'p:' || c_pk, 'm:' || coalesce(c_cid, lower(c_maps))], null) loop
      if seen ? v_key then v_dup_of := (seen ->> v_key)::integer; exit; end if;
    end loop;
    if v_dup_of is not null then
      rows_out := rows_out || jsonb_build_object('i', i, 'row', c_row, 'business_name', c_name,
                                                 'outcome', 'duplicate_in_file', 'reasons', jsonb_build_array('duplicate_in_file'),
                                                 'first_row', v_dup_of);
      continue;
    end if;
    foreach v_key in array array_remove(array['g:' || c_pid, 'p:' || c_pk, 'm:' || coalesce(c_cid, lower(c_maps))], null) loop
      seen := seen || jsonb_build_object(v_key, c_row);
    end loop;

    -- Postcode joins the address unless the address already holds it.
    if c_post is not null then
      if c_addr is null then c_addr := c_post;
      elsif position(replace(c_post, ' ', '') in upper(replace(c_addr, ' ', ''))) = 0 then c_addr := c_addr || ', ' || c_post;
      end if;
    end if;
    c_site_id := public.website_identity(c_site);
    -- The location keys for a same-name comparison: the UK postcode (from the postcode column or the address) and
    -- the whole address, both reduced to letters and digits.
    -- 2026-10-07: the name key carries the row's COUNTRY, so a same-name match is looked for within that country only
    -- (a Sydney "Premier Plumbing" is not a possible match for a Leeds one). The UK postcode / address keys are
    -- unchanged; an Australian row uses its state + 4-digit postcode ("NSW2000") and drops a trailing "australia".
    c_nk := c_country || ':' || nullif(btrim(regexp_replace(lower(c_name), '[^a-z0-9]+', ' ', 'g')), '');
    c_pc := case when c_country = 'Australia'
                 then replace(substring(upper(coalesce(c_addr, '')) from '\m((?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\s*[0-9]{4})\M'), ' ', '')
                 else replace(substring(upper(coalesce(c_addr, '')) from '([A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2})'), ' ', '') end;
    c_ak := nullif(regexp_replace(regexp_replace(lower(coalesce(c_addr, '')), '[^a-z0-9]+', '', 'g'),
                                  case when c_country = 'Australia' then 'australia$' else 'uk$' end, ''), '');

    v_valid := v_valid || jsonb_build_object(i::text, jsonb_build_object(
      'i', i, 'row', c_row, 'business_name', c_name, 'contact_name', c_contact, 'phone', c_phone, 'pk', c_pk,
      'email', c_email, 'website', c_site, 'site_id', c_site_id, 'address', c_addr, 'town', c_town,
      'trade', c_trade, 'notes', c_notes, 'google_maps_url', c_maps, 'cid', c_cid, 'place_id', c_pid,
      'nk', c_nk, 'pc', c_pc, 'ak', c_ak, 'country', c_country));
    v_items := v_items || jsonb_build_object('k', i::text, 'place_id', c_pid, 'phone', c_phone, 'maps_url', c_maps);
  end loop;

  -- ── 2. Existing leads ────────────────────────────────────────────────────────────────────────────────────
  if jsonb_array_length(v_items) > 0 then
    if v_commit then
      -- The same lock sales_add_lead takes, in key order (no deadlock between two imports), held to commit.
      perform pg_advisory_xact_lock(hashtextextended('outreach_leads.phone_key:' || pk, 0))
         from (select distinct value ->> 'pk' as pk from jsonb_each(v_valid) where value ->> 'pk' is not null order by 1) s;
    end if;
    -- HARD: the canonical identity lookup (place id → phone key → Maps link), the one sales_add_lead uses.
    for h in select * from public._lead_identity_rows(v_items) loop
      if h.lead_id is not null then
        v_hits := v_hits || jsonb_build_object(h.k, jsonb_build_object('id', h.lead_id, 'state', h.state, 'owner_name', h.owner_name));
      end if;
    end loop;
    -- HARD, the same Maps-link signal compared by the listing's cid (oldest lead first, like the lookup).
    select coalesce(jsonb_object_agg(cid, jsonb_build_object('id', id, 'owner', owner)), '{}'::jsonb) into v_cids
      from (select distinct on (substring(l.google_maps_url from '[?&]cid=([0-9]+)')) substring(l.google_maps_url from '[?&]cid=([0-9]+)') as cid,
                   l.id, l.assigned_to_user_id as owner
              from public.outreach_leads l
             where l.google_maps_url ~ '[?&]cid=[0-9]'
               and substring(l.google_maps_url from '[?&]cid=([0-9]+)') in (select value ->> 'cid' from jsonb_each(v_valid) where value ->> 'cid' is not null)
             order by 1, l.created_at) s;
    -- POSSIBLE: every lead with the same normalised name IN THE SAME COUNTRY (null = UK, as before; the key carries the
    -- country), with its town and location keys.
    select coalesce(jsonb_object_agg(nk, arr), '{}'::jsonb) into v_names
      from (select nk, jsonb_agg(jsonb_build_object('owner', owner, 'owner_name', owner_name, 'town', town, 'pc', pc, 'ak', ak) order by created_at) as arr
              from (select coalesce(l.country, 'UK') || ':' || nullif(btrim(regexp_replace(lower(l.business_name), '[^a-z0-9]+', ' ', 'g')), '') as nk,
                           l.assigned_to_user_id as owner, t.display_name as owner_name, l.created_at,
                           coalesce(nullif(btrim(l.derived_town), ''), nullif(btrim(l.search_location), '')) as town,
                           case when l.country = 'Australia'
                                then replace(substring(upper(coalesce(l.address, '')) from '\m((?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\s*[0-9]{4})\M'), ' ', '')
                                else replace(substring(upper(coalesce(l.address, '')) from '([A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2})'), ' ', '') end as pc,
                           nullif(regexp_replace(regexp_replace(lower(coalesce(l.address, '')), '[^a-z0-9]+', '', 'g'),
                                                 case when l.country = 'Australia' then 'australia$' else 'uk$' end, ''), '') as ak
                      from public.outreach_leads l
                      left join public.team_members t on t.user_id = l.assigned_to_user_id
                     where coalesce(l.country, 'UK') in ('UK', 'Australia')) s
             where nk in (select value ->> 'nk' from jsonb_each(v_valid))
             group by nk) g;
    -- POSSIBLE (held until confirmed — sales_add_lead's confirm_site_match rule): the same website identity.
    select coalesce(jsonb_object_agg(sid, arr), '{}'::jsonb) into v_sites
      from (select public.website_identity(l.website) as sid,
                   jsonb_agg(jsonb_build_object('owner', l.assigned_to_user_id, 'owner_name', t.display_name,
                                                'town', coalesce(nullif(btrim(l.derived_town), ''), nullif(btrim(l.search_location), '')))
                             order by l.created_at) as arr
              from public.outreach_leads l
              left join public.team_members t on t.user_id = l.assigned_to_user_id
             where l.website is not null
               and public.website_identity(l.website) in (select value ->> 'site_id' from jsonb_each(v_valid) where value ->> 'site_id' is not null)
             group by 1) g;
  end if;

  -- ── 3. Decide, and (on commit) write — each row in its own sub-transaction ─────────────────────────────────
  seen := '{}'::jsonb;   -- reused: the possible-match keys of earlier rows in this file
  for k, o in select key, value from jsonb_each(v_valid) order by (key)::integer loop
    v_outcome := 'new'; v_reason := null; v_fill := '{}'::jsonb; v_id := null; v_match := null; v_held := false;
    if not (v_hits ? k) and o ->> 'cid' is not null and v_cids ? (o ->> 'cid') then
      -- A cid hit is the same Maps listing: classified exactly as the canonical lookup classifies its hits.
      v_hits := v_hits || jsonb_build_object(k, jsonb_build_object('id', v_cids -> (o ->> 'cid') ->> 'id',
        'state', case when (v_cids -> (o ->> 'cid') ->> 'owner')::uuid = v_uid then 'yours'
                      when v_cids -> (o ->> 'cid') ->> 'owner' is not null then 'owned' else 'claimable' end,
        'owner_name', (select display_name from public.team_members where user_id = (v_cids -> (o ->> 'cid') ->> 'owner')::uuid)));
    end if;

    if v_hits ? k then
      -- ── DUPLICATE: a strong identity match. Never a second lead. ──
      v_reason := case v_hits -> k ->> 'state' when 'yours' then 'already_yours' when 'owned' then 'owned_by_other'
                       else 'exists_unassigned' end;
      v_outcome := 'skipped';
      if v_reason = 'already_yours' then
        select l.id, l.contact_name, l.email, l.website, l.address, l.search_keyword, l.amount_paid, l.status, l.assigned_to_user_id
          into v_lead from public.outreach_leads l where l.id = (v_hits -> k ->> 'id')::uuid;
        -- Fill blanks only, on the caller's own non-client lead. Never an overwrite.
        if v_lead.id is not null and v_lead.assigned_to_user_id = v_uid and not public.lead_is_client(v_lead.amount_paid, v_lead.status) then
          if nullif(btrim(coalesce(v_lead.contact_name, '')), '') is null and o ->> 'contact_name' is not null then v_fill := v_fill || jsonb_build_object('contact_name', o ->> 'contact_name'); end if;
          if nullif(btrim(coalesce(v_lead.email, '')), '') is null and o ->> 'email' is not null then v_fill := v_fill || jsonb_build_object('email', o ->> 'email'); end if;
          if nullif(btrim(coalesce(v_lead.website, '')), '') is null and o ->> 'website' is not null then v_fill := v_fill || jsonb_build_object('website', o ->> 'website'); end if;
          if nullif(btrim(coalesce(v_lead.address, '')), '') is null and o ->> 'address' is not null then v_fill := v_fill || jsonb_build_object('address', o ->> 'address'); end if;
          if nullif(btrim(coalesce(v_lead.search_keyword, '')), '') is null and o ->> 'trade' is not null then v_fill := v_fill || jsonb_build_object('search_keyword', o ->> 'trade'); end if;
          if v_fill <> '{}'::jsonb then v_outcome := 'update'; v_id := v_lead.id; end if;
        end if;
      end if;
    else
      -- ── POSSIBLE MATCH: weaker evidence. Never a skip on its own. ──
      -- The context says only what this caller may know: the admin sees towns and owners; a salesperson sees their
      -- OWN matching leads' towns, and of anyone else's only that one exists.
      if o ->> 'site_id' is not null and (v_sites ? (o ->> 'site_id') or seen ? ('s:' || (o ->> 'site_id'))) then
        m := coalesce(v_sites -> (o ->> 'site_id'), '[]'::jsonb);
        v_reason := 'possible_match_website'; v_held := true;
      elsif o ->> 'nk' is not null and (
            exists (select 1 from jsonb_array_elements(coalesce(v_names -> (o ->> 'nk'), '[]'::jsonb)) e
                     where (o ->> 'pc' is not null and e ->> 'pc' = o ->> 'pc') or (o ->> 'ak' is not null and e ->> 'ak' = o ->> 'ak'))
            or (o ->> 'pc' is not null and seen ? ('l:' || (o ->> 'nk') || '|' || (o ->> 'pc')))
            or (o ->> 'ak' is not null and seen ? ('a:' || (o ->> 'nk') || '|' || (o ->> 'ak')))) then
        -- The same name AND the same postcode or full address.
        select coalesce(jsonb_agg(e), '[]'::jsonb) into m from jsonb_array_elements(coalesce(v_names -> (o ->> 'nk'), '[]'::jsonb)) e
         where (o ->> 'pc' is not null and e ->> 'pc' = o ->> 'pc') or (o ->> 'ak' is not null and e ->> 'ak' = o ->> 'ak');
        v_reason := 'possible_match_name_location'; v_held := true;
      elsif o ->> 'nk' is not null and (v_names ? (o ->> 'nk') or seen ? ('n:' || (o ->> 'nk'))) then
        -- The same name ONLY: a warning. The row is imported.
        m := coalesce(v_names -> (o ->> 'nk'), '[]'::jsonb);
        v_reason := 'possible_match_name';
      end if;
      if v_reason is not null then
        v_match := jsonb_strip_nulls(jsonb_build_object(
          'in_file', case when jsonb_array_length(m) = 0 then true end,
          'yours', (select count(*) from jsonb_array_elements(m) e where (e ->> 'owner')::uuid = v_uid),
          'others', case when v_role = 'admin' or exists (select 1 from jsonb_array_elements(m) e where (e ->> 'owner')::uuid is distinct from v_uid) then
                      case when v_role = 'admin' then (select count(*) from jsonb_array_elements(m) e where (e ->> 'owner')::uuid is distinct from v_uid)
                           else 1 end end,
          'towns', (select jsonb_agg(distinct e ->> 'town') from (select e from jsonb_array_elements(m) e
                      where e ->> 'town' is not null and (v_role = 'admin' or (e ->> 'owner')::uuid = v_uid) limit 5) q),
          'owners', case when v_role = 'admin' then (select jsonb_agg(distinct coalesce(e ->> 'owner_name', 'Unassigned')) from jsonb_array_elements(m) e
                      where (e ->> 'owner')::uuid is distinct from v_uid) end));
        if v_held and not v_confirm then v_outcome := 'held'; end if;
      end if;
      -- This row's keys, for the rows after it.
      -- (A key is added only when its parts exist; an earlier row keeps its claim to a key.)
      foreach v_key in array array_remove(array['s:' || (o ->> 'site_id'), 'n:' || (o ->> 'nk'),
          'l:' || (o ->> 'nk') || '|' || (o ->> 'pc'), 'a:' || (o ->> 'nk') || '|' || (o ->> 'ak')], null) loop
        if not (seen ? v_key) then seen := seen || jsonb_build_object(v_key, o -> 'row'); end if;
      end loop;
    end if;

    if v_commit and v_outcome = 'new' then
      begin
        insert into public.outreach_leads (
          user_id, added_by_user_id, assigned_to_user_id, assigned_at, business_name, contact_name, phone, email,
          website, address, category, search_keyword, search_location, google_maps_url, place_id,
          status, next_action, country, list_type)
        values (
          v_book, v_uid, v_uid, now(), o ->> 'business_name', o ->> 'contact_name', o ->> 'phone', o ->> 'email',
          o ->> 'website', o ->> 'address', o ->> 'trade', o ->> 'trade', o ->> 'town', o ->> 'google_maps_url', o ->> 'place_id',
          'not_contacted', 'none', o ->> 'country', 'manual')
        returning id into v_id;
        insert into public.lead_activity (lead_id, actor_user_id, kind, data)
        values (v_id, v_uid, 'lead_added', jsonb_strip_nulls(jsonb_build_object('source', 'csv_import', 'import_id', v_import,
                                                              'file', v_file, 'row', (o ->> 'row')::integer, 'possible_match', v_reason)));
        if o ->> 'notes' is not null then
          insert into public.lead_activity (lead_id, actor_user_id, kind, body) values (v_id, v_uid, 'note', o ->> 'notes');
        end if;
        insert into public.outreach_history (user_id, business_name, google_maps_url, country, phone)
        values (v_book, o ->> 'business_name', o ->> 'google_maps_url', o ->> 'country', o ->> 'phone');
        v_outcome := 'created';
      exception when others then
        v_outcome := 'failed';
        v_reason := case when sqlstate = '23505' then 'duplicate_race' when sqlstate = '42501' then 'refused' else 'write_failed' end;
        v_match := null;
        v_id := null;
      end;
    elsif v_commit and v_outcome = 'update' then
      begin
        update public.outreach_leads l set
          contact_name = coalesce(nullif(btrim(coalesce(l.contact_name, '')), ''), v_fill ->> 'contact_name'),
          email = coalesce(nullif(btrim(coalesce(l.email, '')), ''), v_fill ->> 'email'),
          website = coalesce(nullif(btrim(coalesce(l.website, '')), ''), v_fill ->> 'website'),
          address = coalesce(nullif(btrim(coalesce(l.address, '')), ''), v_fill ->> 'address'),
          search_keyword = coalesce(nullif(btrim(coalesce(l.search_keyword, '')), ''), v_fill ->> 'search_keyword')
         where l.id = v_id and l.assigned_to_user_id = v_uid and not public.lead_is_client(l.amount_paid, l.status);
        if found then
          insert into public.lead_activity (lead_id, actor_user_id, kind, data)
          values (v_id, v_uid, 'details_set', v_fill || jsonb_build_object('source', 'CSV import'));
          v_outcome := 'updated';
        else
          v_outcome := 'skipped'; v_reason := 'already_yours'; v_fill := '{}'::jsonb; v_id := null;
        end if;
      exception when others then
        v_outcome := 'failed'; v_reason := 'write_failed'; v_id := null;
      end;
    end if;

    rows_out := rows_out || jsonb_strip_nulls(jsonb_build_object(
      'i', (o ->> 'i')::integer, 'row', (o ->> 'row')::integer, 'business_name', o ->> 'business_name',
      'outcome', v_outcome,
      'reasons', case when v_reason is null then null else jsonb_build_array(v_reason) end,
      'match', v_match,
      -- The owner's NAME only for the admin; a salesperson is never told whose lead it is.
      'owner_name', case when v_role = 'admin' and v_reason = 'owned_by_other' then v_hits -> k ->> 'owner_name' end,
      'fields', case when v_fill <> '{}'::jsonb then (select jsonb_agg(f) from jsonb_object_keys(v_fill) f) end,
      -- The id only for a lead the caller now owns (created / updated) — never another owner's.
      'lead_id', case when v_outcome in ('created', 'updated') then v_id end));
  end loop;

  -- ── 4. Counts, from the rows themselves ─────────────────────────────────────────────────────────────────
  select jsonb_build_object(
    'rows', v_n,
    'valid', count(*) filter (where r ->> 'outcome' <> 'invalid'),
    'invalid', count(*) filter (where r ->> 'outcome' = 'invalid'),
    'duplicate_in_file', count(*) filter (where r ->> 'outcome' = 'duplicate_in_file'),
    'existing', count(*) filter (where r ->> 'outcome' in ('skipped', 'update', 'updated')),
    'possible_match', count(*) filter (where r ? 'match'),
    'held', count(*) filter (where r ->> 'outcome' = 'held'),
    'new', count(*) filter (where r ->> 'outcome' in ('new', 'created')),
    'update', count(*) filter (where r ->> 'outcome' in ('update', 'updated')),
    'skipped', count(*) filter (where r ->> 'outcome' = 'skipped'),
    'created', count(*) filter (where r ->> 'outcome' = 'created'),
    'updated', count(*) filter (where r ->> 'outcome' = 'updated'),
    'failed', count(*) filter (where r ->> 'outcome' = 'failed'))
    into v_cnt
    from jsonb_array_elements(rows_out) r;

  return jsonb_build_object('ok', true, 'committed', v_commit, 'import_id', case when v_commit then v_import end,
                            'role', v_role, 'counts', v_cnt,
                            'rows', (select jsonb_agg(r order by (r ->> 'i')::integer) from jsonb_array_elements(rows_out) r));
end $function$;

revoke all on function public.import_leads(jsonb, boolean, text, boolean) from public, anon;
grant execute on function public.import_leads(jsonb, boolean, text, boolean) to authenticated;

-- Read back:
--   select pg_get_functiondef('public.import_leads(jsonb, boolean, text, boolean)'::regprocedure) ~ 'invalid_country';
--   select proname, prosecdef, proacl from pg_proc where proname = 'import_leads';
