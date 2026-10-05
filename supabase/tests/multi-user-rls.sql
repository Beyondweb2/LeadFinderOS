-- Multi-user security tests (2026-09-27). RUN AGAINST THE LIVE DATABASE; ALWAYS ROLLED BACK.
-- The last statement raises an exception carrying the results as JSON, so the transaction can never
-- commit: every fixture (fake auth users on example.invalid, roles, claims, notes) disappears.
-- How to run: see docs/multi-user.md ("Re-running the security tests").
begin;
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

-- sales_pool lost its authenticated grant on 2026-09-29 (no caller; it paged the whole pool). This suite still
-- uses it as the oracle for "is this lead in the claimable pool" -- a TEST-ONLY grant, rolled back with the rest.
grant execute on function public.sales_pool(text, integer, integer) to authenticated;

-- ═══ TEST SUITE (runs after the migration, inside the same transaction, which is then aborted) ═══
create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated, anon;
grant usage, select on sequence t_results_n_seq to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-sales-a@example.invalid', '{}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-sales-b@example.invalid', '{}', '{}', now(), now()),
  ('cccccccc-0000-4000-8000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-norole@example.invalid', '{}', '{}', now(), now());
insert into public.user_roles (user_id, role) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'sales'), ('bbbbbbbb-0000-4000-8000-00000000000b', 'sales');
insert into public.team_members (user_id, display_name) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'Sales A'), ('bbbbbbbb-0000-4000-8000-00000000000b', 'Sales B');

create temp table t_fx as select
  (select l.id from public.outreach_leads l where l.assigned_to_user_id = l.user_id and not public.lead_is_client(l.amount_paid, l.status)
     and exists (select 1 from public.whatsapp_messages m where m.lead_id = l.id and m.direction = 'outbound' and m.status in ('read','delivered')) order by l.created_at limit 1) as contacted,
  (select l.id from public.outreach_leads l where l.assigned_to_user_id is null and l.is_archived is not true and not public.lead_is_client(l.amount_paid, l.status)
     and l.place_id is not null and public.lead_first_contact_at(l.id) is null order by l.created_at limit 1) as u1,
  (select l.id from public.outreach_leads l where l.assigned_to_user_id is null and l.is_archived is not true and not public.lead_is_client(l.amount_paid, l.status)
     and public.lead_first_contact_at(l.id) is null order by l.created_at offset 5 limit 1) as u2,
  (select l.id from public.outreach_leads l where l.amount_paid > 0 order by l.created_at limit 1) as paid,
  (select count(*) from public.outreach_leads) as total_leads,
  (select count(*) from public.outreach_leads where assigned_to_user_id is not null) as assigned_after_backfill,
  (select count(*) from public.outreach_leads where assigned_to_user_id is null) as unassigned_after_backfill;
alter table t_fx add column u1_place text, add column c_place text, add column c_phone text;
update t_fx set u1_place = (select place_id from public.outreach_leads where id = t_fx.u1), c_place = (select place_id from public.outreach_leads where id = t_fx.contacted), c_phone = (select phone from public.outreach_leads where id = t_fx.contacted);
grant select on t_fx to authenticated, anon;
-- Every ACTIVE team member with a role — real members plus the fixtures (the real Test salesperson was added after this suite was written).
create temp table t_team as select count(*)::int as n from public.team_members tm join public.user_roles ur on ur.user_id = tm.user_id where tm.status = 'active';
grant select on t_team to authenticated, anon;

insert into t_results (name, ok, detail) select 'fixtures present', contacted is not null and u1 is not null and u2 is not null and paid is not null,
  format('total=%s assigned=%s unassigned=%s', total_leads, assigned_after_backfill, unassigned_after_backfill) from t_fx;

-- ─── as SALES A ───
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-00000000000a', true);

insert into t_results (name, ok, detail) select 'A: role is sales', public.my_role() = 'sales', public.my_role();
insert into t_results (name, ok, detail) select 'A: outreach_leads unreadable', (select count(*) from public.outreach_leads) = 0, (select count(*)::text from public.outreach_leads);
insert into t_results (name, ok, detail) select 'A: sales_leads empty before claim', (select count(*) from public.sales_leads) = 0, (select count(*)::text from public.sales_leads);
insert into t_results (name, ok, detail) select 'A: onboarding_responses unreadable', (select count(*) from public.onboarding_responses) = 0, null;
insert into t_results (name, ok, detail) select 'A: whatsapp_sends unreadable', (select count(*) from public.whatsapp_sends) = 0, null;
insert into t_results (name, ok, detail) select 'A: no messages visible yet', (select count(*) from public.whatsapp_messages) = 0, (select count(*)::text from public.whatsapp_messages);
insert into t_results (name, ok, detail) select 'A: no audits visible yet', (select count(*) from public.ai_audits) = 0, (select count(*)::text from public.ai_audits);
insert into t_results (name, ok, detail) select 'A: lead_claims unreadable', (select count(*) from public.lead_claims) = 0, null;
insert into t_results (name, ok, detail) select 'A: sees only own role row', (select count(*) from public.user_roles) = 1, null;
insert into t_results (name, ok, detail) select 'A: sees only own team row', (select count(*) from public.team_members) = 1, null;
insert into t_results (name, ok, detail) select 'A: team directory lists every active member', (select count(*) from public.team_directory()) = (select n from t_team), (select count(*) from public.team_directory())::text || ' of ' || (select n from t_team);
insert into t_results (name, ok, detail) select 'A: lookup contacted lead = owned by Paul',
  (x.state = 'owned' and x.owner_name = 'Paul'), x.state || '/' || coalesce(x.owner_name, '∅')
  from public.lead_identity_lookup(jsonb_build_array(jsonb_build_object('k', 'c', 'place_id', (select c_place from t_fx), 'phone', (select c_phone from t_fx)))) x;
insert into t_results (name, ok, detail) select 'A: cannot claim contacted', (public.claim_lead((select contacted from t_fx)) ->> 'error') = 'already_owned', public.claim_lead((select contacted from t_fx))::text;
insert into t_results (name, ok, detail) select 'A: cannot claim paid client', coalesce(public.claim_lead((select paid from t_fx)) ->> 'ok', 'x') = 'false', public.claim_lead((select paid from t_fx))::text;
insert into t_results (name, ok, detail) select 'A: lookup u1 = claimable', x.state = 'claimable', x.state
  from public.lead_identity_lookup(jsonb_build_array(jsonb_build_object('k', 'u', 'place_id', (select u1_place from t_fx)))) x;
insert into t_results (name, ok, detail) select 'A: claims u1', (public.claim_lead((select u1 from t_fx)) ->> 'ok') = 'true', null;
insert into t_results (name, ok, detail) select 'A: sees u1 in sales_leads', exists (select 1 from public.sales_leads where id = (select u1 from t_fx)), null;
insert into t_results (name, ok, detail) select 'A: sales_leads amount_paid null', (select amount_paid from public.sales_leads where id = (select u1 from t_fx)) is null, null;
insert into t_results (name, ok, detail) select 'A: lookup u1 = yours', x.state = 'yours', x.state
  from public.lead_identity_lookup(jsonb_build_array(jsonb_build_object('k', 'u', 'place_id', (select u1_place from t_fx)))) x;
insert into t_results (name, ok, detail) select 'A: add note', (public.lead_add_note((select u1 from t_fx), 'spoke to owner, agency runs site') ->> 'ok') = 'true', null;
insert into t_results (name, ok, detail) select 'A: record call', (public.lead_record_call((select u1 from t_fx), 'agency_controls_site', 'contract ends Nov') ->> 'ok') = 'true', null;
insert into t_results (name, ok, detail) select 'A: set follow-up', (public.lead_set_follow_up((select u1 from t_fx), 'call', current_date + 30, 'after contract ends') ->> 'ok') = 'true', null;
insert into t_results (name, ok, detail) select 'A: set website control', (public.lead_set_website_control((select u1 from t_fx), 'agency_controls', null) ->> 'ok') = 'true', null;
insert into t_results (name, ok, detail) select 'A: stage won', (public.lead_set_stage((select u1 from t_fx), 'won_pending_onboarding') ->> 'ok') = 'true', null;
insert into t_results (name, ok, detail) select 'A: stage payment_received refused', (public.lead_set_stage((select u1 from t_fx), 'payment_received') ->> 'error') = 'stage_not_allowed', null;
insert into t_results (name, ok, detail) select 'A: sees own activity', (select count(*) from public.lead_activity) >= 6, (select count(*)::text from public.lead_activity);
insert into t_results (name, ok, detail) select 'A: sees follow-up in view', (select next_action_date from public.sales_leads where id = (select u1 from t_fx)) = current_date + 30, null;
do $$
declare r jsonb;
begin
  r := public.sales_add_lead(jsonb_build_object('business_name', 'Duplicate Of U1', 'search_keyword', 'plumbers', 'place_id', (select u1_place from t_fx)));
  insert into t_results (name, ok, detail) values ('A: sales_add_lead of existing place → exists', r ->> 'error' = 'exists', r::text);
  r := public.sales_add_lead(jsonb_build_object('business_name', 'Brand New Test Plumbing Ltd', 'search_keyword', 'plumbers', 'search_location', 'Testtown', 'place_id', 'TEST_PLACE_' || gen_random_uuid(), 'phone', '07000 000999'));
  insert into t_results (name, ok, detail) values ('A: sales_add_lead of new business → ok', r ->> 'ok' = 'true', r::text);
  insert into t_results (name, ok, detail) values ('A: new lead visible and assigned to A',
    exists (select 1 from public.sales_leads where business_name = 'Brand New Test Plumbing Ltd' and assigned_to_user_id = auth.uid()), null);
  r := public.sales_add_lead(jsonb_build_object('business_name', 'Same Phone Different Name', 'search_keyword', 'plumbers', 'phone', '+44 7000 000999'));
  insert into t_results (name, ok, detail) values ('A: same phone (other format) → exists', r ->> 'error' = 'exists', r::text);
  r := public.sales_add_lead(jsonb_build_object('business_name', 'No Trade Ltd'));
  insert into t_results (name, ok, detail) values ('A: add without trade refused', r ->> 'error' = 'no_trade', r::text);
  begin
    insert into public.outreach_leads (user_id, business_name) values (auth.uid(), 'Direct insert by sales');
    insert into t_results (name, ok, detail) values ('A: direct lead insert blocked', false, 'insert succeeded');
  exception when others then
    insert into t_results (name, ok, detail) values ('A: direct lead insert blocked', true, sqlerrm);
  end;
  begin
    insert into public.ai_audit_queue (user_id) values (auth.uid());
    insert into t_results (name, ok, detail) values ('A: direct audit-queue insert blocked', false, 'insert succeeded');
  exception when others then
    insert into t_results (name, ok, detail) values ('A: direct audit-queue insert blocked', true, sqlerrm);
  end;
  begin
    insert into public.ai_audits (user_id, business_name, business_type, location_text) values (auth.uid(), 'x', 'y', 'z');
    insert into t_results (name, ok, detail) values ('A: direct audit insert blocked', false, 'insert succeeded');
  exception when others then
    insert into t_results (name, ok, detail) values ('A: direct audit insert blocked', true, sqlerrm);
  end;
  begin
    perform public.assign_lead((select u1 from t_fx), 'bbbbbbbb-0000-4000-8000-00000000000b');
    insert into t_results (name, ok, detail) values ('A: cannot reassign', false, 'assign succeeded');
  exception when others then
    insert into t_results (name, ok, detail) values ('A: cannot reassign', sqlerrm = 'admin_only', sqlerrm);
  end;
  begin
    insert into public.user_roles (user_id, role) values (auth.uid(), 'admin');
    insert into t_results (name, ok, detail) values ('A: cannot self-promote', false, 'insert succeeded');
  exception when others then
    insert into t_results (name, ok, detail) values ('A: cannot self-promote', true, sqlerrm);
  end;
  begin
    update public.user_roles set role = 'admin' where user_id = auth.uid();
    insert into t_results (name, ok, detail) values ('A: cannot update own role', public.my_role() = 'sales', public.my_role());
  exception when others then
    insert into t_results (name, ok, detail) values ('A: cannot update own role', true, sqlerrm);
  end;
  begin
    update public.sales_leads set status = 'payment_received' where id = (select u1 from t_fx);
    insert into t_results (name, ok, detail) values ('A: view is read-only', false, 'update succeeded');
  exception when others then
    insert into t_results (name, ok, detail) values ('A: view is read-only', true, sqlerrm);
  end;
  begin
    insert into public.lead_activity (lead_id, actor_user_id, kind, body) values ((select u1 from t_fx), auth.uid(), 'note', 'forged');
    insert into t_results (name, ok, detail) values ('A: activity not directly writable', false, 'insert succeeded');
  exception when others then
    insert into t_results (name, ok, detail) values ('A: activity not directly writable', true, sqlerrm);
  end;
  begin
    perform public.lead_add_note((select contacted from t_fx), 'note on Pauls lead');
    insert into t_results (name, ok, detail) values ('A: cannot note Pauls lead', false, 'note succeeded');
  exception when others then
    insert into t_results (name, ok, detail) values ('A: cannot note Pauls lead', sqlerrm = 'not_your_lead', sqlerrm);
  end;
end $$;
insert into t_results (name, ok, detail) select 'A: pool excludes contacted', not exists (select 1 from public.sales_pool('', 200, 0) p where p.id = (select contacted from t_fx)), null;
insert into t_results (name, ok, detail) select 'A: pool has leads', (select count(*) from public.sales_pool('', 200, 0)) > 0, (select count(*)::text from public.sales_pool('', 200, 0));

-- ─── as SALES B ───
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-00000000000b', true);
insert into t_results (name, ok, detail) select 'B: lookup u1 = owned by Sales A', x.state = 'owned' and x.owner_name = 'Sales A', x.state || '/' || coalesce(x.owner_name, '∅')
  from public.lead_identity_lookup(jsonb_build_array(jsonb_build_object('k', 'u', 'place_id', (select u1_place from t_fx)))) x;
insert into t_results (name, ok, detail) select 'B: cannot claim A lead', (public.claim_lead((select u1 from t_fx)) ->> 'error') = 'already_owned', public.claim_lead((select u1 from t_fx))::text;
insert into t_results (name, ok, detail) select 'B: cannot see A lead', not exists (select 1 from public.sales_leads where id = (select u1 from t_fx)), null;
insert into t_results (name, ok, detail) select 'B: cannot see A activity', (select count(*) from public.lead_activity) = 0, (select count(*)::text from public.lead_activity);
insert into t_results (name, ok, detail) select 'B: claims u2', (public.claim_lead((select u2 from t_fx)) ->> 'ok') = 'true', null;
insert into t_results (name, ok, detail) select 'B: pool no longer has u1', not exists (select 1 from public.sales_pool('', 200, 0) p where p.id = (select u1 from t_fx)), null;
do $$ begin
  perform public.lead_set_stage((select u1 from t_fx), 'interested');
  insert into t_results (name, ok, detail) values ('B: cannot change A stage', false, 'succeeded');
exception when others then
  insert into t_results (name, ok, detail) values ('B: cannot change A stage', sqlerrm = 'not_your_lead', sqlerrm);
end $$;

-- ─── as a signed-in account with NO role ───
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-00000000000c","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-00000000000c', true);
insert into t_results (name, ok, detail) select 'none: role null', public.my_role() is null, public.my_role();
insert into t_results (name, ok, detail) select 'none: sales_leads empty', (select count(*) from public.sales_leads) = 0, null;
insert into t_results (name, ok, detail) select 'none: pool empty', (select count(*) from public.sales_pool('', 50, 0)) = 0, null;
do $$ begin
  perform public.claim_lead((select u2 from t_fx));
  insert into t_results (name, ok, detail) values ('none: cannot claim', false, 'succeeded');
exception when others then
  insert into t_results (name, ok, detail) values ('none: cannot claim', sqlerrm = 'no_role', sqlerrm);
end $$;

-- ─── as ANON ───
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  perform public.claim_lead((select u2 from t_fx));
  insert into t_results (name, ok, detail) values ('anon: cannot call claim', false, 'succeeded');
exception when others then
  insert into t_results (name, ok, detail) values ('anon: cannot call claim', true, sqlerrm);
end $$;
do $$ begin
  perform count(*) from public.sales_leads;
  insert into t_results (name, ok, detail) values ('anon: cannot read view', false, 'succeeded');
exception when others then
  insert into t_results (name, ok, detail) values ('anon: cannot read view', true, sqlerrm);
end $$;

-- ─── as ADMIN (the real data account) ───
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', public.book_owner_id(), 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', (select user_id::text from public.team_members where is_book_owner), true);
insert into t_results (name, ok, detail) select 'admin: role admin', public.my_role() = 'admin', public.my_role();
insert into t_results (name, ok, detail) select 'admin: reads every lead as before', (select count(*) from public.outreach_leads) = (select total_leads from t_fx) + 1,
  format('%s vs %s+1', (select count(*) from public.outreach_leads), (select total_leads from t_fx));
insert into t_results (name, ok, detail) select 'admin: reads every audit', (select count(*) from public.ai_audits) >= 1500, (select count(*)::text from public.ai_audits);
insert into t_results (name, ok, detail) select 'admin: reads messages', (select count(*) from public.whatsapp_messages) >= 5000, (select count(*)::text from public.whatsapp_messages);
with u as (update public.outreach_leads set notes = notes where id = (select u2 from t_fx) returning 1) insert into t_results (name, ok, detail) select 'admin: can update a lead', count(*) = 1, count(*)::text from u;
insert into t_results (name, ok, detail) select 'admin: reassign A→B', (public.assign_lead((select u1 from t_fx), 'bbbbbbbb-0000-4000-8000-00000000000b') ->> 'ok') = 'true', null;
insert into t_results (name, ok, detail) select 'admin: reassign kept the same record', (select assigned_to_user_id from public.outreach_leads where id = (select u1 from t_fx)) = 'bbbbbbbb-0000-4000-8000-00000000000b', null;
insert into t_results (name, ok, detail) select 'admin: reassign logged from A to B',
  exists (select 1 from public.lead_activity where lead_id = (select u1 from t_fx) and kind = 'lead_assigned' and data ->> 'from' = 'aaaaaaaa-0000-4000-8000-00000000000a' and data ->> 'to' = 'bbbbbbbb-0000-4000-8000-00000000000b'), null;
insert into t_results (name, ok, detail) select 'admin: reassign sent nothing', (select count(*) from public.whatsapp_messages where lead_id = (select u1 from t_fx)) = 0, null;
insert into t_results (name, ok, detail) select 'admin: history kept after reassign', (select count(*) from public.lead_activity where lead_id = (select u1 from t_fx) and kind = 'note') = 1, null;
do $$ begin
  insert into public.outreach_leads (user_id, business_name, place_id) values (auth.uid(), 'Admin duplicate', (select u1_place from t_fx));
  insert into t_results (name, ok, detail) values ('admin: duplicate place id insert blocked', false, 'insert succeeded');
exception when unique_violation then
  insert into t_results (name, ok, detail) values ('admin: duplicate place id insert blocked', true, sqlerrm);
end $$;
do $$ begin
  insert into public.outreach_leads (user_id, business_name, place_id) values (auth.uid(), 'Admin brand new', 'TEST_ADMIN_' || gen_random_uuid());
  insert into t_results (name, ok, detail) values ('admin: new place id insert works', true, null);
exception when others then
  insert into t_results (name, ok, detail) values ('admin: new place id insert works', false, sqlerrm);
end $$;
-- Auto-assign on contact (assign_lead_on_contact). ⛔ THE RULE CHANGED 2026-10-01 (migration 20261001230000 era,
-- docs/outreach-workspace.md §E): an AUTOMATIC queue send that is only 'sent' (accepted by Meta, not yet delivered)
-- no longer assigns — it may still fail as "not on WhatsApp". It assigns the book owner once DELIVERED. This check
-- asserted the old rule and read NULL (no assignment) — a stale test, not a bug. Now both halves, on its own
-- fixture lead (it borrowed the newest unassigned live lead).
reset role;
do $$ declare v uuid := gen_random_uuid(); m uuid; begin
  insert into public.outreach_leads (id, user_id, business_name, status) values (v, public.book_owner_id(), 'QA auto-assign (rolled back)', 'not_contacted');
  insert into public.whatsapp_messages (direction, lead_id, phone, body, status, user_id) values ('outbound', v, '447700900611', 'test', 'sent', null) returning id into m;
  insert into t_results (name, ok, detail) values ('trigger: an automatic send that is only sent does NOT assign yet', (select assigned_to_user_id from public.outreach_leads where id = v) is null, null);
  update public.whatsapp_messages set status = 'delivered' where id = m;
  insert into t_results (name, ok, detail) values ('trigger: once delivered, it assigns the book owner', (select assigned_to_user_id from public.outreach_leads where id = v) = public.book_owner_id(), null);
end $$;

do $$ begin
  raise exception 'RESULTS %', (select json_agg(json_build_object('n', n, 'ok', ok, 'name', name, 'detail', detail) order by n) from t_results);
end $$;
