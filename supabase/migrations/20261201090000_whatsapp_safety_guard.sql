-- ⛔ THE COLD WHATSAPP GUARD (2026-11-02, docs/whatsapp-safety-guard.md; the rule: src/lib/whatsappColdGuard.ts).
--   1. whatsapp_outreach_state: cold_gap_until (the 1-2 minute gap, one conditional write), cold_stop_at / cold_stop_reason (the
--      tripwire, latched until a person clears it), meta_number_status / meta_can_send (what the watcher reads from Meta).
--   2. outreach_country_settings: whatsapp_cooldown_until / _started_at / _reason. A cool-down does NOT touch whatsapp_on: the
--      switch stays the person's, leads can still be queued, and an in-window reply is never affected.
--   3. whatsapp_queue_pause_log: the new actions, and the health log's new kinds.
--   4. country_whatsapp_start_cooldown: the one writer of a cool-down (service role only).
--   5. country_whatsapp_auto_pause: the SAME pattern, but it starts a cool-down instead of switching the country off for good, and
--      counts only sends since the last cool-down ended (or the old failures would start another one the moment it ended).
--   6. set_outreach_country: takes whatsapp_cooldown_clear (the manual override, recorded with who).
--   7. trg_country_switch_logged: every on/off a PERSON makes to a country's WhatsApp, SMS or calls goes in the pause log (who, when).
-- Additive and idempotent. Singapore is untouched: its old automatic switch-off stays as it is until a person switches it on.
-- Rollback: re-create country_whatsapp_auto_pause and set_outreach_country from 20261124090000 / 20261122090000 and drop the trigger.

alter table public.whatsapp_outreach_state add column if not exists cold_gap_until timestamptz;
alter table public.whatsapp_outreach_state add column if not exists cold_stop_at timestamptz;
alter table public.whatsapp_outreach_state add column if not exists cold_stop_reason text;
alter table public.whatsapp_outreach_state add column if not exists meta_number_status text;
alter table public.whatsapp_outreach_state add column if not exists meta_can_send text;

alter table public.outreach_country_settings add column if not exists whatsapp_cooldown_until timestamptz;
alter table public.outreach_country_settings add column if not exists whatsapp_cooldown_started_at timestamptz;
alter table public.outreach_country_settings add column if not exists whatsapp_cooldown_reason text;

alter table public.whatsapp_queue_pause_log drop constraint if exists whatsapp_queue_pause_log_action_check;
alter table public.whatsapp_queue_pause_log add constraint whatsapp_queue_pause_log_action_check
  check (action in ('paused', 'resumed', 'switched_off', 'switched_on', 'cooldown_started', 'cooldown_cleared', 'cold_stopped', 'cold_resumed'));

alter table public.whatsapp_number_health_log drop constraint if exists whatsapp_number_health_log_kind_check;
alter table public.whatsapp_number_health_log add constraint whatsapp_number_health_log_kind_check
  check (kind in ('rating_changed', 'tier_changed', 'read_failed', 'read_recovered', 'paused_red', 'cap_rise_refused', 'status_changed', 'cold_stopped'));

create or replace function public.country_whatsapp_start_cooldown(_market text, _reason text, _hours integer)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare s record;
begin
  if _market is null or _market not in ('UK', 'MY', 'SG', 'AU') then return false; end if;
  if _hours is null or _hours < 1 or _hours > 168 then return false; end if;
  select * into s from public.outreach_country_settings where country = _market for update;
  if not found then return false; end if;
  if s.whatsapp_cooldown_until is not null and s.whatsapp_cooldown_until > now() then return false; end if;
  update public.outreach_country_settings
     set whatsapp_cooldown_started_at = now(), whatsapp_cooldown_until = now() + make_interval(hours => _hours),
         whatsapp_cooldown_reason = _reason, updated_at = now(), updated_by = null
   where country = _market;
  insert into public.whatsapp_queue_pause_log (scope, action, source, by_user_id, reason)
  values (_market, 'cooldown_started', 'auto', null, _reason);
  return true;
end
$function$;
revoke execute on function public.country_whatsapp_start_cooldown(text, text, integer) from public, anon, authenticated;
grant execute on function public.country_whatsapp_start_cooldown(text, text, integer) to service_role;

-- THE SAME COUNTING AS 20261124090000 (mirror: src/lib/countryAutoPause.ts). What changed: the period starts at the end of the last
-- cool-down, a country already resting is left alone, and the action is a 24-hour cool-down rather than whatsapp_on = false.
create or replace function public.country_whatsapp_auto_pause(_market text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  v_skipped integer;
  v_reason text;
  -- Meta codes about OUR account or template, never one number (src/lib/countryAutoPause.ts COUNTRY_SYSTEMIC_CODES).
  v_systemic integer[] := array[0, 3, 10, 190, 200, 368, 130497, 131031, 131042, 131045, 131048, 131057, 131063, 131064,
                                132001, 132007, 132015, 132016, 133010];
  v_name text := case _market when 'MY' then 'Malaysia' when 'SG' then 'Singapore' when 'AU' then 'Australia' end;
begin
  if _market is null or _market not in ('MY', 'SG', 'AU') then return null; end if;
  select * into s from public.outreach_country_settings where country = _market;
  if not found or not s.whatsapp_on then return null; end if;
  if s.whatsapp_cooldown_until is not null and s.whatsapp_cooldown_until > now() then return null; end if;
  v_since := greatest(coalesce(s.whatsapp_on_since, s.updated_at), s.whatsapp_cooldown_until);
  v_min_fails := coalesce(s.whatsapp_auto_off_min_fails, 5);
  v_window := coalesce(s.whatsapp_auto_off_window, 10);
  v_pct := coalesce(s.whatsapp_auto_off_fail_pct, 50);
  with sends as (
    select coalesce(ws.message_id, 'send:' || ws.id::text) as k, ws.created_at as at,
           (ws.delivery_status in ('failed', 'failed_temporary')) as failed, ws.error_code as code,
           ws.lead_id, ws.message_id as wamid
      from public.whatsapp_sends ws
     where ws.created_at >= v_since and ws.test_mode is not true
       and coalesce(ws.delivery_status, '') <> 'simulated'
       and public.mobile_market(null, public.phone_key(ws.phone)) = _market
    union all
    select m.wa_message_id, m.created_at, (m.status = 'failed'), m.error_code, m.lead_id, m.wa_message_id
      from public.whatsapp_messages m
     where m.direction = 'outbound' and m.wa_message_id is not null
       and m.created_at >= v_since and m.test_mode is not true
       and coalesce(m.status, '') <> 'simulated'
       and public.mobile_market(null, public.phone_key(m.phone)) = _market
  ), per as (
    select k, min(at) as at, bool_or(failed) as failed, max(code) as code, max(lead_id::text)::uuid as lead_id, max(wamid) as wamid
      from sends group by k
  ), judged as (
    select p.*,
           -- 2026-10-22: the number is not on WhatsApp — Meta 131026, or the lead is flagged No WhatsApp.
           -- ⛔ coalesce(…, false): a NULL code or a missing lead must read as "no", never drop the row (NULL is not false).
           coalesce(p.failed and (p.code = 131026 or l.status = 'no_whatsapp' or l.whatsapp_delivery_status = 'no_whatsapp'), false) as not_on_wa,
           -- 2026-10-22: the webhook has not patched the lead yet (this is the lead's current message, no failure on it).
           coalesce(p.failed and p.code is null and p.wamid is not null and l.whatsapp_message_id = p.wamid
              and coalesce(l.whatsapp_delivery_status, '') not in ('failed', 'failed_temporary', 'no_whatsapp')
              and coalesce(l.status, '') not in ('no_whatsapp', 'whatsapp_failed'), false) as unsettled
      from per p left join public.outreach_leads l on l.id = p.lead_id
  ), counted as (
    select * from judged where not not_on_wa and not unsettled
  ), lastn as (
    select * from counted order by at desc limit v_window
  )
  select count(*), count(*) filter (where failed),
         (array_agg(code order by at desc) filter (where failed and code is not null))[1],
         (array_agg(code order by at desc) filter (where failed and code = any(v_systemic)))[1],
         (select count(*) from per),
         (select count(*) from judged where not_on_wa or unsettled)
    into v_total, v_failed, v_code, v_sys_code, v_all, v_skipped from lastn;

  if v_sys_code is null and not (v_failed >= v_min_fails and v_failed * 100 >= v_pct * v_total) then
    return jsonb_build_object('market', _market, 'sends', v_all, 'counted', v_total, 'failed', v_failed,
                              'not_counted', v_skipped, 'cooling_down', false);
  end if;

  if v_sys_code is not null then
    v_reason := format('A send failed with Meta error %s, which is about our WhatsApp account or template, not one number. %s rests 24 hours, then tries 3 sends by itself.',
                       v_sys_code, v_name);
  else
    v_reason := format('%s of its last %s sends failed for a reason other than the number not being on WhatsApp%s. %s rests 24 hours, then tries 3 sends by itself.',
                       v_failed, v_total,
                       case when v_code is not null then format(' (latest Meta error %s)', v_code) else ' (Meta gave no error code)' end,
                       v_name);
  end if;
  perform public.country_whatsapp_start_cooldown(_market, v_reason, 24);
  return jsonb_build_object('market', _market, 'sends', v_total, 'failed', v_failed, 'not_counted', v_skipped,
                            'cooling_down', true, 'reason', v_reason);
end
$function$;
revoke execute on function public.country_whatsapp_auto_pause(text) from public, anon, authenticated;

create or replace function public.set_outreach_country(_country text, _patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    -- 2026-11-02: the manual override of a cool-down. The rest ends now, so the probe starts now. Recorded with who.
    elsif k = 'whatsapp_cooldown_clear' then
      if v is distinct from 'true'::jsonb then return jsonb_build_object('ok', false, 'error', 'whatsapp_cooldown_clear_not_true'); end if;
      if exists (select 1 from public.outreach_country_settings where country = _country and whatsapp_cooldown_until > now()) then
        update public.outreach_country_settings set whatsapp_cooldown_until = now(), whatsapp_cooldown_reason = null where country = _country;
        insert into public.whatsapp_queue_pause_log (scope, action, source, by_user_id, reason)
        values (_country, 'cooldown_cleared', 'person', auth.uid(), 'Restarted by hand before the cool-down ended.');
      end if;
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

-- WHO SWITCHED WHAT, WHEN. auth.uid() is only there for a person's request, so a system write is never logged as a person.
create or replace function public.country_switch_logged()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_who uuid := auth.uid();
begin
  if v_who is null then return new; end if;
  if new.whatsapp_on is distinct from old.whatsapp_on then
    insert into public.whatsapp_queue_pause_log (scope, action, source, by_user_id, reason)
    values (new.country, case when new.whatsapp_on then 'switched_on' else 'switched_off' end, 'person', v_who, 'WhatsApp');
  end if;
  if new.sms_on is distinct from old.sms_on then
    insert into public.whatsapp_queue_pause_log (scope, action, source, by_user_id, reason)
    values (new.country, case when new.sms_on then 'switched_on' else 'switched_off' end, 'person', v_who, 'SMS');
  end if;
  if new.call_on is distinct from old.call_on then
    insert into public.whatsapp_queue_pause_log (scope, action, source, by_user_id, reason)
    values (new.country, case when new.call_on then 'switched_on' else 'switched_off' end, 'person', v_who, 'Browser calls');
  end if;
  return new;
end
$function$;
revoke execute on function public.country_switch_logged() from public, anon, authenticated;
drop trigger if exists trg_country_switch_logged on public.outreach_country_settings;
create trigger trg_country_switch_logged
  after update of whatsapp_on, sms_on, call_on on public.outreach_country_settings
  for each row execute function public.country_switch_logged();

-- Read back:
--   select pg_get_functiondef('public.country_whatsapp_auto_pause(text)'::regprocedure) ~ 'country_whatsapp_start_cooldown';
--   select tgname from pg_trigger where tgname = 'trg_country_switch_logged';
