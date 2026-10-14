-- 2026-10-14 (feat/team-access-tidy): the name a person signs their messages with, who queued a lead, and the
-- ai_visibility_report_offer template in the Sales bulk queue. Additive only. docs/team-access-tidy.md §4–5.

set local lock_timeout = '5s';

-- 1) The name on your messages. Set by the person (first-login box, or their profile). NULL = not chosen yet: the
--    app falls back to the first part of their own email and asks again next login. RLS already lets a person update
--    only their own profile row.
alter table public.profiles add column if not exists message_name text;
alter table public.profiles add column if not exists message_name_set_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_message_name_shape') then
    alter table public.profiles add constraint profiles_message_name_shape
      check (message_name is null or (char_length(btrim(message_name)) between 1 and 40 and message_name !~ '[\r\n\t]'));
  end if;
end $$;

-- 2) WHO QUEUED THIS LEAD. The ai_visibility_report_offer message is signed {{6}} with the queuing person's own
--    message name; the drip never guesses a sender (no owner, no assignee fallback). Plain nullable column: no rewrite.
alter table public.outreach_leads add column if not exists queued_by_user_id uuid;

-- 3) sales_queue_opener: the live definition (read 2026-10-14), with two changes only — the report-offer template is
--    accepted beside the two openers, and the queuing person is stamped on the lead.
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
  if v_template not in ('initial_contact', 'initial_opener_v2', 'ai_visibility_report_offer') then return jsonb_build_object('ok', false, 'error', 'not_an_initial_opener'); end if;
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
           previous_status = v_lead.status, contact_method = 'whatsapp', queued_by_user_id = v_uid
     where id = v_id;
    insert into public.lead_activity (lead_id, actor_user_id, kind, data)
    values (v_id, v_uid, 'bulk_queued', jsonb_build_object('template', v_template));
    v_queued := v_queued + 1;
  end loop;

  return jsonb_build_object('ok', true, 'queued', v_queued, 'template', v_template, 'skipped', v_skip);
end $function$
;
