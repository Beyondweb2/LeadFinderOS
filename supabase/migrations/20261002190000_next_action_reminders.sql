-- NEXT ACTION CLEANUP + TIMED REMINDERS (2026-10-02, Paul).
--
-- 1. ✓ Done and Clear take the Next Action's NOTE with them (it belonged to that action; the next one starts
--    blank). History keeps it: follow_up_set's "from" now carries the note. Nothing else is touched — the
--    lead's own notes, learned-on-call facts, contact History and client notes are other columns.
-- 2. The reminder sweep runs HOURLY (was daily at 06:00 UTC), reading UK time:
--      date-only: due today → the first sweep at/after 07:00 UK; an earlier day → the next sweep (overdue).
--      timed:     the first sweep at/after its UK time (next_action_due_at); an overdue one the next sweep.
--      no date:   never (it stays in the filters and the dashboard).
--    ONE reminder per action version: notifications' unique (user_id, dedupe_key), keyed on the lead, the
--    type, the day and — for a timed action — the time. A reschedule, a new time or a new type is a new key, so
--    it can be reminded again; an unchanged overdue action is never reminded twice. The recipient is the lead's
--    owner AT THE SWEEP (lead_recipient), so a transfer before the reminder reaches the new owner only.
--    Exclusions unchanged: archived leads and 'none' are never reminded. The date-only key is the old one, so
--    nothing already reminded is reminded again by this change.

/* ⛔ BUILT ON 20261002180000_one_next_action.sql (feat/one-next-action, applied live first): its booking mirror —
   call_booked_at = the timed Meeting's UK instant, or null — is kept byte for byte; only the two lines above change. */
create or replace function public.lead_set_follow_up(_lead_id uuid, _next_action text, _date date, _note text, _time text DEFAULT NULL::text, _done boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  /* Done / Clear (2026-10-02, Paul): the note belongs to the action — it goes with it (History keeps it). */
  if v_action = 'none' then v_date := null; v_note := null; end if;
  if v_date is null then v_time := null; end if;
  /* The booking is the Meeting's own moment, or nothing. */
  v_at := case when v_action = 'meeting' and v_time is not null then public.next_action_due_at(v_date, v_time) end;
  select next_action::text as na, next_action_date as d, next_action_time as t, next_action_note as n, call_booked_at as cb
    into v_old from public.outreach_leads where id = _lead_id for update;
  if v_old.na is not distinct from v_action::text and v_old.d is not distinct from v_date
     and v_old.t is not distinct from v_time and v_old.n is not distinct from v_note then
    if v_old.cb is not distinct from v_at then
      return jsonb_build_object('ok', true, 'unchanged', true);
    end if;
    v_change := 'synced';
  else
    v_change := case
      when v_action = 'none' then case when coalesce(_done, false) then 'completed' else 'cleared' end
      when coalesce(v_old.na, 'none') = 'none' then 'set'
      when v_old.na <> v_action::text then 'changed'
      when v_old.d is distinct from v_date or v_old.t is distinct from v_time then 'rescheduled'
      else 'updated' end;
  end if;
  update public.outreach_leads
     set next_action = v_action, next_action_date = v_date, next_action_time = v_time, next_action_note = v_note,
         call_booked_at = v_at
   where id = _lead_id;
  if v_change <> 'synced' then
    insert into public.lead_activity (lead_id, actor_user_id, kind, data)
    values (_lead_id, auth.uid(), 'follow_up_set', jsonb_build_object(
      'next_action', v_action::text, 'date', v_date, 'time', to_char(v_time, 'HH24:MI'), 'note', v_note, 'change', v_change,
      'from', jsonb_build_object('next_action', v_old.na, 'date', v_old.d, 'time', to_char(v_old.t, 'HH24:MI'), 'note', v_old.n)));
  end if;
  if v_old.cb is distinct from v_at then
    insert into public.lead_activity (lead_id, actor_user_id, kind, data)
    values (_lead_id, auth.uid(), 'call_booked', jsonb_build_object('at', v_at,
      'reason', case when v_at is not null then 'booked'
                     when v_change = 'completed' then 'completed'
                     when v_change = 'changed' then 'changed'
                     when v_action = 'meeting' then 'time_removed'
                     else 'cleared' end));
  end if;
  return jsonb_build_object('ok', true, 'change', v_change);
end $function$;
revoke all on function public.lead_set_follow_up(uuid, text, date, text, text, boolean) from public, anon;
grant execute on function public.lead_set_follow_up(uuid, text, date, text, text, boolean) to authenticated;

create or replace function public.notify_due_follow_ups()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_now timestamptz := now();
  v_uk timestamp := now() at time zone 'Europe/London';
  v_today date := (now() at time zone 'Europe/London')::date;
  v_morning boolean := extract(hour from (now() at time zone 'Europe/London')) >= 7;
  n integer := 0; r record; v_overdue boolean; v_title text; v_body text; v_key text;
begin
  for r in
    select l.id, l.business_name, l.next_action::text as na, l.next_action_date as d, l.next_action_time as t, public.lead_recipient(l.id) as to_user
    from public.outreach_leads l
    where l.next_action is not null and l.next_action::text <> 'none' and l.next_action_date is not null and l.is_archived is not true
      and ((l.next_action_time is null and (l.next_action_date < v_today or (l.next_action_date = v_today and v_morning)))
        or (l.next_action_time is not null and public.next_action_due_at(l.next_action_date, l.next_action_time) <= v_now))
  loop
    begin
      if r.t is null then
        v_overdue := r.d < v_today;
        v_title := case when v_overdue then 'Follow-up overdue' else 'Follow-up due today' end;
        v_body := coalesce(r.business_name, 'A lead') || ' — ' || public.next_action_label(r.na)
          || case when v_overdue then ' (was due ' || to_char(r.d, 'Dy FMDD Mon') || ')' else ' today' end;
        v_key := 'followup:' || r.id || ':' || r.na || ':' || r.d;
      else
        v_overdue := public.next_action_due_at(r.d, r.t) < v_now - interval '1 hour';
        v_title := case when v_overdue then 'Follow-up overdue' else 'Follow-up due now' end;
        v_body := coalesce(r.business_name, 'A lead') || ' — ' || public.next_action_label(r.na) || ' at ' || to_char(r.t, 'HH24:MI')
          || case when r.d <> v_today then ' on ' || to_char(r.d, 'Dy FMDD Mon') else '' end;
        v_key := 'followup:' || r.id || ':' || r.na || ':' || r.d || ':' || to_char(r.t, 'HH24:MI');
      end if;
      if r.to_user is not null and not exists (select 1 from public.notifications where user_id = r.to_user and dedupe_key = v_key) then
        perform public.notify_person(r.to_user, 'follow_up_due', v_title, v_body, '/inbox?lead=' || r.id, r.id, v_key, 1::smallint);
        n := n + 1;
      end if;
    exception when others then raise warning 'notify_due_follow_ups: %', sqlerrm;
    end;
  end loop;
  return n;
end $function$;
revoke all on function public.notify_due_follow_ups() from public, anon, authenticated;

-- Hourly, on the hour (UTC hours are UK hours, BST or GMT alike). Same job, new schedule.
select cron.schedule('notify-follow-ups-due', '0 * * * *', 'select public.notify_due_follow_ups()');
