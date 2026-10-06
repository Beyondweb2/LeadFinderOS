-- PAID CLIENT AUTO-INTAKE + SEND TO PAUL — live database checks (2026-10-06,
-- docs/pre-sales-certification/paid-client-auto-intake-final-sales-check.md).
-- RUN AGAINST THE LIVE DATABASE; ALWAYS ROLLED BACK — the last statement raises the results as JSON, so
-- nothing commits (the Management API runs the whole request as ONE transaction). Before the migration is
-- live, prepend supabase/migrations/20261013120000_paid_client_auto_intake.sql to the same request.
-- Fake users on example.invalid; fake leads named "ZZ INTAKE …" with no contact details; no message, no
-- payment, no Stripe; the trigger's pg_net request is queued inside this transaction and rolled back with it.
--   T  the paid trigger: Stripe-style amount, Mark Paid's status, a replay, Interested / a link / a draft,
--      refunded, ended, a manual add (insert) — exactly one queued intake per real transition.
--   S  Send to Paul: one row per client (unique), RLS admin-or-sender, no write grant, History once.
--   K  the new History / notification kinds; every earlier kind still accepted.
--   R  client_intake is service-role only (no grant, no policy) — Sales can never read research notes.
--   C  the worker door and the cron exist.
begin;
create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated, anon, service_role; grant usage, select on sequence t_results_n_seq to authenticated, anon, service_role;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('1a7a0000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'intake-rep-a@example.invalid', '{}', '{}', now(), now()),
  ('1a7a0000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'intake-rep-b@example.invalid', '{}', '{}', now(), now());
insert into public.user_roles (user_id, role) values ('1a7a0000-0000-4000-8000-0000000000a1', 'sales'), ('1a7a0000-0000-4000-8000-0000000000a2', 'sales');
insert into public.team_members (user_id, display_name) values ('1a7a0000-0000-4000-8000-0000000000a1', 'Intake Rep A'), ('1a7a0000-0000-4000-8000-0000000000a2', 'Intake Rep B');

create temp table t_fx as select (select user_id from public.team_members where is_book_owner limit 1) as admin_id,
  (select count(*) from public.client_intake) as intakes_before;
grant select on t_fx to authenticated, anon, service_role;

-- Fixture leads: an ordinary prospect each, assigned to Rep A, no contact details.
insert into public.outreach_leads (id, user_id, assigned_to_user_id, added_by_user_id, business_name, search_keyword, search_location, country, status)
select ('1a7a0000-0000-4000-8000-0000000001' || lpad(g::text, 2, '0'))::uuid, (select admin_id from t_fx), '1a7a0000-0000-4000-8000-0000000000a1', '1a7a0000-0000-4000-8000-0000000000a1',
  'ZZ INTAKE ' || g, 'plumber', 'Rugby', 'UK', 'not_contacted'
from generate_series(1, 8) g;
insert into public.metric_exclusions (kind, value, reason)
select 'lead', id::text, 'QA fixture 06/10/2026: paid client auto-intake (rolled back, no phone, never messaged)' from public.outreach_leads where business_name like 'ZZ INTAKE %';
create temp table t_l as select business_name, id from public.outreach_leads where business_name like 'ZZ INTAKE %';
grant select on t_l to authenticated, anon, service_role;

-- ── T. THE PAID TRIGGER ──────────────────────────────────────────────────────────────────────────────
insert into t_results (name, ok, detail) select 'T0: prospects carry no intake', count(*) = 0, count(*)::text
  from public.client_intake where lead_id in (select id from t_l);

-- 1: a Stripe-style first payment (amount + status, as establishLeadPayment writes it)
update public.outreach_leads set amount_paid = 99, status = 'payment_received', payment_date = current_date where id = (select id from t_l where business_name = 'ZZ INTAKE 1');
insert into t_results (name, ok, detail) select 'T1: a first payment queues ONE intake (trigger_source payment)',
  count(*) = 1 and bool_and(status = 'queued' and trigger_source = 'payment'), string_agg(status || '/' || trigger_source, ',')
  from public.client_intake where lead_id = (select id from t_l where business_name = 'ZZ INTAKE 1');

-- 2: a replayed webhook / a later status move never queues a second one, never resets the first
update public.client_intake set status = 'ready' where lead_id = (select id from t_l where business_name = 'ZZ INTAKE 1');
update public.outreach_leads set amount_paid = 99, status = 'payment_received' where id = (select id from t_l where business_name = 'ZZ INTAKE 1');
update public.outreach_leads set status = 'in_delivery' where id = (select id from t_l where business_name = 'ZZ INTAKE 1');
insert into t_results (name, ok, detail) select 'T2: a duplicate webhook / payment retry / status move adds nothing and resets nothing',
  count(*) = 1 and bool_and(status = 'ready'), string_agg(status, ',')
  from public.client_intake where lead_id = (select id from t_l where business_name = 'ZZ INTAKE 1');

-- 3: Mark Paid (a paid status, no amount) is the same transition
update public.outreach_leads set status = 'payment_received' where id = (select id from t_l where business_name = 'ZZ INTAKE 2');
insert into t_results (name, ok, detail) select 'T3: Mark Paid queues the same intake (trigger_source manual_paid)',
  count(*) = 1 and bool_and(trigger_source = 'manual_paid'), string_agg(trigger_source, ',')
  from public.client_intake where lead_id = (select id from t_l where business_name = 'ZZ INTAKE 2');

-- 4: Interested / replied / a sign-up link / a drafted handoff are NOT a payment
update public.outreach_leads set status = 'replied', sales_handoff = '{"client_wants":"x"}'::jsonb where id = (select id from t_l where business_name = 'ZZ INTAKE 3');
insert into t_results (name, ok, detail) select 'T4: Interested / a reply / a drafted handoff never start an intake', count(*) = 0, count(*)::text
  from public.client_intake where lead_id = (select id from t_l where business_name = 'ZZ INTAKE 3');

-- 5: refunded and ended never start one
update public.outreach_leads set amount_paid = 99, status = 'refunded' where id = (select id from t_l where business_name = 'ZZ INTAKE 4');
update public.outreach_leads set service_terminated_at = now(), service_termination_reason = 'client_ended_early' where id = (select id from t_l where business_name = 'ZZ INTAKE 5');
update public.outreach_leads set amount_paid = 99, status = 'payment_received' where id = (select id from t_l where business_name = 'ZZ INTAKE 5');
insert into t_results (name, ok, detail) select 'T5: a refunded or ended client never starts an intake', count(*) = 0, count(*)::text
  from public.client_intake where lead_id in (select id from t_l where business_name in ('ZZ INTAKE 4', 'ZZ INTAKE 5'));

-- 6: the manual add inserts a paid lead directly — the insert path queues it too
insert into public.outreach_leads (id, user_id, business_name, search_keyword, search_location, country, status, amount_paid, payment_date)
values ('1a7a0000-0000-4000-8000-000000000199', (select admin_id from t_fx), 'ZZ INTAKE manual add', 'plumber', 'Rugby', 'UK', 'in_delivery', 99, current_date);
insert into t_results (name, ok, detail) select 'T6: a client added manually (insert) queues its intake', count(*) = 1, count(*)::text
  from public.client_intake where lead_id = '1a7a0000-0000-4000-8000-000000000199';

-- 7: the PK — a second insert for the same client is refused (nothing can create a second intake)
do $$ begin
  insert into public.client_intake (lead_id) values ((select id from t_l where business_name = 'ZZ INTAKE 1'));
  insert into t_results (name, ok, detail) values ('T7: one intake per client (primary key)', false, 'second row accepted');
exception when unique_violation then insert into t_results (name, ok, detail) values ('T7: one intake per client (primary key)', true, sqlstate); end $$;

-- ── S. SEND TO PAUL ──────────────────────────────────────────────────────────────────────────────────
insert into public.client_handoff_sends (lead_id, sent_by_user_id, sent_by_name, sent_by_role, paid_when_sent, handoff)
values ((select id from t_l where business_name = 'ZZ INTAKE 6'), '1a7a0000-0000-4000-8000-0000000000a1', 'Intake Rep A', 'sales', false, '{"client_wants":"calls"}');
do $$ begin
  insert into public.client_handoff_sends (lead_id, sent_by_user_id, sent_by_name, sent_by_role, paid_when_sent, handoff)
  values ((select id from t_l where business_name = 'ZZ INTAKE 6'), '1a7a0000-0000-4000-8000-0000000000a1', 'Intake Rep A', 'sales', false, '{}');
  insert into t_results (name, ok, detail) values ('S1: one Send to Paul per client (a double press is refused by the database)', false, 'second row accepted');
exception when unique_violation then insert into t_results (name, ok, detail) values ('S1: one Send to Paul per client (a double press is refused by the database)', true, sqlstate); end $$;
do $$ begin
  insert into public.client_handoff_sends (lead_id, sent_by_user_id, sent_by_role, handoff) values ((select id from t_l where business_name = 'ZZ INTAKE 7'), '1a7a0000-0000-4000-8000-0000000000a1', 'manager', '{}');
  insert into t_results (name, ok, detail) values ('S2: the sender role is sales or admin only', false, 'accepted');
exception when check_violation then insert into t_results (name, ok, detail) values ('S2: the sender role is sales or admin only', true, sqlstate); end $$;

-- History once per client
insert into public.lead_activity (lead_id, actor_user_id, kind, body, data) values ((select id from t_l where business_name = 'ZZ INTAKE 6'), '1a7a0000-0000-4000-8000-0000000000a1', 'handoff_sent', 'Handoff sent to Paul', '{"source":"sales"}');
do $$ begin
  insert into public.lead_activity (lead_id, kind, data) values ((select id from t_l where business_name = 'ZZ INTAKE 6'), 'handoff_sent', '{"source":"sales"}');
  insert into t_results (name, ok, detail) values ('S3: one "sent to Paul" History line per client', false, 'accepted');
exception when unique_violation then insert into t_results (name, ok, detail) values ('S3: one "sent to Paul" History line per client', true, sqlstate); end $$;

-- RLS: the sender reads their own send; another rep reads nothing; nobody signed in can write
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1a7a0000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
insert into t_results (name, ok, detail) select 'S4: the salesperson who sent it can read their own send', count(*) = 1, count(*)::text from public.client_handoff_sends where lead_id in (select id from t_l);
do $$ begin
  insert into public.client_handoff_sends (lead_id, sent_by_user_id, sent_by_role, handoff) values ((select id from t_l where business_name = 'ZZ INTAKE 8'), '1a7a0000-0000-4000-8000-0000000000a1', 'sales', '{}');
  insert into t_results (name, ok, detail) values ('S5: a salesperson cannot write a send directly (only fn quick-close can)', false, 'accepted');
exception when insufficient_privilege then insert into t_results (name, ok, detail) values ('S5: a salesperson cannot write a send directly (only fn quick-close can)', true, sqlstate); end $$;
do $$ declare n int; begin
  select count(*) into n from public.client_intake;
  insert into t_results (name, ok, detail) values ('R1: a salesperson cannot read client_intake (research is admin-only)', false, n::text);
exception when insufficient_privilege then insert into t_results (name, ok, detail) values ('R1: a salesperson cannot read client_intake (research is admin-only)', true, sqlstate); end $$;
select set_config('request.jwt.claims', '{"sub":"1a7a0000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
insert into t_results (name, ok, detail) select 'S6: another salesperson sees none of it', count(*) = 0, count(*)::text from public.client_handoff_sends where lead_id in (select id from t_l);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from t_fx), 'role', 'authenticated')::text, true);
insert into t_results (name, ok, detail) select 'S7: the admin (Paul) reads every send', count(*) = 1, count(*)::text from public.client_handoff_sends where lead_id in (select id from t_l);
reset role;
set local role anon;
do $$ declare n int; begin
  select count(*) into n from public.client_handoff_sends;
  insert into t_results (name, ok, detail) values ('S8: the public (anon) reads nothing', false, n::text);
exception when insufficient_privilege then insert into t_results (name, ok, detail) values ('S8: the public (anon) reads nothing', true, sqlstate); end $$;
reset role;

-- ── K. THE KINDS ─────────────────────────────────────────────────────────────────────────────────────
do $$ declare k text; bad text := ''; begin
  foreach k in array array['client_intake', 'client_fact_set', 'payment_received', 'handoff_saved', 'client_info_requested', 'client_contact_opened', 'details_set', 'crawl_run'] loop
    begin
      insert into public.lead_activity (lead_id, kind, data) values ((select id from t_l where business_name = 'ZZ INTAKE 7'), k, '{"source":"system","event":"x"}');
    exception when others then bad := bad || k || ':' || sqlstate || ' '; end;
  end loop;
  insert into t_results (name, ok, detail) values ('K1: the new History kinds are accepted and every earlier kind still is', bad = '', bad);
end $$;
insert into public.lead_activity (lead_id, kind, data) values ((select id from t_l where business_name = 'ZZ INTAKE 8'), 'client_intake', '{"source":"system","event":"ready"}');
do $$ begin
  insert into public.lead_activity (lead_id, kind, data) values ((select id from t_l where business_name = 'ZZ INTAKE 8'), 'client_intake', '{"source":"system","event":"ready"}');
  insert into t_results (name, ok, detail) values ('K2: one "intake ready" History line per client (a re-run never repeats it)', false, 'accepted');
exception when unique_violation then insert into t_results (name, ok, detail) values ('K2: one "intake ready" History line per client (a re-run never repeats it)', true, sqlstate); end $$;
do $$ begin
  insert into public.lead_activity (lead_id, kind, data) values ((select id from t_l where business_name = 'ZZ INTAKE 8'), 'not_a_kind', '{}');
  insert into t_results (name, ok, detail) values ('K3: an unknown History kind is refused', false, 'accepted');
exception when check_violation then insert into t_results (name, ok, detail) values ('K3: an unknown History kind is refused', true, sqlstate); end $$;
set local role service_role;
select public.notify_person((select admin_id from t_fx), 'client_handoff', 'NEW CLIENT HANDOFF · ZZ INTAKE 6', 'From Intake Rep A.', '/paid-clients?handoff=x', (select id from t_l where business_name = 'ZZ INTAKE 6'), 'handoff_sent:zz-intake-6', 2::smallint);
select public.notify_person((select admin_id from t_fx), 'client_handoff', 'NEW CLIENT HANDOFF · ZZ INTAKE 6', 'From Intake Rep A.', '/paid-clients?handoff=x', (select id from t_l where business_name = 'ZZ INTAKE 6'), 'handoff_sent:zz-intake-6', 2::smallint);
select public.notify_person((select admin_id from t_fx), 'client_intake', 'CLIENT READY · ZZ INTAKE 8', 'x', '/paid-clients/x', (select id from t_l where business_name = 'ZZ INTAKE 8'), 'client_intake:zz-intake-8', 1::smallint);
reset role;
insert into t_results (name, ok, detail) select 'K4: NEW CLIENT HANDOFF reaches Paul ONCE (dedupe), and the intake notice is accepted',
  (select count(*) from public.notifications where dedupe_key = 'handoff_sent:zz-intake-6') = 1 and (select count(*) from public.notifications where dedupe_key = 'client_intake:zz-intake-8') = 1, null;

-- ── C. THE WORKER DOOR ───────────────────────────────────────────────────────────────────────────────
insert into t_results (name, ok, detail) select 'C1: invoke_client_intake exists and is not callable by a signed-in person',
  exists (select 1 from pg_proc where proname = 'invoke_client_intake') and not has_function_privilege('authenticated', 'public.invoke_client_intake()', 'execute'), null;
insert into t_results (name, ok, detail) select 'C2: the one-minute backstop cron is scheduled', count(*) = 1, string_agg(schedule || ' ' || command, ',') from cron.job where jobname = 'client-intake-run';
insert into t_results (name, ok, detail) select 'C3: no intake outside the fixtures was created by this run',
  (select count(*) from public.client_intake where lead_id not in (select id from t_l) and lead_id <> '1a7a0000-0000-4000-8000-000000000199') = (select intakes_before from t_fx), null;

do $$ begin
  raise exception 'QA_RESULT %', (select jsonb_build_object('passed', count(*) filter (where ok), 'failed', count(*) filter (where ok is not true),
    'results', jsonb_agg(jsonb_build_object('n', n, 'ok', ok, 'name', name, 'detail', detail) order by n)) from t_results);
end $$;
