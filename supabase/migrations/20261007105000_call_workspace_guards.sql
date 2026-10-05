-- Call workspace guards (fix workstream 5, pre-sales certification, 2026-10-04).
--
-- 1. A DOUBLE-SUBMITTED CALL OUTCOME IS ONE CALL (Session E, E-12 / M-053). Two taps 20 ms apart wrote two
--    call_outcome rows and inflated the call count. lead_log_contact and lead_record_call now lock the lead
--    row, then refuse to write a SECOND identical row — same lead, same person, same kind, same outcome,
--    same channel, same note — inside call_log_dedupe_window(). They answer ok with `duplicate: true`, so a
--    retry after a lost response is safe. Conservative on purpose: a different outcome, a different note,
--    another person, or the same outcome after the window is a separate contact and is recorded.
--
-- 2. A STALE TAB CANNOT SILENTLY REPLACE A NEXT ACTION (Session E, E-13 / M-052). lead_set_follow_up takes an
--    optional `_expected` — what the screen showed when the person opened the editor
--    ({"next_action": "...", "date": "YYYY-MM-DD"|null, "time": "HH:MM"|null}). When the stored action, day
--    or time no longer match it, nothing is written and it answers `stale_next_action` with the current
--    values; the screen asks "replace it?" and only a yes sends again (with the new expectation).
--    Absent `_expected` = the old behaviour (bulk menu, outcome clears, lead_set_call_booked, the admin brief).
--    A note-only difference is not "material" and does not block.
--
-- ⛔ The 6-argument lead_set_follow_up is DROPPED and recreated with a 7th defaulted argument: keeping both
--    would make every named-argument call ambiguous ("could not choose the best candidate function").
--    Every existing caller (positional in lead_set_call_booked / assign_lead_with_brief, named from the SPA)
--    resolves to the new one unchanged. The body is the live definition (read 2026-10-04) plus the check.
-- Apply ONE statement block at a time, read back pg_get_functiondef, THEN deploy the SPA that sends _expected.

create or replace function public.call_log_dedupe_window()
returns interval language sql immutable as $$ select interval '10 seconds' $$;
comment on function public.call_log_dedupe_window() is
  'An identical call/contact outcome from the same person on the same lead inside this window is one contact (double-submit guard).';

create or replace function public.lead_log_contact(_lead_id uuid, _channel text, _outcome text, _note text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_note text := nullif(btrim(coalesce(_note, '')), '');
  v_kind text;
begin
  perform public._require_work(_lead_id);
  if _channel is null or _channel not in ('call', 'email', 'linkedin', 'facebook', 'instagram', 'linkedin_voice', 'social', 'sms', 'in_person', 'referral', 'video', 'other') then
    return jsonb_build_object('ok', false, 'error', 'bad_channel');
  end if;
  if _outcome is null or _outcome not in ('no_answer', 'left_voicemail', 'message_sent', 'connection_sent', 'spoke_to_owner', 'interested', 'call_back',
       'meeting_booked', 'not_interested', 'wrong_number', 'agency_controls_site') then
    return jsonb_build_object('ok', false, 'error', 'bad_outcome');
  end if;
  v_kind := case when _channel = 'call' then 'call_outcome' else 'contact_logged' end;
  /* One writer at a time per lead, so two taps cannot both pass the check below. */
  perform 1 from public.outreach_leads where id = _lead_id for update;
  if exists (
    select 1 from public.lead_activity a
     where a.lead_id = _lead_id and a.kind = v_kind
       and a.actor_user_id is not distinct from auth.uid()
       and a.data ->> 'outcome' = _outcome
       and coalesce(a.data ->> 'channel', 'call') = _channel
       and a.body is not distinct from v_note
       and a.created_at > now() - public.call_log_dedupe_window()
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  insert into public.lead_activity (lead_id, actor_user_id, kind, body, data)
  values (_lead_id, auth.uid(), v_kind, v_note, jsonb_build_object('outcome', _outcome, 'channel', _channel));
  return jsonb_build_object('ok', true);
end $function$;

create or replace function public.lead_record_call(_lead_id uuid, _outcome text, _note text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_note text := nullif(btrim(coalesce(_note, '')), '');
begin
  perform public._require_work(_lead_id);
  if _outcome not in ('no_answer', 'spoke_to_owner', 'interested', 'call_back', 'not_interested', 'wrong_number', 'agency_controls_site') then
    return jsonb_build_object('ok', false, 'error', 'bad_outcome');
  end if;
  perform 1 from public.outreach_leads where id = _lead_id for update;
  if exists (
    select 1 from public.lead_activity a
     where a.lead_id = _lead_id and a.kind = 'call_outcome'
       and a.actor_user_id is not distinct from auth.uid()
       and a.data ->> 'outcome' = _outcome
       and coalesce(a.data ->> 'channel', 'call') = 'call'
       and a.body is not distinct from v_note
       and a.created_at > now() - public.call_log_dedupe_window()
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  insert into public.lead_activity (lead_id, actor_user_id, kind, body, data)
  values (_lead_id, auth.uid(), 'call_outcome', v_note, jsonb_build_object('outcome', _outcome));
  return jsonb_build_object('ok', true);
end
$function$;

drop function if exists public.lead_set_follow_up(uuid, text, date, text, text, boolean);

create function public.lead_set_follow_up(_lead_id uuid, _next_action text, _date date, _note text, _time text default null::text, _done boolean default false, _expected jsonb default null::jsonb)
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
  v_exp_date date;
  v_exp_time text;
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
  /* ⛔ THE STALE-SCREEN CHECK (2026-10-04): the screen says what it showed; if the action, day or time has
     changed since (another tab, another device, Paul), nothing is replaced silently. Saving exactly what is
     already stored is not a conflict (falls through to `unchanged`). */
  if _expected is not null and jsonb_typeof(_expected) = 'object' then
    begin
      v_exp_date := nullif(_expected ->> 'date', '')::date;
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'bad_expected');
    end;
    v_exp_time := nullif(left(coalesce(_expected ->> 'time', ''), 5), '');
    if (coalesce(v_old.na, 'none') is distinct from coalesce(nullif(_expected ->> 'next_action', ''), 'none')
        or v_old.d is distinct from v_exp_date
        or to_char(v_old.t, 'HH24:MI') is distinct from v_exp_time)
       and not (v_old.na is not distinct from v_action::text and v_old.d is not distinct from v_date
                and v_old.t is not distinct from v_time) then
      return jsonb_build_object('ok', false, 'error', 'stale_next_action', 'current', jsonb_build_object(
        'next_action', coalesce(v_old.na, 'none'), 'date', v_old.d, 'time', to_char(v_old.t, 'HH24:MI'), 'note', v_old.n));
    end if;
  end if;
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

revoke all on function public.lead_set_follow_up(uuid, text, date, text, text, boolean, jsonb) from public, anon;
grant execute on function public.lead_set_follow_up(uuid, text, date, text, text, boolean, jsonb) to authenticated, service_role;
revoke all on function public.call_log_dedupe_window() from public, anon;
grant execute on function public.call_log_dedupe_window() to authenticated, service_role;
