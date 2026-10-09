-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- THE SMS QUEUE SENDS A WHATSAPP OPENER, CHOSEN PER BATCH (2026-10-09, feat/sms-reuse-whatsapp-templates).
-- Paul: SMS has no copy of its own — it reuses the existing WhatsApp templates and their selection logic. The WhatsApp opener
-- logic is "two approved openers (initial_contact, initial_opener_v2), the operator picks per send / per batch, no split, no
-- hidden selection" (src/lib/openerVariant.ts) — so the SMS queue takes the SAME choice.
--   · outreach_leads.sms_queued_template   NEW: the opener this lead was queued with (stored on the lead, so a later pick
--                                          or a retry can never switch it — the same rule as whatsapp_template).
--   · queue_sms_openers(uuid[], text)      REPLACES queue_sms_openers(uuid[]) — same checks, plus the template argument.
--   · unqueue_sms / my_sms_queue           clear / return the template.
-- Everything else in 20261019090000 is unchanged. Rollback: re-run that file's queue_sms_openers / my_sms_queue.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

alter table public.outreach_leads add column if not exists sms_queued_template text;

drop function if exists public.queue_sms_openers(uuid[]);
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

create or replace function public.unqueue_sms(_lead_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_was timestamptz; v_method text;
begin
  perform public._require_work(_lead_id);
  select sms_queued_at, contact_method into v_was, v_method from public.outreach_leads where id = _lead_id for update;
  if v_was is null then return jsonb_build_object('ok', true, 'unchanged', true); end if;
  update public.outreach_leads
     set sms_queued_at = null, sms_queued_by_user_id = null, sms_queued_template = null,
         contact_method = case when v_method = 'sms' then null else v_method end
   where id = _lead_id;
  insert into public.lead_activity (lead_id, actor_user_id, kind, data)
  values (_lead_id, auth.uid(), 'details_set', jsonb_build_object('sms_queue', 'removed'));
  return jsonb_build_object('ok', true);
end $function$;

drop function if exists public.my_sms_queue();
create or replace function public.my_sms_queue()
 returns table (id uuid, business_name text, phone text, queued_at timestamptz, queued_by_user_id uuid, template text)
 language sql stable security definer set search_path to 'public'
as $function$
  select l.id, l.business_name, l.phone, l.sms_queued_at, l.sms_queued_by_user_id, l.sms_queued_template
    from public.outreach_leads l
   where l.sms_queued_at is not null and l.is_archived is not true
     and (public.my_role() = 'admin' or (public.my_role() = 'sales' and l.assigned_to_user_id = auth.uid() and not public.lead_is_client(l.amount_paid, l.status)))
   order by l.sms_queued_at, l.id
$function$;
revoke all on function public.my_sms_queue() from public, anon;
grant execute on function public.my_sms_queue() to authenticated;

-- Read back:
--   select pg_get_function_identity_arguments('public.queue_sms_openers(uuid[], text)'::regprocedure);
--   select column_name from information_schema.columns where table_name='outreach_leads' and column_name='sms_queued_template';
--   select count(*) from pg_proc where proname = 'queue_sms_openers';   -- 1
