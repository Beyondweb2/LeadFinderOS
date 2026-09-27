-- SALES ON THE SHARED OUTREACH + INBOX (2026-09-27, Paul's approval). Additive. Applied one statement
-- at a time via the Management API and read back (docs/multi-user.md §9).
--
-- ⛔ Sales still has NO direct write on outreach_leads (the restrictive admin-only policy stays). Every
-- change a salesperson makes goes through one of these SECURITY DEFINER functions, each of which runs
-- _require_work (a role, and for sales: assigned to the caller and not a client) before touching the row.

-- 1. The activity kinds the new functions log. Same list plus three; nothing existing is refused.
alter table public.lead_activity drop constraint lead_activity_kind_check, add constraint lead_activity_kind_check check (kind = any (array['lead_added','lead_claimed','lead_assigned','lead_unassigned','note','stage_changed','follow_up_set','call_booked','call_outcome','website_control_set','audit_run','bulk_queued','marked_interested','details_set','archived_set']));

-- 2. Mark (or unmark) a lead interested — the ⭐ flag, is_potential_work. NOT a status: the admin's
--    Outreach and Inbox treat "Interested" as a star that leaves the pipeline status alone, and this is
--    the same behaviour for a salesperson.
create or replace function public.lead_mark_interested(_lead_id uuid, _on boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_from boolean;
begin
  perform public._require_work(_lead_id);
  select is_potential_work into v_from from public.outreach_leads where id = _lead_id for update;
  if v_from is not distinct from coalesce(_on, true) then return jsonb_build_object('ok', true, 'unchanged', true); end if;
  update public.outreach_leads set is_potential_work = coalesce(_on, true) where id = _lead_id;
  insert into public.lead_activity (lead_id, actor_user_id, kind, data)
  values (_lead_id, auth.uid(), 'marked_interested', jsonb_build_object('on', coalesce(_on, true)));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.lead_mark_interested(uuid, boolean) from public, anon;
grant execute on function public.lead_mark_interested(uuid, boolean) to authenticated;

-- 3. Save the contact name / trade / town on a lead. NULL = leave that field as it is; '' = clear it.
--    Exactly these three columns — the ones the Inbox hook follow-up and the Hook Audit prompt need.
create or replace function public.lead_set_details(_lead_id uuid, _contact_name text default null, _search_keyword text default null, _search_location text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_changed jsonb := '{}'::jsonb;
begin
  perform public._require_work(_lead_id);
  if coalesce(length(_contact_name), 0) > 200 or coalesce(length(_search_keyword), 0) > 200 or coalesce(length(_search_location), 0) > 200 then
    return jsonb_build_object('ok', false, 'error', 'too_long');
  end if;
  if _contact_name is not null then v_changed := v_changed || jsonb_build_object('contact_name', nullif(btrim(_contact_name), '')); end if;
  if _search_keyword is not null then v_changed := v_changed || jsonb_build_object('search_keyword', nullif(btrim(_search_keyword), '')); end if;
  if _search_location is not null then v_changed := v_changed || jsonb_build_object('search_location', nullif(btrim(_search_location), '')); end if;
  if v_changed = '{}'::jsonb then return jsonb_build_object('ok', true, 'unchanged', true); end if;
  update public.outreach_leads set
    contact_name    = case when _contact_name    is null then contact_name    else nullif(btrim(_contact_name), '') end,
    search_keyword  = case when _search_keyword  is null then search_keyword  else nullif(btrim(_search_keyword), '') end,
    search_location = case when _search_location is null then search_location else nullif(btrim(_search_location), '') end
  where id = _lead_id;
  insert into public.lead_activity (lead_id, actor_user_id, kind, data) values (_lead_id, auth.uid(), 'details_set', v_changed);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.lead_set_details(uuid, text, text, text) from public, anon;
grant execute on function public.lead_set_details(uuid, text, text, text) to authenticated;

-- 4. Archive / unarchive a lead the caller works. Archiving STOPS contact (both queues skip archived
--    leads) and takes it out of the pool; it never deletes anything, and the owner is unchanged.
create or replace function public.lead_set_archived(_lead_id uuid, _archived boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_from boolean;
begin
  perform public._require_work(_lead_id);
  if _archived is null then return jsonb_build_object('ok', false, 'error', 'bad_value'); end if;
  select is_archived into v_from from public.outreach_leads where id = _lead_id for update;
  if v_from is not distinct from _archived then return jsonb_build_object('ok', true, 'unchanged', true); end if;
  update public.outreach_leads set is_archived = _archived where id = _lead_id;
  insert into public.lead_activity (lead_id, actor_user_id, kind, data) values (_lead_id, auth.uid(), 'archived_set', jsonb_build_object('archived', _archived));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.lead_set_archived(uuid, boolean) from public, anon;
grant execute on function public.lead_set_archived(uuid, boolean) to authenticated;

-- 5. Bulk initial outreach with THE TEMPLATE THE USER CHOSE for this batch (no global selected opener).
--    Same checks as before, in the same order; the chosen template is stored on each lead and the queue
--    sends exactly that. Only an approved cold opener is accepted.
create or replace function public.sales_queue_opener(_lead_ids uuid[], _template text)
returns jsonb language plpgsql security definer set search_path = public as $$
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
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if v_template = '' then return jsonb_build_object('ok', false, 'error', 'template_required'); end if;
  if v_template not in ('initial_contact', 'initial_opener_v2') then return jsonb_build_object('ok', false, 'error', 'not_an_initial_opener'); end if;
  if _lead_ids is null or array_length(_lead_ids, 1) is null then return jsonb_build_object('ok', false, 'error', 'no_leads'); end if;
  if array_length(_lead_ids, 1) > 200 then return jsonb_build_object('ok', false, 'error', 'too_many'); end if;

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
end $$;
revoke all on function public.sales_queue_opener(uuid[], text) from public, anon;
grant execute on function public.sales_queue_opener(uuid[], text) to authenticated;

-- 6. The old one-argument form read the GLOBAL selected opener (whatsapp_outreach_state.
--    initial_opener_template). There is no global selection any more, so it now refuses — nothing can
--    reach the stored setting through it. (Replaced rather than dropped: no destructive DDL.)
create or replace function public.sales_queue_opener(_lead_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is null then raise exception 'no_role' using errcode = '42501'; end if;
  return jsonb_build_object('ok', false, 'error', 'template_required');
end $$;

-- 7. The follow-up setter accepted four next actions; the shared Outreach table offers every value of
--    the next_action_type enum. Same checks (_require_work first), same activity row — the enum itself
--    is now the allowlist, so an unknown value is still refused (by the cast, reported as bad_next_action).
create or replace function public.lead_set_follow_up(_lead_id uuid, _next_action text, _date date, _note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_action public.next_action_type;
begin
  perform public._require_work(_lead_id);
  begin
    v_action := coalesce(_next_action, 'none')::public.next_action_type;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'error', 'bad_next_action');
  end;
  update public.outreach_leads
     set next_action = v_action,
         next_action_date = _date,
         next_action_note = nullif(btrim(coalesce(_note, '')), '')
   where id = _lead_id;
  insert into public.lead_activity (lead_id, actor_user_id, kind, data)
  values (_lead_id, auth.uid(), 'follow_up_set',
          jsonb_build_object('next_action', v_action::text, 'date', _date, 'note', nullif(btrim(coalesce(_note, '')), '')));
  return jsonb_build_object('ok', true);
end $$;
