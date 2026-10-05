-- v3 SIGN-UP → SELLER (F + H integration, 2026-10-05, migration 20261010130000).
-- RUN AGAINST THE LIVE DATABASE; ALWAYS ROLLED BACK — the last statement raises the results as JSON, so nothing
-- commits (fake users on example.invalid; real leads borrowed and changed only inside this transaction). Before
-- the migrations are applied, prepend 20261010090000, 20261010120000 and 20261010130000 after `begin;`.
-- The v3 model: Quick Close creates a SIGN-UP (an onboarding row) and logs 'link_generated' with NO Stripe session;
-- the session is created later by findable-checkout after the client signs; the webhook writes the paid sign-up.
-- Sarah (A) and Tom (T) and C are Ready to Sell on Monday; B never is. Paul = the book owner (admin).
begin;
create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated, anon, service_role; grant usage, select on sequence t_results_n_seq to authenticated, anon, service_role;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('eeeeeeee-0000-4000-8000-0000000005a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-v3-sarah@example.invalid', '{}', '{}', now(), now()),
  ('eeeeeeee-0000-4000-8000-0000000005b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-v3-b@example.invalid', '{}', '{}', now(), now()),
  ('eeeeeeee-0000-4000-8000-0000000005c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-v3-c@example.invalid', '{}', '{}', now(), now()),
  ('eeeeeeee-0000-4000-8000-0000000005d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-v3-tom@example.invalid', '{}', '{}', now(), now());
insert into public.user_roles (user_id, role) values ('eeeeeeee-0000-4000-8000-0000000005a1', 'sales'), ('eeeeeeee-0000-4000-8000-0000000005b1', 'sales'), ('eeeeeeee-0000-4000-8000-0000000005c1', 'sales'), ('eeeeeeee-0000-4000-8000-0000000005d1', 'sales');
insert into public.team_members (user_id, display_name) values ('eeeeeeee-0000-4000-8000-0000000005a1', 'V3 Sarah'), ('eeeeeeee-0000-4000-8000-0000000005b1', 'V3 B'), ('eeeeeeee-0000-4000-8000-0000000005c1', 'V3 C'), ('eeeeeeee-0000-4000-8000-0000000005d1', 'V3 Tom');

create temp table t_fx as select
  (select user_id from public.team_members where is_book_owner limit 1) as admin_id,
  array(select l.id from public.outreach_leads l where l.assigned_to_user_id is null and l.is_archived is not true
          and not public.lead_is_client(l.amount_paid, l.status) and coalesce(l.status, '') = 'not_contacted'
          and public.lead_contact_attempt_at(l.id) is null
        order by l.created_at limit 12) as leads,
  (select md5(string_agg(id::text || ':' || sold_by_user_id::text, ',' order by id)) from public.outreach_leads where sold_by_user_id is not null) as sold_hash_before,
  (select count(*) from public.sale_attribution_reviews) as reviews_before;
grant select on t_fx to authenticated, anon, service_role;
insert into t_results (name, ok, detail) select 'fixtures: the admin and twelve untouched unassigned leads', admin_id is not null and cardinality(leads) = 12, cardinality(leads)::text from t_fx;
insert into t_results (name, ok, detail) select 'HISTORY: the three migrations open no review on any existing sale', reviews_before = 0, reviews_before::text from t_fx;

-- Documents: approved QA versions (what Paul does when the finals arrive), and complete onboarding for A, C, T.
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.sub', '', true);
insert into public.salesperson_document_versions (id, kind, label, status, outstanding) values
  ('qa-v3-agreement-1', 'contractor_agreement', 'QA v3 agreement 1', 'draft', '{}'),
  ('qa-v3-agreement-2', 'contractor_agreement', 'QA v3 agreement 2', 'draft', '{}'),
  ('qa-v3-notice-1', 'privacy_notice', 'QA v3 notice 1', 'draft', '{}');
select public.approve_salesperson_document('qa-v3-agreement-1', (select admin_id from t_fx));
select public.approve_salesperson_document('qa-v3-notice-1', (select admin_id from t_fx));
insert into public.salesperson_onboarding (user_id, agreement_version, agreement_signed_on, agreement_ref, privacy_notice_version, privacy_notice_given_on,
  age_18_confirmed_on, rtw_method, rtw_checked_on, rtw_checked_by, rtw_result, rtw_evidence_ref, bank_details_received_on, vat_registered,
  contractor_type, start_date, team_guide_version, team_guide_acknowledged_on, updated_by)
select u, 'qa-v3-agreement-1', '2026-10-06', 'Secure folder / QA', 'qa-v3-notice-1', '2026-10-06',
  '2026-10-06', 'manual_video_call', '2026-10-06', 'Paul James Sales', 'pass', 'Secure folder / RTW / QA', '2026-10-06', false,
  'individual', '2026-10-06', 'team-guide-2026-10-02', '2026-10-06', (select admin_id from t_fx)
  from unnest(array['eeeeeeee-0000-4000-8000-0000000005a1', 'eeeeeeee-0000-4000-8000-0000000005c1', 'eeeeeeee-0000-4000-8000-0000000005d1']::uuid[]) u;
reset role;
insert into t_results (name, ok, detail) select 'setup: Sarah, Tom and C are Ready to Sell; B is not',
  public.salesperson_ready_to_sell('eeeeeeee-0000-4000-8000-0000000005a1') and public.salesperson_ready_to_sell('eeeeeeee-0000-4000-8000-0000000005d1')
  and public.salesperson_ready_to_sell('eeeeeeee-0000-4000-8000-0000000005c1') and not public.salesperson_ready_to_sell('eeeeeeee-0000-4000-8000-0000000005b1'), null;

-- The sign-ups (one onboarding row each; the client's questionnaire or Quick Close row).
create temp table t_su (k text primary key, id uuid, lead uuid);
grant all on t_su to service_role;
insert into t_su (k, lead) values
  ('S1', (select leads[1] from t_fx)), ('S2', (select leads[2] from t_fx)), ('S3', (select leads[3] from t_fx)),
  ('S4a', (select leads[4] from t_fx)), ('S4b', (select leads[4] from t_fx)), ('S5', (select leads[5] from t_fx)),
  ('S6', (select leads[6] from t_fx)), ('S7', (select leads[7] from t_fx)), ('S8', (select leads[8] from t_fx)),
  ('S9', (select leads[9] from t_fx)), ('S10a', (select leads[10] from t_fx)), ('S10b', (select leads[10] from t_fx));
update t_su set id = gen_random_uuid();
insert into public.onboarding_responses (id, lead_id, business_name) select id, lead, 'ZZ QA v3 attribution ' || k from t_su;

-- Owners on MONDAY: L1 / L3 Sarah, L2 C, L8 Tom, L7 Tom, L4 / L5 / L6 Sarah / Sarah / B; L9 / L10 Paul (unassigned).
update public.outreach_leads set assigned_to_user_id = 'eeeeeeee-0000-4000-8000-0000000005a1', assigned_at = now() where id in ((select leads[1] from t_fx), (select leads[3] from t_fx), (select leads[4] from t_fx), (select leads[5] from t_fx));
update public.outreach_leads set assigned_to_user_id = 'eeeeeeee-0000-4000-8000-0000000005c1', assigned_at = now() where id = (select leads[2] from t_fx);
update public.outreach_leads set assigned_to_user_id = 'eeeeeeee-0000-4000-8000-0000000005d1', assigned_at = now() where id in ((select leads[7] from t_fx), (select leads[8] from t_fx));
update public.outreach_leads set assigned_to_user_id = 'eeeeeeee-0000-4000-8000-0000000005b1', assigned_at = now() where id = (select leads[6] from t_fx);

-- MONDAY: the sign-ups are CREATED (what quick-close logs after its Ready-to-Sell gate) — NO Stripe session under v3.
insert into public.quick_close_events (lead_id, onboarding_id, actor_user_id, kind, data) values
  ((select leads[1] from t_fx),  (select id from t_su where k = 'S1'),   'eeeeeeee-0000-4000-8000-0000000005a1', 'link_generated', '{"qa": true, "session": null}'),
  ((select leads[2] from t_fx),  (select id from t_su where k = 'S2'),   'eeeeeeee-0000-4000-8000-0000000005c1', 'link_generated', '{"qa": true, "session": null}'),
  ((select leads[3] from t_fx),  (select id from t_su where k = 'S3'),   'eeeeeeee-0000-4000-8000-0000000005a1', 'link_generated', '{"qa": true, "session": null}'),
  ((select leads[4] from t_fx),  (select id from t_su where k = 'S4a'),  'eeeeeeee-0000-4000-8000-0000000005a1', 'link_generated', '{"qa": true, "session": null}'),
  ((select leads[4] from t_fx),  (select id from t_su where k = 'S4b'),  'eeeeeeee-0000-4000-8000-0000000005a1', 'link_generated', '{"qa": true, "session": null}'),
  ((select leads[5] from t_fx),  (select id from t_su where k = 'S5'),   'eeeeeeee-0000-4000-8000-0000000005a1', 'link_generated', '{"qa": true, "session": null}'),
  ((select leads[5] from t_fx),  (select id from t_su where k = 'S5'),   'eeeeeeee-0000-4000-8000-0000000005a1', 'link_generated', '{"qa": true, "session": null, "replaced": "fresh_link"}'),
  ((select leads[6] from t_fx),  (select id from t_su where k = 'S6'),   'eeeeeeee-0000-4000-8000-0000000005b1', 'link_generated', '{"qa": true, "session": null}'),
  ((select leads[7] from t_fx),  (select id from t_su where k = 'S7'),   (select admin_id from t_fx),            'link_generated', '{"qa": true, "session": null}'),
  ((select leads[10] from t_fx), (select id from t_su where k = 'S10a'), 'eeeeeeee-0000-4000-8000-0000000005a1', 'link_generated', '{"qa": true, "session": null}');
-- …and Tom re-issues Sarah's sign-up S3 the same day (two different creators of ONE sign-up).
insert into public.quick_close_events (lead_id, onboarding_id, actor_user_id, kind, data) values
  ((select leads[3] from t_fx), (select id from t_su where k = 'S3'), 'eeeeeeee-0000-4000-8000-0000000005d1', 'link_generated', '{"qa": true, "session": null}');
insert into t_results (name, ok, detail) select 'CREATION: each sign-up is snapshotted with its creator, role and readiness, with NO session',
  (select bool_and(creator_ready is true and checkout_session_id is null and creator_role = 'sales') from public.sale_creations where onboarding_id = (select id from t_su where k = 'S1'))
  and (select creator_role = 'admin' and creator_ready from public.sale_creations where onboarding_id = (select id from t_su where k = 'S7'))
  and (select not creator_ready from public.sale_creations where onboarding_id = (select id from t_su where k = 'S6')), null;

-- TUESDAY: L1 and L2 move to Tom; a newer agreement is approved (Sarah, C and Tom are no longer Ready to Sell); C is disabled.
update public.outreach_leads set assigned_to_user_id = 'eeeeeeee-0000-4000-8000-0000000005d1', assigned_at = now() where id in ((select leads[1] from t_fx), (select leads[2] from t_fx));
set local role service_role;
select public.approve_salesperson_document('qa-v3-agreement-2', (select admin_id from t_fx));
reset role;
update public.team_members set status = 'disabled', disabled_at = now() where user_id = 'eeeeeeee-0000-4000-8000-0000000005c1';
delete from public.user_roles where user_id = 'eeeeeeee-0000-4000-8000-0000000005c1' and role = 'sales';
insert into t_results (name, ok, detail) select 'setup: Sarah is no longer Ready to Sell, C is disabled, L1 and L2 belong to Tom',
  not public.salesperson_ready_to_sell('eeeeeeee-0000-4000-8000-0000000005a1') and not public.salesperson_ready_to_sell('eeeeeeee-0000-4000-8000-0000000005c1')
  and (select bool_and(assigned_to_user_id = 'eeeeeeee-0000-4000-8000-0000000005d1') from public.outreach_leads where id in ((select leads[1] from t_fx), (select leads[2] from t_fx))), null;

-- WEDNESDAY: the clients sign and pay. stripe-webhook: money + the session findable-checkout made AFTER signing (never in
-- sale_creations) + the paid SIGN-UP, in one update. L4 / L5: a manual Mark Paid (no session, no sign-up).
set local role service_role;
update public.outreach_leads set amount_paid = 99, status = 'payment_received', payment_date = now(), paid_checkout_session_id = 'cs_v3_after_sign_1', paid_signup_id = (select id from t_su where k = 'S1') where id = (select leads[1] from t_fx);
update public.outreach_leads set amount_paid = 99, status = 'payment_received', payment_date = now(), paid_checkout_session_id = 'cs_v3_after_sign_2', paid_signup_id = (select id from t_su where k = 'S2') where id = (select leads[2] from t_fx);
update public.outreach_leads set amount_paid = 99, status = 'payment_received', payment_date = now(), paid_checkout_session_id = 'cs_v3_after_sign_3', paid_signup_id = (select id from t_su where k = 'S3') where id = (select leads[3] from t_fx);
update public.outreach_leads set amount_paid = 99, status = 'payment_received', payment_date = now() where id = (select leads[4] from t_fx);
update public.outreach_leads set amount_paid = 99, status = 'payment_received', payment_date = now() where id = (select leads[5] from t_fx);
update public.outreach_leads set amount_paid = 99, status = 'payment_received', payment_date = now(), paid_checkout_session_id = 'cs_v3_after_sign_6', paid_signup_id = (select id from t_su where k = 'S6') where id = (select leads[6] from t_fx);
update public.outreach_leads set amount_paid = 99, status = 'payment_received', payment_date = now(), paid_checkout_session_id = 'cs_v3_after_sign_7', paid_signup_id = (select id from t_su where k = 'S7') where id = (select leads[7] from t_fx);
update public.outreach_leads set amount_paid = 99, status = 'payment_received', payment_date = now(), paid_checkout_session_id = 'cs_v3_after_sign_8', paid_signup_id = (select id from t_su where k = 'S8') where id = (select leads[8] from t_fx);
update public.outreach_leads set amount_paid = 99, status = 'payment_received', payment_date = now(), paid_checkout_session_id = 'cs_v3_after_sign_9', paid_signup_id = (select id from t_su where k = 'S9') where id = (select leads[9] from t_fx);
update public.outreach_leads set amount_paid = 99, status = 'payment_received', payment_date = now(), paid_checkout_session_id = 'cs_v3_after_sign_10', paid_signup_id = (select id from t_su where k = 'S10b') where id = (select leads[10] from t_fx);
reset role;

insert into t_results (name, ok, detail) select 'THE EXAMPLE: Sarah created sign-up A while ready; reassigned to Tom; Sarah not ready; client signed, Stripe session made, paid → seller = Sarah',
  sold_by_user_id = 'eeeeeeee-0000-4000-8000-0000000005a1' and assigned_to_user_id = 'eeeeeeee-0000-4000-8000-0000000005d1' and paid_signup_id = (select id from t_su where k = 'S1')
  and not exists (select 1 from public.sale_attribution_reviews where lead_id = (select leads[1] from t_fx)), coalesce(sold_by_user_id::text, 'null') from public.outreach_leads where id = (select leads[1] from t_fx);
insert into t_results (name, ok, detail) select 'C created the sign-up, was DISABLED, the lead moved to Tom → seller = C (no review)',
  sold_by_user_id = 'eeeeeeee-0000-4000-8000-0000000005c1' and not exists (select 1 from public.sale_attribution_reviews where lead_id = (select leads[2] from t_fx)),
  coalesce(sold_by_user_id::text, 'null') from public.outreach_leads where id = (select leads[2] from t_fx);
insert into t_results (name, ok, detail) select 'two different creators of ONE sign-up → NO seller, REVIEW conflicting_creators, claimed = the first creator (Sarah)',
  (select sold_by_user_id is null and sold_at is not null from public.outreach_leads where id = (select leads[3] from t_fx))
  and (select reason = 'conflicting_creators' and status = 'open' and claimed_seller_user_id = 'eeeeeeee-0000-4000-8000-0000000005a1' and jsonb_array_length(evidence -> 'signup_creators') = 2
         from public.sale_attribution_reviews where lead_id = (select leads[3] from t_fx)), null;
insert into t_results (name, ok, detail) select 'manual Mark Paid with TWO sign-ups on record (even by the same rep) → NO seller, REVIEW ambiguous_manual_payment (never "the most recent")',
  (select sold_by_user_id is null from public.outreach_leads where id = (select leads[4] from t_fx))
  and (select reason = 'ambiguous_manual_payment' and (evidence ->> 'signups_on_lead')::int = 2 from public.sale_attribution_reviews where lead_id = (select leads[4] from t_fx)), null;
insert into t_results (name, ok, detail) select 'manual Mark Paid with exactly ONE sign-up by an authorised creator (re-issued twice) → that creator, no review',
  sold_by_user_id = 'eeeeeeee-0000-4000-8000-0000000005a1' and not exists (select 1 from public.sale_attribution_reviews where lead_id = (select leads[5] from t_fx)),
  coalesce(sold_by_user_id::text, 'null') from public.outreach_leads where id = (select leads[5] from t_fx);
insert into t_results (name, ok, detail) select 'a sign-up created by someone NOT Ready to Sell → NO seller, REVIEW creator_not_authorised',
  (select sold_by_user_id is null from public.outreach_leads where id = (select leads[6] from t_fx))
  and (select reason = 'creator_not_authorised' and claimed_seller_user_id = 'eeeeeeee-0000-4000-8000-0000000005b1' and evidence ? 'creation' from public.sale_attribution_reviews where lead_id = (select leads[6] from t_fx)), null;
insert into t_results (name, ok, detail) select 'Paul created the sign-up on a lead Tom owns → seller = Paul (the authorised creator), not Tom',
  sold_by_user_id = (select admin_id from t_fx), coalesce(sold_by_user_id::text, 'null') from public.outreach_leads where id = (select leads[7] from t_fx);
insert into t_results (name, ok, detail) select 'a sign-up nobody created through Quick Close, on Tom''s lead → NO seller (not Tom, not Paul), REVIEW no_authorised_creator claimed Tom',
  (select sold_by_user_id is null from public.outreach_leads where id = (select leads[8] from t_fx))
  and (select reason = 'no_authorised_creator' and claimed_seller_user_id = 'eeeeeeee-0000-4000-8000-0000000005d1' from public.sale_attribution_reviews where lead_id = (select leads[8] from t_fx)), null;
insert into t_results (name, ok, detail) select 'Paul''s own lead, the client''s own sign-up, no salesperson ever involved → Paul''s sale exactly as before (no review)',
  sold_by_user_id = user_id and not exists (select 1 from public.sale_attribution_reviews where lead_id = (select leads[9] from t_fx)),
  coalesce(sold_by_user_id::text, 'null') from public.outreach_leads where id = (select leads[9] from t_fx);
insert into t_results (name, ok, detail) select 'Paul''s lead paid through a sign-up nobody created, but a SALESPERSON made another one → NOT silently Paul: REVIEW, claimed Sarah',
  (select sold_by_user_id is null from public.outreach_leads where id = (select leads[10] from t_fx))
  and (select reason = 'no_authorised_creator' and claimed_seller_user_id = 'eeeeeeee-0000-4000-8000-0000000005a1' from public.sale_attribution_reviews where lead_id = (select leads[10] from t_fx)), null;

-- IMMUTABILITY: reassignment, readiness, status, and attempted rewrites never move a seller or the paid sign-up.
update public.outreach_leads set assigned_to_user_id = 'eeeeeeee-0000-4000-8000-0000000005b1', status = 'in_delivery',
       sold_by_user_id = 'eeeeeeee-0000-4000-8000-0000000005d1', paid_signup_id = (select id from t_su where k = 'S9'), paid_checkout_session_id = 'cs_other'
 where id = (select leads[1] from t_fx);
insert into t_results (name, ok, detail) select 'IMMUTABLE: a later owner, status change and attempted rewrites leave Sarah as seller and the paid sign-up as it was',
  sold_by_user_id = 'eeeeeeee-0000-4000-8000-0000000005a1' and paid_signup_id = (select id from t_su where k = 'S1') and paid_checkout_session_id = 'cs_v3_after_sign_1',
  sold_by_user_id::text from public.outreach_leads where id = (select leads[1] from t_fx);
update public.outreach_leads set sold_by_user_id = 'eeeeeeee-0000-4000-8000-0000000005a1' where id = (select leads[3] from t_fx);
insert into t_results (name, ok, detail) select 'IMMUTABLE: a held sale cannot be given a seller by a plain update',
  sold_by_user_id is null, coalesce(sold_by_user_id::text, 'null') from public.outreach_leads where id = (select leads[3] from t_fx);

-- THE HOLD (what commission reads) and Paul's one decision.
insert into t_results (name, ok, detail) select 'HOLD: every open review is held (function and view); a clean sale is not',
  public.sale_attribution_held((select leads[3] from t_fx)) and public.sale_attribution_held((select leads[4] from t_fx))
  and (select bool_and(held) from public.sale_attribution_holds where lead_id in ((select leads[3] from t_fx), (select leads[4] from t_fx), (select leads[6] from t_fx), (select leads[8] from t_fx), (select leads[10] from t_fx)))
  and not public.sale_attribution_held((select leads[1] from t_fx)), null;
create temp table t_res (k text primary key, r jsonb);
grant all on t_res to service_role;
set local role service_role;
insert into t_res select 'confirm', public.resolve_sale_attribution_review((select leads[3] from t_fx), 'confirmed', 'QA', (select admin_id from t_fx));
insert into t_res select 'notcred', public.resolve_sale_attribution_review((select leads[4] from t_fx), 'not_credited', 'QA', (select admin_id from t_fx));
reset role;
insert into t_results (name, ok, detail) select 'CONFIRM SELLER: Sarah becomes the seller of the conflicting sign-up, frozen; the hold clears',
  (select (r ->> 'ok')::boolean from t_res where k = 'confirm')
  and (select sold_by_user_id = 'eeeeeeee-0000-4000-8000-0000000005a1' from public.outreach_leads where id = (select leads[3] from t_fx))
  and not public.sale_attribution_held((select leads[3] from t_fx))
  and (select resolved_at is not null from public.sale_attribution_holds where lead_id = (select leads[3] from t_fx)), (select r::text from t_res where k = 'confirm');
insert into t_results (name, ok, detail) select 'NOT CREDITED: no seller, the hold stays (no commission), evidence kept',
  (select (r ->> 'ok')::boolean from t_res where k = 'notcred')
  and (select sold_by_user_id is null from public.outreach_leads where id = (select leads[4] from t_fx))
  and public.sale_attribution_held((select leads[4] from t_fx))
  and (select evidence ? 'all_links' from public.sale_attribution_reviews where lead_id = (select leads[4] from t_fx)), (select r::text from t_res where k = 'notcred');
insert into t_results (name, ok, detail) select 'a review that is not open cannot be decided again',
  (public.resolve_sale_attribution_review((select leads[3] from t_fx), 'not_credited', null, (select admin_id from t_fx)) ->> 'error') = 'no_open_review', null;

-- HISTORY and structure.
insert into t_results (name, ok, detail) select 'HISTORY: every sale that existed before is untouched (same sellers, same count)',
  (select md5(string_agg(id::text || ':' || sold_by_user_id::text, ',' order by id)) from public.outreach_leads
    where sold_by_user_id is not null and not exists (select 1 from t_fx where outreach_leads.id = any (t_fx.leads))) = (select sold_hash_before from t_fx), null;
insert into t_results (name, ok, detail) select 'no policy on the attribution tables; the paid sign-up column exists',
  not exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('sale_creations', 'sale_attribution_reviews'))
  and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'outreach_leads' and column_name = 'paid_signup_id'), null;
insert into t_results (name, ok, detail) select 'signed-in users cannot read the hold or resolve a review',
  not has_function_privilege('authenticated', 'public.sale_attribution_held(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.resolve_sale_attribution_review(uuid, text, text, uuid)', 'execute')
  and not has_table_privilege('authenticated', 'public.sale_attribution_holds', 'select'), null;

do $$ declare r jsonb; begin
  select jsonb_build_object('passed', count(*) filter (where ok), 'failed', count(*) filter (where not ok or ok is null),
    'results', jsonb_agg(jsonb_build_object('n', n, 'ok', ok, 'name', name, 'detail', detail) order by n)) into r from t_results;
  raise exception 'QA_RESULT %', r::text;
end $$;
