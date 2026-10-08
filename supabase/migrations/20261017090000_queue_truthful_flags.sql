-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- THE QUEUE TELLS THE TRUTH ABOUT WHY A LEAD WAS NOT QUEUED, AND LEAVES THE LEAD HONEST (2026-10-08).
-- fix/whatsapp-queue-send-reliability. Additive: one new function + sales_queue_opener re-created from its LIVE
-- body (20261015090000, read 2026-10-08) with ONLY these changes:
--
--  1. "already_contacted" was one reason for four different facts. lead_first_contact_at is true for a lead with
--     (a) its OWN real message / legacy send stamp, (b) a sign-up/onboarding row (a quick close or free check),
--     (c) an "Open in WhatsApp app" attempt stamp, or (d) NOTHING of its own but a message on ANOTHER lead row
--     with the same phone (a duplicate Google listing). Live 2026-10-08: of 25 "contacted" New leads, 19 were (d),
--     6 were (b), 0 were (a). New lead_contact_basis() names which, and the skip key now says so:
--        own_message -> already_contacted (unchanged)   sign_up -> sign_up_started
--        attempt -> whatsapp_app_opened                 otherwise -> number_already_contacted
--     A CALL TAP IS NONE OF THESE: it writes contact_method only and is read by none of them.
--  2. A lead the queue has just LEARNED it cannot WhatsApp no longer stays "New": no_phone / not_a_uk_mobile ->
--     status no_whatsapp_needs_sms (the existing marker; whatsapp_delivery_status keeps the reason).
--  3. A lead at the start with GENUINE contact evidence of its own (a real message of its own, or a logged
--     conversation) is reconciled to initial_contact ("Contacted"). Only from not_contacted - nothing more advanced
--     is ever written over. Evidence on ANOTHER row (case d) proves nothing about this row and changes nothing.
-- Rollback: re-run 20261015090000_outreach_uk_only.sql's sales_queue_opener body.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.lead_contact_basis(_lead_id uuid)
 returns text
 language sql stable security definer set search_path to 'public'
as $function$
  select case
    when exists (select 1 from public.whatsapp_messages m
                  where m.lead_id = _lead_id and (m.direction = 'inbound' or m.status in ('sent', 'delivered', 'read')))
      or exists (select 1 from public.whatsapp_sends s
                  where s.lead_id = _lead_id and s.delivery_status in ('sent', 'delivered', 'read'))
      or exists (select 1 from public.outreach_leads l
                  where l.id = _lead_id
                    and (public.lead_opener_really_sent(l.status, l.whatsapp_sent_at, l.whatsapp_ever_delivered)
                         or l.sms_sent_at is not null or l.instantly_pushed_at is not null)) then 'own_message'
    when exists (select 1 from public.onboarding_responses o where o.lead_id = _lead_id) then 'sign_up'
    when exists (select 1 from public.outreach_leads l where l.id = _lead_id and l.last_outreach_attempt_at is not null) then 'attempt'
    when public.lead_first_contact_at(_lead_id) is not null then 'number'
    else null
  end
$function$;
revoke all on function public.lead_contact_basis(uuid) from public, anon, authenticated;
grant execute on function public.lead_contact_basis(uuid) to service_role;

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
        -- Cold WhatsApp is UK only: a UK mobile (UK/blank country, 07... key). India removed 2026-10-15; Australia stays off.
        elsif not (coalesce(v_lead.country, 'UK') = 'UK' and v_pk ~ '^7[0-9]{9}$') then v_reason := 'not_a_uk_mobile';
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
end $function$;

-- Read back:
--   select pg_get_functiondef('public.sales_queue_opener(uuid[],text)'::regprocedure) like '%lead_contact_basis(v_id)%';  -- true
--   select has_function_privilege('authenticated', 'public.lead_contact_basis(uuid)', 'EXECUTE');                        -- false
