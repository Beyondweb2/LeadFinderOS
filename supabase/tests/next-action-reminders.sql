-- Rolled-back live test: hourly Next Action reminders + Done/Clear clear the note (2026-10-02).
-- Times are relative to now(), so it runs at any hour. Output: QA_RESULT [ {check: bool}, ... ].
do $$
declare
  paul uuid := '9d5a7629-3171-4091-b3a4-43010a1d424d';
  test uuid := '262c1d64-05ad-42e8-a81b-7d25553aeff3';
  v_uk timestamp := now() at time zone 'Europe/London';
  v_today date := (now() at time zone 'Europe/London')::date;
  past1 timestamp := date_trunc('minute', (now() - interval '5 minutes') at time zone 'Europe/London');
  past3 timestamp := date_trunc('minute', (now() - interval '3 hours') at time zone 'Europe/London');
  fut2 timestamp := date_trunc('minute', (now() + interval '2 hours') at time zone 'Europe/London');
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); d uuid := gen_random_uuid();
  e uuid := gen_random_uuid(); f uuid := gen_random_uuid(); g uuid := gen_random_uuid(); h uuid := gen_random_uuid();
  i uuid := gen_random_uuid(); j uuid := gen_random_uuid();
  r jsonb; res jsonb := '[]'::jsonb; k int; nb text;
  cnt int;
begin
  insert into public.outreach_leads (id, user_id, business_name, status, assigned_to_user_id) values
    (a, paul, 'QA rem date-only today', 'initial_contact', paul),
    (b, paul, 'QA rem timed due now', 'initial_contact', paul),
    (c, paul, 'QA rem timed future', 'initial_contact', paul),
    (d, paul, 'QA rem timed overdue', 'initial_contact', paul),
    (e, paul, 'QA rem rescheduled', 'initial_contact', paul),
    (f, paul, 'QA rem completed', 'initial_contact', paul),
    (g, paul, 'QA rem cleared', 'initial_contact', paul),
    (h, paul, 'QA rem transferred', 'initial_contact', paul),
    (i, paul, 'QA rem no date', 'initial_contact', paul),
    (j, paul, 'QA rem date-only overdue', 'initial_contact', test);

  perform set_config('request.jwt.claims', json_build_object('sub', paul, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', paul::text, true);
  r := public.lead_set_follow_up(a, 'call', v_today, null);
  r := public.lead_set_follow_up(b, 'send_proposal', past1::date, 'proposal v1', to_char(past1, 'HH24:MI'));
  r := public.lead_set_follow_up(c, 'call', fut2::date, null, to_char(fut2, 'HH24:MI'));
  r := public.lead_set_follow_up(d, 'chase_payment', past3::date, 'invoice 1042', to_char(past3, 'HH24:MI'));
  r := public.lead_set_follow_up(e, 'call', past3::date, null, to_char(past3, 'HH24:MI'));
  r := public.lead_set_follow_up(f, 'call', past1::date, 'call note', to_char(past1, 'HH24:MI'));
  r := public.lead_set_follow_up(g, 'chase_payment', past1::date, 'chase note', to_char(past1, 'HH24:MI'));
  r := public.lead_set_follow_up(h, 'meeting', past1::date, null, to_char(past1, 'HH24:MI'));
  r := public.lead_set_follow_up(i, 'email', null, 'some day');
  r := public.lead_set_follow_up(j, 'call', v_today - 1, 'ring back');
  -- 4. the overdue one was already reminded (an earlier sweep)
  perform public.notify_due_follow_ups();
  select count(*) into k from notifications where lead_id = d and kind = 'follow_up_due';
  res := res || jsonb_build_object('4 an overdue timed action is reminded once', k = 1);
  -- 6. completed and 7. cleared BEFORE the next sweep (they were just reminded above — use fresh copies below)
  delete from notifications where lead_id in (f, g, h, b, a, e) and kind = 'follow_up_due';
  r := public.lead_set_follow_up(f, 'none', null, 'call note', null, true);
  r := public.lead_set_follow_up(g, 'none', null, 'chase note', null, false);
  -- 8. ownership transfer before the sweep: Paul → Test
  update public.outreach_leads set assigned_to_user_id = test, assigned_at = now() where id = h;
  -- 5. rescheduled: a new time is a new version
  r := public.lead_set_follow_up(e, 'call', past1::date, null, to_char(past1, 'HH24:MI'));

  -- the sweep
  perform public.notify_due_follow_ups();
  perform public.notify_due_follow_ups();   -- a second hourly sweep changes nothing

  select count(*) into k from notifications where lead_id = a and kind = 'follow_up_due';
  res := res || jsonb_build_object('1 date-only today: reminded after 07:00 UK, not before (UK hour ' || extract(hour from v_uk) || ')', k = case when extract(hour from v_uk) >= 7 then 1 else 0 end);
  select count(*), min(body) into k, nb from notifications where lead_id = b and kind = 'follow_up_due' and user_id = paul;
  res := res || jsonb_build_object('2 timed, due this hour: reminded once', k = 1);
  res := res || jsonb_build_object('…in words: "Send proposal at HH:MM", never a raw value (' || coalesce(nb, '') || ')', nb like 'QA rem timed due now — Send proposal at ' || to_char(past1, 'HH24:MI') || '%' and nb not like '%send_proposal%');
  select count(*) into k from notifications where lead_id = c and kind = 'follow_up_due';
  res := res || jsonb_build_object('3 timed, later today/tomorrow: not yet', k = 0);
  select count(*) into k from notifications where lead_id = d and kind = 'follow_up_due';
  res := res || jsonb_build_object('4 …and never reminded again, however many sweeps', k = 1);
  select count(*) into k from notifications where lead_id = e and kind = 'follow_up_due';
  res := res || jsonb_build_object('5 rescheduled (new time): the new version is reminded', k = 1);
  res := res || jsonb_build_object('5 …keyed on the new time', exists (select 1 from notifications where lead_id = e and dedupe_key like '%:' || to_char(past1, 'HH24:MI')));
  select count(*) into k from notifications where lead_id = f and kind = 'follow_up_due';
  res := res || jsonb_build_object('6 completed before the sweep: no reminder', k = 0);
  select count(*) into k from notifications where lead_id = g and kind = 'follow_up_due';
  res := res || jsonb_build_object('7 cleared before the sweep: no reminder', k = 0);
  res := res || jsonb_build_object('8 transferred before the sweep: the NEW owner is reminded', exists (select 1 from notifications where lead_id = h and kind = 'follow_up_due' and user_id = test));
  res := res || jsonb_build_object('8 …the old owner is not', not exists (select 1 from notifications where lead_id = h and kind = 'follow_up_due' and user_id = paul));
  select count(*) into k from notifications where lead_id = i and kind = 'follow_up_due';
  res := res || jsonb_build_object('9 no date: never reminded', k = 0);
  res := res || jsonb_build_object('10 a salesperson''s overdue date-only action reaches the salesperson', exists (select 1 from notifications where lead_id = j and kind = 'follow_up_due' and user_id = test and title = 'Follow-up overdue') and not exists (select 1 from notifications where lead_id = j and user_id = paul and kind = 'follow_up_due'));

  -- Done / Clear clear the Next Action note; History keeps it
  res := res || jsonb_build_object('Done clears the note', (select next_action::text = 'none' and next_action_note is null and next_action_date is null and next_action_time is null from outreach_leads where id = f));
  res := res || jsonb_build_object('…History keeps what was completed, with its note', exists (select 1 from lead_activity where lead_id = f and data->>'change' = 'completed' and data->'from'->>'note' = 'call note'));
  res := res || jsonb_build_object('Clear clears the note', (select next_action_note is null from outreach_leads where id = g));
  res := res || jsonb_build_object('…History keeps what was cleared, with its note', exists (select 1 from lead_activity where lead_id = g and data->>'change' = 'cleared' and data->'from'->>'note' = 'chase note'));
  r := public.lead_set_follow_up(f, 'send_proposal', v_today + 1, null);
  res := res || jsonb_build_object('the next action after Done starts with a blank note', (select next_action_note is null from outreach_leads where id = f));
  res := res || jsonb_build_object('the lead''s own notes are untouched', (select notes is null from outreach_leads where id = f));

  -- a salesperson cannot run the sweep
  perform set_config('request.jwt.claims', json_build_object('sub', test, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.notify_due_follow_ups(); res := res || jsonb_build_object('the sweep is not callable by users', false);
  exception when insufficient_privilege then res := res || jsonb_build_object('the sweep is not callable by users', true); end;
  reset role;

  raise exception 'QA_RESULT %', res;
end $$;
