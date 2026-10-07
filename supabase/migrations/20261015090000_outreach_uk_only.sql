-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- COLD WHATSAPP OUTREACH IS UK ONLY (2026-10-15). India is no longer an outreach market.
--
-- Two live functions still let an Indian mobile (phone_key ^91[6-9][0-9]{9}$) into cold outreach. Both are
-- re-created here from their LIVE bodies (pg_get_functiondef, read 2026-10-07 and diffed against the latest
-- migration files) with ONLY the India alternative removed:
--
--   sales_queue_opener(uuid[], text)  - the campaign launch / Sales bulk queue / per-lead queue guard. The
--                                       reason code 'not_a_uk_mobile' is UNCHANGED (a stored, consumed token);
--                                       only its human wording (src/lib/salesCrm.ts) became UK-only.
--   campaign_candidates(uuid, text)   - the 'sendable' flag the campaign picker shows.
--
-- UK rule, unchanged: coalesce(country,'UK') = 'UK' and phone_key ~ '^7[0-9]{9}$'. Australia stays off (its
-- phone_key is not 7...). NOTHING historical is touched: no lead, message, campaign, log or metric row is read
-- or written here - only function bodies change. Re-runnable (create or replace; privileges are kept).
-- The edge twin is src/lib/ukColdDestination.ts (queue + send-whatsapp-message refuse a non-UK cold send).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

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
  /* 2026-09-29: a suspended salesperson queues nothing. Already-queued leads are left for the admin. */
  v_g := public.guard_action(v_uid, 'whatsapp_queue', null, 0, array_length(_lead_ids, 1), 'sales_queue_opener');
  if not coalesce((v_g ->> 'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'usage_paused', 'detail', 'Usage temporarily paused - contact Paul');
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
      /* The ONE real-contact guard (opener_contact_block): a logged conversation means a cold opener is wrong.
         The lead stays in its campaign; only the opener is not queued. */
      v_reason := public.opener_contact_block(v_id);
      if v_reason is null then
        v_pk := public.phone_key(v_lead.phone);
        if v_pk is null then v_reason := 'no_phone';
        -- Cold WhatsApp is UK only: a UK mobile (UK/blank country, 07... key). India removed 2026-10-15; Australia stays off.
        elsif not (coalesce(v_lead.country, 'UK') = 'UK' and v_pk ~ '^7[0-9]{9}$') then v_reason := 'not_a_uk_mobile';
        elsif exists (select 1 from public.contact_suppressions s where public.phone_key(s.phone_e164) = v_pk) then v_reason := 'opted_out';
        elsif v_room is not null and v_queued >= v_room then v_reason := 'daily_limit';
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
end $function$;

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
          and (coalesce(o.country, 'UK') = 'UK' and public.phone_key(o.phone) ~ '^7[0-9]{9}$')
          and not exists (select 1 from public.contact_suppressions s where public.phone_key(s.phone_e164) = public.phone_key(o.phone))) x
        from public.outreach_leads o
       where not coalesce(o.is_archived, false) and not public.lead_is_client(o.amount_paid, o.status)
         and (v_role = 'admin' or o.assigned_to_user_id = auth.uid())
         and (v_q is null or o.business_name ilike '%' || v_q || '%' or o.search_keyword ilike '%' || v_q || '%'
              or o.category ilike '%' || v_q || '%' or o.derived_town ilike '%' || v_q || '%' or o.search_location ilike '%' || v_q || '%')
       order by o.created_at desc
       limit 1000) s), '[]'::jsonb));
end $function$;
