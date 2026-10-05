-- READY-TO-SELL FIXTURE (2026-10-05, E2E certification; inside this suite's own rolled-back transaction). Since
-- migration 20261010120000 a salesperson who has not finished onboarding is refused claims, calls, campaigns and
-- queueing, so this suite could no longer reach its own rules. The readiness rule itself is tested by
-- salesperson-onboarding-rls.sql and ready-to-sell-paperwork.sql. Here: every FAKE salesperson the suite creates
-- (auth.users email ending .invalid) is onboarded complete, so pre-gate suites exercise their own rules again.
create function public.qa_tmp_autoonboard() returns trigger language plpgsql security definer set search_path = public as $q$
begin
  if new.role = 'sales' and exists (select 1 from auth.users u where u.id = new.user_id and u.email like '%.invalid') then
    insert into public.salesperson_onboarding (user_id, age_18_confirmed_on, rtw_method, rtw_checked_on, rtw_checked_by, rtw_result,
      rtw_evidence_ref, bank_details_received_on, vat_registered, contractor_type, start_date, team_guide_version, team_guide_acknowledged_on)
    values (new.user_id, current_date, 'manual_video_call', current_date, 'QA', 'pass', 'QA', current_date, false, 'individual', current_date,
      (select id from public.salesperson_document_versions where kind = 'team_guide' and status = 'approved' order by id desc limit 1), current_date)
    on conflict (user_id) do nothing;
  end if;
  return new;
end $q$;
create trigger qa_tmp_autoonboard after insert on public.user_roles for each row execute function public.qa_tmp_autoonboard();
-- Existing sales accounts (Test, test1) made Ready INSIDE this rolled-back transaction only.
insert into public.salesperson_onboarding (user_id, age_18_confirmed_on, rtw_method, rtw_checked_on, rtw_checked_by, rtw_result,
  rtw_evidence_ref, bank_details_received_on, vat_registered, contractor_type, start_date, team_guide_version, team_guide_acknowledged_on)
select r.user_id, current_date, 'manual_video_call', current_date, 'QA', 'pass', 'QA', current_date, false, 'individual', current_date,
  (select id from public.salesperson_document_versions where kind = 'team_guide' and status = 'approved' order by id desc limit 1), current_date
from public.user_roles r where r.role = 'sales'
on conflict (user_id) do update set age_18_confirmed_on = excluded.age_18_confirmed_on, rtw_method = excluded.rtw_method,
  rtw_checked_on = excluded.rtw_checked_on, rtw_checked_by = excluded.rtw_checked_by, rtw_result = excluded.rtw_result,
  rtw_evidence_ref = excluded.rtw_evidence_ref, bank_details_received_on = excluded.bank_details_received_on,
  vat_registered = excluded.vat_registered, contractor_type = excluded.contractor_type, start_date = excluded.start_date,
  team_guide_version = excluded.team_guide_version, team_guide_acknowledged_on = excluded.team_guide_acknowledged_on, end_date = null;
-- Call workspace guards (migration 20261007105000). RUN AGAINST THE LIVE DATABASE; ALWAYS ROLLED BACK.
-- ONE DO block that ends by RAISING its results, so it can never commit: the fake users (example.invalid),
-- the assignment, every activity row and every Next Action change disappear with the error.
-- How to run: send this file as one query to the Management API (CLAUDE.md §2) and read the JSON in the
-- error message. Before the migration is applied, the runner replaces the @@DDL@@ line below with the
-- migration's own statements (EXECUTE), so the NEW definitions are tested inside the same rolled-back block.
do $test$
declare
  a uuid := 'dddddddd-0000-4000-8000-0000000005a1';
  b uuid := 'dddddddd-0000-4000-8000-0000000005b2';
  l uuid;
  r jsonb;
  s jsonb;
  n int;
  res jsonb := '[]'::jsonb;
  v record;
  tomorrow date := ((now() at time zone 'Europe/London')::date + 1);
  nextweek date := ((now() at time zone 'Europe/London')::date + 7);
begin
  -- @@DDL@@
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-cw-a@example.invalid', '{}', '{}', now(), now()),
    (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-cw-b@example.invalid', '{}', '{}', now(), now());
  insert into public.user_roles (user_id, role) values (a, 'sales'), (b, 'sales');
  insert into public.team_members (user_id, display_name) values (a, 'CW A'), (b, 'CW B');
  select x.id into l from public.outreach_leads x
   where x.assigned_to_user_id is null and x.is_archived is not true and x.status = 'not_contacted'
     and not public.lead_is_client(x.amount_paid, x.status)
   order by x.created_at desc limit 1;
  update public.outreach_leads set assigned_to_user_id = a, next_action = 'none', next_action_date = null, next_action_time = null, next_action_note = null, call_booked_at = null where id = l;
  res := res || jsonb_build_object('name', 'fixture lead found', 'ok', l is not null);

  -- ── as rep A ──
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);

  -- 1. double submit = one call
  r := public.lead_log_contact(l, 'call', 'no_answer', null);
  res := res || jsonb_build_object('name', 'first call outcome is written', 'ok', (r ->> 'ok')::boolean and r ->> 'duplicate' is null, 'detail', r);
  r := public.lead_log_contact(l, 'call', 'no_answer', '  ');
  res := res || jsonb_build_object('name', 'identical outcome a moment later answers ok + duplicate', 'ok', (r ->> 'ok')::boolean and (r ->> 'duplicate')::boolean, 'detail', r);
  select count(*) into n from public.lead_activity where lead_id = l and kind = 'call_outcome' and actor_user_id = a;
  res := res || jsonb_build_object('name', 'double submit leaves ONE call_outcome row', 'ok', n = 1, 'detail', n);

  -- 2. genuinely separate contacts are still recorded
  r := public.lead_log_contact(l, 'call', 'left_voicemail', null);
  r := public.lead_log_contact(l, 'call', 'no_answer', 'rang the landline instead');
  r := public.lead_log_contact(l, 'email', 'message_sent', null);
  select count(*) into n from public.lead_activity where lead_id = l and kind in ('call_outcome', 'contact_logged') and actor_user_id = a;
  res := res || jsonb_build_object('name', 'a different outcome, a different note or another channel is a new contact', 'ok', n = 4, 'detail', n);
  update public.lead_activity set created_at = now() - public.call_log_dedupe_window() - interval '1 second'
   where lead_id = l and kind = 'call_outcome' and data ->> 'outcome' = 'no_answer' and body is null;
  r := public.lead_log_contact(l, 'call', 'no_answer', null);
  res := res || jsonb_build_object('name', 'the same outcome after the window is a new call', 'ok', (r ->> 'ok')::boolean and r ->> 'duplicate' is null, 'detail', r);
  r := public.lead_record_call(l, 'spoke_to_owner', null);
  r := public.lead_record_call(l, 'spoke_to_owner', null);
  select count(*) into n from public.lead_activity where lead_id = l and kind = 'call_outcome' and data ->> 'outcome' = 'spoke_to_owner';
  res := res || jsonb_build_object('name', 'lead_record_call: double submit is one row too', 'ok', n = 1 and (r ->> 'duplicate')::boolean, 'detail', n);

  -- 3. the stale Next Action check
  r := public.lead_set_follow_up(l, 'call', tomorrow, 'ring after 10', null, false, jsonb_build_object('next_action', 'none', 'date', null, 'time', null));
  res := res || jsonb_build_object('name', 'set with the right expectation saves', 'ok', (r ->> 'ok')::boolean, 'detail', r);
  r := public.lead_set_follow_up(l, 'meeting', tomorrow, 'booked by the other tab', '14:30', false, jsonb_build_object('next_action', 'call', 'date', tomorrow, 'time', null));
  res := res || jsonb_build_object('name', 'tab 1 books a meeting (its expectation matches)', 'ok', (r ->> 'ok')::boolean, 'detail', r);
  r := public.lead_set_follow_up(l, 'follow_up', nextweek, 'from the stale tab', null, false, jsonb_build_object('next_action', 'call', 'date', tomorrow, 'time', null));
  s := r;
  select next_action::text na, next_action_date d, to_char(next_action_time, 'HH24:MI') t, call_booked_at cb into v from public.outreach_leads where id = l;
  res := res || jsonb_build_object('name', 'the stale tab is refused with stale_next_action and the current values', 'ok', r ->> 'error' = 'stale_next_action' and r -> 'current' ->> 'next_action' = 'meeting' and r -> 'current' ->> 'time' = '14:30', 'detail', r);
  res := res || jsonb_build_object('name', '…and the booked meeting is untouched', 'ok', v.na = 'meeting' and v.d = tomorrow and v.t = '14:30' and v.cb is not null, 'detail', row_to_json(v));
  r := public.lead_set_follow_up(l, 'meeting', tomorrow, 'booked by the other tab', '14:30', false, jsonb_build_object('next_action', 'call', 'date', tomorrow, 'time', null));
  res := res || jsonb_build_object('name', 'saving exactly what is stored is not a conflict', 'ok', (r ->> 'ok')::boolean and (r ->> 'unchanged')::boolean, 'detail', r);
  r := public.lead_set_follow_up(l, 'follow_up', nextweek, 'replace confirmed', null, false, s -> 'current');
  select next_action::text na, call_booked_at cb into v from public.outreach_leads where id = l;
  res := res || jsonb_build_object('name', 'after "replace?" yes (new expectation) it saves and the booking goes with it', 'ok', (r ->> 'ok')::boolean and v.na = 'follow_up' and v.cb is null, 'detail', r);
  r := public.lead_set_follow_up(l, 'call', nextweek, null, null, false);
  res := res || jsonb_build_object('name', 'no _expected = the old behaviour (bulk menu, outcome clears)', 'ok', (r ->> 'ok')::boolean, 'detail', r);
  r := public.lead_set_follow_up(l, 'call', nextweek, null, null, false, '{"next_action":"call","date":"not-a-date"}'::jsonb);
  res := res || jsonb_build_object('name', 'a malformed expectation is refused, never ignored', 'ok', r ->> 'error' = 'bad_expected', 'detail', r);
  r := public.lead_set_call_booked(l, now() + interval '2 days');
  res := res || jsonb_build_object('name', 'lead_set_call_booked (positional caller) still resolves', 'ok', (r ->> 'ok')::boolean, 'detail', r);

  -- ── as rep B: not their lead ──
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  begin
    r := public.lead_log_contact(l, 'call', 'interested', null);
    res := res || jsonb_build_object('name', 'another rep cannot log a call on the lead', 'ok', false, 'detail', r);
  exception when others then
    res := res || jsonb_build_object('name', 'another rep cannot log a call on the lead', 'ok', sqlerrm = 'not_your_lead', 'detail', sqlerrm);
  end;
  begin
    r := public.lead_set_follow_up(l, 'none', null, null, null, false, null);
    res := res || jsonb_build_object('name', 'another rep cannot change its Next Action', 'ok', false, 'detail', r);
  exception when others then
    res := res || jsonb_build_object('name', 'another rep cannot change its Next Action', 'ok', sqlerrm = 'not_your_lead', 'detail', sqlerrm);
  end;

  raise exception 'QA_RESULT %', res::text;
end $test$;
