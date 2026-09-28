-- Abuse protection follow-up (2026-09-29, found in live QA): a suspended account's refused attempts raise ONE
-- alert per person per day instead of one per action. guard_action is the live definition read back, one
-- expression changed (scripted, asserted). Nothing else changes.
set local lock_timeout = '5s';
CREATE OR REPLACE FUNCTION public.guard_action(_actor uuid, _action text, _lead uuid DEFAULT NULL::uuid, _est_cost numeric DEFAULT 0, _units integer DEFAULT 1, _fn text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
            -- A SUSPENDED account's attempts are one alert per person per day, whatever they try (2026-09-29, live QA:
            -- one per action was ten lines in one email). Everything else stays per action.
            _actor::text || ':' || coalesce(v_reason, v_warn) || ':' || case when v_reason = 'suspended' then 'any' else _action end || ':' || v_day,
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
