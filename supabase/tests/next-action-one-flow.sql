-- Rolled-back live test: the one next-action write — every type, day, optional UK time, note; set / reschedule /
-- change / complete / clear in History; a Meeting's time books it; both roles (2026-10-02).
-- Output: QA_RESULT [ {check: bool}, ... ].
do $$
declare
  paul uuid := '9d5a7629-3171-4091-b3a4-43010a1d424d';
  test uuid := '262c1d64-05ad-42e8-a81b-7d25553aeff3';
  a uuid := gen_random_uuid(); s uuid := gen_random_uuid(); o uuid := gen_random_uuid(); m uuid := gen_random_uuid();
  r jsonb; res jsonb := '[]'::jsonb; v text; t record; n0 int; d1 date := current_date + 1;
begin
  insert into public.outreach_leads (id, user_id, business_name, status, assigned_to_user_id) values
    (a, paul, 'QA next action admin', 'initial_contact', paul),
    (s, paul, 'QA next action sales', 'not_contacted', test),
    (o, paul, 'QA next action not theirs', 'not_contacted', paul),
    (m, paul, 'QA meeting sync', 'initial_contact', paul);

  perform set_config('request.jwt.claims', json_build_object('sub', paul, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', paul::text, true);
  foreach v in array array['call', 'send_follow_up', 'email', 'follow_up', 'send_info', 'send_proposal', 'chase_payment', 'meeting'] loop
    r := public.lead_set_follow_up(a, v, d1, 'note for ' || v, null);
    res := res || jsonb_build_object('type ' || v || ': saved with its day and note, no time', (r->>'ok')::boolean and (select next_action::text = v and next_action_date = d1 and next_action_time is null and next_action_note = 'note for ' || v from outreach_leads where id = a));
  end loop;
  -- 1. untimed, 2. timed (the four-argument call still works)
  r := public.lead_set_follow_up(a, 'call', d1, null);
  res := res || jsonb_build_object('Call · Tomorrow, no time (old 4-argument call)', (r->>'ok')::boolean and (select next_action_time is null from outreach_leads where id = a));
  r := public.lead_set_follow_up(a, 'call', d1, null, '14:30');
  res := res || jsonb_build_object('Call · Tomorrow · 14:30 → rescheduled', r->>'change' = 'rescheduled' and (select to_char(next_action_time, 'HH24:MI') = '14:30' from outreach_leads where id = a));
  -- the same save twice writes one History row
  select count(*) into n0 from lead_activity where lead_id = a and kind = 'follow_up_set';
  r := public.lead_set_follow_up(a, 'call', d1, null, '14:30');
  res := res || jsonb_build_object('an identical save is a no-op (no duplicate History)', (r->>'unchanged')::boolean and (select count(*) from lead_activity where lead_id = a and kind = 'follow_up_set') = n0);
  -- 8. reschedule the time, 9. remove the time but keep the day, 10. change the type
  r := public.lead_set_follow_up(a, 'call', d1, null, '10:00');
  res := res || jsonb_build_object('reschedule the time → rescheduled, was 14:30', r->>'change' = 'rescheduled' and exists (select 1 from lead_activity where lead_id = a and kind = 'follow_up_set' and data->>'time' = '10:00' and data->'from'->>'time' = '14:30'));
  r := public.lead_set_follow_up(a, 'call', d1, null, null);
  res := res || jsonb_build_object('remove the time, keep the day', (select next_action_date = d1 and next_action_time is null from outreach_leads where id = a));
  r := public.lead_set_follow_up(a, 'send_proposal', d1, 'proposal v2', '16:00');
  res := res || jsonb_build_object('change type Call → Send proposal (History: changed, from call)', r->>'change' = 'changed' and exists (select 1 from lead_activity where lead_id = a and kind = 'follow_up_set' and data->>'change' = 'changed' and data->'from'->>'next_action' = 'call' and data->>'next_action' = 'send_proposal'));
  -- 11. complete, 12. clear
  r := public.lead_set_follow_up(a, 'none', null, 'proposal v2', null, true);
  res := res || jsonb_build_object('✓ Done → completed (from Send proposal · 16:00)', r->>'change' = 'completed' and (select next_action::text = 'none' and next_action_date is null and next_action_time is null from outreach_leads where id = a) and exists (select 1 from lead_activity where lead_id = a and data->>'change' = 'completed' and data->'from'->>'time' = '16:00'));
  r := public.lead_set_follow_up(a, 'chase_payment', d1, 'invoice 1042', '11:00');
  res := res || jsonb_build_object('Chase payment with day, time and note → set', r->>'change' = 'set' and (select next_action::text = 'chase_payment' and to_char(next_action_time, 'HH24:MI') = '11:00' and next_action_note = 'invoice 1042' from outreach_leads where id = a));
  r := public.lead_set_follow_up(a, 'none', null, null);
  res := res || jsonb_build_object('Clear → cleared', r->>'change' = 'cleared');
  -- bad input
  res := res || jsonb_build_object('an unknown type is refused', (public.lead_set_follow_up(a, 'send_agreement', null, null)->>'error') = 'bad_next_action');
  res := res || jsonb_build_object('a malformed time is refused', (public.lead_set_follow_up(a, 'call', d1, null, '25:99')->>'error') = 'bad_time');
  r := public.lead_set_follow_up(a, 'call', null, null, '14:30');
  res := res || jsonb_build_object('a time without a day is dropped (never stored)', (select next_action_time is null from outreach_leads where id = a));
  -- 7. Meeting · 14:30 books it at 14:30 UK; moving the booking moves the Meeting
  r := public.lead_set_follow_up(m, 'meeting', d1, null, '14:30');
  select call_booked_at, next_action_date dd, next_action_time tt into t from outreach_leads where id = m;
  res := res || jsonb_build_object('Meeting · 14:30 → booked at 14:30 UK (one time)', to_char(t.call_booked_at at time zone 'Europe/London', 'HH24:MI') = '14:30' and (t.call_booked_at at time zone 'Europe/London')::date = d1);
  r := public.lead_set_call_booked(m, ((d1 + 1) + time '09:15') at time zone 'Europe/London');
  res := res || jsonb_build_object('moving the booked time moves the Meeting next action', (select next_action_date = d1 + 1 and to_char(next_action_time, 'HH24:MI') = '09:15' from outreach_leads where id = m));
  -- DST: the database reads the day + time as London
  res := res || jsonb_build_object('BST: 2 Oct 14:30 UK = 13:30 UTC', public.next_action_due_at('2026-10-02', '14:30') = '2026-10-02 13:30:00+00'::timestamptz);
  res := res || jsonb_build_object('GMT: 2 Dec 14:30 UK = 14:30 UTC', public.next_action_due_at('2026-12-02', '14:30') = '2026-12-02 14:30:00+00'::timestamptz);
  res := res || jsonb_build_object('the reminder words', public.next_action_label('send_proposal') = 'Send proposal' and public.next_action_label('chase_payment') = 'Chase payment' and public.next_action_label('send_info') = 'Send information');

  perform set_config('request.jwt.claims', json_build_object('sub', test, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', test::text, true);
  r := public.lead_set_follow_up(s, 'send_follow_up', current_date, 'check they got it', '17:00');
  res := res || jsonb_build_object('sales: WhatsApp follow-up · Today · 17:00 on own lead', (r->>'ok')::boolean and (select next_action::text = 'send_follow_up' and to_char(next_action_time, 'HH24:MI') = '17:00' from outreach_leads where id = s));
  res := res || jsonb_build_object('sales: History under the salesperson', exists (select 1 from lead_activity where lead_id = s and kind = 'follow_up_set' and actor_user_id = test and data->>'time' = '17:00'));
  res := res || jsonb_build_object('sales: the view carries the time', (select to_char(next_action_time, 'HH24:MI') = '17:00' from public.sales_leads where id = s));
  begin
    r := public.lead_set_follow_up(o, 'call', current_date, null, '09:00');
    res := res || jsonb_build_object('sales: another person''s lead is refused', coalesce((r->>'ok')::boolean, false) = false);
  exception when others then
    res := res || jsonb_build_object('sales: another person''s lead is refused', (select next_action::text = 'none' from outreach_leads where id = o));
  end;

  raise exception 'QA_RESULT %', res;
end $$;
