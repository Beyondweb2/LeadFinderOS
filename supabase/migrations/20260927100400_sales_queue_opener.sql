-- Multi-user: a salesperson's BULK OUTREACH (2026-09-27).
--
-- ⛔ ONE THING ONLY: queue the admin's CURRENTLY SELECTED initial opener
-- (whatsapp_outreach_state.initial_opener_template) to never-contacted leads the caller works. The
-- caller does not choose the template — so no unapproved, edited or follow-up template can be sent
-- this way. Everything else (follow-ups, replies) is one lead at a time through send-whatsapp-message.
--
-- The same exclusions as the admin's bulk queue (OutreachTable.handleQueueForWhatsApp), decided here
-- from the database instead of the browser's view: archived, a client, already queued, not on
-- WhatsApp, ANY prior contact on the lead OR on the same phone (lead_first_contact_at covers both),
-- opted out (contact_suppressions), and not a UK mobile. The queue drainer re-checks at send time.
--
-- Per-person ceiling: team_members.daily_send_limit (NULL = none). Counted from today's
-- 'bulk_queued' activity by this person, London day. Nothing sets a limit yet.
create or replace function public.sales_queue_opener(_lead_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_role text := public.my_role();
  v_uid uuid := auth.uid();
  v_template text;
  v_limit integer;
  v_today integer;
  v_room integer;
  v_id uuid;
  v_lead record;
  v_pk text;
  v_queued integer := 0;
  v_skip jsonb := '{}'::jsonb;
  v_reason text;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if _lead_ids is null or array_length(_lead_ids, 1) is null then return jsonb_build_object('ok', false, 'error', 'no_leads'); end if;
  if array_length(_lead_ids, 1) > 200 then return jsonb_build_object('ok', false, 'error', 'too_many'); end if;

  select initial_opener_template into v_template from public.whatsapp_outreach_state where id = 1;
  if v_template is null or btrim(v_template) = '' then return jsonb_build_object('ok', false, 'error', 'no_opener_selected'); end if;

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
      elsif coalesce(v_lead.country, 'UK') <> 'UK' or v_pk !~ '^7[0-9]{9}$' then v_reason := 'not_a_uk_mobile';
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
end
$$;
revoke execute on function public.sales_queue_opener(uuid[]) from public, anon;
grant execute on function public.sales_queue_opener(uuid[]) to authenticated;
