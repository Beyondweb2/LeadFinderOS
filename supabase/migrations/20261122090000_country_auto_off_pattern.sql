-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- COUNTRY AUTO-OFF ONLY ON A REAL PATTERN (2026-10-22, fix/country-auto-off, docs/country-auto-off.md).
--
-- 22 Oct: Australia switched itself off twice on ONE failed send each (1 of its first 2, then 1 of its first 5). Both were
-- numbers not on WhatsApp — the delivery-report webhook (held, live v114) routed each lead to no_whatsapp, which it does only
-- for Meta 131026, but it stores no error code, so the old trial rule ("any failure in the first 5 except 131026") saw a
-- failure with no code and stopped the whole country. One number that is not on WhatsApp is normal.
--
--   1. outreach_country_settings: three settings for the rule (NULL = the default, like every other column here) and when /
--      by whom WhatsApp was last switched off.
--   2. country_whatsapp_on_since (the trigger): stamps whatsapp_off_at / whatsapp_off_by on every switch-off (a person's
--      auth.uid(), or NULL when the database switched it off); clears them on switch-on.
--   3. set_outreach_country: accepts the three settings (admin only, ranges checked).
--   4. country_whatsapp_auto_pause: THE NEW RULE (mirrored in src/lib/countryAutoPause.ts). Counted on real sends to the
--      country since it was last switched on:
--        • PATTERN — at least whatsapp_auto_off_min_fails (5) failures AND at least whatsapp_auto_off_fail_pct (50) % of the
--          last whatsapp_auto_off_window (10) sends failed. One failed number only flags that lead (unchanged routing).
--        • SYSTEMIC — any failed send in that window with a Meta code that is about OUR account or template, never one
--          number (login / permission, account restricted or rated down, country blocked, template missing / paused /
--          disabled / against policy). One is enough.
--      Everything else is the live definition (read back 2026-10-22): same counting, same "only ever switches OFF", same
--      three countries, same log row.
-- The trigger whatsapp_failure_country_check, whatsapp_my_sg_no_auto_retry and the UK queue auto-pause are NOT changed.
-- Applies alone: no code depends on the new columns being present (absent = the defaults; the screen shows no time).
-- Rollback: re-create country_whatsapp_auto_pause / country_whatsapp_on_since / set_outreach_country from
--   20261120090000 / 20261029090000; the new columns can stay (nothing else reads them).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '5s';

-- ── 1. settings ────────────────────────────────────────────────────────────────────────────────
alter table public.outreach_country_settings add column if not exists whatsapp_auto_off_min_fails integer;
alter table public.outreach_country_settings add column if not exists whatsapp_auto_off_window integer;
alter table public.outreach_country_settings add column if not exists whatsapp_auto_off_fail_pct integer;
alter table public.outreach_country_settings add column if not exists whatsapp_off_at timestamptz;
alter table public.outreach_country_settings add column if not exists whatsapp_off_by uuid;
comment on column public.outreach_country_settings.whatsapp_auto_off_min_fails is 'Auto switch-off: at least this many failed sends (NULL = 5).';
comment on column public.outreach_country_settings.whatsapp_auto_off_window is 'Auto switch-off: counted over the last this-many sends (NULL = 10).';
comment on column public.outreach_country_settings.whatsapp_auto_off_fail_pct is 'Auto switch-off: and at least this % of them failed (NULL = 50).';
comment on column public.outreach_country_settings.whatsapp_off_at is 'When WhatsApp was last switched off (by a person or automatically); NULL while on.';
comment on column public.outreach_country_settings.whatsapp_off_by is 'Who switched it off (auth.uid()); NULL = switched off automatically, or not known.';

-- What is already off: Australia's automatic switch-off time is known.
update public.outreach_country_settings
   set whatsapp_off_at = whatsapp_auto_paused_at
 where whatsapp_on is not true and whatsapp_off_at is null and whatsapp_auto_paused_at is not null;

-- ── 2. the switch trigger ──────────────────────────────────────────────────────────────────────
create or replace function public.country_whatsapp_on_since()
returns trigger language plpgsql as $function$
begin
  if new.whatsapp_on and not coalesce(old.whatsapp_on, false) then
    new.whatsapp_on_since := now();
    new.whatsapp_auto_paused_at := null;
    new.whatsapp_auto_pause_reason := null;
    -- 2026-10-22: on again → no "off since".
    new.whatsapp_off_at := null;
    new.whatsapp_off_by := null;
  end if;
  -- 2026-10-22: every switch-off is stamped (who: a person, or NULL = the database's automatic switch-off).
  if coalesce(old.whatsapp_on, false) and not coalesce(new.whatsapp_on, false) then
    new.whatsapp_off_at := now();
    -- The automatic switch-off stamps its own time in the same update: never credit it to whoever's write set it off.
    new.whatsapp_off_by := case when new.whatsapp_auto_paused_at is not null
                                 and new.whatsapp_auto_paused_at is distinct from old.whatsapp_auto_paused_at
                                then null else auth.uid() end;
  end if;
  return new;
end $function$;

-- ── 3. set_outreach_country: the three settings ────────────────────────────────────────────────
create or replace function public.set_outreach_country(_country text, _patch jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare k text; v jsonb; n integer;
begin
  if public.my_role() is distinct from 'admin' then raise exception 'admin_only' using errcode = '42501'; end if;
  -- 2026-10-22: AU accepted.
  if _country not in ('UK', 'MY', 'SG', 'AU') then return jsonb_build_object('ok', false, 'error', 'unknown_country'); end if;
  if _patch is null or jsonb_typeof(_patch) <> 'object' then return jsonb_build_object('ok', false, 'error', 'bad_patch'); end if;
  insert into public.outreach_country_settings (country) values (_country) on conflict (country) do nothing;
  for k, v in select * from jsonb_each(_patch) loop
    if k in ('whatsapp_on', 'sms_on', 'call_on') then
      if jsonb_typeof(v) <> 'boolean' then return jsonb_build_object('ok', false, 'error', k || '_not_boolean'); end if;
      -- 2026-10-22: Australia is WhatsApp only (prospect-only; texts to +61 stay refused).
      if _country = 'AU' and k in ('sms_on', 'call_on') and (v #>> '{}')::boolean then
        return jsonb_build_object('ok', false, 'error', 'whatsapp_only');
      end if;
      execute format('update public.outreach_country_settings set %I = $1 where country = $2', k) using (v #>> '{}')::boolean, _country;
    elsif k in ('whatsapp_daily_cap', 'sms_daily_cap', 'send_start_min', 'send_end_min') then
      if jsonb_typeof(v) = 'null' then n := null;
      elsif jsonb_typeof(v) = 'number' and (v #>> '{}') ~ '^[0-9]+$' then n := (v #>> '{}')::integer;
      else return jsonb_build_object('ok', false, 'error', k || '_out_of_range'); end if;
      if n is not null and (n < 0 or n > case when k like '%_cap' then 1000 else 1440 end) then
        return jsonb_build_object('ok', false, 'error', k || '_out_of_range');
      end if;
      execute format('update public.outreach_country_settings set %I = $1 where country = $2', k) using n, _country;
    -- 2026-10-22: the auto switch-off settings (NULL = the default). 1-100 each.
    elsif k in ('whatsapp_auto_off_min_fails', 'whatsapp_auto_off_window', 'whatsapp_auto_off_fail_pct') then
      if jsonb_typeof(v) = 'null' then n := null;
      elsif jsonb_typeof(v) = 'number' and (v #>> '{}') ~ '^[0-9]+$' then n := (v #>> '{}')::integer;
      else return jsonb_build_object('ok', false, 'error', k || '_out_of_range'); end if;
      if n is not null and (n < 1 or n > 100) then
        return jsonb_build_object('ok', false, 'error', k || '_out_of_range');
      end if;
      execute format('update public.outreach_country_settings set %I = $1 where country = $2', k) using n, _country;
    else
      return jsonb_build_object('ok', false, 'error', 'unknown_field', 'field', k);
    end if;
  end loop;
  update public.outreach_country_settings set updated_at = now(), updated_by = auth.uid() where country = _country;
  if exists (select 1 from public.outreach_country_settings where country = _country
              and send_start_min is not null and send_end_min is not null and send_start_min >= send_end_min) then
    raise exception 'send_hours_inverted' using errcode = '22023';
  end if;
  -- 2026-10-22: a failure count above the window could never be reached.
  if exists (select 1 from public.outreach_country_settings where country = _country
              and coalesce(whatsapp_auto_off_min_fails, 5) > coalesce(whatsapp_auto_off_window, 10)) then
    raise exception 'auto_off_fails_above_window' using errcode = '22023';
  end if;
  return jsonb_build_object('ok', true, 'setting', (select to_jsonb(s) from public.outreach_country_settings s where s.country = _country));
end
$function$;
revoke execute on function public.set_outreach_country(text, jsonb) from public, anon;
grant execute on function public.set_outreach_country(text, jsonb) to authenticated;

-- ── 4. THE RULE ────────────────────────────────────────────────────────────────────────────────
create or replace function public.country_whatsapp_auto_pause(_market text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  s record;
  v_since timestamptz;
  v_min_fails integer;
  v_window integer;
  v_pct integer;
  v_total integer;
  v_failed integer;
  v_all integer;
  v_code integer;
  v_sys_code integer;
  v_reason text;
  -- Meta codes about OUR account or template, never one number (src/lib/countryAutoPause.ts COUNTRY_SYSTEMIC_CODES).
  v_systemic integer[] := array[0, 3, 10, 190, 200, 368, 130497, 131031, 131042, 131045, 131048, 131057, 131063, 131064,
                                132001, 132007, 132015, 132016, 133010];
  v_name text := case _market when 'MY' then 'Malaysia' when 'SG' then 'Singapore' when 'AU' then 'Australia' end;
begin
  if _market is null or _market not in ('MY', 'SG', 'AU') then return null; end if;
  select * into s from public.outreach_country_settings where country = _market for update;
  if not found or not s.whatsapp_on then return null; end if;
  v_since := coalesce(s.whatsapp_on_since, s.updated_at);
  v_min_fails := coalesce(s.whatsapp_auto_off_min_fails, 5);
  v_window := coalesce(s.whatsapp_auto_off_window, 10);
  v_pct := coalesce(s.whatsapp_auto_off_fail_pct, 50);
  with sends as (
    select coalesce(ws.message_id, 'send:' || ws.id::text) as k, ws.created_at as at,
           (ws.delivery_status in ('failed', 'failed_temporary')) as failed, ws.error_code as code
      from public.whatsapp_sends ws
     where ws.created_at >= v_since and ws.test_mode is not true
       and coalesce(ws.delivery_status, '') <> 'simulated'
       and public.mobile_market(null, public.phone_key(ws.phone)) = _market
    union all
    select m.wa_message_id, m.created_at, (m.status = 'failed'), m.error_code
      from public.whatsapp_messages m
     where m.direction = 'outbound' and m.wa_message_id is not null
       and m.created_at >= v_since and m.test_mode is not true
       and coalesce(m.status, '') <> 'simulated'
       and public.mobile_market(null, public.phone_key(m.phone)) = _market
  ), per as (
    select k, min(at) as at, bool_or(failed) as failed, max(code) as code from sends group by k
  ), lastn as (
    select * from per order by at desc limit v_window
  )
  select count(*), count(*) filter (where failed),
         (array_agg(code order by at desc) filter (where failed and code is not null))[1],
         (array_agg(code order by at desc) filter (where failed and code = any(v_systemic)))[1],
         (select count(*) from per)
    into v_total, v_failed, v_code, v_sys_code, v_all from lastn;

  if v_sys_code is null and not (v_failed >= v_min_fails and v_failed * 100 >= v_pct * v_total) then
    return jsonb_build_object('market', _market, 'sends', v_all, 'failed', v_failed, 'switched_off', false);
  end if;

  if v_sys_code is not null then
    v_reason := format('WhatsApp to %s switched itself off: a send failed with Meta error %s, which is about our WhatsApp account or template, not one number. Check the failed sends before switching it back on.',
                       v_name, v_sys_code);
  else
    v_reason := format('WhatsApp to %s switched itself off: %s of its last %s sends failed%s. Check the failed sends before switching it back on.',
                       v_name, v_failed, v_total,
                       case when v_code is not null then format(' (latest Meta error %s)', v_code) else ' (Meta gave no error code)' end);
  end if;
  update public.outreach_country_settings
     set whatsapp_on = false, whatsapp_auto_paused_at = now(), whatsapp_auto_pause_reason = v_reason,
         updated_at = now(), updated_by = null
   where country = _market;
  insert into public.whatsapp_queue_pause_log (scope, action, source, by_user_id, reason)
  values (_market, 'switched_off', 'auto', null, v_reason);
  return jsonb_build_object('market', _market, 'sends', v_total, 'failed', v_failed, 'switched_off', true, 'reason', v_reason);
end $function$;
revoke execute on function public.country_whatsapp_auto_pause(text) from public, anon, authenticated;

-- Read back:
--   select country, whatsapp_on, whatsapp_off_at, whatsapp_off_by, whatsapp_auto_off_min_fails, whatsapp_auto_off_window,
--          whatsapp_auto_off_fail_pct from public.outreach_country_settings;
--   select pg_get_functiondef('public.country_whatsapp_auto_pause(text)'::regprocedure) ~ 'v_systemic';
