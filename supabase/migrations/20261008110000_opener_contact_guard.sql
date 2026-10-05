-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- ONE REAL-CONTACT GUARD FOR EVERY COLD OPENER (2026-10-05, post-release consistency fix;
-- docs/pre-sales-certification/sales-workspace-v2.md §12).
--
-- Sales workspace v2 taught sales_queue_opener (campaign launches, the sales bulk queue, the per-lead queue)
-- that a logged CONVERSATION means a cold opener is wrong. The admin's Outreach bulk queue, the admin's
-- per-lead queue, the drip that actually sends, and send-whatsapp-message (the Inbox / one-off template send)
-- did not ask. Now every one asks the SAME function:
--
--   opener_contact_block(lead) → 'contacted_by_phone' | 'contacted_logged' | null
--
-- built on lead_reached_contact (migration 20261008100000), whose outcome list IS lead_conversation_outcomes()
-- = CONVERSATION_OUTCOMES in src/lib/leadState.ts (tested). Not contact, because nothing is logged as a
-- conversation: a Call tap / tel: (writes nothing), no answer, voicemail, opening the lead, the Interested star.
-- It answers the question for a COLD template only — the callers decide that with isColdOutreachTemplate;
-- continuations and free-form replies in an open window never reach it.
--
-- Additive: two new functions; sales_queue_opener re-created from its live body (20261008100000) with the
-- inline lead_reached_contact read replaced by the shared function — same reasons, same order.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.opener_contact_block(_lead_id uuid)
 returns text
 language sql stable security definer set search_path to 'public'
as $function$
  select case when r.at is null then null when r.by_phone then 'contacted_by_phone' else 'contacted_logged' end
    from (select null::int) one
    left join public.lead_reached_contact(_lead_id) r on true
   limit 1
$function$;

/* The batch form, for the Outreach queue dialog's pre-check (one call for a whole selection). */
create or replace function public.opener_contact_blocks(_lead_ids uuid[])
 returns table (lead_id uuid, reason text)
 language sql stable security definer set search_path to 'public'
as $function$
  select x.id, public.opener_contact_block(x.id)
    from unnest(coalesce(_lead_ids, '{}'::uuid[])) as x(id)
$function$;

revoke all on function public.opener_contact_block(uuid) from public, anon, authenticated;
revoke all on function public.opener_contact_blocks(uuid[]) from public, anon, authenticated;
grant execute on function public.opener_contact_block(uuid) to service_role;
grant execute on function public.opener_contact_blocks(uuid[]) to service_role;
grant execute on function public.lead_reached_contact(uuid) to service_role;

-- ── sales_queue_opener: live body, the reached-contact reason now read through opener_contact_block ──
create or replace function public.sales_queue_opener(_lead_ids uuid[], _template text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
        -- A UK mobile (UK/blank country, 07... key), OR an Indian mobile judged from the NUMBER.
        elsif not ((coalesce(v_lead.country, 'UK') = 'UK' and v_pk ~ '^7[0-9]{9}$') or v_pk ~ '^91[6-9][0-9]{9}$') then v_reason := 'not_a_uk_mobile';
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

-- Read back:
--   select proname from pg_proc where proname in ('opener_contact_block', 'opener_contact_blocks');
--   select pg_get_functiondef('public.sales_queue_opener(uuid[],text)'::regprocedure) like '%opener_contact_block(v_id)%';
--   select has_function_privilege('service_role', 'public.opener_contact_block(uuid)', 'EXECUTE');   -- true
--   select has_function_privilege('authenticated', 'public.opener_contact_block(uuid)', 'EXECUTE');  -- false
