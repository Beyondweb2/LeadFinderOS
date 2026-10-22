-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- AUSTRALIA AS A WHATSAPP MARKET (2026-10-22, feat/australia-whatsapp, docs/australia-whatsapp.md).
--
-- Australia is set up like Malaysia: its own switch (ON), its own daily cap (100), the same automatic switch-off after early
-- failures and the same "never retried automatically". Two differences:
--   · WHATSAPP ONLY. Texts and browser calls to Australia are never on: outreach_channel_on answers false for them whatever
--     is stored, and set_outreach_country refuses to switch them on (prospect-only; SMS to +61 stays refused).
--   · Its send hours (09:00-17:00, Mon-Fri) are read in each LEAD's zone, from its state — that is code
--     (src/lib/auLeadZone.ts, the queue and the Inbox); the database only knows the hours and the cap.
--
--   1. outreach_country_settings: 'AU' allowed; the AU row (WhatsApp on, SMS / calls off, cap 100, 540-1020, the cap's day
--      counted in Australia/Sydney).
--   2. whatsapp_queue_pause_log: scope 'AU' allowed (the automatic switch-off logs there).
--   3. mobile_market: an Australian mobile ('61 4…' → phone_key '4' + 8 digits) is 'AU'. Every other branch unchanged.
--      Twin of src/lib/outreachMarkets.ts mobileMarketOf.
--   4. outreach_channel_on: AU sms / call → false.
--   5. set_outreach_country: 'AU' accepted; sms_on / call_on true refused for AU ('whatsapp_only').
--   6. country_whatsapp_auto_pause / whatsapp_failure_country_check / whatsapp_my_sg_no_auto_retry: AU joins MY / SG.
-- sales_queue_opener, campaign_candidates and queue_sms_openers need no change: they ask mobile_market + outreach_channel_on,
-- so an Australian mobile now queues for WhatsApp (switch on) and is 'country_off' for texts (never marked No mobile).
-- Each function is its live definition (read back 2026-10-22) with only the commented lines changed.
-- ⛔ APPLY ONLY TOGETHER WITH THE CODE: before the new process-whatsapp-queue is live, an Australian lead queued by the new
--    sales_queue_opener would reach the OLD drip, which calls it "not a UK mobile" and marks it No WhatsApp.
-- Rollback: re-create the six functions from 20261025090000 / 20261029090000 (their bodies are in this file's comments'
--   sources), set the AU row whatsapp_on = false (or delete it), then restore the two CHECKs.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '5s';

-- ── 1. settings: allow AU, seed its row ────────────────────────────────────────────────────────
alter table public.outreach_country_settings drop constraint if exists outreach_country_settings_country_check;
alter table public.outreach_country_settings add constraint outreach_country_settings_country_check
  check (country in ('UK', 'MY', 'SG', 'AU'));

insert into public.outreach_country_settings
  (country, whatsapp_on, sms_on, call_on, whatsapp_daily_cap, sms_daily_cap, send_start_min, send_end_min, timezone, whatsapp_on_since)
values ('AU', true, false, false, 100, null, 540, 1020, 'Australia/Sydney', now())
on conflict (country) do nothing;

-- ── 2. pause log scope ─────────────────────────────────────────────────────────────────────────
alter table public.whatsapp_queue_pause_log drop constraint if exists whatsapp_queue_pause_log_scope_check;
alter table public.whatsapp_queue_pause_log add constraint whatsapp_queue_pause_log_scope_check
  check (scope in ('queue', 'UK', 'MY', 'SG', 'AU'));

-- ── 3. mobile_market ───────────────────────────────────────────────────────────────────────────
create or replace function public.mobile_market(_country text, _pk text)
returns text language sql immutable parallel safe as $function$
  select case
    when _pk is null then null
    when coalesce(_country, 'UK') = 'UK' and _pk ~ '^7[0-9]{9}$' then 'UK'
    when _pk ~ '^601([02-9][0-9]{7}|1[0-9]{8})$' then 'MY'
    when _pk ~ '^65[89][0-9]{7}$' then 'SG'
    -- 2026-10-22: an Australian mobile. phone_key drops the 61 (or the trunk 0) of '04…', leaving '4' + 8 digits — a shape
    -- no UK (10 digits), Malaysian or Singapore key has.
    when _pk ~ '^4[0-9]{8}$' then 'AU'
  end
$function$;

-- ── 4. outreach_channel_on ─────────────────────────────────────────────────────────────────────
create or replace function public.outreach_channel_on(_market text, _channel text)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select case when _market is null then false
    -- 2026-10-22: Australia is WhatsApp only — texts and browser calls are never on, whatever is stored.
    when _market = 'AU' and _channel <> 'whatsapp' then false
    else coalesce(
    (select case _channel when 'whatsapp' then s.whatsapp_on when 'sms' then s.sms_on when 'call' then s.call_on end
       from public.outreach_country_settings s where s.country = _market),
    _market = 'UK') end
$function$;
revoke execute on function public.outreach_channel_on(text, text) from public, anon;
grant execute on function public.outreach_channel_on(text, text) to authenticated, service_role;

-- ── 5. set_outreach_country ────────────────────────────────────────────────────────────────────
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
    else
      return jsonb_build_object('ok', false, 'error', 'unknown_field', 'field', k);
    end if;
  end loop;
  update public.outreach_country_settings set updated_at = now(), updated_by = auth.uid() where country = _country;
  if exists (select 1 from public.outreach_country_settings where country = _country
              and send_start_min is not null and send_end_min is not null and send_start_min >= send_end_min) then
    raise exception 'send_hours_inverted' using errcode = '22023';
  end if;
  return jsonb_build_object('ok', true, 'setting', (select to_jsonb(s) from public.outreach_country_settings s where s.country = _country));
end
$function$;
revoke execute on function public.set_outreach_country(text, jsonb) from public, anon;
grant execute on function public.set_outreach_country(text, jsonb) to authenticated;

-- ── 6. the automatic switch-off and no-auto-retry: AU joins MY / SG ────────────────────────────
create or replace function public.country_whatsapp_auto_pause(_market text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  s record;
  v_since timestamptz;
  v_total integer;
  v_failed integer;
  v_trial_fail integer;
  v_all integer;
  v_code integer;
  v_reason text;
  -- 2026-10-22: Australia.
  v_name text := case _market when 'MY' then 'Malaysia' when 'SG' then 'Singapore' when 'AU' then 'Australia' end;
begin
  if _market is null or _market not in ('MY', 'SG', 'AU') then return null; end if;
  select * into s from public.outreach_country_settings where country = _market for update;
  if not found or not s.whatsapp_on then return null; end if;
  v_since := coalesce(s.whatsapp_on_since, s.updated_at);
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
  ), last5 as (
    select * from per order by at desc limit 5
  )
  select count(*), count(*) filter (where failed), count(*) filter (where failed and code is distinct from 131026),
         max(code) filter (where failed), (select count(*) from per)
    into v_total, v_failed, v_trial_fail, v_code, v_all from last5;

  if not ((v_all <= 5 and v_trial_fail >= 1) or v_failed >= 2) then
    return jsonb_build_object('market', _market, 'sends', v_all, 'failed', v_failed, 'switched_off', false);
  end if;

  v_reason := format('WhatsApp to %s switched itself off: %s of its %s %s sends failed%s. Test a handful by hand before switching it back on.',
                     v_name, v_failed, case when v_all <= 5 then 'first' else 'last' end, v_total,
                     case when v_code is not null then format(' (Meta error %s)', v_code) else ' (Meta gave no error code)' end);
  update public.outreach_country_settings
     set whatsapp_on = false, whatsapp_auto_paused_at = now(), whatsapp_auto_pause_reason = v_reason,
         updated_at = now(), updated_by = null
   where country = _market;
  insert into public.whatsapp_queue_pause_log (scope, action, source, by_user_id, reason)
  values (_market, 'switched_off', 'auto', null, v_reason);
  return jsonb_build_object('market', _market, 'sends', v_total, 'failed', v_failed, 'switched_off', true, 'reason', v_reason);
end $function$;

create or replace function public.whatsapp_failure_country_check()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_market text;
begin
  begin
    v_market := public.mobile_market(null, public.phone_key(new.phone));
    -- 2026-10-22: Australia.
    if v_market in ('MY', 'SG', 'AU') then perform public.country_whatsapp_auto_pause(v_market); end if;
  exception when others then
    raise warning 'country auto-pause check failed (non-fatal): %', sqlerrm;
  end;
  return null;
end $function$;

create or replace function public.whatsapp_my_sg_no_auto_retry()
returns trigger language plpgsql as $function$
begin
  if coalesce(new.whatsapp_attempts, 0) > coalesce(old.whatsapp_attempts, 0)
     -- 2026-10-22: Australia.
     and public.mobile_market(new.country, public.phone_key(new.phone)) in ('MY', 'SG', 'AU') then
    new.status := 'whatsapp_failed';
    new.whatsapp_delivery_status := 'failed';
    new.queued_at := null;
  end if;
  return new;
end $function$;
