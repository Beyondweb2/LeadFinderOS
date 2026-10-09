-- 2026-10-09 — queue_sms_openers marks a lead whose number can never be a UK mobile as No SMS (sms_delivery_status = 'no_sms'), as it refuses it.
-- Same checks as 20261019100000; the only change is the no_sms write. Rollback: re-run that file's queue_sms_openers.

create or replace function public.queue_sms_openers(_lead_ids uuid[], _template text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_role text := public.my_role();
  v_uid uuid := auth.uid();
  v_template text := btrim(coalesce(_template, ''));
  v_id uuid;
  v_lead record;
  v_pk text;
  v_queued integer := 0;
  v_skip jsonb := '{}'::jsonb;
  v_reason text;
  v_g jsonb;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if v_template not in ('initial_contact', 'initial_opener_v2') then return jsonb_build_object('ok', false, 'error', 'not_an_initial_opener'); end if;
  if _lead_ids is null or array_length(_lead_ids, 1) is null then return jsonb_build_object('ok', false, 'error', 'no_leads'); end if;
  if array_length(_lead_ids, 1) > 200 then return jsonb_build_object('ok', false, 'error', 'too_many'); end if;
  v_g := public.guard_action(v_uid, 'sms_send', null, 0, array_length(_lead_ids, 1), 'queue_sms_openers');
  if not coalesce((v_g ->> 'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'usage_paused', 'detail', 'Usage temporarily paused - contact Paul');
  end if;

  foreach v_id in array _lead_ids loop
    v_reason := null;
    select id, status, is_archived, amount_paid, phone, country, sms_queued_at into v_lead
      from public.outreach_leads where id = v_id for update;
    v_pk := case when found then public.phone_key(v_lead.phone) end;
    if not found then v_reason := 'not_found';
    elsif not public.can_work_lead(v_id) then v_reason := 'not_yours';
    elsif v_lead.is_archived is true then v_reason := 'archived';
    elsif public.lead_is_client(v_lead.amount_paid, v_lead.status) then v_reason := 'client';
    elsif v_lead.sms_queued_at is not null then v_reason := 'already_queued';
    elsif coalesce(v_lead.status, '') not in ('not_contacted', 'no_whatsapp', 'whatsapp_failed', 'no_whatsapp_needs_sms') then v_reason := 'not_new';
    elsif v_pk is null then v_reason := 'no_phone';
    elsif not (coalesce(v_lead.country, 'UK') = 'UK' and v_pk ~ '^7[0-9]{9}$') then v_reason := 'not_a_uk_mobile';
    elsif exists (select 1 from public.contact_suppressions s where public.phone_key(s.phone_e164) = v_pk) then v_reason := 'opted_out';
    elsif exists (select 1 from public.sms_messages m where m.direction = 'outbound' and public.phone_key(m.phone) = v_pk
                   and m.status not in ('failed', 'undelivered', 'simulated')) then v_reason := 'already_texted';
    elsif exists (select 1 from public.whatsapp_messages w where public.phone_key(w.phone) = v_pk
                   and (w.status is null or w.status not in ('failed', 'failed_temporary', 'simulated'))) then v_reason := 'in_whatsapp_conversation';
    else v_reason := public.opener_contact_block(v_id);
    end if;

    if v_reason in ('no_phone', 'not_a_uk_mobile') then
      -- a number that can never be a UK mobile is No SMS the moment we look (the SMS twin of "not on WhatsApp"); a delivered text is never overwritten
      update public.outreach_leads set sms_delivery_status = 'no_sms'
       where id = v_id and coalesce(sms_delivery_status, '') <> 'delivered';
    end if;

    if v_reason is not null then
      v_skip := jsonb_set(v_skip, array[v_reason], to_jsonb(coalesce((v_skip ->> v_reason)::int, 0) + 1));
      continue;
    end if;

    update public.outreach_leads
       set sms_queued_at = now(), sms_queued_by_user_id = v_uid, sms_queued_template = v_template, sms_attempts = 0, contact_method = 'sms'
     where id = v_id;
    insert into public.lead_activity (lead_id, actor_user_id, kind, data)
    values (v_id, v_uid, 'bulk_queued', jsonb_build_object('channel', 'sms', 'template', v_template));
    v_queued := v_queued + 1;
  end loop;

  return jsonb_build_object('ok', true, 'queued', v_queued, 'template', v_template, 'skipped', v_skip);
end $function$;
revoke all on function public.queue_sms_openers(uuid[], text) from public, anon;
grant execute on function public.queue_sms_openers(uuid[], text) to authenticated;
