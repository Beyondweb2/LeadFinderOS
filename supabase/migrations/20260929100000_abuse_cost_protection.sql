-- Abuse / API-cost / lead protection (2026-09-29, docs/abuse-cost-protection.md).
--
-- ONE ledger (api_usage_log, extended), ONE event log (security_events), ONE settings row
-- (protection_settings), ONE server guard (guard_action) that every paid or data-heavy action a person
-- starts passes through. Suspension is team_members.suspended_at — the role row stays, so a suspended
-- salesperson still READS their leads, notes and history; every protected action refuses.
--
-- ⛔ Additive except where named: claim_lead / lead_identity_lookup / sales_add_lead / sales_queue_opener
-- are the LIVE definitions read back on 2026-09-29 with the guard added (scripted, each edit asserted);
-- sales_pool loses its authenticated grant (no caller since 2026-09-28); the sales message policy loses
-- the phone match for messages that belong to ANOTHER lead.
-- Applied one statement group at a time and read back (CLAUDE.md §6 "Migrations are applied one at a time").

set local lock_timeout = '5s';

-- ── 1. The ledger: api_usage_log gains who / what / outcome. Nullable, no default: metadata-only. ──
alter table public.api_usage_log
  add column if not exists action text,
  add column if not exists actor_role text,
  add column if not exists lead_id uuid,
  add column if not exists outcome text,
  add column if not exists reason text;
create index if not exists api_usage_log_user_time on public.api_usage_log (user_id, created_at desc);
create index if not exists api_usage_log_time on public.api_usage_log (created_at desc);
create index if not exists api_usage_log_guard on public.api_usage_log (user_id, action, created_at desc) where action is not null;

/* Which provider a ledger row paid. Positive match per prefix; a guard row is an ESTIMATE, never a
   provider charge, and is kept out of every provider total. */
create or replace function public.usage_provider(_fn text, _type text)
returns text language sql immutable as $$
  select case
    when _type = 'guard' then 'estimate'
    when _type ilike 'openai%' then 'OpenAI'
    when _type ilike 'apify%' then 'Apify'
    when _type in ('place_details', 'text_search', 'geocode', 'place_search')
      or _fn in ('google-place-details', 'search-leads', 'niche-sample') then 'Google'
    when _type ilike 'website%' then 'Website fetch'
    else 'Other'
  end
$$;

-- ── 2. security_events: append-only for everyone but the service role; the admin reads it. ──
create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  kind text not null,
  severity text not null check (severity in ('info', 'warning', 'restricted', 'critical')),
  action text,
  lead_id uuid,
  occurrences integer not null default 1,
  detail jsonb not null default '{}'::jsonb,
  -- One alert per (who, what, day): repeats bump `occurrences` instead of a new row / email.
  alert_key text unique,
  alert_wanted boolean not null default false,
  alerted_at timestamptz
);
alter table public.security_events enable row level security;
revoke all on public.security_events from anon, authenticated;
grant select on public.security_events to authenticated;
drop policy if exists security_events_admin_select on public.security_events;
create policy security_events_admin_select on public.security_events
  for select to authenticated using ((select public.my_role()) = 'admin');
create index if not exists security_events_time on public.security_events (created_at desc);
create index if not exists security_events_actor_kind on public.security_events (actor_user_id, kind, created_at desc);
create index if not exists security_events_pending_alert on public.security_events (created_at)
  where alert_wanted and alerted_at is null;

-- ── 3. protection_settings: the ONE row of thresholds + the global mode. Service role only. ──
create table if not exists public.protection_settings (
  id integer primary key default 1 check (id = 1),
  mode text not null default 'running' check (mode in ('running', 'prospecting_paused', 'all_stop')),
  limits jsonb not null,
  -- { "<user uuid>": "<iso until>" } — the admin's unlock: per-user limits skipped until then.
  overrides jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.protection_settings enable row level security;
revoke all on public.protection_settings from anon, authenticated;
-- SEED: byte-equal to DEFAULT_PROTECTION_LIMITS (src/lib/protectionLimits.ts), held by scripts/abuse-cost-protection.test.ts.
insert into public.protection_settings (id, mode, limits) values (1, 'running', '{"user_hour_warn_usd":6,"user_hour_hard_usd":15,"user_day_warn_usd":15,"user_day_hard_usd":35,"team_hour_warn_usd":12,"team_day_warn_usd":50,"team_day_cap_usd":100,"denied_alert_10min":10,"apify_warn_pct":90,"actions":{"lead_search":{"paid":true,"per_min":10,"per_hour":60},"place_details":{"paid":true,"per_min":40,"per_hour":500},"enrich":{"paid":true,"per_hour":150},"site_scrape":{"paid":false,"per_hour":300},"hook_audit":{"paid":true,"per_10min":10,"per_day":80},"hook_preview":{"paid":true,"per_hour":30},"ai_draft":{"paid":true,"per_hour":30},"prospect_preview":{"paid":true,"per_hour":20},"niche_check":{"paid":true},"audit_manual":{"paid":true},"admin_ai":{"paid":true},"claim":{"paid":false,"per_hour":60,"per_day":200,"warn_day":100},"lead_add":{"paid":false,"per_hour":200},"lead_lookup":{"paid":false,"per_hour":120},"copy_numbers":{"paid":false,"per_hour":10,"max_rows":200,"rows_per_day":1000,"warn_rows":100},"export_csv":{"paid":false,"sales_allowed":false},"whatsapp_send":{"paid":false},"whatsapp_queue":{"paid":false}}}'::jsonb)
on conflict (id) do nothing;

-- ── 4. Suspension: a column, not a status value (status stays active/disabled for every reader). ──
alter table public.team_members
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by uuid references auth.users(id) on delete set null;

-- ── 5. THE GUARD. Service role + SECURITY DEFINER callers only; never granted to a signed-in role. ──
create or replace function public.guard_action(
  _actor uuid, _action text, _lead uuid default null, _est_cost numeric default 0,
  _units integer default 1, _fn text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s public.protection_settings%rowtype;
  a jsonb;
  v_role text;
  v_susp boolean := false;
  v_paid boolean;
  v_over timestamptz;
  v_reason text;
  v_warn text;
  v_units integer := greatest(coalesce(_units, 1), 1);
  v_n numeric;
  v_h numeric := 0;
  v_d numeric := 0;
  v_team numeric := 0;
  w record;
  v_outcome text;
  v_day text := to_char(now() at time zone 'Europe/London', 'YYYY-MM-DD');
begin
  if _actor is null or _action is null then return jsonb_build_object('ok', false, 'reason', 'no_actor'); end if;
  select * into s from public.protection_settings where id = 1;
  -- ⛔ FAIL CLOSED: no settings row = nothing is allowed (absence is never "unlimited").
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_settings'); end if;
  select case when bool_or(role::text = 'admin') then 'admin' when bool_or(role::text = 'sales') then 'sales' end
    into v_role from public.user_roles where user_id = _actor;
  if v_role is null then return jsonb_build_object('ok', false, 'reason', 'no_role'); end if;
  select (t.suspended_at is not null) into v_susp from public.team_members t where t.user_id = _actor;
  v_susp := coalesce(v_susp, false) and v_role = 'sales';
  a := coalesce(s.limits -> 'actions' -> _action, '{}'::jsonb);
  -- An action the row does not know is PAID (the pause modes and spend caps apply to it).
  v_paid := coalesce((a ->> 'paid')::boolean, true);
  begin
    v_over := nullif(s.overrides ->> _actor::text, '')::timestamptz;
  exception when others then v_over := null;
  end;

  if v_susp then v_reason := 'suspended';
  elsif v_paid and s.mode = 'all_stop' then v_reason := 'all_stop';
  elsif v_paid and s.mode = 'prospecting_paused' then v_reason := 'paused';
  elsif v_role = 'sales' and coalesce((a ->> 'sales_allowed')::boolean, true) is false then v_reason := 'not_allowed';
  elsif v_role = 'sales' and a ? 'max_rows' and v_units > (a ->> 'max_rows')::numeric then v_reason := 'too_many_rows';
  elsif v_role = 'sales' and (v_over is null or v_over <= now()) then
    if v_paid then
      -- The whole team's REAL spend (every provider row, background jobs included; estimates excluded).
      select coalesce(sum(estimated_cost_usd), 0) into v_team from public.api_usage_log
       where created_at > now() - interval '24 hours' and api_type is distinct from 'guard';
      if v_team >= (s.limits ->> 'team_day_cap_usd')::numeric then v_reason := 'team_cap'; end if;
    end if;
    if v_reason is null then
      for w in select * from (values ('per_min', interval '1 minute'), ('per_10min', interval '10 minutes'),
                                     ('per_hour', interval '1 hour'), ('per_day', interval '24 hours')) t(k, span) loop
        if a ? w.k then
          select count(*) into v_n from public.api_usage_log
           where user_id = _actor and action = _action and outcome in ('allowed', 'warned')
             and created_at > now() - w.span;
          if v_n + 1 > (a ->> w.k)::numeric then v_reason := 'rate_limit'; exit; end if;
        end if;
      end loop;
    end if;
    if v_reason is null and a ? 'rows_per_day' then
      select coalesce(sum(calls_made), 0) into v_n from public.api_usage_log
       where user_id = _actor and action = _action and outcome in ('allowed', 'warned')
         and created_at > now() - interval '24 hours';
      if v_n + v_units > (a ->> 'rows_per_day')::numeric then v_reason := 'rate_limit'; end if;
    end if;
    if v_reason is null and v_paid then
      -- This person's spend: their own provider rows + the estimates for work billed to the book (hooks).
      select coalesce(sum(estimated_cost_usd) filter (where created_at > now() - interval '1 hour'), 0),
             coalesce(sum(estimated_cost_usd), 0)
        into v_h, v_d from public.api_usage_log
       where user_id = _actor and created_at > now() - interval '24 hours' and outcome is distinct from 'refused';
      if v_h >= (s.limits ->> 'user_hour_hard_usd')::numeric or v_d >= (s.limits ->> 'user_day_hard_usd')::numeric then
        v_reason := 'spend_cap';
      elsif v_h >= (s.limits ->> 'user_hour_warn_usd')::numeric or v_d >= (s.limits ->> 'user_day_warn_usd')::numeric then
        v_warn := 'spend_warning';
      end if;
    end if;
    if v_reason is null and v_warn is null and a ? 'warn_day' then
      select count(*) into v_n from public.api_usage_log
       where user_id = _actor and action = _action and outcome in ('allowed', 'warned')
         and created_at > now() - interval '24 hours';
      if v_n + 1 > (a ->> 'warn_day')::numeric then v_warn := 'volume_warning'; end if;
    end if;
    if v_reason is null and v_warn is null and a ? 'warn_rows' and v_units > (a ->> 'warn_rows')::numeric then
      v_warn := 'large_copy';
    end if;
  end if;

  v_outcome := case when v_reason is not null then 'refused' when v_warn is not null then 'warned' else 'allowed' end;
  insert into public.api_usage_log (user_id, function_name, api_type, calls_made, cache_hit, estimated_cost_usd,
                                    trigger_source, action, actor_role, lead_id, outcome, reason)
  values (_actor, left(coalesce(_fn, _action), 80), 'guard', v_units, false,
          case when v_reason is null then greatest(coalesce(_est_cost, 0), 0) else 0 end,
          'guard', _action, v_role, _lead, v_outcome, coalesce(v_reason, v_warn));

  if v_reason is not null or v_warn is not null then
    insert into public.security_events (actor_user_id, actor_role, kind, severity, action, lead_id, detail, alert_key, alert_wanted)
    values (_actor, v_role, coalesce(v_reason, v_warn),
            case when v_reason in ('paused', 'all_stop', 'suspended', 'not_allowed') then 'info'
                 when v_reason is not null then 'restricted' else 'warning' end,
            _action, _lead,
            jsonb_build_object('spend_hour_usd', round(v_h, 2), 'spend_day_usd', round(v_d, 2),
                               'team_day_usd', round(v_team, 2), 'units', v_units, 'function', _fn),
            _actor::text || ':' || coalesce(v_reason, v_warn) || ':' || _action || ':' || v_day,
            -- The admin's own pause is never emailed back to them; everything else is, once a day.
            coalesce(v_reason, v_warn) not in ('paused', 'all_stop'))
    on conflict (alert_key) do update
      set occurrences = public.security_events.occurrences + 1, last_at = now(), detail = excluded.detail;
  end if;

  return jsonb_build_object(
    'ok', v_reason is null,
    'state', case when v_reason is not null then 'restricted' when v_warn is not null then 'warning' else 'normal' end,
    'reason', coalesce(v_reason, v_warn),
    'role', v_role,
    'suspended', v_susp);
end
$function$;
revoke all on function public.guard_action(uuid, text, uuid, numeric, integer, text) from public, anon, authenticated;
grant execute on function public.guard_action(uuid, text, uuid, numeric, integer, text) to service_role;

/* A server-side refusal (admin-only function, someone else's lead). One info row each; the tenth in
   ten minutes (denied_alert_10min) raises ONE warning a day that is emailed. */
create or replace function public.record_denial(_actor uuid, _what text, _lead uuid default null, _detail jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text;
  v_n integer;
  v_lim numeric;
begin
  if _actor is null then return; end if;
  select case when bool_or(role::text = 'admin') then 'admin' when bool_or(role::text = 'sales') then 'sales' end
    into v_role from public.user_roles where user_id = _actor;
  insert into public.security_events (actor_user_id, actor_role, kind, severity, action, lead_id, detail)
  values (_actor, v_role, 'denied', 'info', left(coalesce(_what, 'unknown'), 80), _lead, coalesce(_detail, '{}'::jsonb));
  select (limits ->> 'denied_alert_10min')::numeric into v_lim from public.protection_settings where id = 1;
  select count(*) into v_n from public.security_events
   where actor_user_id = _actor and kind = 'denied' and created_at > now() - interval '10 minutes';
  if v_lim is not null and v_n >= v_lim then
    insert into public.security_events (actor_user_id, actor_role, kind, severity, action, detail, alert_key, alert_wanted)
    values (_actor, v_role, 'denied_burst', 'warning', left(coalesce(_what, 'unknown'), 80),
            jsonb_build_object('denied_last_10min', v_n),
            _actor::text || ':denied_burst:' || to_char(now() at time zone 'Europe/London', 'YYYY-MM-DD'), true)
    on conflict (alert_key) do update
      set occurrences = public.security_events.occurrences + 1, last_at = now(), detail = excluded.detail;
  end if;
end
$function$;
revoke all on function public.record_denial(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_denial(uuid, text, uuid, jsonb) to service_role;

/* Copy Numbers / Export CSV: the browser asks BEFORE it copies or downloads, and does nothing on a
   refusal (fail closed). Sales: copy only their own leads' numbers, never a CSV. Every allowed one is
   logged (data_export) with who, when, how many rows and the filter. */
create or replace function public.log_data_access(_kind text, _rows integer, _lead_ids uuid[] default null, _filter jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text := public.my_role();
  v_n integer := greatest(coalesce(_rows, cardinality(_lead_ids), 0), 0);
  v_g jsonb;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if _kind is null or _kind not in ('copy_numbers', 'export_csv') then
    return jsonb_build_object('ok', false, 'error', 'bad_kind');
  end if;
  if v_role = 'sales' and _kind = 'copy_numbers' then
    if _lead_ids is null or cardinality(_lead_ids) <> v_n then
      return jsonb_build_object('ok', false, 'error', 'lead_ids_required');
    end if;
    if exists (select 1 from unnest(_lead_ids) x(id) where x.id not in (select public.my_sales_lead_ids())) then
      perform public.record_denial(v_uid, 'copy_numbers', null, jsonb_build_object('rows', v_n));
      return jsonb_build_object('ok', false, 'error', 'not_your_leads');
    end if;
  end if;
  v_g := public.guard_action(v_uid, _kind, null, 0, v_n, 'log_data_access');
  if not coalesce((v_g ->> 'ok')::boolean, false) then
    -- The one refusal a salesperson can act on: too many in one go. Says the per-copy limit, never a cost.
    if v_g ->> 'reason' = 'too_many_rows' then
      return jsonb_build_object('ok', false, 'error', 'too_many_rows',
        'max_rows', (select (limits -> 'actions' -> _kind ->> 'max_rows')::int from public.protection_settings where id = 1));
    end if;
    return jsonb_build_object('ok', false, 'error', 'usage_paused', 'detail', 'Usage temporarily paused — contact Paul');
  end if;
  insert into public.security_events (actor_user_id, actor_role, kind, severity, action, detail)
  values (v_uid, v_role, 'data_export', 'info', _kind,
          jsonb_build_object('rows', v_n, 'filter',
            case when length(coalesce(_filter, '{}'::jsonb)::text) <= 2000 then coalesce(_filter, '{}'::jsonb)
                 else '"(filter too long to record)"'::jsonb end));
  return jsonb_build_object('ok', true);
end
$function$;
revoke all on function public.log_data_access(text, integer, uuid[], jsonb) from public, anon;
grant execute on function public.log_data_access(text, integer, uuid[], jsonb) to authenticated;

-- ── 6. The live SQL functions, with the guard. Each read back from the database on 2026-09-29. ──
-- 6a. claim_lead
CREATE OR REPLACE FUNCTION public.claim_lead(_lead_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text := public.my_role();
  v_uid uuid := auth.uid();
  v_lead record;
  v_owner text;
  v_g jsonb;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  select id, assigned_to_user_id, is_archived, amount_paid, status into v_lead
    from public.outreach_leads where id = _lead_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_lead.assigned_to_user_id = v_uid then return jsonb_build_object('ok', true, 'already_yours', true); end if;
  if v_lead.assigned_to_user_id is not null then
    select display_name into v_owner from public.team_members where user_id = v_lead.assigned_to_user_id;
    return jsonb_build_object('ok', false, 'error', 'already_owned', 'owner_name', v_owner);
  end if;
  if v_lead.is_archived is true then return jsonb_build_object('ok', false, 'error', 'archived'); end if;
  if public.lead_is_client(v_lead.amount_paid, v_lead.status) then return jsonb_build_object('ok', false, 'error', 'client'); end if;
  if public.lead_contact_attempt_at(_lead_id) is not null then return jsonb_build_object('ok', false, 'error', 'already_contacted'); end if;
  /* ⛔ ABUSE LIMIT (2026-09-29): claims per hour / per day (protection_settings.actions.claim), a
     suspended account, a warning at warn_day. Counted only for a claim that would succeed. */
  v_g := public.guard_action(v_uid, 'claim', _lead_id, 0, 1, 'claim_lead');
  if not coalesce((v_g ->> 'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'usage_paused', 'detail', 'Usage temporarily paused — contact Paul');
  end if;
  update public.outreach_leads set assigned_to_user_id = v_uid, assigned_at = now() where id = _lead_id;
  insert into public.lead_activity (lead_id, actor_user_id, kind) values (_lead_id, v_uid, 'lead_claimed');
  return jsonb_build_object('ok', true);
end
$function$;

-- 6b. _lead_identity_rows = the previous lead_identity_lookup body, unmasked, internal only.
CREATE OR REPLACE FUNCTION public._lead_identity_rows(_items jsonb)
 RETURNS TABLE(k text, lead_id uuid, state text, owner_id uuid, owner_name text, added_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  with it as (
    select x->>'k' as ik,
           nullif(btrim(x->>'place_id'), '') as pid,
           public.phone_key(x->>'phone') as pk,
           nullif(btrim(x->>'maps_url'), '') as mu
    from jsonb_array_elements(_items) x
  ), m as (
    select it.ik, coalesce(
      (select l.id from public.outreach_leads l where it.pid is not null and l.place_id = it.pid order by l.created_at limit 1),
      (select l.id from public.outreach_leads l where it.pk is not null and public.phone_key(l.phone) = it.pk order by l.created_at limit 1),
      (select l.id from public.outreach_leads l where it.mu is not null and l.google_maps_url = it.mu order by l.created_at limit 1)
    ) as lid
    from it
  )
  select m.ik, l.id,
         case
           when l.id is null then 'new'
           when l.assigned_to_user_id = v_uid then 'yours'
           when l.assigned_to_user_id is not null then 'owned'
           when l.is_archived is true or public.lead_is_client(l.amount_paid, l.status)
                or public.lead_contact_attempt_at(l.id) is not null then 'protected'
           else 'claimable'
         end,
         l.assigned_to_user_id, t.display_name, l.created_at
  from m
  left join public.outreach_leads l on l.id = m.lid
  left join public.team_members t on t.user_id = l.assigned_to_user_id;
end
$function$;

revoke all on function public._lead_identity_rows(jsonb) from public, anon, authenticated;

-- 6c. lead_identity_lookup: masked + guarded wrapper (VOLATILE now: it records the guard row).
CREATE OR REPLACE FUNCTION public.lead_identity_lookup(_items jsonb)
 RETURNS TABLE(k text, lead_id uuid, state text, owner_id uuid, owner_name text, added_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_role text := public.my_role();
  v_uid uuid := auth.uid();
  v_g jsonb;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  /* ⛔ 2026-09-29: a salesperson's lookup is rate-limited (actions.lead_lookup) and refused while
     suspended — answered as state 'paused' per item, never an exception (an exception would roll back
     the guard's own record of the refusal). */
  if v_role = 'sales' then
    v_g := public.guard_action(v_uid, 'lead_lookup', null, 0, 1, 'lead_identity_lookup');
    if not coalesce((v_g ->> 'ok')::boolean, false) then
      return query select x->>'k', null::uuid, 'paused'::text, null::uuid, null::text, null::timestamptz
        from jsonb_array_elements(case when jsonb_typeof(_items) = 'array' then _items else '[]'::jsonb end) x;
      return;
    end if;
  end if;
  /* ⛔ MASKED FOR SALES (2026-09-29): the internal lead id and owner id only for a lead the caller may act
     on — 'yours' (open it) and 'claimable' (claim it). An owned or protected (client / contacted /
     archived) lead answers its state and the owner's NAME only, so the lookup is no longer a key into
     another rep's or a client's record. The admin is unchanged. */
  return query
  select r.k,
         case when v_role = 'admin' or r.state in ('yours', 'claimable') then r.lead_id end,
         r.state,
         case when v_role = 'admin' or r.state = 'yours' then r.owner_id end,
         r.owner_name,
         r.added_at
  from public._lead_identity_rows(_items) r;
end
$function$;

revoke all on function public.lead_identity_lookup(jsonb) from public, anon;
grant execute on function public.lead_identity_lookup(jsonb) to authenticated;

-- 6d. sales_add_lead
CREATE OR REPLACE FUNCTION public.sales_add_lead(_lead jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_g jsonb;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if v_owner is null then return jsonb_build_object('ok', false, 'error', 'no_book_owner'); end if;
  /* ⛔ 2026-09-29: suspended → refused; adds per hour (actions.lead_add). */
  v_g := public.guard_action(v_uid, 'lead_add', null, 0, 1, 'sales_add_lead');
  if not coalesce((v_g ->> 'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'usage_paused', 'detail', 'Usage temporarily paused — contact Paul');
  end if;
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
  select * into v_hit from public._lead_identity_rows(jsonb_build_array(jsonb_build_object(
    'k', '1', 'place_id', v_pid, 'phone', _lead->>'phone', 'maps_url', v_mu)));
  if v_hit.lead_id is not null then
    return jsonb_build_object('ok', false, 'error', 'exists', 'state', v_hit.state,
                              'lead_id', case when v_hit.state in ('yours', 'claimable') then v_hit.lead_id end,
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

-- 6e. sales_queue_opener(uuid[], text)
CREATE OR REPLACE FUNCTION public.sales_queue_opener(_lead_ids uuid[], _template text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text := public.my_role();
  v_uid uuid := auth.uid();
  v_template text := btrim(coalesce(_template, ''));
  v_limit integer;
  v_today integer;
  v_room integer;
  v_id uuid;
  v_lead record;
  v_pk text;
  v_queued integer := 0;
  v_skip jsonb := '{}'::jsonb;
  v_reason text;
  v_g jsonb;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if v_template = '' then return jsonb_build_object('ok', false, 'error', 'template_required'); end if;
  if v_template not in ('initial_contact', 'initial_opener_v2') then return jsonb_build_object('ok', false, 'error', 'not_an_initial_opener'); end if;
  if _lead_ids is null or array_length(_lead_ids, 1) is null then return jsonb_build_object('ok', false, 'error', 'no_leads'); end if;
  if array_length(_lead_ids, 1) > 200 then return jsonb_build_object('ok', false, 'error', 'too_many'); end if;
  /* ⛔ 2026-09-29: a suspended salesperson queues nothing. Already-queued leads are left for the admin. */
  v_g := public.guard_action(v_uid, 'whatsapp_queue', null, 0, array_length(_lead_ids, 1), 'sales_queue_opener');
  if not coalesce((v_g ->> 'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'usage_paused', 'detail', 'Usage temporarily paused — contact Paul');
  end if;

  select daily_send_limit into v_limit from public.team_members where user_id = v_uid;
  if v_limit is not null then
    select count(*) into v_today from public.lead_activity
     where actor_user_id = v_uid and kind = 'bulk_queued'
       and created_at >= (date_trunc('day', now() at time zone 'Europe/London') at time zone 'Europe/London');
    v_room := greatest(v_limit - v_today, 0);
  end if;

  foreach v_id in array _lead_ids loop
    v_reason := null;
    select id, status, is_archived, amount_paid, phone, country, assigned_to_user_id into v_lead
      from public.outreach_leads where id = v_id for update;
    if not found then v_reason := 'not_found';
    elsif not public.can_work_lead(v_id) then v_reason := 'not_yours';
    elsif v_lead.is_archived is true then v_reason := 'archived';
    elsif public.lead_is_client(v_lead.amount_paid, v_lead.status) then v_reason := 'client';
    elsif coalesce(v_lead.status, '') <> 'not_contacted' then v_reason := 'not_new';
    elsif public.lead_first_contact_at(v_id) is not null then v_reason := 'already_contacted';
    else
      v_pk := public.phone_key(v_lead.phone);
      if v_pk is null then v_reason := 'no_phone';
      -- ⛔ A UK mobile exactly as before (UK/blank country, 07… key), OR an Indian mobile judged from the NUMBER
      -- (91 + 10 digits starting 6-9 — a +91 number keeps its code in phone_key). The stored country is not
      -- trusted for India: ~370 live rows were measured with the wrong one (2026-09-28). The refusal keeps its
      -- key so older clients still label it.
      elsif not ((coalesce(v_lead.country, 'UK') = 'UK' and v_pk ~ '^7[0-9]{9}$') or v_pk ~ '^91[6-9][0-9]{9}$') then v_reason := 'not_a_uk_mobile';
      elsif exists (select 1 from public.contact_suppressions s where public.phone_key(s.phone_e164) = v_pk) then v_reason := 'opted_out';
      elsif v_room is not null and v_queued >= v_room then v_reason := 'daily_limit';
      end if;
    end if;

    if v_reason is not null then
      v_skip := jsonb_set(v_skip, array[v_reason], to_jsonb(coalesce((v_skip ->> v_reason)::int, 0) + 1));
      continue;
    end if;

    update public.outreach_leads
       set status = 'queued', queued_at = now(), whatsapp_attempts = 0, whatsapp_template = v_template,
           previous_status = v_lead.status, contact_method = 'whatsapp'
     where id = v_id;
    insert into public.lead_activity (lead_id, actor_user_id, kind, data)
    values (v_id, v_uid, 'bulk_queued', jsonb_build_object('template', v_template));
    v_queued := v_queued + 1;
  end loop;

  return jsonb_build_object('ok', true, 'queued', v_queued, 'template', v_template, 'skipped', v_skip);
end $function$;


-- ── 7. sales_pool: no caller since 2026-09-28 (Available to claim reads the view) and it pages the
--       whole unassigned pool. Revoked, kept (a rollback re-grants it). ──
revoke execute on function public.sales_pool(text, integer, integer) from authenticated;

-- ── 8. The sales message policy: a phone match counts ONLY for a message that belongs to no lead —
--       exactly the media rule (20260927120000). A thread filed under another lead (a duplicate row, a
--       client) is that lead's, never the rep's. ──
drop policy if exists sales_select_messages on public.whatsapp_messages;
create policy sales_select_messages on public.whatsapp_messages for select to authenticated using (
  ((select public.my_role()) = 'sales') and (
    (lead_id in (select public.my_sales_lead_ids()))
    or (lead_id is null and phone in (select public.my_sales_message_phones()))
  )
);

-- ── 9. Alerts: the sweep emails pending events and raises the team / spike / Apify ones. ──
create or replace function public.security_sweep()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s public.protection_settings%rowtype;
  v_team numeric;
  v_hour numeric;
  v_day text := to_char(now() at time zone 'Europe/London', 'YYYY-MM-DD');
  v_hr text := to_char(now() at time zone 'Europe/London', 'YYYY-MM-DD"T"HH24');
  v_ap record;
  v_pct numeric;
  v_top jsonb;
begin
  select * into s from public.protection_settings where id = 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_settings'); end if;
  select coalesce(sum(estimated_cost_usd), 0),
         coalesce(sum(estimated_cost_usd) filter (where created_at > now() - interval '1 hour'), 0)
    into v_team, v_hour
    from public.api_usage_log where created_at > now() - interval '24 hours' and api_type is distinct from 'guard';
  select coalesce(jsonb_agg(x order by x.usd desc), '[]'::jsonb) into v_top from (
    select function_name as fn, round(sum(estimated_cost_usd), 2) as usd, count(*) as rows
      from public.api_usage_log where created_at > now() - interval '1 hour' and api_type is distinct from 'guard'
     group by function_name order by sum(estimated_cost_usd) desc limit 5) x;

  if v_team >= (s.limits ->> 'team_day_cap_usd')::numeric then
    insert into public.security_events (kind, severity, detail, alert_key, alert_wanted)
    values ('team_spend_cap', 'critical', jsonb_build_object('team_24h_usd', round(v_team, 2), 'top_last_hour', v_top),
            'system:team_spend_cap:' || v_day, true)
    on conflict (alert_key) do update set occurrences = public.security_events.occurrences + 1, last_at = now(), detail = excluded.detail;
  elsif v_team >= (s.limits ->> 'team_day_warn_usd')::numeric then
    insert into public.security_events (kind, severity, detail, alert_key, alert_wanted)
    values ('team_spend_warning', 'warning', jsonb_build_object('team_24h_usd', round(v_team, 2), 'top_last_hour', v_top),
            'system:team_spend_warning:' || v_day, true)
    on conflict (alert_key) do update set occurrences = public.security_events.occurrences + 1, last_at = now(), detail = excluded.detail;
  end if;
  if v_hour >= (s.limits ->> 'team_hour_warn_usd')::numeric then
    insert into public.security_events (kind, severity, detail, alert_key, alert_wanted)
    values ('spend_spike', 'warning', jsonb_build_object('team_last_hour_usd', round(v_hour, 2), 'top_last_hour', v_top),
            'system:spend_spike:' || v_hr, true)
    on conflict (alert_key) do update set occurrences = public.security_events.occurrences + 1, last_at = now(), detail = excluded.detail;
  end if;
  -- Apify: the percentage is RECOMPUTED from used / cap, never the stored usage_pct (CLAUDE.md §4).
  select monthly_usage_usd, max_monthly_usage_usd, captured_at into v_ap
    from public.apify_account_usage order by captured_at desc limit 1;
  if found and coalesce(v_ap.max_monthly_usage_usd, 0) > 0 then
    v_pct := round(100 * v_ap.monthly_usage_usd / v_ap.max_monthly_usage_usd, 1);
    if v_pct >= (s.limits ->> 'apify_warn_pct')::numeric then
      insert into public.security_events (kind, severity, detail, alert_key, alert_wanted)
      values ('apify_near_cap', 'critical', jsonb_build_object('used_usd', v_ap.monthly_usage_usd, 'cap_usd', v_ap.max_monthly_usage_usd,
              'pct', v_pct, 'captured_at', v_ap.captured_at), 'system:apify_near_cap:' || v_day, true)
      on conflict (alert_key) do update set occurrences = public.security_events.occurrences + 1, last_at = now(), detail = excluded.detail;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'team_24h_usd', round(v_team, 2), 'team_1h_usd', round(v_hour, 2),
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'created_at', e.created_at, 'last_at', e.last_at, 'kind', e.kind, 'severity', e.severity,
        'action', e.action, 'occurrences', e.occurrences, 'detail', e.detail, 'actor_role', e.actor_role,
        'actor_name', t.display_name, 'actor_email', u.email, 'lead_id', e.lead_id) order by e.created_at)
      from (select * from public.security_events where alert_wanted and alerted_at is null order by created_at limit 50) e
      left join public.team_members t on t.user_id = e.actor_user_id
      left join auth.users u on u.id = e.actor_user_id), '[]'::jsonb));
end
$function$;
revoke all on function public.security_sweep() from public, anon, authenticated;
grant execute on function public.security_sweep() to service_role;

/* The admin screen's one read. Service role only: security-admin checks the admin first. */
create or replace function public.security_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_since timestamptz := (date_trunc('day', now() at time zone 'Europe/London') at time zone 'Europe/London');
  s public.protection_settings%rowtype;
  v jsonb;
begin
  select * into s from public.protection_settings where id = 1;
  select jsonb_build_object(
    'mode', s.mode, 'limits', s.limits, 'overrides', s.overrides, 'settings_updated_at', s.updated_at,
    'today_since', v_since,
    'today_total_usd', (select round(coalesce(sum(estimated_cost_usd), 0), 2) from public.api_usage_log
                         where created_at >= v_since and api_type is distinct from 'guard'),
    'team_24h_usd', (select round(coalesce(sum(estimated_cost_usd), 0), 2) from public.api_usage_log
                      where created_at > now() - interval '24 hours' and api_type is distinct from 'guard'),
    'team_1h_usd', (select round(coalesce(sum(estimated_cost_usd), 0), 2) from public.api_usage_log
                     where created_at > now() - interval '1 hour' and api_type is distinct from 'guard'),
    'by_provider', coalesce((select jsonb_agg(p order by p.usd desc) from (
        select public.usage_provider(function_name, api_type) as provider, round(sum(estimated_cost_usd), 2) as usd, count(*) as rows
          from public.api_usage_log where created_at >= v_since and api_type is distinct from 'guard'
         group by 1) p), '[]'::jsonb),
    'by_user', coalesce((select jsonb_agg(x order by x.usd desc) from (
        select l.user_id, t.display_name as name, max(l.actor_role) as role,
               round(coalesce(sum(l.estimated_cost_usd), 0), 2) as usd,
               round(coalesce(sum(l.estimated_cost_usd) filter (where l.api_type = 'guard'), 0), 2) as estimated_usd,
               count(*) filter (where l.api_type = 'guard' and l.outcome = 'refused') as refused
          from public.api_usage_log l left join public.team_members t on t.user_id = l.user_id
         where l.created_at >= v_since group by l.user_id, t.display_name) x), '[]'::jsonb),
    'by_action', coalesce((select jsonb_agg(x order by x.name, x.action) from (
        select l.user_id, t.display_name as name, l.action,
               count(*) filter (where l.outcome = 'allowed') as allowed,
               count(*) filter (where l.outcome = 'warned') as warned,
               count(*) filter (where l.outcome = 'refused') as refused,
               sum(l.calls_made) filter (where l.outcome <> 'refused') as units
          from public.api_usage_log l left join public.team_members t on t.user_id = l.user_id
         where l.created_at >= v_since and l.api_type = 'guard' group by l.user_id, t.display_name, l.action) x), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(x order by x.last_at desc) from (
        select e.id, e.created_at, e.last_at, e.kind, e.severity, e.action, e.occurrences, e.detail, e.alerted_at,
               e.actor_user_id, e.actor_role, t.display_name as name
          from public.security_events e left join public.team_members t on t.user_id = e.actor_user_id
         where e.last_at > now() - interval '7 days' and e.kind <> 'denied'
         order by e.last_at desc limit 60) x), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select l.created_at, l.user_id, t.display_name as name, l.action, l.outcome, l.reason, l.calls_made as units,
               round(l.estimated_cost_usd, 4) as est_usd
          from public.api_usage_log l left join public.team_members t on t.user_id = l.user_id
         where l.api_type = 'guard' order by l.created_at desc limit 40) x), '[]'::jsonb),
    'restricted_now', coalesce((select jsonb_agg(distinct jsonb_build_object('user_id', l.user_id, 'name', t.display_name, 'reason', l.reason))
          from public.api_usage_log l left join public.team_members t on t.user_id = l.user_id
         where l.api_type = 'guard' and l.outcome = 'refused' and l.reason in ('spend_cap', 'rate_limit', 'team_cap', 'too_many_rows')
           and l.created_at > now() - interval '1 hour'), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(x order by x.name) from (
        select t.user_id, t.display_name as name, t.status, t.suspended_at, r.role,
               (select count(*) from public.outreach_leads o where o.assigned_to_user_id = t.user_id and o.status = 'queued') as queued_leads
          from public.team_members t
          left join lateral (select case when bool_or(role::text = 'admin') then 'admin' when bool_or(role::text = 'sales') then 'sales' end as role
                               from public.user_roles ur where ur.user_id = t.user_id) r on true
         where not t.is_book_owner) x), '[]'::jsonb),
    'denied_24h', (select count(*) from public.security_events where kind = 'denied' and created_at > now() - interval '24 hours'),
    'apify', (select jsonb_build_object('used_usd', monthly_usage_usd, 'cap_usd', max_monthly_usage_usd,
                     'pct', case when coalesce(max_monthly_usage_usd, 0) > 0 then round(100 * monthly_usage_usd / max_monthly_usage_usd, 1) end,
                     'captured_at', captured_at)
                from public.apify_account_usage order by captured_at desc limit 1)
  ) into v;
  return v;
end
$function$;
revoke all on function public.security_overview() from public, anon, authenticated;
grant execute on function public.security_overview() to service_role;

-- The pg_cron invoker (same shape as invoke_crawl_worker) — every 5 minutes, anon never.
create or replace function public.invoke_security_sweep()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_service_key text; v_anon_key text; v_cron_secret text;
begin
  select decrypted_secret into v_service_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
  select decrypted_secret into v_anon_key    from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY'         limit 1;
  select decrypted_secret into v_cron_secret from vault.decrypted_secrets where name = 'CRON_SECRET'               limit 1;
  perform net.http_post(
    url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/security-admin',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_service_key, ''),
      'apikey', coalesce(v_anon_key, ''),
      'x-internal-job', '1',
      'x-cron-secret', coalesce(v_cron_secret, '')
    ),
    body := jsonb_build_object('action', 'sweep', 'triggered_by', 'pg_cron')
  );
end; $function$;
revoke all on function public.invoke_security_sweep() from public, anon, authenticated;
-- The schedule is applied LAST, after security-admin is deployed (a cron firing at a missing function is noise):
-- select cron.schedule('security-sweep-run', '*/5 * * * *', 'select public.invoke_security_sweep()');
