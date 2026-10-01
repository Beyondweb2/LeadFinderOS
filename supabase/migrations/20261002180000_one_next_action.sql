-- ONE NEXT ACTION (2026-10-02, Paul: "There should be ONE kind of Next Action").
--
-- Before this, Outreach's Next Action column could show "+ Set" AND, underneath, "Meeting · Fri 2 Oct 15:15" or
-- "Call back · no day set". Two systems: the saved Next Action (next_action / _date / _time / _note), and a
-- display-only hint drawn from call_booked_at or the last logged outcome. call_booked_at outlived its Meeting:
-- completing, clearing or changing a Meeting Next Action left the booking behind, and the "Call booked for"
-- box set a booking with no Meeting at all.
--
-- ⛔ THE RULE NOW: the Next Action is the one thing. call_booked_at is its MIRROR, never set on its own:
--     call_booked_at = the UK instant of next_action_date + next_action_time  when next_action = 'meeting' with a time
--     call_booked_at = null                                                   otherwise
-- lead_set_follow_up writes both in ONE update (the check constraint below holds the shape); lead_set_call_booked
-- (the older meeting box, and Not interested's "cancel the meeting") is now a wrapper over it. "Meeting booked"
-- (salesStateOf), the Meetings list and the reminders keep reading call_booked_at and can no longer disagree with
-- the Next Action. History keeps every call_booked row; a cleared booking says why (reason).

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
  /* Done / Clear (2026-10-02, Paul): the note belongs to the action — it goes with it (History keeps it).
     (Added by the timed-reminders session; kept identical to its 20261002190000 so the live body matches.) */
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

/* The older meeting box ("Call booked for") and Not interested's cancel: the SAME write. A time books the Meeting
   Next Action at that UK day and time (keeping a Meeting's own note); null cancels a Meeting Next Action. */
create or replace function public.lead_set_call_booked(_lead_id uuid, _at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_na text;
  v_note text;
begin
  perform public._require_work(_lead_id);
  select next_action::text, next_action_note into v_na, v_note from public.outreach_leads where id = _lead_id;
  if _at is not null then
    return public.lead_set_follow_up(_lead_id, 'meeting', (_at at time zone 'Europe/London')::date,
      case when v_na = 'meeting' then v_note end, to_char(_at at time zone 'Europe/London', 'HH24:MI'), false);
  end if;
  if v_na = 'meeting' then
    return public.lead_set_follow_up(_lead_id, 'none', null, v_note, null, false);
  end if;
  return jsonb_build_object('ok', true, 'unchanged', true);
end $function$;
