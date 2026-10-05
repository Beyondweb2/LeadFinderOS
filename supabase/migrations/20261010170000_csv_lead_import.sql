-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CSV LEAD IMPORT, DECIDED BY THE SERVER (2026-10-05, fix/csv-lead-import;
-- docs/pre-sales-certification/csv-import-fix.md).
--
-- Found: the Outreach CSV import inserted straight from the browser with list_type 'imported', which
-- outreach_leads_list_type_check refuses (it allows only no_website / broken_website / manual), so every
-- row failed and the dialog still said "Successfully imported". The browser also chose the duplicate rule
-- (exact business name against the rows it happened to have loaded) and could write any column.
--
-- The rule now lives in ONE function, import_leads(_rows, _commit, _file_name):
--   · WHO: a signed-in admin or salesperson (my_role). Anyone else is refused. Sales goes through the usage
--     guard (action lead_import: suspension, not-onboarded, row and hourly limits); the admin is logged only.
--   · OWNER: always the caller. assigned_to_user_id = added_by_user_id = auth.uid(); user_id = the book owner
--     (the same as sales_add_lead). No owner, seller, status, payment, agreement or client field is ever read
--     from a row — the function reads an allowlist of eleven keys and nothing else.
--   · NO CONTACT: status 'not_contacted', next_action 'none', no campaign, nothing queued, no message. Only
--     outreach_leads / lead_activity / outreach_history rows are written.
--   · list_type 'manual' — the existing value for a lead a person added by hand (AddLeadDialog). The ORIGIN
--     ("CSV import", the file, the row) is recorded on the lead's history: lead_activity 'lead_added' with
--     data.source = 'csv_import'. The CHECK constraint is NOT widened.
--   · DUPLICATES: the canonical _lead_identity_rows (place id → phone key → Maps link, the one sales_add_lead
--     uses), then the website identity and the exact business name as POSSIBLE duplicates (both skipped and
--     flagged, never merged). A lead already YOURS gets only its blank contact / email / website / address /
--     trade filled (never overwritten, never on a client). Someone else's lead, or an unassigned one, is
--     skipped and reported — never claimed, never stolen. A salesperson is never told whose it is.
--   · ONE BAD ROW NEVER SINKS THE BATCH: every row is validated first and reported with its reason; each
--     write runs in its own sub-transaction, so a refused row is reported as failed and the rest land.
--   · PREVIEW: _commit = false runs every check and writes nothing (except the guard's own usage row).
--   · At most 500 rows per call (the identity lookup's own ceiling). The browser sends a bigger file in calls
--     of 500, one transaction each, and reports every call.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- ── The guard action (src/lib/protectionLimits.ts DEFAULT_PROTECTION_LIMITS) — only when absent. Unpaid, so the
--    prospecting pause never blocks an import; a salesperson's rows count against max_rows / rows_per_day. ──
update public.protection_settings
   set limits = jsonb_set(limits, '{actions,lead_import}', '{"paid": false, "per_hour": 30, "max_rows": 500, "rows_per_day": 3000}'::jsonb, true),
       updated_at = now()
 where id = 1 and not (limits -> 'actions' ? 'lead_import');

create or replace function public.import_leads(_rows jsonb, _commit boolean default false, _file_name text default null)
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
  x jsonb;
  i integer := 0;
  rows_out jsonb := '[]'::jsonb;
  -- one row's cleaned values
  c_row integer; c_name text; c_contact text; c_phone text; c_pk text; c_email text; c_site text; c_site_id text;
  c_addr text; c_post text; c_town text; c_trade text; c_notes text; c_maps text; c_errs text[];
  -- in-file keys seen so far → first row number
  seen jsonb := '{}'::jsonb;
  v_dup_of integer;
  v_key text;
  v_items jsonb := '[]'::jsonb;
  v_valid jsonb := '{}'::jsonb;   -- k → cleaned row, for valid, non-duplicate rows
  v_hits jsonb := '{}'::jsonb;    -- k → identity hit
  v_names jsonb := '{}'::jsonb;   -- lower(name) → {id, owner}
  v_sites jsonb := '{}'::jsonb;   -- website identity → {id, owner}
  h record;
  o jsonb;
  v_outcome text;
  v_reason text;
  v_lead record;
  v_fill jsonb;
  v_id uuid;
  v_cnt jsonb := jsonb_build_object('rows', 0, 'valid', 0, 'invalid', 0, 'duplicate_in_file', 0, 'existing', 0,
                                    'new', 0, 'update', 0, 'skipped', 0, 'created', 0, 'updated', 0, 'failed', 0);
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
  v_g := public.guard_action(v_uid, 'lead_import', null, 0, v_n, case when coalesce(_commit, false) then 'import_leads' else 'import_leads_preview' end);
  if not coalesce((v_g ->> 'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'usage_paused', 'reason', case when v_role = 'admin' then v_g ->> 'reason' end);
  end if;

  -- ── 1. Clean and validate every row; detect duplicates inside the file ─────────────────────────────────
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
      c_phone := regexp_replace(c_phone, '^\+?44\s*\(0\)\s*', '+44 ');
      if c_phone ~ '^[1-9][0-9]{9}$' then c_phone := '0' || c_phone; end if;
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
    -- The admin's add rule, kept: a business with neither a phone nor an email is not added.
    if c_phone is null and c_email is null then c_errs := c_errs || 'no_phone_or_email'::text; end if;

    if cardinality(c_errs) > 0 then
      rows_out := rows_out || jsonb_build_object('i', i, 'row', c_row, 'business_name', left(coalesce(c_name, ''), 200),
                                                 'outcome', 'invalid', 'reasons', to_jsonb(c_errs));
      continue;
    end if;

    c_site_id := public.website_identity(c_site);
    -- In-file duplicate: same phone key, Maps link, email, website identity or business name as an earlier valid row.
    v_dup_of := null;
    foreach v_key in array array_remove(array[
        'p:' || c_pk, 'm:' || lower(c_maps), 'e:' || c_email, 's:' || c_site_id, 'n:' || lower(c_name)], null) loop
      if seen ? v_key then v_dup_of := (seen ->> v_key)::integer; exit; end if;
    end loop;
    if v_dup_of is not null then
      rows_out := rows_out || jsonb_build_object('i', i, 'row', c_row, 'business_name', c_name,
                                                 'outcome', 'duplicate_in_file', 'reasons', jsonb_build_array('duplicate_in_file'),
                                                 'first_row', v_dup_of);
      continue;
    end if;
    foreach v_key in array array_remove(array[
        'p:' || c_pk, 'm:' || lower(c_maps), 'e:' || c_email, 's:' || c_site_id, 'n:' || lower(c_name)], null) loop
      seen := seen || jsonb_build_object(v_key, c_row);
    end loop;

    -- Postcode joins the address unless the address already holds it.
    if c_post is not null then
      if c_addr is null then c_addr := c_post;
      elsif position(replace(c_post, ' ', '') in upper(replace(c_addr, ' ', ''))) = 0 then c_addr := c_addr || ', ' || c_post;
      end if;
    end if;

    v_valid := v_valid || jsonb_build_object(i::text, jsonb_build_object(
      'i', i, 'row', c_row, 'business_name', c_name, 'contact_name', c_contact, 'phone', c_phone, 'pk', c_pk,
      'email', c_email, 'website', c_site, 'site_id', c_site_id, 'address', c_addr, 'town', c_town,
      'trade', c_trade, 'notes', c_notes, 'google_maps_url', c_maps));
    v_items := v_items || jsonb_build_object('k', i::text, 'phone', c_phone, 'maps_url', c_maps);
  end loop;

  -- ── 2. Existing leads: the canonical identity lookup, then the possible-duplicate checks ───────────────────
  if jsonb_array_length(v_items) > 0 then
    if coalesce(_commit, false) then
      -- The same lock sales_add_lead takes, in key order (no deadlock between two imports), held to commit.
      perform pg_advisory_xact_lock(hashtextextended('outreach_leads.phone_key:' || pk, 0))
         from (select distinct value ->> 'pk' as pk from jsonb_each(v_valid) where value ->> 'pk' is not null order by 1) s;
    end if;
    for h in select * from public._lead_identity_rows(v_items) loop
      if h.lead_id is not null then
        v_hits := v_hits || jsonb_build_object(h.k, jsonb_build_object('id', h.lead_id, 'state', h.state, 'owner_name', h.owner_name));
      end if;
    end loop;
    select coalesce(jsonb_object_agg(nk, jsonb_build_object('id', id, 'owner', owner)), '{}'::jsonb) into v_names
      from (select distinct on (lower(btrim(l.business_name))) lower(btrim(l.business_name)) as nk, l.id, l.assigned_to_user_id as owner
              from public.outreach_leads l
             where coalesce(l.country, 'UK') = 'UK'
               and lower(btrim(l.business_name)) in (select lower(value ->> 'business_name') from jsonb_each(v_valid))
             order by lower(btrim(l.business_name)), l.created_at) s;
    select coalesce(jsonb_object_agg(sid, jsonb_build_object('id', id, 'owner', owner)), '{}'::jsonb) into v_sites
      from (select distinct on (public.website_identity(l.website)) public.website_identity(l.website) as sid, l.id, l.assigned_to_user_id as owner
              from public.outreach_leads l
             where l.website is not null
               and public.website_identity(l.website) in (select value ->> 'site_id' from jsonb_each(v_valid) where value ->> 'site_id' is not null)
             order by public.website_identity(l.website), l.created_at) s;
  end if;

  -- ── 3. Decide, and (on commit) write — each row in its own sub-transaction ─────────────────────────────────
  for k, o in select key, value from jsonb_each(v_valid) order by (key)::integer loop
    v_outcome := 'new'; v_reason := null; v_fill := '{}'::jsonb; v_id := null;
    if v_hits ? k then
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
    elsif o ->> 'site_id' is not null and v_sites ? (o ->> 'site_id') then
      v_outcome := 'skipped';
      v_reason := case when (v_sites -> (o ->> 'site_id') ->> 'owner')::uuid = v_uid then 'already_yours_website' else 'possible_duplicate_website' end;
    elsif v_names ? lower(o ->> 'business_name') then
      v_outcome := 'skipped';
      v_reason := case when (v_names -> lower(o ->> 'business_name') ->> 'owner')::uuid = v_uid then 'already_yours_name' else 'possible_duplicate_name' end;
    end if;

    if coalesce(_commit, false) and v_outcome = 'new' then
      begin
        insert into public.outreach_leads (
          user_id, added_by_user_id, assigned_to_user_id, assigned_at, business_name, contact_name, phone, email,
          website, address, category, search_keyword, search_location, google_maps_url,
          status, next_action, country, list_type)
        values (
          v_book, v_uid, v_uid, now(), o ->> 'business_name', o ->> 'contact_name', o ->> 'phone', o ->> 'email',
          o ->> 'website', o ->> 'address', o ->> 'trade', o ->> 'trade', o ->> 'town', o ->> 'google_maps_url',
          'not_contacted', 'none', 'UK', 'manual')
        returning id into v_id;
        insert into public.lead_activity (lead_id, actor_user_id, kind, data)
        values (v_id, v_uid, 'lead_added', jsonb_build_object('source', 'csv_import', 'import_id', v_import,
                                                              'file', v_file, 'row', (o ->> 'row')::integer));
        if o ->> 'notes' is not null then
          insert into public.lead_activity (lead_id, actor_user_id, kind, body) values (v_id, v_uid, 'note', o ->> 'notes');
        end if;
        insert into public.outreach_history (user_id, business_name, google_maps_url, country, phone)
        values (v_book, o ->> 'business_name', o ->> 'google_maps_url', 'UK', o ->> 'phone');
        v_outcome := 'created';
      exception when others then
        v_outcome := 'failed';
        v_reason := case when sqlstate = '23505' then 'duplicate_race' when sqlstate = '42501' then 'refused' else 'write_failed' end;
        v_id := null;
      end;
    elsif coalesce(_commit, false) and v_outcome = 'update' then
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
    'new', count(*) filter (where r ->> 'outcome' in ('new', 'created')),
    'update', count(*) filter (where r ->> 'outcome' in ('update', 'updated')),
    'skipped', count(*) filter (where r ->> 'outcome' = 'skipped'),
    'created', count(*) filter (where r ->> 'outcome' = 'created'),
    'updated', count(*) filter (where r ->> 'outcome' = 'updated'),
    'failed', count(*) filter (where r ->> 'outcome' = 'failed'))
    into v_cnt
    from jsonb_array_elements(rows_out) r;

  return jsonb_build_object('ok', true, 'committed', coalesce(_commit, false), 'import_id', case when _commit then v_import end,
                            'role', v_role, 'counts', v_cnt,
                            'rows', (select jsonb_agg(r order by (r ->> 'i')::integer) from jsonb_array_elements(rows_out) r));
end $function$;

revoke all on function public.import_leads(jsonb, boolean, text) from public, anon;
grant execute on function public.import_leads(jsonb, boolean, text) to authenticated;

-- Read back:
--   select proname, prosecdef, proacl from pg_proc where proname = 'import_leads';
--   select limits -> 'actions' -> 'lead_import' from public.protection_settings where id = 1;
