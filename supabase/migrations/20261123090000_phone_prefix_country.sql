-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- A NUMBER WITH AN EXPLICIT UK CODE IS A UK NUMBER, WHATEVER THE LEAD'S COUNTRY SAYS (2026-10-22, fix/country-refusals).
--
-- mobile_market(country, phone_key) reads Malaysia / Singapore / Australia from the digits alone, but accepts a UK
-- mobile only when the lead's country is UK or blank (phone_key drops the 44, so "+44 7700 900123" and a bare 10-digit
-- Indian mobile "7700900123" give the same key — the country was the only way to tell them apart). So a real UK mobile
-- stored "+44 7…" on a lead whose country label is wrong (349 live leads are labelled "USA" with UK addresses and +44
-- numbers; a Malaysia / Singapore / Australia label is possible too) was refused as 'not_a_uk_mobile' and flagged No
-- mobile.
--
--   1. public.phone_market_country(_country, _phone): 'UK' when the STORED number carries the UK code explicitly —
--      "+44" / "0044", or the full form typed without "+" (44 + 1/2/3/7 + 8-9 digits; no national number of
--      Malaysia, Singapore or Australia has that shape) — otherwise the lead's country unchanged. Mirrors
--      src/lib/waNumber.ts (bareInternationalMarketOf): the TS side already kept a "+44" number UK on every lead.
--      ⛔ A number with no code is never guessed: "07700 900123" on a "USA" lead stays unreadable, as before.
--   2. campaign_candidates, queue_sms_openers, sales_queue_opener: mobile_market is given phone_market_country(...)
--      instead of the raw country. Nothing else in them changes (each is the live definition, read back 2026-10-22).
--   whatsapp_my_sg_no_auto_retry is not changed: it asks for MY / SG / AU, which never read the country.
--   country_whatsapp_auto_pause / whatsapp_failure_country_check pass NULL (= UK) already.
-- Rollback: re-create the three functions from their previous live definitions (the text below with
--   phone_market_country(x.country, x.phone) put back to x.country) and drop phone_market_country.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '5s';

create or replace function public.phone_market_country(_country text, _phone text)
returns text language sql immutable parallel safe as $function$
  select case
    when intl and d ~ '^44' then 'UK'
    when d ~ '^44[1237][0-9]{8,9}$' then 'UK'
    else _country
  end
  from (select regexp_replace(regexp_replace(coalesce(_phone, ''), '[^0-9+]', '', 'g'), '^(\+|00)', '') as d,
               regexp_replace(coalesce(_phone, ''), '[^0-9+]', '', 'g') ~ '^(\+|00)' as intl) x
$function$;
comment on function public.phone_market_country(text, text) is
  'The country to read a stored number in: UK when it carries the UK code explicitly (+44 / 0044 / 44 + full number), else the lead''s country. 2026-10-22, docs/country-refusals.md.';

-- ── campaign_candidates: the live definition (read back 2026-10-22), only the country argument of mobile_market changed ──
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
          and public.outreach_channel_on(public.mobile_market(public.phone_market_country(o.country, o.phone), public.phone_key(o.phone)), 'whatsapp')
          and not exists (select 1 from public.contact_suppressions s where public.phone_key(s.phone_e164) = public.phone_key(o.phone))) x
        from public.outreach_leads o
       where not coalesce(o.is_archived, false) and not public.lead_is_client(o.amount_paid, o.status)
         and (v_role = 'admin' or o.assigned_to_user_id = auth.uid())
         and (v_q is null or o.business_name ilike '%' || v_q || '%' or o.search_keyword ilike '%' || v_q || '%'
              or o.category ilike '%' || v_q || '%' or o.derived_town ilike '%' || v_q || '%' or o.search_location ilike '%' || v_q || '%')
       order by o.created_at desc
       limit 1000) s), '[]'::jsonb));
end $function$;

-- ── queue_sms_openers: the live definition (read back 2026-10-22), only the country argument of mobile_market changed ──
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
    elsif public.mobile_market(public.phone_market_country(v_lead.country, v_lead.phone), v_pk) is null then v_reason := 'not_a_uk_mobile';
    -- 2026-10-14: a real Malaysia / Singapore mobile while texts to that country are switched off — never No SMS.
    elsif not public.outreach_channel_on(public.mobile_market(public.phone_market_country(v_lead.country, v_lead.phone), v_pk), 'sms') then v_reason := 'country_off';
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
end $function$;

-- ── sales_queue_opener: the live definition (read back 2026-10-22), only the country argument of mobile_market changed ──
CREATE OR REPLACE FUNCTION public.sales_queue_opener(_lead_ids uuid[], _template text, _confirm_call_campaign boolean DEFAULT false)
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
  if v_template not in ('initial_contact', 'initial_opener_v2', 'initial_contact_short', 'ai_visibility_report_offer') then return jsonb_build_object('ok', false, 'error', 'not_an_initial_opener'); end if;
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
    select id, status, is_archived, amount_paid, phone, country, assigned_to_user_id, campaign_id into v_lead
      from public.outreach_leads where id = v_id for update;
    if not found then v_reason := 'not_found';
    elsif not public.can_work_lead(v_id) then v_reason := 'not_yours';
    elsif v_lead.is_archived is true then v_reason := 'archived';
    elsif public.lead_is_client(v_lead.amount_paid, v_lead.status) then v_reason := 'client';
    elsif coalesce(v_lead.status, '') <> 'not_contacted' then v_reason := 'not_new';
    elsif not coalesce(_confirm_call_campaign, false) and v_lead.campaign_id is not null
          and exists (select 1 from public.campaigns c where c.id = v_lead.campaign_id and c.method = 'call') then
      /* 2026-10-15: a Call campaign's lead gets a WhatsApp opener only when the person confirmed it. */
      v_reason := 'call_campaign';
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
        elsif public.mobile_market(public.phone_market_country(v_lead.country, v_lead.phone), v_pk) is null then v_reason := 'not_a_uk_mobile';
        elsif not public.outreach_channel_on(public.mobile_market(public.phone_market_country(v_lead.country, v_lead.phone), v_pk), 'whatsapp') then v_reason := 'country_off';
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
           previous_status = v_lead.status, contact_method = 'whatsapp', queued_by_user_id = v_uid
     where id = v_id;
    insert into public.lead_activity (lead_id, actor_user_id, kind, data)
    values (v_id, v_uid, 'bulk_queued', jsonb_build_object('template', v_template, 'call_campaign_confirmed', coalesce(_confirm_call_campaign, false)));
    v_queued := v_queued + 1;
  end loop;

  return jsonb_build_object('ok', true, 'queued', v_queued, 'template', v_template, 'skipped', v_skip);
end $function$;

-- Read back:
--   select public.phone_market_country('USA', '+44 7700 900123') = 'UK',
--          public.phone_market_country('Malaysia', '447700900123') = 'UK',
--          public.phone_market_country('USA', '07700 900123') = 'USA',
--          public.phone_market_country('India', '4412345678') = 'India',
--          public.mobile_market(public.phone_market_country('USA', '+44 7700 900123'), public.phone_key('+44 7700 900123')) = 'UK';
--   select proname from pg_proc where proname in ('campaign_candidates','queue_sms_openers','sales_queue_opener')
--      and pg_get_functiondef(oid) ~ 'phone_market_country';
