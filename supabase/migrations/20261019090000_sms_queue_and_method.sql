-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- SMS QUEUE (works like the WhatsApp queue) + "TEXT" AS A CONTACT METHOD (2026-10-09, feat/sms-queue-and-method).
-- Additive; the WhatsApp queue and its columns are not touched.
--
--   outreach_leads.sms_queued_at / sms_attempts / sms_sent_at / sms_delivery_status   already exist (legacy columns, unused
--                                                                                     since the old SMS product was removed)
--   outreach_leads.sms_queued_by_user_id   NEW: who queued it — the person the text is sent as (attribution)
--   sms_queue_state                        NEW: pause switch + pacing clock (service-role only, like whatsapp_outreach_state)
--
-- The marker is sms_queued_at, NOT a status: a lead's pipeline status never changes because it is waiting for a text.
-- ⛔ COLD RULE (mirrors the WhatsApp cold rule): the queue sends ONE approved opener (sms_opener) and only to a lead that
--    (a) is a UK mobile, (b) is not opted out / wrong number, (c) has never been texted, (d) has no WhatsApp conversation,
--    (e) has had no logged conversation, (f) is still at the start of the pipeline or has no WhatsApp route. Every refusal
--    names its reason. The drip (process-sms-queue) re-checks all of it at send time.
-- ⛔ A salesperson's queue is their own assigned, non-client leads (can_work_lead); admin: any.
-- Rollback: drop the three functions + table + column; re-run the previous lead_set_contact_method (call, whatsapp).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

alter table public.outreach_leads add column if not exists sms_queued_by_user_id uuid;

create table if not exists public.sms_queue_state (
  id integer primary key default 1 check (id = 1),
  paused boolean not null default false,
  next_send_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.sms_queue_state (id) values (1) on conflict (id) do nothing;
alter table public.sms_queue_state enable row level security;   -- no policies: the service role only

-- ── queue ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.queue_sms_openers(_lead_ids uuid[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_role text := public.my_role();
  v_uid uuid := auth.uid();
  v_id uuid;
  v_lead record;
  v_pk text;
  v_queued integer := 0;
  v_skip jsonb := '{}'::jsonb;
  v_reason text;
  v_g jsonb;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
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
       set sms_queued_at = now(), sms_queued_by_user_id = v_uid, sms_attempts = 0, contact_method = 'sms'
     where id = v_id;
    insert into public.lead_activity (lead_id, actor_user_id, kind, data)
    values (v_id, v_uid, 'bulk_queued', jsonb_build_object('channel', 'sms', 'template', 'sms_opener'));
    v_queued := v_queued + 1;
  end loop;

  return jsonb_build_object('ok', true, 'queued', v_queued, 'template', 'sms_opener', 'skipped', v_skip);
end $function$;
revoke all on function public.queue_sms_openers(uuid[]) from public, anon;
grant execute on function public.queue_sms_openers(uuid[]) to authenticated;

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
     set sms_queued_at = null, sms_queued_by_user_id = null,
         contact_method = case when v_method = 'sms' then null else v_method end
   where id = _lead_id;
  insert into public.lead_activity (lead_id, actor_user_id, kind, data)
  values (_lead_id, auth.uid(), 'details_set', jsonb_build_object('sms_queue', 'removed'));
  return jsonb_build_object('ok', true);
end $function$;
revoke all on function public.unqueue_sms(uuid) from public, anon;
grant execute on function public.unqueue_sms(uuid) to authenticated;

-- The caller's own SMS queue (admin: all; a salesperson: their assigned, non-client leads) — the queue panel's rows.
create or replace function public.my_sms_queue()
 returns table (id uuid, business_name text, phone text, queued_at timestamptz, queued_by_user_id uuid)
 language sql stable security definer set search_path to 'public'
as $function$
  select l.id, l.business_name, l.phone, l.sms_queued_at, l.sms_queued_by_user_id
    from public.outreach_leads l
   where l.sms_queued_at is not null and l.is_archived is not true
     and (public.my_role() = 'admin' or (public.my_role() = 'sales' and l.assigned_to_user_id = auth.uid() and not public.lead_is_client(l.amount_paid, l.status)))
   order by l.sms_queued_at, l.id
$function$;
revoke all on function public.my_sms_queue() from public, anon;
grant execute on function public.my_sms_queue() to authenticated;

create or replace function public.sms_queue_info()
 returns jsonb
 language sql stable security definer set search_path to 'public'
as $function$
  select case when public.my_role() is null then null else jsonb_build_object(
    'paused', (select paused from public.sms_queue_state where id = 1),
    'sent_today', (select count(*) from public.sms_messages m
                    where m.direction = 'outbound' and m.test_mode = false and m.status not in ('failed', 'undelivered')
                      and m.created_at >= (date_trunc('day', now() at time zone 'Europe/London') at time zone 'Europe/London')))
  end
$function$;
revoke all on function public.sms_queue_info() from public, anon;
grant execute on function public.sms_queue_info() to authenticated;

create or replace function public.sms_queue_set_paused(_paused boolean)
 returns jsonb
 language plpgsql security definer set search_path to 'public'
as $function$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'admin_only' using errcode = '42501'; end if;
  update public.sms_queue_state set paused = coalesce(_paused, false), updated_at = now() where id = 1;
  return jsonb_build_object('ok', true, 'paused', coalesce(_paused, false));
end $function$;
revoke all on function public.sms_queue_set_paused(boolean) from public, anon;
grant execute on function public.sms_queue_set_paused(boolean) to authenticated;

-- ── Contact Method: a rep may now set Text as well as Call / WhatsApp (the pill is the route, never the evidence) ──
create or replace function public.lead_set_contact_method(_lead_id uuid, _method text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_from text;
begin
  perform public._require_work(_lead_id);
  if _method is null or _method not in ('call', 'whatsapp', 'sms') then
    return jsonb_build_object('ok', false, 'error', 'bad_method');
  end if;
  select contact_method into v_from from public.outreach_leads where id = _lead_id for update;
  if v_from is not distinct from _method then return jsonb_build_object('ok', true, 'unchanged', true); end if;
  update public.outreach_leads set contact_method = _method where id = _lead_id;
  return jsonb_build_object('ok', true);
end $function$;

-- Read back:
--   select proname from pg_proc where proname in ('queue_sms_openers','unqueue_sms','my_sms_queue','sms_queue_info','sms_queue_set_paused');
--   select column_name from information_schema.columns where table_name='outreach_leads' and column_name='sms_queued_by_user_id';
--   select pg_get_functiondef('public.lead_set_contact_method(uuid,text)'::regprocedure) like '%''sms''%';
