-- Salesperson onboarding + the READY TO SELL gate (2026-10-05, migration 20261010120000).
-- RUN AGAINST THE LIVE DATABASE; ALWAYS ROLLED BACK — the last statement raises the results as JSON, so
-- nothing commits (fake users on example.invalid; real leads borrowed and changed only inside this
-- transaction). Before the migration is applied, prepend the migration's text after `begin;` — DDL is
-- transactional, so it is rolled back with everything else.
-- Sales A ("Sarah") = fully onboarded (approved documents). Sales B = incomplete. Sales C = a rep who creates a
-- sale and is then disabled. Sales T ("Tom") = a ready rep who takes leads over. The admin = the book owner.
begin;
create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated, anon, service_role; grant usage, select on sequence t_results_n_seq to authenticated, anon, service_role;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('ffffffff-0000-4000-8000-0000000005a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-onb-a@example.invalid', '{}', '{}', now(), now()),
  ('ffffffff-0000-4000-8000-0000000005b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-onb-b@example.invalid', '{}', '{}', now(), now()),
  ('ffffffff-0000-4000-8000-0000000005c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-onb-c@example.invalid', '{}', '{}', now(), now()),
  ('ffffffff-0000-4000-8000-0000000005d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-onb-t@example.invalid', '{}', '{}', now(), now());
insert into public.user_roles (user_id, role) values ('ffffffff-0000-4000-8000-0000000005a1', 'sales'), ('ffffffff-0000-4000-8000-0000000005b1', 'sales'), ('ffffffff-0000-4000-8000-0000000005c1', 'sales'), ('ffffffff-0000-4000-8000-0000000005d1', 'sales');
insert into public.team_members (user_id, display_name) values ('ffffffff-0000-4000-8000-0000000005a1', 'ONB A'), ('ffffffff-0000-4000-8000-0000000005b1', 'ONB B'), ('ffffffff-0000-4000-8000-0000000005c1', 'ONB C'), ('ffffffff-0000-4000-8000-0000000005d1', 'ONB T');

create temp table t_fx as select
  (select user_id from public.team_members where is_book_owner limit 1) as admin_id,
  array(select l.id from public.outreach_leads l where l.assigned_to_user_id is null and l.is_archived is not true
          and not public.lead_is_client(l.amount_paid, l.status) and coalesce(l.status, '') = 'not_contacted'
          and public.lead_contact_attempt_at(l.id) is null
        order by l.created_at limit 10) as leads,
  (select count(*) from public.outreach_leads where sold_by_user_id is not null) as sold_before,
  (select md5(string_agg(id::text || ':' || sold_by_user_id::text, ',' order by id)) from public.outreach_leads where sold_by_user_id is not null) as sold_hash_before,
  (select count(*) from public.sale_attribution_reviews) as reviews_before;
grant select on t_fx to authenticated, anon, service_role;
insert into t_results (name, ok, detail) select 'fixtures: the admin and ten untouched unassigned leads', admin_id is not null and cardinality(leads) = 10, cardinality(leads)::text from t_fx;
-- leads[1] → A (own lead, to call), leads[2] → B (own lead), leads[3] claim target, leads[4]/[5]/[7] payments, leads[6] admin assign
update public.outreach_leads set assigned_to_user_id = 'ffffffff-0000-4000-8000-0000000005a1', assigned_at = now() where id = (select leads[1] from t_fx);
update public.outreach_leads set assigned_to_user_id = 'ffffffff-0000-4000-8000-0000000005b1', assigned_at = now() where id = (select leads[2] from t_fx);
update public.outreach_leads set assigned_to_user_id = 'ffffffff-0000-4000-8000-0000000005b1', assigned_at = now() where id = (select leads[4] from t_fx);
update public.outreach_leads set assigned_to_user_id = 'ffffffff-0000-4000-8000-0000000005a1', assigned_at = now() where id = (select leads[5] from t_fx);
update public.outreach_leads set assigned_to_user_id = 'ffffffff-0000-4000-8000-0000000005c1', assigned_at = now() where id = (select leads[7] from t_fx);
insert into t_results (name, ok, detail) select 'HISTORY: the migration opens no review on any existing sale', reviews_before = 0, reviews_before::text from t_fx;

-- ── documents: the seeds, then approved QA versions (what Paul does when the final documents arrive) ──
insert into t_results (name, ok, detail) select 'seed: agreement draft v2 is a DRAFT, the privacy notice is a DRAFT with 10 outstanding, the team guide is approved',
  (select status from public.salesperson_document_versions where id = 'contractor-agreement-draft-v2') = 'draft'
  and (select status = 'draft' and cardinality(outstanding) = 10 from public.salesperson_document_versions where id = 'salesperson-privacy-notice-draft-2026-10-05')
  and (select status from public.salesperson_document_versions where id = 'team-guide-2026-10-02') = 'approved', null;
insert into t_results (name, ok, detail) select 'no contractor agreement or privacy notice is approved yet', not exists (
  select 1 from public.salesperson_document_versions where kind in ('contractor_agreement', 'privacy_notice') and status = 'approved'), null;
set local role service_role;
insert into public.salesperson_document_versions (id, kind, label, status, outstanding) values ('qa-notice-with-gap', 'privacy_notice', 'QA notice with a blank', 'draft', array['a blank']);
insert into t_results (name, ok, detail) select 'a draft with outstanding items cannot be approved',
  r ->> 'error' = 'has_outstanding', r::text from (select public.approve_salesperson_document('qa-notice-with-gap', (select admin_id from t_fx)) r) x;
insert into t_results (name, ok, detail) select 'the draft privacy notice can never be approved as it is',
  r ->> 'ok' = 'false', r::text from (select public.approve_salesperson_document('salesperson-privacy-notice-draft-2026-10-05', (select admin_id from t_fx)) r) x;
update public.salesperson_document_versions set outstanding = '{}' where id = 'contractor-agreement-draft-v2';
insert into t_results (name, ok, detail) select 'draft v2 can never be approved, even with its outstanding note cleared',
  (public.approve_salesperson_document('contractor-agreement-draft-v2', (select admin_id from t_fx)) ->> 'error') = 'draft_named_version', null;
insert into public.salesperson_document_versions (id, kind, label, status, outstanding) values
  ('qa-agreement-final-1', 'contractor_agreement', 'QA agreement final 1', 'draft', '{}'),
  ('qa-agreement-final-2', 'contractor_agreement', 'QA agreement final 2', 'draft', '{}'),
  ('qa-notice-final-1', 'privacy_notice', 'QA notice final 1', 'draft', '{}');
insert into t_results (name, ok, detail) select 'approving a complete draft works', (public.approve_salesperson_document('qa-agreement-final-1', (select admin_id from t_fx)) ->> 'ok')::boolean
  and (public.approve_salesperson_document('qa-notice-final-1', (select admin_id from t_fx)) ->> 'ok')::boolean, null;

-- Sales A: complete, but on the DRAFT agreement and the DRAFT notice first.
insert into public.salesperson_onboarding (user_id, agreement_version, agreement_signed_on, agreement_ref, privacy_notice_version, privacy_notice_given_on,
  age_18_confirmed_on, rtw_method, rtw_checked_on, rtw_checked_by, rtw_result, rtw_evidence_ref, bank_details_received_on, vat_registered,
  contractor_type, start_date, team_guide_version, team_guide_acknowledged_on, updated_by)
values ('ffffffff-0000-4000-8000-0000000005a1', 'contractor-agreement-draft-v2', '2026-10-06', 'Secure folder / A', 'salesperson-privacy-notice-draft-2026-10-05', '2026-10-06',
  '2026-10-06', 'manual_video_call', '2026-10-06', 'Paul James Sales', 'pass', 'Secure folder / RTW / A', '2026-10-06', false,
  'individual', '2026-10-01', 'team-guide-2026-10-02', '2026-10-06', (select admin_id from t_fx));
/* Since migration 20261010140000 (Paul, 2026-10-05) salesperson PAPERWORK is handled outside LeadFinderOS: a draft,
   approved or superseded agreement / notice — or none — never decides Ready to Sell. */
insert into t_results (name, ok, detail) select 'DOCS: draft agreement v2 + draft notice recorded → still READY TO SELL (paperwork handled outside the app)',
  cardinality(m) = 0, m::text from (select public.salesperson_onboarding_missing('ffffffff-0000-4000-8000-0000000005a1') m) x;
update public.salesperson_onboarding set agreement_version = 'qa-agreement-final-1' where user_id = 'ffffffff-0000-4000-8000-0000000005a1';
insert into t_results (name, ok, detail) select 'DOCS: an approved agreement changes nothing either',
  cardinality(m) = 0, m::text from (select public.salesperson_onboarding_missing('ffffffff-0000-4000-8000-0000000005a1') m) x;
update public.salesperson_onboarding set privacy_notice_version = 'qa-notice-final-1' where user_id = 'ffffffff-0000-4000-8000-0000000005a1';
insert into t_results (name, ok, detail) select 'DOCS: READY TO SELL on the practical items alone (no TPS/CTPS needed)',
  public.salesperson_ready_to_sell('ffffffff-0000-4000-8000-0000000005a1'), public.salesperson_onboarding_missing('ffffffff-0000-4000-8000-0000000005a1')::text;
insert into t_results (name, ok, detail) select 'approving a newer agreement version is still recorded (reference only)',
  (r ->> 'superseded') = 'qa-agreement-final-1', r::text
  from (select public.approve_salesperson_document('qa-agreement-final-2', (select admin_id from t_fx)) r) x;
insert into t_results (name, ok, detail) select 'DOCS: having only the SUPERSEDED agreement does not stop them selling',
  cardinality(m) = 0, m::text from (select public.salesperson_onboarding_missing('ffffffff-0000-4000-8000-0000000005a1') m) x;
update public.salesperson_onboarding set agreement_version = 'qa-agreement-final-2' where user_id = 'ffffffff-0000-4000-8000-0000000005a1';
insert into t_results (name, ok) values ('…and recording the new one keeps them ready', public.salesperson_ready_to_sell('ffffffff-0000-4000-8000-0000000005a1'));
do $$ begin
  begin
    update public.salesperson_onboarding set privacy_notice_version = 'qa-agreement-final-2' where user_id = 'ffffffff-0000-4000-8000-0000000005a1';
    insert into t_results (name, ok) values ('a version of the wrong kind is refused', false);
  exception when others then insert into t_results (name, ok, detail) values ('a version of the wrong kind is refused', sqlstate = '23514', sqlerrm); end;
  begin
    update public.salesperson_document_versions set status = 'approved' where id = 'salesperson-privacy-notice-draft-2026-10-05';
    insert into t_results (name, ok) values ('the database itself refuses an approved version with outstanding items (even written directly)', false);
  exception when others then insert into t_results (name, ok, detail) values ('the database itself refuses an approved version with outstanding items (even written directly)', sqlstate = '23514', sqlerrm); end;
end $$;
-- Sales B: only part of it.
insert into public.salesperson_onboarding (user_id, agreement_version, agreement_signed_on, age_18_confirmed_on, updated_by)
values ('ffffffff-0000-4000-8000-0000000005b1', 'contractor-agreement-draft-v2', '2026-10-06', '2026-10-06', (select admin_id from t_fx));
insert into t_results (name, ok, detail) select 'Sales B (incomplete) is not ready; TPS/CTPS is never one of the reasons',
  not public.salesperson_ready_to_sell('ffffffff-0000-4000-8000-0000000005b1') and not (m::text ~* 'tps'), m::text
  from (select public.salesperson_onboarding_missing('ffffffff-0000-4000-8000-0000000005b1') m) x;
insert into t_results (name, ok, detail) select 'the change log recorded the edits', count(*) >= 5, count(*)::text from public.salesperson_onboarding_log where user_id::text like 'ffffffff-0000-4000-8000-0000000005%';
reset role;

-- ── as Sales B (NOT ready) ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ffffffff-0000-4000-8000-0000000005b1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'ffffffff-0000-4000-8000-0000000005b1', true);
do $$ declare r jsonb; begin
  r := public.my_onboarding_status();
  insert into t_results (name, ok, detail) values ('GATE: an incomplete rep can still sign in and see their own onboarding status', (r ->> 'gated')::boolean and not (r ->> 'ready')::boolean and jsonb_array_length(r -> 'missing') > 0, r::text);
  begin
    perform 1 from public.salesperson_onboarding;
    insert into t_results (name, ok) values ('…but never the stored record itself (theirs or anyone''s)', false);
  exception when others then insert into t_results (name, ok, detail) values ('…but never the stored record itself (theirs or anyone''s)', sqlstate = '42501', sqlerrm); end;
  r := public.claim_lead((select leads[3] from t_fx));
  insert into t_results (name, ok, detail) values ('GATE: an incomplete rep cannot claim a lead', r ->> 'error' = 'usage_paused'
    and (select assigned_to_user_id from public.outreach_leads where id = (select leads[3] from t_fx)) is null, r::text);
  r := public.sales_queue_opener(array[(select leads[2] from t_fx)], 'initial_opener_v2');
  insert into t_results (name, ok, detail) values ('GATE: an incomplete rep cannot queue outreach', r ->> 'error' = 'usage_paused', r::text);
  begin
    r := public.lead_record_call((select leads[2] from t_fx), 'spoke_to_owner', null);
    insert into t_results (name, ok, detail) values ('GATE: an incomplete rep cannot use the sales call action (even on their own lead)', false, r::text);
  exception when others then insert into t_results (name, ok, detail) values ('GATE: an incomplete rep cannot use the sales call action (even on their own lead)', sqlerrm = 'not_ready_to_sell', sqlerrm); end;
  begin
    r := public.lead_log_contact((select leads[2] from t_fx), 'email', 'message_sent', null);
    insert into t_results (name, ok, detail) values ('GATE: an incomplete rep cannot log other outreach either', false, r::text);
  exception when others then insert into t_results (name, ok, detail) values ('GATE: an incomplete rep cannot log other outreach either', sqlerrm = 'not_ready_to_sell', sqlerrm); end;
  r := public.lead_add_note((select leads[2] from t_fx), 'onboarding QA note');
  insert into t_results (name, ok, detail) values ('an incomplete rep may still write a note on their own lead', coalesce((r ->> 'ok')::boolean, false), r::text);
  r := public.my_acknowledge_team_guide();
  insert into t_results (name, ok, detail) values ('an incomplete rep can complete their own team-guide acknowledgement', (r ->> 'ok')::boolean and r ->> 'version' = 'team-guide-2026-10-02', r::text);
end $$;
reset role;
set local role service_role;
insert into t_results (name, ok, detail) select 'GATE: the usage guard refuses an incomplete rep''s prospect check (not_onboarded)',
  r ->> 'reason' = 'not_onboarded' and not (r ->> 'ok')::boolean, r::text
  from (select public.guard_action('ffffffff-0000-4000-8000-0000000005b1', 'sales_check', null, 0, 1, 'qa') r) x;
insert into t_results (name, ok, detail) select 'GATE: …and its Quick Close / search / WhatsApp-send actions (same refusal as a suspended account)',
  bool_and(r ->> 'reason' = 'not_onboarded'), string_agg(a || '=' || (r ->> 'reason'), ', ')
  from (select a, public.guard_action('ffffffff-0000-4000-8000-0000000005b1', a, null, 0, 1, 'qa') r from unnest(array['lead_search', 'whatsapp_send', 'claim', 'whatsapp_queue']) a) x;
insert into t_results (name, ok, detail) select '…nothing was queued, claimed or logged for them (read back as the server)',
  (select status from public.outreach_leads where id = (select leads[2] from t_fx)) = 'not_contacted'
  and (select assigned_to_user_id from public.outreach_leads where id = (select leads[3] from t_fx)) is null
  and not exists (select 1 from public.lead_activity where actor_user_id = 'ffffffff-0000-4000-8000-0000000005b1' and kind in ('bulk_queued', 'call_outcome', 'contact_logged', 'lead_claimed')), null;
insert into t_results (name, ok, detail) select 'the team guide acknowledgement was stored as the current guide', team_guide_version = 'team-guide-2026-10-02' and team_guide_acknowledged_on is not null, null
  from public.salesperson_onboarding where user_id = 'ffffffff-0000-4000-8000-0000000005b1';
reset role;

-- ── as Sales A (fully onboarded) — works normally, with NO TPS/CTPS check on file ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ffffffff-0000-4000-8000-0000000005a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'ffffffff-0000-4000-8000-0000000005a1', true);
do $$ declare r jsonb; begin
  r := public.my_onboarding_status();
  insert into t_results (name, ok, detail) values ('a fully onboarded rep sees READY', (r ->> 'ready')::boolean, r::text);
  insert into t_results (name, ok, detail) values ('no TPS/CTPS answer exists for their lead (no provider)', not exists (select 1 from public.phone_tps_checks where lead_id = (select leads[1] from t_fx)), null);
  r := public.lead_record_call((select leads[1] from t_fx), 'no_answer', null);
  insert into t_results (name, ok, detail) values ('CALL: a ready rep logs a call with no TPS provider and no TPS result (calling unchanged)', (r ->> 'ok')::boolean, r::text);
  r := public.lead_log_contact((select leads[1] from t_fx), 'call', 'left_voicemail', null);
  insert into t_results (name, ok, detail) values ('CALL: …and through the Log contact path', (r ->> 'ok')::boolean, r::text);
  r := public.claim_lead((select leads[3] from t_fx));
  insert into t_results (name, ok, detail) values ('a ready rep can claim a lead', (r ->> 'ok')::boolean, r::text);
end $$;
reset role;
set local role service_role;
insert into t_results (name, ok, detail) select 'the usage guard does not refuse a ready rep for onboarding',
  bool_and(coalesce(r ->> 'reason', '') <> 'not_onboarded' and not coalesce((r ->> 'not_onboarded')::boolean, false)), string_agg(a || '=' || coalesce(r ->> 'reason', 'ok'), ', ')
  from (select a, public.guard_action('ffffffff-0000-4000-8000-0000000005a1', a, null, 0, 1, 'qa') r from unnest(array['sales_check', 'whatsapp_send', 'whatsapp_queue']) a) x;
insert into t_results (name, ok, detail) select 'the admin is never refused for onboarding',
  coalesce(r ->> 'reason', '') <> 'not_onboarded', r::text from (select public.guard_action((select admin_id from t_fx), 'whatsapp_send', null, 0, 1, 'qa') r) x;
reset role;

-- ── as the admin ──
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from t_fx), 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', (select admin_id::text from t_fx), true);
do $$ declare r jsonb; begin
  begin
    r := public.assign_lead((select leads[6] from t_fx), 'ffffffff-0000-4000-8000-0000000005b1');
    insert into t_results (name, ok, detail) values ('the admin cannot hand a lead to an incomplete rep', false, r::text);
  exception when others then insert into t_results (name, ok, detail) values ('the admin cannot hand a lead to an incomplete rep', sqlerrm = 'not_ready_to_sell', sqlerrm); end;
  r := public.assign_lead((select leads[6] from t_fx), 'ffffffff-0000-4000-8000-0000000005a1');
  insert into t_results (name, ok, detail) values ('the admin can hand a lead to a ready rep', (r ->> 'ok')::boolean, r::text);
  r := public.lead_record_call((select leads[2] from t_fx), 'no_answer', null);
  insert into t_results (name, ok, detail) values ('the admin is unaffected: logs a call on any lead', (r ->> 'ok')::boolean, r::text);
  r := public.my_onboarding_status();
  insert into t_results (name, ok, detail) values ('the admin is never gated', not (r ->> 'gated')::boolean and (r ->> 'ready')::boolean, r::text);
end $$;
reset role;

-- ── ATTRIBUTION: SALE CREATOR ≠ CURRENT LEAD OWNER ──────────────────────────────────────────────────
-- Sarah = Sales A (ready). Tom = Sales T (made ready here). C = a ready rep who will be disabled. B = never ready.
set local role service_role;
-- A real server request carries no signed-in user: clear the previous section's session claims.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.sub', '', true);
insert into public.salesperson_onboarding (user_id, agreement_version, agreement_signed_on, agreement_ref, privacy_notice_version, privacy_notice_given_on,
  age_18_confirmed_on, rtw_method, rtw_checked_on, rtw_checked_by, rtw_result, rtw_evidence_ref, bank_details_received_on, vat_registered,
  contractor_type, start_date, team_guide_version, team_guide_acknowledged_on, updated_by)
select u, agreement_version, agreement_signed_on, agreement_ref, privacy_notice_version, privacy_notice_given_on,
  age_18_confirmed_on, rtw_method, rtw_checked_on, rtw_checked_by, rtw_result, rtw_evidence_ref, bank_details_received_on, vat_registered,
  contractor_type, start_date, team_guide_version, team_guide_acknowledged_on, updated_by
  from public.salesperson_onboarding, unnest(array['ffffffff-0000-4000-8000-0000000005c1', 'ffffffff-0000-4000-8000-0000000005d1']::uuid[]) u
 where user_id = 'ffffffff-0000-4000-8000-0000000005a1';
insert into t_results (name, ok, detail) select 'setup: Sarah (A), Tom (T) and C are Ready to Sell; B is not',
  public.salesperson_ready_to_sell('ffffffff-0000-4000-8000-0000000005a1') and public.salesperson_ready_to_sell('ffffffff-0000-4000-8000-0000000005d1')
  and public.salesperson_ready_to_sell('ffffffff-0000-4000-8000-0000000005c1') and not public.salesperson_ready_to_sell('ffffffff-0000-4000-8000-0000000005b1'), null;
insert into t_results (name, ok, detail) select 'HISTORY: links made before this rule are kept as evidence with readiness UNKNOWN (never counted as authorised for a salesperson)',
  (select count(*) from public.sale_creations) = (select count(*) from public.quick_close_events where kind = 'link_generated' and actor_user_id is not null and lead_id is not null)
  and not exists (select 1 from public.sale_creations where creator_role = 'sales' and creator_ready is true), null;

-- MONDAY: the sign-up links are created (what quick-close logs once its Ready-to-Sell gate passed).
insert into public.quick_close_events (lead_id, actor_user_id, kind, data) values
  ((select leads[5] from t_fx),  'ffffffff-0000-4000-8000-0000000005a1', 'link_generated', '{"qa": true, "session": "cs_qa_case_a"}'),
  ((select leads[8] from t_fx),  'ffffffff-0000-4000-8000-0000000005a1', 'link_generated', '{"qa": true, "session": "cs_qa_case_b"}'),
  ((select leads[7] from t_fx),  'ffffffff-0000-4000-8000-0000000005c1', 'link_generated', '{"qa": true, "session": "cs_qa_case_c"}'),
  ((select leads[10] from t_fx), 'ffffffff-0000-4000-8000-0000000005a1', 'link_generated', '{"qa": true, "session": "cs_qa_manual"}'),
  ((select leads[2] from t_fx),  'ffffffff-0000-4000-8000-0000000005b1', 'link_generated', '{"qa": true, "session": "cs_qa_case_g"}'),
  ((select leads[6] from t_fx),  'ffffffff-0000-4000-8000-0000000005a1', 'link_generated', '{"qa": true, "session": "cs_qa_mismatch"}');
insert into t_results (name, ok, detail) select 'CREATION: each link is snapshotted with its creator and their readiness AT THAT MOMENT',
  (select creator_user_id = 'ffffffff-0000-4000-8000-0000000005a1' and creator_role = 'sales' and creator_ready from public.sale_creations where checkout_session_id = 'cs_qa_case_a')
  and (select not creator_ready and cardinality(creator_missing) > 0 from public.sale_creations where checkout_session_id = 'cs_qa_case_g'), null;
do $$ begin
  begin
    update public.sale_creations set creator_user_id = 'ffffffff-0000-4000-8000-0000000005d1' where checkout_session_id = 'cs_qa_case_a';
    insert into t_results (name, ok) values ('the creation snapshot cannot be edited', false);
  exception when others then insert into t_results (name, ok, detail) values ('the creation snapshot cannot be edited', sqlerrm like '%append-only%', sqlerrm); end;
end $$;

-- TUESDAY: owners change, Sarah becomes not ready (her bank-details record is withdrawn — paperwork no longer
-- decides readiness since 20261010140000), C is disabled.
update public.outreach_leads set assigned_to_user_id = 'ffffffff-0000-4000-8000-0000000005d1', assigned_at = now()
 where id in ((select leads[5] from t_fx), (select leads[7] from t_fx), (select leads[10] from t_fx), (select leads[4] from t_fx));
update public.salesperson_onboarding set bank_details_received_on = null where user_id = 'ffffffff-0000-4000-8000-0000000005a1';
update public.team_members set status = 'disabled', disabled_at = now() where user_id = 'ffffffff-0000-4000-8000-0000000005c1';
delete from public.user_roles where user_id = 'ffffffff-0000-4000-8000-0000000005c1' and role = 'sales';
insert into t_results (name, ok, detail) select 'setup: Sarah and C are now NOT ready; the leads now belong to Tom',
  not public.salesperson_ready_to_sell('ffffffff-0000-4000-8000-0000000005a1') and not public.salesperson_ready_to_sell('ffffffff-0000-4000-8000-0000000005c1')
  and (select bool_and(assigned_to_user_id = 'ffffffff-0000-4000-8000-0000000005d1') from public.outreach_leads where id in ((select leads[5] from t_fx), (select leads[7] from t_fx))), null;

-- WEDNESDAY: the clients pay (stripe-webhook: the payment and its checkout session in ONE update).
update public.outreach_leads set amount_paid = 99, status = 'payment_received', payment_date = now(), paid_checkout_session_id = 'cs_qa_case_a' where id = (select leads[5] from t_fx);
update public.outreach_leads set amount_paid = 99, status = 'payment_received', payment_date = now(), paid_checkout_session_id = 'cs_qa_case_b' where id = (select leads[8] from t_fx);
update public.outreach_leads set amount_paid = 99, status = 'payment_received', payment_date = now(), paid_checkout_session_id = 'cs_qa_case_c' where id = (select leads[7] from t_fx);
update public.outreach_leads set amount_paid = 99, status = 'payment_received', payment_date = now() where id = (select leads[10] from t_fx);                 -- a manual Mark Paid: no session
update public.outreach_leads set amount_paid = 99, status = 'payment_received', payment_date = now() where id = (select leads[4] from t_fx);                  -- no link at all; Tom owns it
update public.outreach_leads set amount_paid = 99, status = 'payment_received', payment_date = now(), paid_checkout_session_id = 'cs_qa_case_g' where id = (select leads[2] from t_fx);
update public.outreach_leads set amount_paid = 99, status = 'payment_received', payment_date = now() where id = (select leads[9] from t_fx);                  -- Paul's own lead (unassigned)
update public.outreach_leads set amount_paid = 99, status = 'payment_received', payment_date = now(), paid_checkout_session_id = 'cs_qa_mismatch',
       sold_by_user_id = 'ffffffff-0000-4000-8000-0000000005d1' where id = (select leads[6] from t_fx);                                                   -- a seller claimed that is not the creator

insert into t_results (name, ok, detail) select 'CASE A: Sarah created the sign-up, the lead moved to Tom, the client paid → seller = Sarah (not Tom)',
  sold_by_user_id = 'ffffffff-0000-4000-8000-0000000005a1' and assigned_to_user_id = 'ffffffff-0000-4000-8000-0000000005d1', sold_by_user_id::text from public.outreach_leads where id = (select leads[5] from t_fx);
insert into t_results (name, ok, detail) select 'CASE B: Sarah created the sign-up, then became not ready, the client paid → seller = Sarah',
  sold_by_user_id = 'ffffffff-0000-4000-8000-0000000005a1', sold_by_user_id::text from public.outreach_leads where id = (select leads[8] from t_fx);
insert into t_results (name, ok, detail) select 'CASE C: C created the sign-up, was disabled, the lead moved to Tom, the client paid → seller = C',
  sold_by_user_id = 'ffffffff-0000-4000-8000-0000000005c1', sold_by_user_id::text from public.outreach_leads where id = (select leads[7] from t_fx);
insert into t_results (name, ok, detail) select '…none of A, B, C opened a review', not exists (select 1 from public.sale_attribution_reviews
  where lead_id in ((select leads[5] from t_fx), (select leads[8] from t_fx), (select leads[7] from t_fx))), null;
insert into t_results (name, ok, detail) select 'a manual Mark Paid (no session) follows the latest sign-up creator, not the owner',
  sold_by_user_id = 'ffffffff-0000-4000-8000-0000000005a1', sold_by_user_id::text from public.outreach_leads where id = (select leads[10] from t_fx);
insert into t_results (name, ok, detail) select 'Paul''s own lead with no salesperson link is his sale exactly as before (no review)',
  sold_by_user_id = user_id and not exists (select 1 from public.sale_attribution_reviews where lead_id = (select leads[9] from t_fx)), sold_by_user_id::text from public.outreach_leads where id = (select leads[9] from t_fx);
insert into t_results (name, ok, detail) select 'CASE D: no authorised creator, Tom owns the lead → NO seller (not silently Tom, not Paul)',
  sold_by_user_id is null and sold_at is not null, coalesce(sold_by_user_id::text, 'null') from public.outreach_leads where id = (select leads[4] from t_fx);
insert into t_results (name, ok, detail) select 'CASE D: …ATTRIBUTION REVIEW NEEDED, claimed seller Tom, with owner history and creator evidence',
  status = 'open' and reason = 'no_authorised_creator' and claimed_seller_user_id = 'ffffffff-0000-4000-8000-0000000005d1'
  and evidence ? 'owner_history' and evidence ? 'all_links' and evidence ? 'owner_at_payment' and evidence ? 'claimed_seller_readiness', evidence::text
  from public.sale_attribution_reviews where lead_id = (select leads[4] from t_fx);
insert into t_results (name, ok, detail) select 'a link made by someone NOT ready is not authorised: no seller, review (creator_not_authorised)',
  (select sold_by_user_id is null from public.outreach_leads where id = (select leads[2] from t_fx))
  and (select reason = 'creator_not_authorised' and claimed_seller_user_id = 'ffffffff-0000-4000-8000-0000000005b1' from public.sale_attribution_reviews where lead_id = (select leads[2] from t_fx)), null;
insert into t_results (name, ok, detail) select 'a claimed seller that does not match the creator evidence: no seller, review (claimed_seller_mismatch)',
  (select sold_by_user_id is null from public.outreach_leads where id = (select leads[6] from t_fx))
  and (select reason = 'claimed_seller_mismatch' and claimed_seller_user_id = 'ffffffff-0000-4000-8000-0000000005d1'
         and evidence -> 'creator_evidence_seller' = to_jsonb('ffffffff-0000-4000-8000-0000000005a1'::text) from public.sale_attribution_reviews where lead_id = (select leads[6] from t_fx)), null;
insert into t_results (name, ok, detail) select 'CASE E: an open review → the commission hold is TRUE (function and view)',
  public.sale_attribution_held((select leads[4] from t_fx))
  and (select held from public.sale_attribution_holds where lead_id = (select leads[4] from t_fx))
  and not public.sale_attribution_held((select leads[5] from t_fx)), null;
insert into t_results (name, ok, detail) select '…a security event flags each review for Paul', (select count(*) from public.security_events where alert_key like 'attribution_review:%'
  and lead_id in ((select leads[4] from t_fx), (select leads[2] from t_fx), (select leads[6] from t_fx))) = 3, null;

-- IMMUTABILITY: later changes never move a seller.
update public.outreach_leads set assigned_to_user_id = 'ffffffff-0000-4000-8000-0000000005b1', status = 'in_delivery', sold_by_user_id = 'ffffffff-0000-4000-8000-0000000005d1',
       paid_checkout_session_id = 'cs_other' where id = (select leads[5] from t_fx);
insert into t_results (name, ok, detail) select 'IMMUTABLE: reassignment, a status change and an attempted rewrite leave Sarah as seller (and the session)',
  sold_by_user_id = 'ffffffff-0000-4000-8000-0000000005a1' and paid_checkout_session_id = 'cs_qa_case_a', sold_by_user_id::text || ' ' || paid_checkout_session_id from public.outreach_leads where id = (select leads[5] from t_fx);
update public.outreach_leads set sold_by_user_id = 'ffffffff-0000-4000-8000-0000000005d1' where id = (select leads[4] from t_fx);
insert into t_results (name, ok, detail) select 'IMMUTABLE: a held sale cannot be given a seller by a plain update (only Paul''s resolution)',
  sold_by_user_id is null, coalesce(sold_by_user_id::text, 'null') from public.outreach_leads where id = (select leads[4] from t_fx);

-- RESOLUTION (each decision is its own statement; the check reads it in the next one)
create temp table t_res (k text primary key, r jsonb);
grant all on t_res to service_role;
insert into t_res select 'F', public.resolve_sale_attribution_review((select leads[4] from t_fx), 'confirmed', 'QA', (select admin_id from t_fx));
insert into t_results (name, ok, detail) select 'CASE F: Paul confirms the seller → Tom is the seller, the hold clears',
  (select (r ->> 'ok')::boolean from t_res where k = 'F')
  and (select sold_by_user_id = 'ffffffff-0000-4000-8000-0000000005d1' from public.outreach_leads where id = (select leads[4] from t_fx))
  and not public.sale_attribution_held((select leads[4] from t_fx)),
  (select r::text from t_res where k = 'F') || ' seller=' || coalesce((select sold_by_user_id::text from public.outreach_leads where id = (select leads[4] from t_fx)), 'null');
update public.outreach_leads set sold_by_user_id = 'ffffffff-0000-4000-8000-0000000005a1' where id = (select leads[4] from t_fx);
insert into t_results (name, ok, detail) select 'CASE F: …and the confirmed seller is then frozen like any other',
  sold_by_user_id = 'ffffffff-0000-4000-8000-0000000005d1', sold_by_user_id::text from public.outreach_leads where id = (select leads[4] from t_fx);
insert into t_res select 'G', public.resolve_sale_attribution_review((select leads[2] from t_fx), 'not_credited', 'QA', (select admin_id from t_fx));
insert into t_results (name, ok, detail) select 'CASE G: Paul chooses Not credited → no seller, claimed seller + evidence kept, hold stays TRUE',
  (select (r ->> 'ok')::boolean from t_res where k = 'G')
  and (select sold_by_user_id is null from public.outreach_leads where id = (select leads[2] from t_fx))
  and (select status = 'not_credited' and claimed_seller_user_id = 'ffffffff-0000-4000-8000-0000000005b1' and evidence ? 'creation' from public.sale_attribution_reviews where lead_id = (select leads[2] from t_fx))
  and public.sale_attribution_held((select leads[2] from t_fx)), (select r::text from t_res where k = 'G');
update public.outreach_leads set sold_by_user_id = 'ffffffff-0000-4000-8000-0000000005b1' where id = (select leads[2] from t_fx);
insert into t_results (name, ok, detail) select 'CASE G: …and nobody can be stamped as its seller afterwards',
  sold_by_user_id is null, coalesce(sold_by_user_id::text, 'null') from public.outreach_leads where id = (select leads[2] from t_fx);
insert into t_results (name, ok, detail) select 'one decision only: a resolved review cannot be decided again',
  r ->> 'error' = 'no_open_review', r::text from (select public.resolve_sale_attribution_review((select leads[2] from t_fx), 'confirmed', null, (select admin_id from t_fx)) r) x;
insert into t_results (name, ok, detail) select 'HISTORY: every sale that existed before is untouched (same sellers, same count)',
  (select md5(string_agg(id::text || ':' || sold_by_user_id::text, ',' order by id)) from public.outreach_leads
    where sold_by_user_id is not null and not exists (select 1 from t_fx where outreach_leads.id = any (t_fx.leads))) = (select sold_hash_before from t_fx), null;
reset role;

-- ── anon, and the structure ──
set local role anon;
do $$ begin
  begin perform 1 from public.salesperson_onboarding; insert into t_results (name, ok) values ('anon cannot read onboarding', false);
  exception when others then insert into t_results (name, ok, detail) values ('anon cannot read onboarding', sqlstate = '42501', sqlerrm); end;
  begin perform 1 from public.salesperson_document_versions; insert into t_results (name, ok) values ('anon cannot read document versions', false);
  exception when others then insert into t_results (name, ok, detail) values ('anon cannot read document versions', sqlstate = '42501', sqlerrm); end;
end $$;
reset role;
insert into t_results (name, ok, detail) select 'no policy exists on the onboarding or review tables (admin-users only)', count(*) = 0, string_agg(policyname, ', ')
  from pg_policies where schemaname = 'public' and tablename in ('salesperson_onboarding', 'salesperson_onboarding_log', 'salesperson_document_versions', 'sale_attribution_reviews', 'sale_creations');
insert into t_results (name, ok, detail) select 'signed-in users cannot call the readiness functions for someone else',
  not has_function_privilege('authenticated', 'public.salesperson_ready_to_sell(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.salesperson_onboarding_missing(uuid)', 'execute'), null;

do $$ declare r jsonb; begin
  select jsonb_build_object('passed', count(*) filter (where ok), 'failed', count(*) filter (where not ok or ok is null),
    'results', jsonb_agg(jsonb_build_object('n', n, 'ok', ok, 'name', name, 'detail', detail) order by n)) into r from t_results;
  raise exception 'QA_RESULT %', r::text;
end $$;
