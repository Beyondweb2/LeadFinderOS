-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- MALAYSIA AND SINGAPORE: PHONE KEYS, ONE MARKET RULE, A PER-COUNTRY SWITCH (2026-10-14, feat/my-sg-support).
--
-- Found (read-only check, 2026-10-14): a Singapore '+65 9123 4567' keyed as 6591234567 and phone_e164_key turned it
-- into '+446591234567' — so "Wrong number" suppressed a UK-shaped number nobody owns and every sender (which compares
-- '+' + the digits it dials) missed the mark. A 10-digit Malaysian key (60 + a landline) went the same way. Every
-- MY / SG mobile was "not a UK mobile" and so marked No mobile / No SMS on the first queue press.
--
--   1. phone_e164_key: a 10-digit key starting 60 or 65 keeps its own code ('+65…', '+60…'). The UK has no 06 numbers,
--      so no UK key can start 6; every other branch is unchanged. phone_key itself is NOT changed (no index rebuild):
--      '+65 9123 4567' and '+60 12-345 6789' already key as 6591234567 / 60123456789 — their national forms are made to
--      meet them by storing E.164 (section 4), not by guessing in the key.
--   2. my_sales_message_phones: also offers '+' || key for a 60 / 65 key (a rep reads their MY / SG leads' messages).
--   3. public.outreach_country_settings — one row per market (UK, MY, SG): a switch per channel (WhatsApp, SMS, browser
--      calling), a country daily cap per channel, local send hours. UK ON for all three (its rules are unchanged);
--      Malaysia and Singapore start OFF. Read by any signed-in role; changed only through set_outreach_country (admin).
--      public.mobile_market(country, phone_key) is THE rule (twin of src/lib/outreachMarkets.ts mobileMarketOf);
--      public.outreach_channel_on(market, channel) reads the switch (a missing row: UK on, anything else off).
--   4. A Malaysia / Singapore lead's phone is stored E.164 ('+60123456789', '+6591234567'): public.my_sg_e164 (twin of
--      src/lib/waNumber.ts malaysiaDigits / singaporeDigits) + a BEFORE trigger on outreach_leads that rewrites the
--      phone ONLY when the row's country is Malaysia / Singapore AND the number can be read; anything else is left
--      exactly as typed. UK / every other country: untouched.
--   5. sales_queue_opener / campaign_candidates / queue_sms_openers: the UK-only line is replaced by the market rule +
--      the switch. A real MY / SG mobile in a market switched off answers 'country_off' and writes NOTHING on the lead
--      (it is a mobile — never No mobile / No SMS). 'not_a_uk_mobile' keeps its stored token for everything that is
--      genuinely not a mobile we message. UK: identical answers (mobile_market is 'UK' exactly when the old test passed,
--      and the UK switch is on).
-- Each function is its live definition (read back 2026-10-14, restore copies kept by the session) with only those lines.
-- Rollback: re-create the five functions from their previous migrations (phone_e164_key / my_sales_message_phones
--   20261014100000; sales_queue_opener 20261024110000; campaign_candidates 20261015090000; queue_sms_openers
--   20261023090000), drop trigger trg_outreach_leads_my_sg_phone. The table can stay (nothing reads it then).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '5s';

-- ── 1. phone_e164_key ───────────────────────────────────────────────────────────────────────────
create or replace function public.phone_e164_key(_phone text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case
    when public.phone_key(_phone) is null then null
    -- 2026-10-14: Malaysia (60) / Singapore (65) keep their code. Never a UK key: the UK has no 06 numbers.
    when length(public.phone_key(_phone)) = 10 and public.phone_key(_phone) ~ '^6[05]' then '+' || public.phone_key(_phone)
    when length(public.phone_key(_phone)) = 10 and public.phone_key(_phone) ~ '^[1-9]' then '+44' || public.phone_key(_phone)
    when length(public.phone_key(_phone)) = 9
         and regexp_replace(coalesce(_phone, ''), '\D', '', 'g') ~ '^(00)?61[23478][0-9]{8}$' then '+61' || public.phone_key(_phone)
    when length(public.phone_key(_phone)) = 9
         and regexp_replace(coalesce(_phone, ''), '\D', '', 'g') ~ '^04[0-9]{8}$' then '+61' || public.phone_key(_phone)
    else '+' || public.phone_key(_phone)
  end
$$;

-- ── 2. my_sales_message_phones ──────────────────────────────────────────────────────────────────
create or replace function public.my_sales_message_phones()
returns setof text language plpgsql stable security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'sales' then return; end if;
  return query
    select distinct x.p from (
      select public.phone_key(l.phone) as k from public.outreach_leads l
      where l.id in (select public.my_sales_lead_ids())
    ) s
    cross join lateral (
      select v from (values ('44' || s.k), (s.k), ('0' || s.k), ('+44' || s.k)) as uk(v)
      union all
      select v from (values ('61' || s.k), ('+61' || s.k)) as au(v) where s.k ~ '^[23478][0-9]{8}$'
      union all
      select v from (values ('+' || s.k)) as mysg(v) where s.k ~ '^6[05][0-9]{8,10}$'
    ) as x(p)
    where s.k is not null;
end
$$;
revoke execute on function public.my_sales_message_phones() from public, anon;
grant execute on function public.my_sales_message_phones() to authenticated;

-- ── 3. the per-country settings + the one market rule ──────────────────────────────────────────
create table if not exists public.outreach_country_settings (
  country text primary key check (country in ('UK', 'MY', 'SG')),
  whatsapp_on boolean not null default false,
  sms_on boolean not null default false,
  call_on boolean not null default false,
  whatsapp_daily_cap integer check (whatsapp_daily_cap is null or whatsapp_daily_cap between 0 and 1000),
  sms_daily_cap integer check (sms_daily_cap is null or sms_daily_cap between 0 and 1000),
  send_start_min integer check (send_start_min is null or send_start_min between 0 and 1440),
  send_end_min integer check (send_end_min is null or send_end_min between 0 and 1440),
  timezone text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.outreach_country_settings enable row level security;
revoke all on public.outreach_country_settings from anon, authenticated;
grant select on public.outreach_country_settings to authenticated;
drop policy if exists outreach_country_settings_read on public.outreach_country_settings;
create policy outreach_country_settings_read on public.outreach_country_settings
  for select to authenticated using ((select public.my_role()) is not null);

-- UK on for everything (exactly as before, its own windows/caps stay in code); MY / SG OFF, lower caps, 09:00-19:00 local.
insert into public.outreach_country_settings (country, whatsapp_on, sms_on, call_on, whatsapp_daily_cap, sms_daily_cap, send_start_min, send_end_min, timezone)
values ('UK', true, true, true, null, null, null, null, null),
       ('MY', false, false, false, 50, 25, 540, 1140, 'Asia/Kuala_Lumpur'),
       ('SG', false, false, false, 50, 25, 540, 1140, 'Asia/Singapore')
on conflict (country) do nothing;

-- THE market of a mobile, from the lead's country and its phone_key. UK: the exact old test. MY / SG: the digits.
create or replace function public.mobile_market(_country text, _pk text)
returns text language sql immutable parallel safe as $$
  select case
    when _pk is null then null
    when coalesce(_country, 'UK') = 'UK' and _pk ~ '^7[0-9]{9}$' then 'UK'
    when _pk ~ '^601([02-9][0-9]{7}|1[0-9]{8})$' then 'MY'
    when _pk ~ '^65[89][0-9]{7}$' then 'SG'
  end
$$;

-- Is this channel switched on for this market? A missing row: the UK on (as before), anything else off.
create or replace function public.outreach_channel_on(_market text, _channel text)
returns boolean language sql stable security definer set search_path = public as $$
  select case when _market is null then false else coalesce(
    (select case _channel when 'whatsapp' then s.whatsapp_on when 'sms' then s.sms_on when 'call' then s.call_on end
       from public.outreach_country_settings s where s.country = _market),
    _market = 'UK') end
$$;
revoke execute on function public.outreach_channel_on(text, text) from public, anon;
grant execute on function public.outreach_channel_on(text, text) to authenticated, service_role;

-- The admin's one door to change a country. _patch keys: whatsapp_on, sms_on, call_on (boolean), whatsapp_daily_cap,
-- sms_daily_cap, send_start_min, send_end_min (integer or null = default). Out of range is refused, never clamped.
create or replace function public.set_outreach_country(_country text, _patch jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k text; v jsonb; n integer;
begin
  if public.my_role() is distinct from 'admin' then raise exception 'admin_only' using errcode = '42501'; end if;
  if _country not in ('UK', 'MY', 'SG') then return jsonb_build_object('ok', false, 'error', 'unknown_country'); end if;
  if _patch is null or jsonb_typeof(_patch) <> 'object' then return jsonb_build_object('ok', false, 'error', 'bad_patch'); end if;
  insert into public.outreach_country_settings (country) values (_country) on conflict (country) do nothing;
  for k, v in select * from jsonb_each(_patch) loop
    if k in ('whatsapp_on', 'sms_on', 'call_on') then
      if jsonb_typeof(v) <> 'boolean' then return jsonb_build_object('ok', false, 'error', k || '_not_boolean'); end if;
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
$$;
revoke execute on function public.set_outreach_country(text, jsonb) from public, anon;
grant execute on function public.set_outreach_country(text, jsonb) to authenticated;

-- ── 4. a Malaysia / Singapore lead's phone, stored E.164 ────────────────────────────────────────
-- E.164 for a Malaysian / Singapore number (national or international form), or NULL when it cannot be read.
-- Twin of src/lib/waNumber.ts malaysiaDigits / singaporeDigits.
create or replace function public.my_sg_e164(_phone text, _country text)
returns text language sql immutable parallel safe as $$
  select case
    when d = '' then null
    when intl and d !~ '^6[05]' then null                     -- another country's "+" number: not ours to rewrite
    when _country = 'Malaysia' then case
      when d ~ '^600?1([02-9][0-9]{7}|1[0-9]{8})$' then '+60' || regexp_replace(d, '^600?', '')
      when d ~ '^600?[3-9][0-9]{7,8}$' then '+60' || regexp_replace(d, '^600?', '')
      when not intl and d ~ '^0(1([02-9][0-9]{7}|1[0-9]{8})|[3-9][0-9]{7,8})$' then '+60' || substr(d, 2)
      when not intl and d ~ '^1([02-9][0-9]{7}|1[0-9]{8})$' then '+60' || d
    end
    when _country = 'Singapore' then case
      when d ~ '^65[3689][0-9]{7}$' then '+' || d
      when not intl and d ~ '^[3689][0-9]{7}$' then '+65' || d
    end
  end
  from (select regexp_replace(regexp_replace(coalesce(_phone, ''), '\D', '', 'g'), '^00', '') as d,
               coalesce(_phone, '') ~ '^\s*(\+|00)' as intl) x
$$;

create or replace function public._outreach_leads_my_sg_phone()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.country in ('Malaysia', 'Singapore') and new.phone is not null then
    new.phone := coalesce(public.my_sg_e164(new.phone, new.country), new.phone);
  end if;
  return new;
end
$$;
drop trigger if exists trg_outreach_leads_my_sg_phone on public.outreach_leads;
create trigger trg_outreach_leads_my_sg_phone
  before insert or update of phone, country on public.outreach_leads
  for each row execute function public._outreach_leads_my_sg_phone();

-- ── 5. the three queue doors: the market rule + the switch ──────────────────────────────────────
-- The live definitions (read back 2026-10-14), each with only the commented lines changed.
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
  v_basis text;
  v_g jsonb;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if v_template = '' then return jsonb_build_object('ok', false, 'error', 'template_required'); end if;
  if v_template not in ('initial_contact', 'initial_opener_v2') then return jsonb_build_object('ok', false, 'error', 'not_an_initial_opener'); end if;
  if _lead_ids is null or array_length(_lead_ids, 1) is null then return jsonb_build_object('ok', false, 'error', 'no_leads'); end if;
  if array_length(_lead_ids, 1) > 200 then return jsonb_build_object('ok', false, 'error', 'too_many'); end if;
  /* 2026-09-29: a suspended salesperson queues nothing. Already-queued leads are left for the admin. */
  v_g := public.guard_action(v_uid, 'whatsapp_queue', null, 0, array_length(_lead_ids, 1), 'sales_queue_opener');
  if not coalesce((v_g ->> 'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'usage_paused', 'detail', 'Usage temporarily paused - contact Paul');
  end if;

  /* 2026-10-14 (test day): a salesperson with no limit of their own gets the admin default
     (whatsapp_outreach_state.person_daily_limit_default, NULL = none). The admin is never limited by the default. */
  v_limit := coalesce((select daily_send_limit from public.team_members where user_id = v_uid),
                      case when public.my_role() = 'sales' then (select person_daily_limit_default from public.whatsapp_outreach_state where id = 1) end);
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
    elsif public.lead_first_contact_at(v_id) is not null then
      /* WHICH contact? (see the header). Only a lead's OWN real message reconciles its status. */
      v_basis := public.lead_contact_basis(v_id);
      v_reason := case v_basis
        when 'own_message' then 'already_contacted'
        when 'sign_up' then 'sign_up_started'
        when 'attempt' then 'whatsapp_app_opened'
        else 'number_already_contacted' end;
      if v_basis = 'own_message' then
        update public.outreach_leads set status = 'initial_contact' where id = v_id and status = 'not_contacted';
      end if;
    else
      /* The ONE real-contact guard (opener_contact_block): a logged conversation means a cold opener is wrong.
         The lead stays in its campaign; only the opener is not queued. A logged conversation IS genuine contact. */
      v_reason := public.opener_contact_block(v_id);
      if v_reason is not null then
        update public.outreach_leads set status = 'initial_contact' where id = v_id and status = 'not_contacted';
      else
        v_pk := public.phone_key(v_lead.phone);
        if v_pk is null then v_reason := 'no_phone';
        -- Cold WhatsApp: a mobile in a market whose WhatsApp switch is on (2026-10-14: the UK exactly as before; Malaysia /
        -- Singapore by outreach_country_settings). A real MY / SG mobile in a market switched off is 'country_off' and is
        -- never marked No mobile. Anything else is genuinely not a mobile we message: 'not_a_uk_mobile' (stored token).
        elsif public.mobile_market(v_lead.country, v_pk) is null then v_reason := 'not_a_uk_mobile';
        elsif not public.outreach_channel_on(public.mobile_market(v_lead.country, v_pk), 'whatsapp') then v_reason := 'country_off';
        elsif exists (select 1 from public.contact_suppressions s where public.phone_key(s.phone_e164) = v_pk) then v_reason := 'opted_out';
        elsif v_room is not null and v_queued >= v_room then v_reason := 'daily_limit';
        end if;
        /* Learned for certain that WhatsApp cannot reach this lead: say so on the lead (the existing marker). */
        if v_reason in ('no_phone', 'not_a_uk_mobile') then
          update public.outreach_leads set status = 'no_whatsapp_needs_sms', whatsapp_delivery_status = v_reason
           where id = v_id and status = 'not_contacted';
        end if;
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
end $function$
;

CREATE OR REPLACE FUNCTION public.campaign_candidates(_campaign_id uuid, _search text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_role text := public.my_role(); v_q text := nullif(btrim(coalesce(_search, '')), '');
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if _campaign_id is not null and not public.campaign_usable(_campaign_id) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'leads', coalesce((
    select jsonb_agg(x) from (
      select jsonb_build_object('id', o.id, 'business_name', o.business_name, 'status', o.status,
        'town', coalesce(nullif(o.derived_town, ''), o.search_location), 'trade', coalesce(nullif(o.search_keyword, ''), o.category),
        'in_this', o.campaign_id is not distinct from _campaign_id and _campaign_id is not null,
        'campaign_id', case when o.campaign_id is not null and public.campaign_usable(o.campaign_id) then o.campaign_id end,
        'campaign_name', case when o.campaign_id is not null and public.campaign_usable(o.campaign_id) then (select c.name from public.campaigns c where c.id = o.campaign_id) end,
        'in_other_campaign', o.campaign_id is not null and o.campaign_id is distinct from _campaign_id,
        'sendable', o.status = 'not_contacted' and public.lead_first_contact_at(o.id) is null
          and public.phone_key(o.phone) is not null
          and public.outreach_channel_on(public.mobile_market(o.country, public.phone_key(o.phone)), 'whatsapp')
          and not exists (select 1 from public.contact_suppressions s where public.phone_key(s.phone_e164) = public.phone_key(o.phone))) x
        from public.outreach_leads o
       where not coalesce(o.is_archived, false) and not public.lead_is_client(o.amount_paid, o.status)
         and (v_role = 'admin' or o.assigned_to_user_id = auth.uid())
         and (v_q is null or o.business_name ilike '%' || v_q || '%' or o.search_keyword ilike '%' || v_q || '%'
              or o.category ilike '%' || v_q || '%' or o.derived_town ilike '%' || v_q || '%' or o.search_location ilike '%' || v_q || '%')
       order by o.created_at desc
       limit 1000) s), '[]'::jsonb));
end $function$
;

CREATE OR REPLACE FUNCTION public.queue_sms_openers(_lead_ids uuid[], _template text, _dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text := public.my_role();
  v_uid uuid := auth.uid();
  v_template text := btrim(coalesce(_template, ''));
  v_dry boolean := coalesce(_dry_run, false);
  v_id uuid;
  v_lead record;
  v_pk text;
  v_queued integer := 0;
  v_ids jsonb := '[]'::jsonb;
  v_skip jsonb := '{}'::jsonb;
  v_reason text;
  v_g jsonb;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if v_template not in ('initial_contact', 'initial_opener_v2') then return jsonb_build_object('ok', false, 'error', 'not_an_initial_opener'); end if;
  if _lead_ids is null or array_length(_lead_ids, 1) is null then return jsonb_build_object('ok', false, 'error', 'no_leads'); end if;
  -- the per-press limit (100 = SMS_QUEUE_MAX_PER_ACTION, pinned by scripts/sms-queue-rules.test.ts); a check-only call may look at more
  if array_length(_lead_ids, 1) > (case when v_dry then 1000 else 100 end) then
    return jsonb_build_object('ok', false, 'error', 'too_many', 'limit', case when v_dry then 1000 else 100 end);
  end if;
  if not v_dry then
    v_g := public.guard_action(v_uid, 'sms_send', null, 0, array_length(_lead_ids, 1), 'queue_sms_openers');
    if not coalesce((v_g ->> 'ok')::boolean, false) then
      return jsonb_build_object('ok', false, 'error', 'usage_paused', 'detail', 'Usage temporarily paused - contact Paul');
    end if;
  end if;

  foreach v_id in array _lead_ids loop
    v_reason := null;
    if v_dry then
      select id, status, is_archived, amount_paid, phone, country, sms_queued_at, whatsapp_sent_at,
             contact_followup_queued_at, hook_followup_queued_at into v_lead
        from public.outreach_leads where id = v_id;
    else
      select id, status, is_archived, amount_paid, phone, country, sms_queued_at, whatsapp_sent_at,
             contact_followup_queued_at, hook_followup_queued_at into v_lead
        from public.outreach_leads where id = v_id for update;
    end if;
    v_pk := case when found then public.phone_key(v_lead.phone) end;
    if not found then v_reason := 'not_found';
    elsif not public.can_work_lead(v_id) then v_reason := 'not_yours';
    elsif v_lead.is_archived is true then v_reason := 'archived';
    elsif public.lead_is_client(v_lead.amount_paid, v_lead.status) then v_reason := 'client';
    elsif v_lead.sms_queued_at is not null then v_reason := 'already_queued';
    elsif v_lead.status = 'queued' or v_lead.contact_followup_queued_at is not null or v_lead.hook_followup_queued_at is not null
       or (v_pk is not null and exists (select 1 from public.outreach_leads o
                                         where public.phone_key(o.phone) = v_pk and o.id <> v_id and o.status = 'queued'
                                           and coalesce(o.is_archived, false) = false)) then v_reason := 'in_whatsapp_queue';
    elsif (v_lead.whatsapp_sent_at is not null
           and coalesce(v_lead.status, '') not in ('', 'not_contacted', 'queued', 'no_whatsapp', 'whatsapp_failed', 'no_whatsapp_needs_sms'))
       or (v_pk is not null and exists (select 1 from public.whatsapp_messages w where public.phone_key(w.phone) = v_pk
                                         and w.direction = 'outbound'
                                         and (w.status is null or w.status not in ('failed', 'failed_temporary', 'simulated')))) then v_reason := 'whatsapp_messaged';
    elsif v_pk is not null and exists (select 1 from public.whatsapp_messages w where public.phone_key(w.phone) = v_pk
                                         and (w.status is null or w.status not in ('failed', 'failed_temporary', 'simulated'))) then v_reason := 'in_whatsapp_conversation';
    elsif v_lead.status = 'whatsapp_failed' then v_reason := 'whatsapp_failed';
    elsif coalesce(v_lead.status, '') not in ('not_contacted', 'no_whatsapp', 'no_whatsapp_needs_sms') then v_reason := 'not_new';
    elsif v_pk is null then v_reason := 'no_phone';
    elsif public.mobile_market(v_lead.country, v_pk) is null then v_reason := 'not_a_uk_mobile';
    -- 2026-10-14: a real Malaysia / Singapore mobile while texts to that country are switched off — never No SMS.
    elsif not public.outreach_channel_on(public.mobile_market(v_lead.country, v_pk), 'sms') then v_reason := 'country_off';
    elsif exists (select 1 from public.contact_suppressions s where public.phone_key(s.phone_e164) = v_pk) then v_reason := 'opted_out';
    elsif exists (select 1 from public.sms_messages m where m.direction = 'outbound' and public.phone_key(m.phone) = v_pk
                   and m.status not in ('failed', 'undelivered', 'simulated')) then v_reason := 'already_texted';
    else v_reason := public.opener_contact_block(v_id);
    end if;

    if not v_dry and v_reason in ('no_phone', 'not_a_uk_mobile') then
      -- a number that can never be a UK mobile is No SMS the moment we look (the SMS twin of "not on WhatsApp"); a delivered text is never overwritten
      update public.outreach_leads set sms_delivery_status = 'no_sms'
       where id = v_id and coalesce(sms_delivery_status, '') <> 'delivered';
    end if;

    if v_reason is not null then
      v_skip := jsonb_set(v_skip, array[v_reason], to_jsonb(coalesce((v_skip ->> v_reason)::int, 0) + 1));
      continue;
    end if;

    if v_dry then
      v_ids := v_ids || to_jsonb(v_id);
    else
      update public.outreach_leads
         set sms_queued_at = now(), sms_queued_by_user_id = v_uid, sms_queued_template = v_template, sms_attempts = 0, contact_method = 'sms'
       where id = v_id;
      insert into public.lead_activity (lead_id, actor_user_id, kind, data)
      values (v_id, v_uid, 'bulk_queued', jsonb_build_object('channel', 'sms', 'template', v_template));
    end if;
    v_queued := v_queued + 1;
  end loop;

  if v_dry then
    return jsonb_build_object('ok', true, 'dry_run', true, 'would_queue', v_queued, 'ids', v_ids, 'template', v_template, 'skipped', v_skip);
  end if;
  return jsonb_build_object('ok', true, 'queued', v_queued, 'template', v_template, 'skipped', v_skip);
end $function$
;

-- Read back:
--   select public.phone_e164_key('+65 9123 4567'), public.phone_e164_key('+60 4-123 4567'), public.phone_e164_key('07700 900123');
--     → +6591234567, +6041234567, +447700900123
--   select public.my_sg_e164('012-345 6789','Malaysia'), public.my_sg_e164('9123 4567','Singapore');  → +60123456789, +6591234567
--   select public.mobile_market('Malaysia','60123456789'), public.mobile_market('UK','7700900123');    → MY, UK
--   select * from public.outreach_country_settings order by country;
