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
-- Notifications (migration 20260929140000). ONE query to the Management API; ALWAYS ROLLED BACK (ends by RAISING).
-- Expect: reply_rows=1 reply_count=2 title_ok=t failed=1 rep_sees=2 other_sees=0 anon_sees=0 marked=2 unread_after=0
--         assigned=1 self_claim=0 owner_auto=0 followup_first=1 followup_again=0 cleared=2 direct_insert_denied=t
do $$
declare sid uuid; tid uuid; book uuid; lid uuid; lid2 uuid; ph text; rr int; rc int; tok boolean; fl int; rs int; os int; an int; mk int; ua int;
  asg int; sc int; oa int; f1 int; f2 int; cl int; din boolean := false;
begin
  select user_id into book from team_members where is_book_owner limit 1;
  select tm.user_id into sid from team_members tm join user_roles r using (user_id) where r.role = 'sales' order by tm.created_at limit 1;
  select tm.user_id into tid from team_members tm join user_roles r using (user_id) where r.role = 'sales' and tm.user_id <> sid order by tm.created_at limit 1;
  /* ⛔ ITS OWN FIXTURES (2026-10-02). It borrowed "a lead assigned to the first salesperson, with a phone" from
     the live book; when none existed (the QA leads were archived and their numbers cleared) lid and ph were NULL
     and the first insert failed on whatsapp_messages.phone. Rolled back like everything else here; the number is
     in the Ofcom drama range, never a real phone. */
  lid := gen_random_uuid(); lid2 := gen_random_uuid(); ph := '447700900601';
  insert into outreach_leads (id, user_id, business_name, status, phone, assigned_to_user_id, assigned_at)
    values (lid, book, 'QA notifications rep lead (rolled back)', 'initial_contact', '+' || ph, sid, now());
  insert into outreach_leads (id, user_id, business_name, status)
    values (lid2, book, 'QA notifications unassigned lead (rolled back)', 'not_contacted');
  -- two replies while unread → ONE notification, count 2
  insert into whatsapp_messages (user_id, lead_id, phone, direction, body, message_type, status, test_mode) values (book, lid, ph, 'inbound', 'QA one (rolled back)', 'text', 'received', false);
  insert into whatsapp_messages (user_id, lead_id, phone, direction, body, message_type, status, test_mode) values (book, lid, ph, 'inbound', 'QA two (rolled back)', 'text', 'received', false);
  select count(*), max(count), bool_and(title = '2 new WhatsApp messages') into rr, rc, tok from notifications where user_id = sid and kind = 'whatsapp_reply' and lead_id = lid and read_at is null;
  -- a failed send
  insert into whatsapp_messages (user_id, lead_id, phone, direction, body, message_type, status, test_mode, error, sent_by_user_id) values (book, lid, ph, 'outbound', 'QA', 'text', 'failed', false, 'QA error', sid);
  select count(*) into fl from notifications where user_id = sid and kind = 'whatsapp_failed' and lead_id = lid;
  -- who can read them
  perform set_config('request.jwt.claims', json_build_object('sub', sid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into rs from notifications where lead_id = lid;
  begin insert into notifications (user_id, kind, title, dedupe_key) values (sid, 'feature_update', 'forged', 'qa-forged'); exception when insufficient_privilege then din := true; end;
  reset role;
  select public.mark_notifications_read(array(select id from notifications where user_id = sid and lead_id = lid)) into mk;
  select count(*) into ua from notifications where user_id = sid and lead_id = lid and read_at is null;
  perform set_config('request.jwt.claims', json_build_object('sub', tid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into os from notifications where lead_id = lid;
  reset role;
  set local role anon;
  begin select count(*) into an from notifications; exception when insufficient_privilege then an := 0; end;
  reset role;
  -- assignment: admin → rep notifies; the rep claiming it themselves does not; the automatic book-owner assign does not
  perform set_config('request.jwt.claims', json_build_object('sub', book, 'role', 'authenticated')::text, true);
  update outreach_leads set assigned_to_user_id = tid, assigned_at = now() where id = lid2;
  select count(*) into asg from notifications where user_id = tid and kind = 'lead_assigned' and lead_id = lid2;
  update outreach_leads set assigned_to_user_id = null where id = lid2;
  perform set_config('request.jwt.claims', json_build_object('sub', tid, 'role', 'authenticated')::text, true);
  update outreach_leads set assigned_to_user_id = tid, assigned_at = now() + interval '1 second' where id = lid2;
  select count(*) - asg into sc from notifications where user_id = tid and kind = 'lead_assigned' and lead_id = lid2;
  update outreach_leads set assigned_to_user_id = null where id = lid2;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  update outreach_leads set assigned_to_user_id = book, assigned_at = now() + interval '2 seconds' where id = lid2;
  select count(*) into oa from notifications where user_id = book and kind = 'lead_assigned' and lead_id = lid2;
  -- a follow-up due: once per scheduled date. Yesterday (overdue) so it is eligible at ANY hour — the sweep is
  -- hourly since 2026-10-02 and a date-only action due TODAY waits for 07:00 UK (next-action-reminders.sql).
  update outreach_leads set next_action = 'call', next_action_date = (now() at time zone 'Europe/London')::date - 1 where id = lid;
  perform public.notify_due_follow_ups();
  select count(*) into f1 from notifications where user_id = sid and kind = 'follow_up_due' and lead_id = lid;
  perform public.notify_due_follow_ups();
  select count(*) - f1 into f2 from notifications where user_id = sid and kind = 'follow_up_due' and lead_id = lid;
  perform set_config('request.jwt.claims', json_build_object('sub', sid, 'role', 'authenticated')::text, true);
  select public.clear_notifications(array(select id from notifications where user_id = sid and lead_id = lid and kind in ('whatsapp_reply', 'whatsapp_failed'))) into cl;
  raise exception 'RESULT reply_rows=% reply_count=% title_ok=% failed=% rep_sees=% other_sees=% anon_sees=% marked=% unread_after=% assigned=% self_claim=% owner_auto=% followup_first=% followup_again=% cleared=% direct_insert_denied=% (rolled back)',
    rr, rc, tok, fl, rs, os, an, mk, ua, asg, sc, oa, f1, f2, cl, din;
end $$;
