-- Rolled-back live test: the one next-action write persists type, day, note, a meeting's time; edit,
-- reschedule, complete; both roles (2026-10-02). Output: QA_RESULT [ {check: bool}, ... ].
do $$
declare
  paul uuid := '9d5a7629-3171-4091-b3a4-43010a1d424d';
  test uuid := '262c1d64-05ad-42e8-a81b-7d25553aeff3';
  a uuid := gen_random_uuid(); s uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  r jsonb; res jsonb := '[]'::jsonb; v text; t record;
begin
  insert into public.outreach_leads (id, user_id, business_name, status, assigned_to_user_id) values
    (a, paul, 'QA next action admin', 'initial_contact', paul),
    (s, paul, 'QA next action sales', 'not_contacted', test),
    (o, paul, 'QA next action not theirs', 'not_contacted', paul);

  perform set_config('request.jwt.claims', json_build_object('sub', paul, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', paul::text, true);
  -- every offered type is accepted
  foreach v in array array['call', 'send_follow_up', 'email', 'follow_up', 'send_info', 'meeting'] loop
    r := public.lead_set_follow_up(a, v, current_date + 1, 'note for ' || v);
    res := res || jsonb_build_object('admin: type ' || v || ' saved with its day and note', (r->>'ok')::boolean and (select next_action::text = v and next_action_date = current_date + 1 and next_action_note = 'note for ' || v from outreach_leads where id = a));
  end loop;
  -- reschedule keeps the type, moves the day, edits the note
  r := public.lead_set_follow_up(a, 'call', current_date + 3, 'ring after 2pm');
  res := res || jsonb_build_object('admin: reschedule + edit (day and note change)', (select next_action::text = 'call' and next_action_date = current_date + 3 and next_action_note = 'ring after 2pm' from outreach_leads where id = a));
  -- a meeting with a time: the time and the Meeting on that day
  r := public.lead_set_call_booked(a, (current_date + 2 + time '14:30') at time zone 'Europe/London');
  r := public.lead_set_follow_up(a, 'meeting', current_date + 2, 'Meeting at 14:30 · bring the audit');
  select call_booked_at, next_action::text na, next_action_date d, next_action_note n into t from outreach_leads where id = a;
  res := res || jsonb_build_object('admin: meeting time + Meeting on that day', t.na = 'meeting' and t.d = current_date + 2 and to_char(t.call_booked_at at time zone 'Europe/London', 'HH24:MI') = '14:30' and t.n = 'Meeting at 14:30 · bring the audit');
  -- complete / remove
  r := public.lead_set_follow_up(a, 'none', null, 'Meeting at 14:30 · bring the audit');
  res := res || jsonb_build_object('admin: Done / Clear → nothing planned, no day', (select next_action::text = 'none' and next_action_date is null from outreach_leads where id = a));
  res := res || jsonb_build_object('admin: every save is in History (follow_up_set)', (select count(*) from lead_activity where lead_id = a and kind = 'follow_up_set') = 9);
  res := res || jsonb_build_object('an unknown type is refused', (public.lead_set_follow_up(a, 'chase_payment', null, null)->>'error') = 'bad_next_action');

  perform set_config('request.jwt.claims', json_build_object('sub', test, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', test::text, true);
  r := public.lead_set_follow_up(s, 'send_info', current_date, 'send the price sheet');
  res := res || jsonb_build_object('sales: own lead saved (type, day, note)', (r->>'ok')::boolean and (select next_action::text = 'send_info' and next_action_date = current_date and next_action_note = 'send the price sheet' from outreach_leads where id = s));
  res := res || jsonb_build_object('sales: History under the salesperson', exists (select 1 from lead_activity where lead_id = s and kind = 'follow_up_set' and actor_user_id = test));
  begin
    r := public.lead_set_follow_up(o, 'call', current_date, null);
    res := res || jsonb_build_object('sales: another person''s lead is refused', coalesce((r->>'ok')::boolean, false) = false);
  exception when others then
    res := res || jsonb_build_object('sales: another person''s lead is refused', (select next_action::text = 'none' from outreach_leads where id = o));
  end;

  raise exception 'QA_RESULT %', res;
end $$;
