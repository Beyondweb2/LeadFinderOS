-- ATTRIBUTION REVIEW — PAUL'S RESOLUTION (2026-10-05, migration 20261011100000; docs/pre-sales-certification/
-- attribution-review-admin.md).
-- RUN AGAINST THE LIVE DATABASE; ALWAYS ROLLED BACK — the last statement raises the results as JSON, so nothing
-- commits (fake users on example.invalid, fake leads "ZZ QA attribution admin"). Before the migration is applied,
-- prepend 20261011100000 after `begin;`.
-- People: Sarah (A) and Tom (T) Ready to Sell; B never is; Zed (Z) is a salesperson with no part in any sale here.
-- Paul = the book owner (admin).
--   L1 Sarah AND Tom each made THE sign-up the client paid through → conflicting_creators (claimed Sarah)
--   L2 B (not ready) made it, B owned the lead                     → creator_not_authorised (claimed B)
--   L3 Sarah made one sign-up, Tom another, Tom owns; marked paid  → ambiguous_manual_payment (claimed Tom)
--   L4 Zed's lead, the client's own sign-up, nobody made a link   → no_authorised_creator (claimed Zed)
--   L5 Paul's lead, the client's own sign-up                       → Paul's own sale, no review (unchanged)
--   L6 Zed's lead like L4, used only to prove the lead's own deletion still cascades.
begin;
create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated, anon, service_role; grant usage, select on sequence t_results_n_seq to authenticated, anon, service_role;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('eeeeeeee-0000-4000-8000-0000000006a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ara-sarah@example.invalid', '{}', '{}', now(), now()),
  ('eeeeeeee-0000-4000-8000-0000000006b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ara-b@example.invalid', '{}', '{}', now(), now()),
  ('eeeeeeee-0000-4000-8000-0000000006d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ara-tom@example.invalid', '{}', '{}', now(), now()),
  ('eeeeeeee-0000-4000-8000-0000000006e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ara-zed@example.invalid', '{}', '{}', now(), now());
insert into public.user_roles (user_id, role) values ('eeeeeeee-0000-4000-8000-0000000006a1', 'sales'), ('eeeeeeee-0000-4000-8000-0000000006b1', 'sales'), ('eeeeeeee-0000-4000-8000-0000000006d1', 'sales'), ('eeeeeeee-0000-4000-8000-0000000006e1', 'sales');
insert into public.team_members (user_id, display_name) values ('eeeeeeee-0000-4000-8000-0000000006a1', 'ARA Sarah'), ('eeeeeeee-0000-4000-8000-0000000006b1', 'ARA B'), ('eeeeeeee-0000-4000-8000-0000000006d1', 'ARA Tom'), ('eeeeeeee-0000-4000-8000-0000000006e1', 'ARA Zed');

create temp table t_fx as select
  (select user_id from public.team_members where is_book_owner limit 1) as admin_id,
  (select md5(string_agg(id::text || ':' || sold_by_user_id::text, ',' order by id)) from public.outreach_leads where sold_by_user_id is not null) as sold_hash_before,
  (select count(*) from public.sale_attribution_reviews) as reviews_before;
grant select on t_fx to authenticated, anon, service_role;
create temp table t_l (k text primary key, id uuid);
grant all on t_l to service_role, authenticated;
insert into t_l values ('L1', gen_random_uuid()), ('L2', gen_random_uuid()), ('L3', gen_random_uuid()), ('L4', gen_random_uuid()), ('L5', gen_random_uuid()), ('L6', gen_random_uuid());
insert into public.outreach_leads (id, user_id, business_name, status)
select id, (select admin_id from t_fx), 'ZZ QA attribution admin ' || k, 'not_contacted' from t_l;
insert into t_results (name, ok, detail) select 'fixtures: the book owner holds the admin role',
  exists (select 1 from public.user_roles where user_id = (select admin_id from t_fx) and role = 'admin'), (select admin_id::text from t_fx);

-- Ready to Sell for Sarah and Tom (approved QA documents + complete onboarding; B and Zed are not completed).
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.sub', '', true);
insert into public.salesperson_document_versions (id, kind, label, status, outstanding) values
  ('qa-ara-agreement-1', 'contractor_agreement', 'QA ARA agreement', 'draft', '{}'),
  ('qa-ara-notice-1', 'privacy_notice', 'QA ARA notice', 'draft', '{}');
select public.approve_salesperson_document('qa-ara-agreement-1', (select admin_id from t_fx));
select public.approve_salesperson_document('qa-ara-notice-1', (select admin_id from t_fx));
insert into public.salesperson_onboarding (user_id, agreement_version, agreement_signed_on, agreement_ref, privacy_notice_version, privacy_notice_given_on,
  age_18_confirmed_on, rtw_method, rtw_checked_on, rtw_checked_by, rtw_result, rtw_evidence_ref, bank_details_received_on, vat_registered,
  contractor_type, start_date, team_guide_version, team_guide_acknowledged_on, updated_by)
select u, 'qa-ara-agreement-1', '2026-10-06', 'Secure folder / QA', 'qa-ara-notice-1', '2026-10-06',
  '2026-10-06', 'manual_video_call', '2026-10-06', 'Paul James Sales', 'pass', 'Secure folder / RTW / QA', '2026-10-06', false,
  'individual', '2026-10-06', 'team-guide-2026-10-02', '2026-10-06', (select admin_id from t_fx)
  from unnest(array['eeeeeeee-0000-4000-8000-0000000006a1', 'eeeeeeee-0000-4000-8000-0000000006d1']::uuid[]) u;
reset role;
insert into t_results (name, ok, detail) select 'setup: Sarah and Tom are Ready to Sell; B is not',
  public.salesperson_ready_to_sell('eeeeeeee-0000-4000-8000-0000000006a1') and public.salesperson_ready_to_sell('eeeeeeee-0000-4000-8000-0000000006d1')
  and not public.salesperson_ready_to_sell('eeeeeeee-0000-4000-8000-0000000006b1'), null;

-- The sign-ups and who made them.
create temp table t_su (k text primary key, id uuid, lead uuid);
grant all on t_su to service_role;
insert into t_su (k, id, lead) values
  ('S1', gen_random_uuid(), (select id from t_l where k = 'L1')), ('S2', gen_random_uuid(), (select id from t_l where k = 'L2')),
  ('S3a', gen_random_uuid(), (select id from t_l where k = 'L3')), ('S3b', gen_random_uuid(), (select id from t_l where k = 'L3')),
  ('S4', gen_random_uuid(), (select id from t_l where k = 'L4')), ('S5', gen_random_uuid(), (select id from t_l where k = 'L5')),
  ('S6', gen_random_uuid(), (select id from t_l where k = 'L6'));
insert into public.onboarding_responses (id, lead_id, business_name) select id, lead, 'ZZ QA attribution admin ' || k from t_su;
update public.outreach_leads set assigned_to_user_id = 'eeeeeeee-0000-4000-8000-0000000006a1', assigned_at = now() where id = (select id from t_l where k = 'L1');
update public.outreach_leads set assigned_to_user_id = 'eeeeeeee-0000-4000-8000-0000000006b1', assigned_at = now() where id = (select id from t_l where k = 'L2');
update public.outreach_leads set assigned_to_user_id = 'eeeeeeee-0000-4000-8000-0000000006d1', assigned_at = now() where id = (select id from t_l where k = 'L3');
update public.outreach_leads set assigned_to_user_id = 'eeeeeeee-0000-4000-8000-0000000006e1', assigned_at = now() where id in ((select id from t_l where k = 'L4'), (select id from t_l where k = 'L6'));
-- ⚠️ quick_close_events_server_time stamps every link with now(), which never moves inside one transaction: Sarah and Tom
-- TIE, so which of them the decision CLAIMS (first creator / latest salesperson) is not fixed here. The tests read the
-- claim from the review (t_claim) — the point is that Paul can pick EITHER evidence-backed person.
insert into public.quick_close_events (lead_id, onboarding_id, actor_user_id, kind, data, created_at) values
  ((select id from t_l where k = 'L1'), (select id from t_su where k = 'S1'),  'eeeeeeee-0000-4000-8000-0000000006a1', 'link_generated', '{"qa": true, "session": null}', now() - interval '3 hours'),
  ((select id from t_l where k = 'L1'), (select id from t_su where k = 'S1'),  'eeeeeeee-0000-4000-8000-0000000006d1', 'link_generated', '{"qa": true, "session": null}', now() - interval '2 hours'),
  ((select id from t_l where k = 'L2'), (select id from t_su where k = 'S2'),  'eeeeeeee-0000-4000-8000-0000000006b1', 'link_generated', '{"qa": true, "session": null}', now() - interval '3 hours'),
  ((select id from t_l where k = 'L3'), (select id from t_su where k = 'S3a'), 'eeeeeeee-0000-4000-8000-0000000006a1', 'link_generated', '{"qa": true, "session": null}', now() - interval '3 hours'),
  ((select id from t_l where k = 'L3'), (select id from t_su where k = 'S3b'), 'eeeeeeee-0000-4000-8000-0000000006d1', 'link_generated', '{"qa": true, "session": null}', now() - interval '1 hour');

-- The clients pay (stripe-webhook's single update; L3 is a manual Mark Paid).
set local role service_role;
update public.outreach_leads set amount_paid = 99, status = 'payment_received', payment_date = now(), paid_checkout_session_id = 'cs_ara_1', paid_signup_id = (select id from t_su where k = 'S1') where id = (select id from t_l where k = 'L1');
update public.outreach_leads set amount_paid = 99, status = 'payment_received', payment_date = now(), paid_checkout_session_id = 'cs_ara_2', paid_signup_id = (select id from t_su where k = 'S2') where id = (select id from t_l where k = 'L2');
update public.outreach_leads set amount_paid = 99, status = 'payment_received', payment_date = now() where id = (select id from t_l where k = 'L3');
update public.outreach_leads set amount_paid = 99, status = 'payment_received', payment_date = now(), paid_checkout_session_id = 'cs_ara_4', paid_signup_id = (select id from t_su where k = 'S4') where id = (select id from t_l where k = 'L4');
update public.outreach_leads set amount_paid = 99, status = 'payment_received', payment_date = now(), paid_checkout_session_id = 'cs_ara_5', paid_signup_id = (select id from t_su where k = 'S5') where id = (select id from t_l where k = 'L5');
update public.outreach_leads set amount_paid = 99, status = 'payment_received', payment_date = now(), paid_checkout_session_id = 'cs_ara_6', paid_signup_id = (select id from t_su where k = 'S6') where id = (select id from t_l where k = 'L6');
reset role;

insert into t_results (name, ok, detail) select 'the four reviews open with the expected reasons and claims; Paul''s own sale has none',
  (select reason = 'conflicting_creators' and claimed_seller_user_id in ('eeeeeeee-0000-4000-8000-0000000006a1', 'eeeeeeee-0000-4000-8000-0000000006d1') from public.sale_attribution_reviews where lead_id = (select id from t_l where k = 'L1'))
  and (select reason = 'creator_not_authorised' and claimed_seller_user_id = 'eeeeeeee-0000-4000-8000-0000000006b1' from public.sale_attribution_reviews where lead_id = (select id from t_l where k = 'L2'))
  and (select reason = 'ambiguous_manual_payment' and claimed_seller_user_id in ('eeeeeeee-0000-4000-8000-0000000006a1', 'eeeeeeee-0000-4000-8000-0000000006d1') from public.sale_attribution_reviews where lead_id = (select id from t_l where k = 'L3'))
  and (select reason = 'no_authorised_creator' and claimed_seller_user_id = 'eeeeeeee-0000-4000-8000-0000000006e1' from public.sale_attribution_reviews where lead_id = (select id from t_l where k = 'L4'))
  and not exists (select 1 from public.sale_attribution_reviews where lead_id = (select id from t_l where k = 'L5'))
  and (select sold_by_user_id = user_id from public.outreach_leads where id = (select id from t_l where k = 'L5')),
  (select string_agg(reason, ',') from public.sale_attribution_reviews where lead_id in (select id from t_l));
create temp table t_claim as select k, s.claimed_seller_user_id as claimed,
  case when s.claimed_seller_user_id = 'eeeeeeee-0000-4000-8000-0000000006a1'::uuid then 'eeeeeeee-0000-4000-8000-0000000006d1'::uuid else 'eeeeeeee-0000-4000-8000-0000000006a1'::uuid end as other
  from t_l join public.sale_attribution_reviews s on s.lead_id = t_l.id where k in ('L1', 'L3');
grant select on t_claim to service_role;
insert into t_results (name, ok, detail) select 'HISTORY: every review that opened has its ''opened'' line, with the candidates as they were',
  (select count(*) from public.sale_attribution_review_events where kind = 'opened' and lead_id in (select id from t_l)) = 5
  and (select bool_and(jsonb_typeof(candidates) = 'array') from public.sale_attribution_review_events where lead_id in (select id from t_l)), null;

-- ── CANDIDATES: only people the evidence names ───────────────────────────────────────────────────────
create temp table t_c (k text primary key, c jsonb);
grant all on t_c to service_role;
set local role service_role;
insert into t_c select k, public.sale_attribution_candidates(id) from t_l;
reset role;
create temp view t_cand as select t_c.k, (x ->> 'user_id')::uuid as uid, x -> 'sources' as src from t_c, jsonb_array_elements(t_c.c) x;
insert into t_results (name, ok, detail) select 'L1 (conflict): exactly Sarah and Tom, BOTH as creators of the paid sign-up; only the claimed one marked as the claim',
  (select count(*) from t_cand where k = 'L1') = 2
  and (select bool_and(src ? 'signup_creator' and src ? 'link_creator') from t_cand where k = 'L1' and uid in ('eeeeeeee-0000-4000-8000-0000000006a1', 'eeeeeeee-0000-4000-8000-0000000006d1'))
  and (select src ? 'claimed_seller' from t_cand where k = 'L1' and uid = (select claimed from t_claim where k = 'L1'))
  and (select not src ? 'claimed_seller' from t_cand where k = 'L1' and uid = (select other from t_claim where k = 'L1')), (select c::text from t_c where k = 'L1');
insert into t_results (name, ok, detail) select 'L2 (not authorised): only B — creator, claim and owner at payment',
  (select count(*) from t_cand where k = 'L2') = 1
  and (select src ? 'signup_creator' and src ? 'claimed_seller' and src ? 'owner_at_payment' from t_cand where k = 'L2' and uid = 'eeeeeeee-0000-4000-8000-0000000006b1'), (select c::text from t_c where k = 'L2');
insert into t_results (name, ok, detail) select 'L3 (ambiguous manual): Sarah and Tom as link makers (no paid sign-up to name); Tom also the owner; the claim marked',
  (select count(*) from t_cand where k = 'L3') = 2
  and (select src ? 'link_creator' and not src ? 'signup_creator' and not src ? 'owner_at_payment' from t_cand where k = 'L3' and uid = 'eeeeeeee-0000-4000-8000-0000000006a1')
  and (select src ? 'link_creator' and not src ? 'signup_creator' and src ? 'owner_at_payment' from t_cand where k = 'L3' and uid = 'eeeeeeee-0000-4000-8000-0000000006d1')
  and (select src ? 'claimed_seller' from t_cand where k = 'L3' and uid = (select claimed from t_claim where k = 'L3')), (select c::text from t_c where k = 'L3');
insert into t_results (name, ok, detail) select 'L4 (no creator): only Zed — the claim and the owner at payment',
  (select count(*) from t_cand where k = 'L4') = 1 and (select src ? 'claimed_seller' and src ? 'owner_at_payment' from t_cand where k = 'L4' and uid = 'eeeeeeee-0000-4000-8000-0000000006e1'), (select c::text from t_c where k = 'L4');
insert into t_results (name, ok, detail) select 'never manufactured: Paul is no candidate anywhere; a lead with no review has none',
  not exists (select 1 from t_cand where uid = (select admin_id from t_fx)) and (select c = '[]'::jsonb from t_c where k = 'L5'), null;

-- ── WHO MAY RESOLVE ──────────────────────────────────────────────────────────────────────────────────
create temp table t_res (k text primary key, r jsonb);
grant all on t_res to service_role;
set local role service_role;
insert into t_res select 'rep', public.resolve_sale_attribution_with_seller((select id from t_l where k = 'L2'), 'confirmed', 'eeeeeeee-0000-4000-8000-0000000006b1', null, null, 'eeeeeeee-0000-4000-8000-0000000006a1');
insert into t_res select 'nobody', public.resolve_sale_attribution_with_seller((select id from t_l where k = 'L2'), 'not_credited', null, null, null, null);
reset role;
insert into t_results (name, ok, detail) select 'a SALESPERSON as the actor is refused (not_admin); so is no actor; the review stays open',
  (select r ->> 'error' from t_res where k = 'rep') = 'not_admin' and (select r ->> 'error' from t_res where k = 'nobody') = 'not_admin'
  and (select status = 'open' from public.sale_attribution_reviews where lead_id = (select id from t_l where k = 'L2')), (select r::text from t_res where k = 'rep');
insert into t_results (name, ok, detail) select 'signed-in users cannot call the resolver, the candidates or read the history',
  not has_function_privilege('authenticated', 'public.resolve_sale_attribution_with_seller(uuid, text, uuid, text, text, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.resolve_sale_attribution_with_seller(uuid, text, uuid, text, text, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.sale_attribution_candidates(uuid)', 'execute')
  and not has_table_privilege('authenticated', 'public.sale_attribution_review_events', 'select')
  and not exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('sale_attribution_reviews', 'sale_attribution_review_events')), null;
do $$ begin
  set local role authenticated;
  perform public.resolve_sale_attribution_with_seller((select id from t_l where k = 'L2'), 'not_credited', null, null, null, (select admin_id from t_fx));
  reset role;
  insert into t_results (name, ok, detail) values ('a signed-in session calling the resolver directly is refused by the database', false, 'it ran');
exception when insufficient_privilege then
  reset role;
  insert into t_results (name, ok, detail) values ('a signed-in session calling the resolver directly is refused by the database', true, sqlerrm);
end $$;

-- ── CONFIRM SELLER from the evidence (not the claim) ────────────────────────────────────────────────
create temp table t_ev as select lead_id, md5(evidence::text) as ev, claimed_seller_user_id, reason, created_at from public.sale_attribution_reviews where lead_id in (select id from t_l);
set local role service_role;
insert into t_res select 'L1', public.resolve_sale_attribution_with_seller((select id from t_l where k = 'L1'), 'confirmed', (select other from t_claim where k = 'L1'), 'The other one ran the call', 'ignored for an evidence pick', (select admin_id from t_fx));
reset role;
insert into t_results (name, ok, detail) select 'CONFIRM an evidence-backed seller who is NOT the claim: they become the seller (basis evidence); the hold clears',
  (select (r ->> 'ok')::boolean and r ->> 'basis' = 'evidence' from t_res where k = 'L1')
  and (select sold_by_user_id = (select other from t_claim where k = 'L1') from public.outreach_leads where id = (select id from t_l where k = 'L1'))
  and not public.sale_attribution_held((select id from t_l where k = 'L1')), (select r::text from t_res where k = 'L1');
insert into t_results (name, ok, detail) select 'the record keeps the ORIGINAL claim beside the resolution, who decided and when; no override reason on an evidence pick',
  status = 'confirmed' and claimed_seller_user_id = (select claimed from t_claim where k = 'L1') and resolved_seller_user_id = (select other from t_claim where k = 'L1')
  and resolution_basis = 'evidence' and override_reason is null and resolution_note = 'The other one ran the call'
  and resolved_by = (select admin_id from t_fx) and resolved_at is not null, null
  from public.sale_attribution_reviews where lead_id = (select id from t_l where k = 'L1');

-- ── ADMIN OVERRIDE needs a reason ────────────────────────────────────────────────────────────────────
set local role service_role;
insert into t_res select 'L3none', public.resolve_sale_attribution_with_seller((select id from t_l where k = 'L3'), 'confirmed', 'eeeeeeee-0000-4000-8000-0000000006e1', null, null, (select admin_id from t_fx));
insert into t_res select 'L3short', public.resolve_sale_attribution_with_seller((select id from t_l where k = 'L3'), 'confirmed', 'eeeeeeee-0000-4000-8000-0000000006e1', null, '  too short ', (select admin_id from t_fx));
insert into t_res select 'L3stranger', public.resolve_sale_attribution_with_seller((select id from t_l where k = 'L3'), 'confirmed', gen_random_uuid(), null, 'Somebody not on the team at all', (select admin_id from t_fx));
reset role;
insert into t_results (name, ok, detail) select 'OVERRIDE to someone outside the evidence: refused with no reason, refused with < 10 characters, refused for a non-team-member; still open',
  (select r ->> 'error' from t_res where k = 'L3none') = 'override_reason_required' and (select r ->> 'error' from t_res where k = 'L3short') = 'override_reason_required'
  and (select r ->> 'error' from t_res where k = 'L3stranger') = 'not_a_team_member'
  and (select s.status = 'open' and l.sold_by_user_id is null from public.sale_attribution_reviews s join public.outreach_leads l on l.id = s.lead_id where s.lead_id = (select id from t_l where k = 'L3')), null;
set local role service_role;
insert into t_res select 'L3', public.resolve_sale_attribution_with_seller((select id from t_l where k = 'L3'), 'confirmed', 'eeeeeeee-0000-4000-8000-0000000006e1', null, 'Zed closed it by phone; Tom and Sarah agree', (select admin_id from t_fx));
reset role;
insert into t_results (name, ok, detail) select 'OVERRIDE with a reason: Zed becomes the seller, basis admin_override, the reason kept',
  (select (r ->> 'ok')::boolean and r ->> 'basis' = 'admin_override' from t_res where k = 'L3')
  and (select sold_by_user_id = 'eeeeeeee-0000-4000-8000-0000000006e1' from public.outreach_leads where id = (select id from t_l where k = 'L3'))
  and (select resolution_basis = 'admin_override' and override_reason = 'Zed closed it by phone; Tom and Sarah agree' and claimed_seller_user_id = (select claimed from t_claim where k = 'L3')
         from public.sale_attribution_reviews where lead_id = (select id from t_l where k = 'L3')), (select r::text from t_res where k = 'L3');

-- ── NOT CREDITED ─────────────────────────────────────────────────────────────────────────────────────
set local role service_role;
insert into t_res select 'L2seller', public.resolve_sale_attribution_with_seller((select id from t_l where k = 'L2'), 'not_credited', 'eeeeeeee-0000-4000-8000-0000000006b1', null, null, (select admin_id from t_fx));
insert into t_res select 'L2', public.resolve_sale_attribution_with_seller((select id from t_l where k = 'L2'), 'not_credited', null, 'B was not onboarded', null, (select admin_id from t_fx));
reset role;
insert into t_results (name, ok, detail) select 'NOT CREDITED: a seller sent with it is refused (never silently dropped); then no seller ever, the hold stays, the payment stays',
  (select r ->> 'error' from t_res where k = 'L2seller') = 'seller_not_allowed' and (select (r ->> 'ok')::boolean from t_res where k = 'L2')
  and (select sold_by_user_id is null and amount_paid = 99 from public.outreach_leads where id = (select id from t_l where k = 'L2'))
  and public.sale_attribution_held((select id from t_l where k = 'L2'))
  and (select status = 'not_credited' and resolved_seller_user_id is null and resolution_basis is null from public.sale_attribution_reviews where lead_id = (select id from t_l where k = 'L2')), null;

-- ── ONE FINAL DECISION; EVIDENCE IMMUTABLE ───────────────────────────────────────────────────────────
set local role service_role;
insert into t_res select 'again', public.resolve_sale_attribution_with_seller((select id from t_l where k = 'L1'), 'not_credited', null, null, null, (select admin_id from t_fx));
reset role;
insert into t_results (name, ok, detail) select 'a resolved review cannot be decided again (no_open_review)', (select r ->> 'error' from t_res where k = 'again') = 'no_open_review', null;
do $$ declare caught text; begin
  begin update public.sale_attribution_reviews set status = 'not_credited', resolved_seller_user_id = null, resolution_basis = null, resolution_note = 'x' where lead_id = (select id from t_l where k = 'L1'); caught := 'ran';
  exception when others then caught := sqlerrm; end;
  insert into t_results (name, ok, detail) values ('a direct UPDATE of a resolved review is refused', caught like '%resolved review is final%', caught);
  begin update public.sale_attribution_reviews set evidence = '{}'::jsonb where lead_id = (select id from t_l where k = 'L4'); caught := 'ran';
  exception when others then caught := sqlerrm; end;
  insert into t_results (name, ok, detail) values ('the evidence of an open review cannot be rewritten', caught like '%immutable%', caught);
  begin update public.sale_attribution_reviews set claimed_seller_user_id = (select admin_id from t_fx) where lead_id = (select id from t_l where k = 'L4'); caught := 'ran';
  exception when others then caught := sqlerrm; end;
  insert into t_results (name, ok, detail) values ('the claimed seller of an open review cannot be rewritten', caught like '%immutable%', caught);
  begin update public.sale_attribution_reviews set status = 'not_credited', resolved_at = now() where lead_id = (select id from t_l where k = 'L4'); caught := 'ran';
  exception when others then caught := sqlerrm; end;
  insert into t_results (name, ok, detail) values ('an open review cannot be resolved by a plain UPDATE (only the resolver, with its history line)', caught like '%resolve only through%', caught);
  begin delete from public.sale_attribution_reviews where lead_id = (select id from t_l where k = 'L4'); caught := 'ran';
  exception when others then caught := sqlerrm; end;
  insert into t_results (name, ok, detail) values ('an open review cannot be deleted (that would lift the commission hold)', caught like '%never deleted%', caught);
  begin delete from public.sale_attribution_reviews where lead_id = (select id from t_l where k = 'L1'); caught := 'ran';
  exception when others then caught := sqlerrm; end;
  insert into t_results (name, ok, detail) values ('a resolved review cannot be deleted', caught like '%never deleted%', caught);
  begin update public.sale_attribution_review_events set note = 'x' where lead_id = (select id from t_l where k = 'L1'); caught := 'ran';
  exception when others then caught := sqlerrm; end;
  insert into t_results (name, ok, detail) values ('the history is append-only', caught like '%append-only%', caught);
end $$;
insert into t_results (name, ok, detail) select 'every original claim, reason, evidence and open date is byte-for-byte as it opened',
  bool_and(md5(s.evidence::text) = e.ev and s.claimed_seller_user_id is not distinct from e.claimed_seller_user_id and s.reason = e.reason and s.created_at = e.created_at), count(*)::text
  from public.sale_attribution_reviews s join t_ev e on e.lead_id = s.lead_id;
insert into t_results (name, ok, detail) select 'HISTORY: opened + the decision for each resolved review, with actor, basis, seller and override reason',
  (select count(*) from public.sale_attribution_review_events where lead_id = (select id from t_l where k = 'L1') and kind = 'confirmed'
     and seller_user_id = (select other from t_claim where k = 'L1') and basis = 'evidence' and actor_user_id = (select admin_id from t_fx) and claimed_seller_user_id = (select claimed from t_claim where k = 'L1')) = 1
  and (select count(*) from public.sale_attribution_review_events where lead_id = (select id from t_l where k = 'L3') and kind = 'confirmed'
     and basis = 'admin_override' and override_reason like 'Zed closed it%') = 1
  and (select count(*) from public.sale_attribution_review_events where lead_id = (select id from t_l where k = 'L2') and kind = 'not_credited' and seller_user_id is null) = 1
  and (select count(*) from public.sale_attribution_review_events where lead_id in (select id from t_l) and kind <> 'opened') = 3, null;

-- ── THE OLD ENTRY POINT (deployed admin-users) still works, as the claimed seller ────────────────────
set local role service_role;
insert into t_res select 'L4old', public.resolve_sale_attribution_review((select id from t_l where k = 'L4'), 'confirmed', 'QA', (select admin_id from t_fx));
insert into t_res select 'L4old_again', public.resolve_sale_attribution_review((select id from t_l where k = 'L4'), 'not_credited', null, (select admin_id from t_fx));
reset role;
insert into t_results (name, ok, detail) select 'the 4-argument resolver = confirm the CLAIMED seller through the one resolver (basis evidence); one decision only',
  (select (r ->> 'ok')::boolean from t_res where k = 'L4old') and (select r ->> 'error' from t_res where k = 'L4old_again') = 'no_open_review'
  and (select sold_by_user_id = 'eeeeeeee-0000-4000-8000-0000000006e1' from public.outreach_leads where id = (select id from t_l where k = 'L4'))
  and (select resolution_basis = 'evidence' and resolved_seller_user_id = 'eeeeeeee-0000-4000-8000-0000000006e1' from public.sale_attribution_reviews where lead_id = (select id from t_l where k = 'L4')),
  (select r::text from t_res where k = 'L4old');

-- ── STAMPS STAY FROZEN; THE HOLD FOLLOWS; HISTORY UNTOUCHED ──────────────────────────────────────────
update public.outreach_leads set sold_by_user_id = 'eeeeeeee-0000-4000-8000-0000000006a1', assigned_to_user_id = 'eeeeeeee-0000-4000-8000-0000000006a1' where id = (select id from t_l where k = 'L3');
insert into t_results (name, ok, detail) select 'a confirmed seller is frozen like any stamp (a later rewrite and reassignment leave Zed)',
  sold_by_user_id = 'eeeeeeee-0000-4000-8000-0000000006e1', sold_by_user_id::text from public.outreach_leads where id = (select id from t_l where k = 'L3');
insert into t_results (name, ok, detail) select 'HOLD (what commission reads, unchanged): confirmed → not held; not credited → held; the view agrees',
  not public.sale_attribution_held((select id from t_l where k = 'L1')) and not public.sale_attribution_held((select id from t_l where k = 'L3'))
  and public.sale_attribution_held((select id from t_l where k = 'L2'))
  and (select bool_and(held = (review_status <> 'confirmed')) from public.sale_attribution_holds where lead_id in (select id from t_l)), null;
delete from public.outreach_leads where id = (select id from t_l where k = 'L6');
insert into t_results (name, ok, detail) select 'deleting the LEAD itself still removes its review (cascade allowed; only direct deletes are refused)',
  not exists (select 1 from public.sale_attribution_reviews where lead_id = (select id from t_l where k = 'L6'))
  and exists (select 1 from public.sale_attribution_review_events where lead_id = (select id from t_l where k = 'L6') and kind = 'opened'), null;
insert into t_results (name, ok, detail) select 'HISTORY: every sale that existed before is untouched (same sellers); no review existed before or was touched',
  (select md5(string_agg(id::text || ':' || sold_by_user_id::text, ',' order by id)) from public.outreach_leads
    where sold_by_user_id is not null and id not in (select id from t_l)) = (select sold_hash_before from t_fx)
  and (select count(*) from public.sale_attribution_reviews where lead_id not in (select id from t_l)) = (select reviews_before from t_fx), null;

do $$ declare r jsonb; begin
  select jsonb_build_object('passed', count(*) filter (where ok), 'failed', count(*) filter (where not ok or ok is null),
    'results', jsonb_agg(jsonb_build_object('n', n, 'ok', ok, 'name', name, 'detail', detail) order by n)) into r from t_results;
  raise exception 'QA_RESULT %', r::text;
end $$;
