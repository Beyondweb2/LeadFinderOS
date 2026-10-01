-- AN OPTIONAL TIME FOR EVERY NEXT ACTION (2026-10-02, Paul).
--
-- ⛔ ONE TIME: outreach_leads.next_action_time — a UK wall-clock time (HH:MM) on next_action_date (a UK day).
-- Together they are the Next Action's moment, read as Europe/London (next_action_due_at), so 14:30 means 14:30
-- UK in summer (BST) and winter (GMT) alike, whatever clock the person's computer runs on. Null = no time:
-- every existing row stays exactly as it was (date-only, day-based due rules).
-- Why not call_booked_at: it is the MEETING BOOKED fact (salesStateOf's "Meeting booked", the meeting line);
-- a call at 14:30 must not make a lead "Meeting booked". So a Meeting's time lives here like every other
-- action's, and the booking follows it: a Meeting saved with a time sets call_booked_at to that instant
-- (lead_set_follow_up), and moving the booked time moves a Meeting next action with it (lead_set_call_booked).
-- One time per meeting, written in one place each way. Migration: 0 rows (no lead had a Meeting next action).

alter table public.outreach_leads add column if not exists next_action_time time;
alter table public.outreach_leads drop constraint if exists outreach_leads_next_action_time_needs_day;
alter table public.outreach_leads add constraint outreach_leads_next_action_time_needs_day
  check (next_action_time is null or next_action_date is not null);

/* The UK instant of a Next Action with a time; null without one. */
create or replace function public.next_action_due_at(_d date, _t time)
 returns timestamptz language sql stable set search_path to 'public'
as $function$ select case when _d is null or _t is null then null else ((_d + _t) at time zone 'Europe/London') end $function$;

/* The words for a stored type — the SQL twin of NEXT_ACTION_LABEL (src/lib/nextActionView.ts); the suite
   holds the two equal. Never a raw enum value in a notification. */
create or replace function public.next_action_label(_na text)
 returns text language sql immutable set search_path to 'public'
as $function$ select case _na
  when 'call' then 'Call' when 'send_follow_up' then 'WhatsApp follow-up' when 'email' then 'Email'
  when 'follow_up' then 'Follow up' when 'send_info' then 'Send information' when 'send_proposal' then 'Send proposal'
  when 'chase_payment' then 'Chase payment' when 'meeting' then 'Meeting' when 'send_voice_note' then 'Voice note'
  when 'send_initial_text' then 'Send opener' when '2nd_follow_up' then 'Second follow-up' when 'send_draft' then 'Send link'
  when 'check_3_day_removal' then 'Check in' when 'remove_if_no_reply' then 'Close if no reply'
  else replace(coalesce(_na, ''), '_', ' ') end $function$;

/* THE ONE NEXT-ACTION WRITE, both roles. Two optional arguments (old four-argument callers still work):
   _time 'HH:MM' (UK) or null; _done — the ✓ Done button (History says completed, not cleared).
   History (lead_activity follow_up_set) says what happened: set / rescheduled / changed / updated (the note) /
   completed / cleared, with what it was before. A save that changes nothing writes nothing. */
drop function if exists public.lead_set_follow_up(uuid, text, date, text);
create or replace function public.lead_set_follow_up(_lead_id uuid, _next_action text, _date date, _note text, _time text default null, _done boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_action public.next_action_type;
  v_date date := _date;
  v_time time;
  v_note text := nullif(btrim(coalesce(_note, '')), '');
  v_old record;
  v_change text;
  v_at timestamptz;
begin
  perform public._require_work(_lead_id);
  begin
    v_action := coalesce(_next_action, 'none')::public.next_action_type;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'error', 'bad_next_action');
  end;
  if nullif(btrim(coalesce(_time, '')), '') is not null then
    if btrim(_time) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return jsonb_build_object('ok', false, 'error', 'bad_time'); end if;
    v_time := btrim(_time)::time;
  end if;
  if v_action = 'none' then v_date := null; end if;
  if v_date is null then v_time := null; end if;
  select next_action::text as na, next_action_date as d, next_action_time as t, next_action_note as n, call_booked_at as cb
    into v_old from public.outreach_leads where id = _lead_id for update;
  if v_old.na is not distinct from v_action::text and v_old.d is not distinct from v_date
     and v_old.t is not distinct from v_time and v_old.n is not distinct from v_note then
    return jsonb_build_object('ok', true, 'unchanged', true);
  end if;
  v_change := case
    when v_action = 'none' then case when coalesce(_done, false) then 'completed' else 'cleared' end
    when coalesce(v_old.na, 'none') = 'none' then 'set'
    when v_old.na <> v_action::text then 'changed'
    when v_old.d is distinct from v_date or v_old.t is distinct from v_time then 'rescheduled'
    else 'updated' end;
  update public.outreach_leads
     set next_action = v_action, next_action_date = v_date, next_action_time = v_time, next_action_note = v_note
   where id = _lead_id;
  insert into public.lead_activity (lead_id, actor_user_id, kind, data)
  values (_lead_id, auth.uid(), 'follow_up_set', jsonb_build_object(
    'next_action', v_action::text, 'date', v_date, 'time', to_char(v_time, 'HH24:MI'), 'note', v_note, 'change', v_change,
    'from', jsonb_build_object('next_action', v_old.na, 'date', v_old.d, 'time', to_char(v_old.t, 'HH24:MI'))));
  /* A Meeting with a time IS the booked meeting: the booking follows it (one time, one place). */
  if v_action = 'meeting' and v_time is not null then
    v_at := public.next_action_due_at(v_date, v_time);
    if v_old.cb is distinct from v_at then
      update public.outreach_leads set call_booked_at = v_at where id = _lead_id;
      insert into public.lead_activity (lead_id, actor_user_id, kind, data) values (_lead_id, auth.uid(), 'call_booked', jsonb_build_object('at', v_at));
    end if;
  end if;
  return jsonb_build_object('ok', true, 'change', v_change);
end $function$;
revoke all on function public.lead_set_follow_up(uuid, text, date, text, text, boolean) from public, anon;
grant execute on function public.lead_set_follow_up(uuid, text, date, text, text, boolean) to authenticated;

/* The booked meeting time and a Meeting next action are one time: moving the booking moves the Meeting. */
create or replace function public.lead_set_call_booked(_lead_id uuid, _at timestamp with time zone)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public._require_work(_lead_id);
  update public.outreach_leads set call_booked_at = _at where id = _lead_id;
  insert into public.lead_activity (lead_id, actor_user_id, kind, data)
  values (_lead_id, auth.uid(), 'call_booked', jsonb_build_object('at', _at));
  if _at is not null then
    update public.outreach_leads
       set next_action_date = (_at at time zone 'Europe/London')::date,
           next_action_time = date_trunc('minute', _at at time zone 'Europe/London')::time
     where id = _lead_id and next_action = 'meeting'
       and (next_action_date, next_action_time) is distinct from ((_at at time zone 'Europe/London')::date, date_trunc('minute', _at at time zone 'Europe/London')::time);
  end if;
  return jsonb_build_object('ok', true);
end
$function$;

/* The daily reminder: the action's words and its time, never a raw value. Day-based as before (it runs once a
   day): due today or overdue by day; a timed action today is "due today at 14:30". */
create or replace function public.notify_due_follow_ups()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_today date := (now() at time zone 'Europe/London')::date; n integer := 0; r record;
begin
  for r in
    select l.id, l.business_name, l.next_action::text as na, l.next_action_date, l.next_action_time, public.lead_recipient(l.id) as to_user
    from public.outreach_leads l
    where l.next_action is not null and l.next_action::text <> 'none' and l.next_action_date is not null
      and l.next_action_date <= v_today and l.is_archived is not true
  loop
    begin
      perform public.notify_person(r.to_user, 'follow_up_due',
        case when r.next_action_date < v_today then 'Follow-up overdue' else 'Follow-up due today' end,
        coalesce(r.business_name, 'A lead') || ' — ' || public.next_action_label(r.na)
          || case when r.next_action_time is not null then ' at ' || to_char(r.next_action_time, 'HH24:MI') else '' end,
        '/inbox?lead=' || r.id, r.id,
        'followup:' || r.id || ':' || r.na || ':' || r.next_action_date, 1::smallint);
      n := n + 1;
    exception when others then raise warning 'notify_due_follow_ups: %', sqlerrm;
    end;
  end loop;
  return n;
end $function$;

-- The team brief keeps a time when it keeps the day.
CREATE OR REPLACE FUNCTION public.assign_lead_with_brief(_lead_id uuid, _to_user_id uuid, _note text, _due date, _reason text, _client_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r jsonb; l record; v_post uuid; v_from uuid; v_note text := nullif(btrim(coalesce(_note, '')), ''); v_notified boolean := false;
begin
  if public.my_role() is distinct from 'admin' then raise exception 'admin_only' using errcode = '42501'; end if;
  if _client_key is not null and exists (select 1 from public.team_posts where client_key = _client_key) then
    return jsonb_build_object('ok', true, 'duplicate', true); end if;
  select assigned_to_user_id into v_from from public.outreach_leads where id = _lead_id;
  r := public.assign_lead(_lead_id, _to_user_id);
  if not coalesce((r->>'ok')::boolean, false) or coalesce((r->>'unchanged')::boolean, false) then return r; end if;
  if _to_user_id is null or not public._team_eligible(_to_user_id) then return r || jsonb_build_object('task', false); end if;

  -- A due date given here IS the lead's Next Action (one date). The type is kept, or becomes a follow-up.
  if _due is not null then
    select next_action::text as na, next_action_note, next_action_date as d, next_action_time as t into l from public.outreach_leads where id = _lead_id;
    -- The time is kept when the day is (2026-10-02): a brief that re-dates the action drops a time for the old day.
    perform public.lead_set_follow_up(_lead_id, case when l.na is null or l.na = 'none' then 'follow_up' else l.na end, _due, l.next_action_note,
      case when l.d = _due then to_char(l.t, 'HH24:MI') end);
  end if;

  select id, business_name, assigned_at into l from public.outreach_leads where id = _lead_id;
  insert into public.team_posts (author_user_id, kind, title, body, details, lead_id, status, audience, recipients, client_key)
    values (auth.uid(), 'lead_assignment', coalesce(nullif(btrim(l.business_name), ''), 'A lead'), v_note,
            jsonb_strip_nulls(jsonb_build_object('reason', nullif(btrim(coalesce(_reason, '')), ''), 'from_user', v_from)),
            _lead_id, 'draft', 'selected', array[_to_user_id], _client_key)
    returning id into v_post;
  insert into public.team_post_events (post_id, actor_user_id, kind, data) values (v_post, auth.uid(), 'created', jsonb_build_object('from', v_from, 'to', _to_user_id));
  perform public._team_publish(v_post);

  -- The one notice is the assignment trigger's; it now carries the instructions.
  update public.notifications set body = left(coalesce('Instructions: ' || v_note, 'On your Team board now.') || ' It is in your Inbox and Outreach with its whole conversation.', 280)
    where user_id = _to_user_id and dedupe_key = 'assigned:' || _lead_id || ':' || l.assigned_at::text;
  select exists (select 1 from public.notifications where user_id = _to_user_id and dedupe_key = 'assigned:' || _lead_id || ':' || l.assigned_at::text) into v_notified;
  -- History: the assignment row assign_lead just wrote gains the note and the board task.
  update public.lead_activity set data = data || jsonb_strip_nulls(jsonb_build_object('note', v_note, 'team_post_id', v_post))
    where id = (select id from public.lead_activity where lead_id = _lead_id and kind = 'lead_assigned' and actor_user_id = auth.uid() order by created_at desc limit 1);
  return r || jsonb_build_object('task', true, 'task_id', v_post, 'notified', v_notified);
end $function$;

-- The Team Board's lead line carries the time.
CREATE OR REPLACE FUNCTION public.team_board_mine()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(x order by x->>'published_at' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', p.id, 'kind', p.kind, 'title', p.title, 'body', p.body, 'details', p.details, 'link', p.link,
      'due_date', p.due_date, 'priority', p.priority, 'published_at', p.published_at, 'edited_at', p.edited_at,
      'author', coalesce((select nullif(btrim(t.display_name), '') from public.team_members t where t.user_id = p.author_user_id), 'Admin'),
      'read_at', r.read_at, 'task_status', r.task_status, 'status_at', r.status_at, 'completed_at', r.completed_at,
      'cancelled_reason', r.cancelled_reason,
      'lead', case when p.lead_id is null then null
        when public.can_work_lead(p.lead_id) then (select jsonb_build_object('id', l.id, 'name', l.business_name, 'next_action', l.next_action::text,
          'next_action_date', l.next_action_date, 'next_action_time', to_char(l.next_action_time, 'HH24:MI'), 'next_action_note', l.next_action_note, 'mine', true) from public.outreach_leads l where l.id = p.lead_id)
        else jsonb_build_object('id', null, 'name', null, 'mine', false) end
    ) as x
    from public.team_post_recipients r join public.team_posts p on p.id = r.post_id
    where r.user_id = auth.uid() and p.status = 'published' and p.published_at > now() - interval '120 days'
  ) s
$function$;

CREATE OR REPLACE FUNCTION public.team_board_admin(_days integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'admin_only' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(x order by coalesce(x->>'published_at', x->>'created_at') desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', p.id, 'kind', p.kind, 'title', p.title, 'body', p.body, 'details', p.details, 'link', p.link, 'status', p.status,
      'due_date', p.due_date, 'priority', p.priority, 'created_at', p.created_at, 'published_at', p.published_at,
      'edited_at', p.edited_at, 'edit_count', p.edit_count, 'audience', p.audience, 'recipient_ids', to_jsonb(p.recipients), 'follow_up_of', p.follow_up_of,
      'lead', case when p.lead_id is null then null else (select jsonb_build_object('id', l.id, 'name', l.business_name,
        'owner', l.assigned_to_user_id, 'next_action', l.next_action::text, 'next_action_date', l.next_action_date, 'next_action_time', to_char(l.next_action_time, 'HH24:MI')) from public.outreach_leads l where l.id = p.lead_id) end,
      'recipients', coalesce((select jsonb_agg(jsonb_build_object('user_id', r.user_id,
          'name', coalesce((select t.display_name from public.team_members t where t.user_id = r.user_id), 'Former member'),
          'read_at', r.read_at, 'task_status', r.task_status, 'status_at', r.status_at, 'completed_at', r.completed_at,
          'cancelled_reason', r.cancelled_reason) order by r.created_at) from public.team_post_recipients r where r.post_id = p.id), '[]'::jsonb)
    ) as x
    from public.team_posts p
    where p.status = 'draft' or (p.status = 'published' and p.published_at > now() - make_interval(days => greatest(1, least(coalesce(_days, 60), 365))))
  ) s);
end $function$;

-- The sales view: next_action_time appended at the END (create or replace view can only add columns there).
-- Body otherwise byte-for-byte the 20260930140000 definition (read back live with pg_get_viewdef, 2026-10-02).
create or replace view public.sales_leads with (security_barrier = true) as
select
  l.id, l.business_name, l.phone, l.email, l.google_maps_url, l.address, l.category, l.status,
  l.next_action, l.next_action_date, l.next_action_note, l.call_booked_at, l.created_at, l.updated_at,
  l.country, l.list_type, l.is_archived, l.is_potential_work, l.image_url, l.facebook_url, l.instagram_url,
  l.contact_method, l.place_id, l.whatsapp_status, l.whatsapp_sent_at, l.whatsapp_delivery_status,
  l.whatsapp_template, l.queued_at, l.contact_name, l.website, l.campaign_id, l.search_keyword,
  l.search_location, l.derived_town, l.review_count, l.rating, l.lat, l.lng, l.line_type, l.product,
  l.hook_followup_queued_at, l.contact_followup_queued_at,
  l.assigned_to_user_id, l.assigned_at, l.added_by_user_id, l.website_control, l.website_control_note,
  null::numeric as amount_paid,
  l.lead_source,
  l.services_included, l.service_areas,
  l.domain_control,
  l.town_fetch_note,
  l.linkedin_url, l.facebook_status, l.instagram_status, l.linkedin_status,
  l.next_action_time
from public.outreach_leads l
where (select public.my_role()) in ('sales', 'admin')
  and ((select public.my_role()) = 'admin' or l.assigned_to_user_id = (select auth.uid()))
  and not public.lead_is_client(l.amount_paid, l.status);
revoke all on public.sales_leads from public, anon, authenticated;
grant select on public.sales_leads to authenticated;
