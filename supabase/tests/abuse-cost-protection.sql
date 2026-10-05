-- Abuse / API-cost / lead-protection tests (2026-09-29). RUN AGAINST THE LIVE DATABASE; ALWAYS ROLLED BACK.
-- The last statement raises an exception carrying the results as JSON, so the transaction can never
-- commit: every fixture (fake users on example.invalid, ledger rows, events, settings changes) disappears.
-- How to run: docs/abuse-cost-protection.md ("Re-running the tests"). Send the whole file as ONE query.
--
-- ⚠️ Inside one transaction now() never moves, so a "session of work" is simulated by inserting ledger
-- rows with created_at in the PAST and then asking the guard once — never by calling it N times.
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

create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated, anon; grant usage, select on sequence t_results_n_seq to authenticated, anon;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('cccccccc-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-guard-a@example.invalid', '{}', '{}', now(), now()),
  ('cccccccc-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-guard-b@example.invalid', '{}', '{}', now(), now()),
  ('cccccccc-0000-4000-8000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-guard-c@example.invalid', '{}', '{}', now(), now());
insert into public.user_roles (user_id, role) values
  ('cccccccc-0000-4000-8000-00000000000a', 'sales'), ('cccccccc-0000-4000-8000-00000000000b', 'sales'), ('cccccccc-0000-4000-8000-00000000000c', 'sales');
insert into public.team_members (user_id, display_name) values
  ('cccccccc-0000-4000-8000-00000000000a', 'Guard A'), ('cccccccc-0000-4000-8000-00000000000b', 'Guard B'), ('cccccccc-0000-4000-8000-00000000000c', 'Guard C');
-- The live team spend must not decide these tests: park the real 24 h under a huge cap for the test only.
update public.protection_settings set limits = jsonb_set(jsonb_set(limits, '{team_day_cap_usd}', '100000'), '{team_day_warn_usd}', '100000'), mode = 'running', overrides = '{}' where id = 1;

create temp table t_fx as select
  (select l.id from public.outreach_leads l
    where l.assigned_to_user_id is null and l.is_archived is not true and l.status = 'not_contacted' and l.phone is not null
      and not public.lead_is_client(l.amount_paid, l.status) and public.lead_contact_attempt_at(l.id) is null
    order by l.created_at limit 1) as mine,
  (select l.id from public.outreach_leads l
    where l.assigned_to_user_id is null and l.is_archived is not true and l.status = 'not_contacted'
      and not public.lead_is_client(l.amount_paid, l.status) and public.lead_contact_attempt_at(l.id) is null
      and l.id is distinct from (select l2.id from public.outreach_leads l2
        where l2.assigned_to_user_id is null and l2.is_archived is not true and l2.status = 'not_contacted' and l2.phone is not null
          and not public.lead_is_client(l2.amount_paid, l2.status) and public.lead_contact_attempt_at(l2.id) is null
        order by l2.created_at limit 1)
    order by l.created_at limit 1) as spare,
  (select l.id from public.outreach_leads l where l.assigned_to_user_id = l.user_id and l.place_id is not null
      and not public.lead_is_client(l.amount_paid, l.status) order by l.created_at limit 1) as pauls,
  (select l.id from public.outreach_leads l where public.lead_is_client(l.amount_paid, l.status) and l.place_id is not null order by l.created_at limit 1) as client,
  (select user_id from public.team_members where is_book_owner limit 1) as admin_id;
alter table t_fx add column mine_pid text, add column mine_phone text, add column pauls_pid text, add column client_pid text, add column spare_pid text;
update t_fx set mine_pid = (select place_id from public.outreach_leads where id = t_fx.mine), mine_phone = (select phone from public.outreach_leads where id = t_fx.mine),
  pauls_pid = (select place_id from public.outreach_leads where id = t_fx.pauls), client_pid = (select place_id from public.outreach_leads where id = t_fx.client),
  spare_pid = (select place_id from public.outreach_leads where id = t_fx.spare);
grant select on t_fx to authenticated, anon;
insert into t_results (name, ok, detail) select 'fixtures', mine is not null and spare is not null and mine <> spare and pauls is not null and client is not null and admin_id is not null, null from t_fx;

-- ── Grants: the guard and the admin reads are never reachable from a browser ──
insert into t_results (name, ok, detail) select 'authenticated cannot execute ' || f, not has_function_privilege('authenticated', f, 'execute'), null
  from unnest(array['public.guard_action(uuid, text, uuid, numeric, integer, text)', 'public.record_denial(uuid, text, uuid, jsonb)',
                    'public.security_sweep()', 'public.security_overview()', 'public._lead_identity_rows(jsonb)',
                    'public.sales_pool(text, integer, integer)', 'public.invoke_security_sweep()']) f;
insert into t_results (name, ok, detail) select 'anon cannot execute ' || f, not has_function_privilege('anon', f, 'execute'), null
  from unnest(array['public.log_data_access(text, integer, uuid[], jsonb)', 'public.lead_identity_lookup(jsonb)', 'public.guard_action(uuid, text, uuid, numeric, integer, text)']) f;
insert into t_results (name, ok, detail) select 'authenticated can execute ' || f, has_function_privilege('authenticated', f, 'execute'), null
  from unnest(array['public.log_data_access(text, integer, uuid[], jsonb)', 'public.lead_identity_lookup(jsonb)', 'public.claim_lead(uuid)']) f;
insert into t_results (name, ok, detail) values
  ('protection_settings: no grant to a signed-in role', not has_table_privilege('authenticated', 'public.protection_settings', 'select') and not has_table_privilege('anon', 'public.protection_settings', 'select'), null),
  ('security_events: no write grant to a signed-in role', not has_table_privilege('authenticated', 'public.security_events', 'insert') and not has_table_privilege('authenticated', 'public.security_events', 'update') and not has_table_privilege('authenticated', 'public.security_events', 'delete'), null),
  ('security_events: anon has nothing', not has_table_privilege('anon', 'public.security_events', 'select'), null);

-- ── A claims a lead (the guard counts it) ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-00000000000a', true);
do $$ declare r jsonb; begin
  r := public.claim_lead((select mine from t_fx));
  insert into t_results (name, ok, detail) values ('A: an ordinary claim works', (r ->> 'ok')::boolean, r::text);
  insert into t_results (name, ok, detail) values ('A: cannot read the ledger', not exists (select 1 from public.api_usage_log), null);
  insert into t_results (name, ok, detail) values ('A: cannot read security events', not exists (select 1 from public.security_events), null);
end $$;
reset role;
insert into t_results (name, ok, detail) values ('the claim is on the ledger with who/what/outcome',
  exists (select 1 from public.api_usage_log where user_id = 'cccccccc-0000-4000-8000-00000000000a' and action = 'claim' and outcome = 'allowed'
          and actor_role = 'sales' and lead_id = (select mine from t_fx) and api_type = 'guard'), null);

-- ── NORMAL: an ordinary rep, a very productive rep, a bulk prospecting session, concurrent audits ──
-- Productive day for B: 30 searches (4 pages each at the text-search rate), 300 place details, 40 hooks,
-- spread over the last 10 hours (provider rows under B, like search-leads / google-place-details write).
insert into public.api_usage_log (user_id, function_name, api_type, calls_made, estimated_cost_usd, created_at)
select 'cccccccc-0000-4000-8000-00000000000b', 'search-leads', 'text_search', 4, 0.14, now() - (g * interval '20 minutes') - interval '2 minutes' from generate_series(1, 30) g;
insert into public.api_usage_log (user_id, function_name, api_type, calls_made, estimated_cost_usd, created_at)
select 'cccccccc-0000-4000-8000-00000000000b', 'google-place-details', 'place_details', 1, 0.02, now() - (g * interval '2 minutes') - interval '1 hour' from generate_series(1, 300) g;
insert into public.api_usage_log (user_id, function_name, api_type, calls_made, estimated_cost_usd, action, actor_role, outcome, created_at)
select 'cccccccc-0000-4000-8000-00000000000b', 'create-ai-audit', 'guard', 1, 0.0331, 'hook_audit', 'sales', 'allowed', now() - (g * interval '15 minutes') - interval '1 hour' from generate_series(1, 40) g;
do $$ declare r jsonb; begin
  r := public.guard_action('cccccccc-0000-4000-8000-00000000000b', 'place_details', null, 0, 1, 'test');
  insert into t_results (name, ok, detail) values ('NORMAL: a very productive day (30 searches, 300 details, 40 hooks) is not restricted', (r ->> 'ok')::boolean and r ->> 'state' = 'normal', r::text);
  r := public.guard_action('cccccccc-0000-4000-8000-00000000000b', 'hook_audit', (select spare from t_fx), 0.0331, 1, 'test');
  insert into t_results (name, ok, detail) values ('NORMAL: …and its next hook audit runs', (r ->> 'ok')::boolean, r::text);
end $$;
-- Bulk prospecting session for C: 200 place details + 10 searches in the last hour, none in the last minute.
insert into public.api_usage_log (user_id, function_name, api_type, calls_made, estimated_cost_usd, action, actor_role, outcome, created_at)
select 'cccccccc-0000-4000-8000-00000000000c', 'google-place-details', 'guard', 1, 0, 'place_details', 'sales', 'allowed', now() - interval '2 minutes' - (g * interval '15 seconds') from generate_series(1, 200) g;
insert into public.api_usage_log (user_id, function_name, api_type, calls_made, estimated_cost_usd, created_at)
select 'cccccccc-0000-4000-8000-00000000000c', 'google-place-details', 'place_details', 1, 0.02, now() - interval '2 minutes' - (g * interval '15 seconds') from generate_series(1, 200) g;
insert into public.api_usage_log (user_id, function_name, api_type, calls_made, estimated_cost_usd, created_at)
select 'cccccccc-0000-4000-8000-00000000000c', 'search-leads', 'text_search', 4, 0.14, now() - interval '5 minutes' - (g * interval '5 minutes') from generate_series(1, 10) g;
do $$ declare r jsonb; i int; ok_n int := 0; begin
  r := public.guard_action('cccccccc-0000-4000-8000-00000000000c', 'place_details', null, 0, 1, 'test');
  insert into t_results (name, ok, detail) values ('NORMAL: a bulk prospecting hour (200 details, 10 searches) is not restricted', (r ->> 'ok')::boolean and r ->> 'state' = 'normal', r::text);
  -- Five audits started together (legitimate concurrency).
  for i in 1..5 loop r := public.guard_action('cccccccc-0000-4000-8000-00000000000c', 'hook_audit', null, 0.0331, 1, 'test'); if (r ->> 'ok')::boolean then ok_n := ok_n + 1; end if; end loop;
  insert into t_results (name, ok, detail) values ('NORMAL: five concurrent hook audits all start', ok_n = 5, ok_n::text);
end $$;

-- ── WARNING: spend over the warning line, under the hard line ──
insert into public.api_usage_log (user_id, function_name, api_type, calls_made, estimated_cost_usd, created_at)
values ('cccccccc-0000-4000-8000-00000000000a', 'search-leads', 'text_search', 50, 7.00, now() - interval '10 minutes');
do $$ declare r jsonb; begin
  r := public.guard_action('cccccccc-0000-4000-8000-00000000000a', 'lead_search', null, 0, 1, 'test');
  insert into t_results (name, ok, detail) values ('WARNING: over the hourly warning — still allowed, state warning', (r ->> 'ok')::boolean and r ->> 'state' = 'warning' and r ->> 'reason' = 'spend_warning', r::text);
  insert into t_results (name, ok, detail) values ('WARNING: …an emailed warning event exists',
    exists (select 1 from public.security_events where actor_user_id = 'cccccccc-0000-4000-8000-00000000000a' and kind = 'spend_warning' and severity = 'warning' and alert_wanted and alerted_at is null), null);
  r := public.guard_action('cccccccc-0000-4000-8000-00000000000a', 'lead_search', null, 0, 1, 'test');
  insert into t_results (name, ok, detail) values ('WARNING: a repeat bumps the same event (one email a day, not one per call)',
    (select occurrences from public.security_events where actor_user_id = 'cccccccc-0000-4000-8000-00000000000a' and kind = 'spend_warning') = 2, null);
end $$;

-- ── RESTRICTED: over the hard line — paid actions refused, unpaid CRM actions still work ──
insert into public.api_usage_log (user_id, function_name, api_type, calls_made, estimated_cost_usd, created_at)
values ('cccccccc-0000-4000-8000-00000000000a', 'search-leads', 'text_search', 100, 9.00, now() - interval '5 minutes');
do $$ declare r jsonb; begin
  r := public.guard_action('cccccccc-0000-4000-8000-00000000000a', 'hook_audit', null, 0.0331, 1, 'test');
  insert into t_results (name, ok, detail) values ('RESTRICTED: over the hourly hard cap — a paid action is refused', not (r ->> 'ok')::boolean and r ->> 'reason' = 'spend_cap', r::text);
  insert into t_results (name, ok, detail) values ('RESTRICTED: …a restricted event is raised for the email',
    exists (select 1 from public.security_events where actor_user_id = 'cccccccc-0000-4000-8000-00000000000a' and kind = 'spend_cap' and severity = 'restricted' and alert_wanted), null);
  r := public.guard_action('cccccccc-0000-4000-8000-00000000000a', 'whatsapp_send', (select mine from t_fx), 0, 1, 'test');
  insert into t_results (name, ok, detail) values ('RESTRICTED: …an unpaid action (a WhatsApp reply) still works', (r ->> 'ok')::boolean, r::text);
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-00000000000a', true);
do $$ declare r jsonb; begin
  r := public.lead_add_note((select mine from t_fx), 'restricted but still working');
  insert into t_results (name, ok, detail) values ('RESTRICTED: …notes still work', (r ->> 'ok')::boolean, r::text);
  insert into t_results (name, ok, detail) values ('RESTRICTED: …own lead still readable', exists (select 1 from public.sales_leads where id = (select mine from t_fx)), null);
end $$;
reset role;

-- ── The admin unlocks A: per-user limits skipped until the override expires ──
update public.protection_settings set overrides = jsonb_build_object('cccccccc-0000-4000-8000-00000000000a', (now() + interval '1 hour')::text) where id = 1;
do $$ declare r jsonb; begin
  r := public.guard_action('cccccccc-0000-4000-8000-00000000000a', 'hook_audit', null, 0.0331, 1, 'test');
  insert into t_results (name, ok, detail) values ('UNLOCK: an admin override lets A work again', (r ->> 'ok')::boolean, r::text);
end $$;
update public.protection_settings set overrides = '{}' where id = 1;

-- ── Burst: a malicious loop is cut off at the per-minute line; a hook spam at the 10-minute line ──
do $$ declare r jsonb; i int; ok_n int := 0; first_refused int; begin
  for i in 1..45 loop
    r := public.guard_action('cccccccc-0000-4000-8000-00000000000b', 'place_details', null, 0, 1, 'test');
    if (r ->> 'ok')::boolean then ok_n := ok_n + 1; elsif first_refused is null then first_refused := i; end if;
  end loop;
  insert into t_results (name, ok, detail) values ('BURST: 45 place lookups in a minute — refused from the per_min line on',
    ok_n = (select (limits -> 'actions' -> 'place_details' ->> 'per_min')::int - 1 from public.protection_settings) and r ->> 'reason' = 'rate_limit',
    'allowed=' || ok_n || ' first_refused=' || coalesce(first_refused::text, 'none'));
  ok_n := 0;
  for i in 1..15 loop
    r := public.guard_action('cccccccc-0000-4000-8000-00000000000c', 'hook_audit', null, 0.0331, 1, 'test');
    if (r ->> 'ok')::boolean then ok_n := ok_n + 1; end if;
  end loop;
  -- C already started 5 in this minute above.
  insert into t_results (name, ok, detail) values ('BURST: hook-audit spam stops at per_10min',
    ok_n + 5 = (select (limits -> 'actions' -> 'hook_audit' ->> 'per_10min')::int from public.protection_settings), 'allowed=' || ok_n);
  insert into t_results (name, ok, detail) values ('BURST: refused attempts are not billed as spend',
    (select coalesce(sum(estimated_cost_usd), 0) from public.api_usage_log where user_id = 'cccccccc-0000-4000-8000-00000000000c' and outcome = 'refused') = 0, null);
end $$;

-- ── Claims: 60 an hour, 200 a day, a warning at 100 a day ──
insert into public.api_usage_log (user_id, function_name, api_type, calls_made, estimated_cost_usd, action, actor_role, outcome, created_at)
select 'cccccccc-0000-4000-8000-00000000000b', 'claim_lead', 'guard', 1, 0, 'claim', 'sales', 'allowed', now() - interval '1 minute' - (g * interval '30 seconds') from generate_series(1, 60) g;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-00000000000b', true);
do $$ declare r jsonb; begin
  r := public.claim_lead((select spare from t_fx));
  insert into t_results (name, ok, detail) values ('CLAIM: the 61st claim in an hour is refused, the lead stays unassigned',
    r ->> 'error' = 'usage_paused' and r ->> 'detail' = 'Usage temporarily paused — contact Paul', r::text);
end $$;
reset role;
insert into t_results (name, ok, detail) values ('CLAIM: …the refused claim did not assign the lead',
  (select assigned_to_user_id from public.outreach_leads where id = (select spare from t_fx)) is null, null);
delete from public.api_usage_log where user_id = 'cccccccc-0000-4000-8000-00000000000b' and action = 'claim';
insert into public.api_usage_log (user_id, function_name, api_type, calls_made, estimated_cost_usd, action, actor_role, outcome, created_at)
select 'cccccccc-0000-4000-8000-00000000000b', 'claim_lead', 'guard', 1, 0, 'claim', 'sales', 'allowed', now() - interval '2 hours' - (g * interval '5 minutes') from generate_series(1, 100) g;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-00000000000b', true);
do $$ declare r jsonb; begin
  r := public.claim_lead((select spare from t_fx));
  insert into t_results (name, ok, detail) values ('CLAIM: the 101st claim of the day works (a warning, not a stop)', (r ->> 'ok')::boolean, r::text);
end $$;
reset role;
insert into t_results (name, ok, detail) values ('CLAIM: …and raises a volume warning for the email',
  exists (select 1 from public.security_events where actor_user_id = 'cccccccc-0000-4000-8000-00000000000b' and kind = 'volume_warning' and action = 'claim' and alert_wanted), null);
update public.outreach_leads set assigned_to_user_id = null, assigned_at = null where id = (select spare from t_fx);
insert into public.api_usage_log (user_id, function_name, api_type, calls_made, estimated_cost_usd, action, actor_role, outcome, created_at)
select 'cccccccc-0000-4000-8000-00000000000b', 'claim_lead', 'guard', 1, 0, 'claim', 'sales', 'allowed', now() - interval '3 hours' - (g * interval '1 minute') from generate_series(1, 99) g;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-00000000000b', true);
do $$ declare r jsonb; begin
  r := public.claim_lead((select spare from t_fx));
  insert into t_results (name, ok, detail) values ('CLAIM: the 201st claim of the day is refused', r ->> 'error' = 'usage_paused', r::text);
end $$;
reset role;

-- ── Lead data: masked lookup, exports, copy numbers ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-00000000000a', true);
do $$ declare h record; r jsonb; ids uuid[]; begin
  select * into h from public.lead_identity_lookup(jsonb_build_array(jsonb_build_object('k', 'p', 'place_id', (select pauls_pid from t_fx))));
  insert into t_results (name, ok, detail) values ('LOOKUP: another rep''s / Paul''s lead answers state + owner name, no lead id, no owner id',
    h.state in ('owned', 'protected') and h.lead_id is null and h.owner_id is null, row_to_json(h)::text);
  select * into h from public.lead_identity_lookup(jsonb_build_array(jsonb_build_object('k', 'c', 'place_id', (select client_pid from t_fx))));
  insert into t_results (name, ok, detail) values ('LOOKUP: a paid client answers protected, no lead id', h.state in ('owned', 'protected') and h.lead_id is null, row_to_json(h)::text);
  select * into h from public.lead_identity_lookup(jsonb_build_array(jsonb_build_object('k', 'm', 'place_id', (select mine_pid from t_fx), 'phone', (select mine_phone from t_fx))));
  insert into t_results (name, ok, detail) values ('LOOKUP: own lead still answers yours + its id (Open works)', h.state = 'yours' and h.lead_id = (select mine from t_fx), row_to_json(h)::text);
  select * into h from public.lead_identity_lookup(jsonb_build_array(jsonb_build_object('k', 's', 'place_id', (select spare_pid from t_fx))));
  insert into t_results (name, ok, detail) values ('LOOKUP: a claimable lead still carries its id (Claim works)',
    (h.state = 'claimable' and h.lead_id = (select spare from t_fx)) or (select spare_pid from t_fx) is null, row_to_json(h)::text);

  r := public.log_data_access('export_csv', 50, null, '{}');
  insert into t_results (name, ok, detail) values ('EXPORT: Sales CSV export refused on the server', r ->> 'error' = 'usage_paused', r::text);
  r := public.log_data_access('copy_numbers', 1, array[(select mine from t_fx)], '{"view":"test"}');
  insert into t_results (name, ok, detail) values ('COPY: own lead number copy is allowed and logged', (r ->> 'ok')::boolean, r::text);
  r := public.log_data_access('copy_numbers', 1, array[(select pauls from t_fx)], '{}');
  insert into t_results (name, ok, detail) values ('COPY: another lead''s number is refused', r ->> 'error' = 'not_your_leads', r::text);
  r := public.log_data_access('copy_numbers', 5, array[(select mine from t_fx)], '{}');
  insert into t_results (name, ok, detail) values ('COPY: a row count that does not match the ids is refused', r ->> 'error' = 'lead_ids_required', r::text);
  select array_agg((select mine from t_fx)) into ids from generate_series(1, 201);
  r := public.log_data_access('copy_numbers', 201, ids, '{}');
  insert into t_results (name, ok, detail) values ('COPY: over max_rows in one copy is refused, naming the limit', r ->> 'error' = 'too_many_rows' and (r ->> 'max_rows')::int = 200, r::text);
  select array_agg((select mine from t_fx)) into ids from generate_series(1, 150);
  r := public.log_data_access('copy_numbers', 150, ids, '{}');
  insert into t_results (name, ok, detail) values ('COPY: a large copy works but warns', (r ->> 'ok')::boolean, r::text);
end $$;
reset role;
insert into t_results (name, ok, detail) values
  ('EXPORT: the refused Sales export is a security event for the email', exists (select 1 from public.security_events where actor_user_id = 'cccccccc-0000-4000-8000-00000000000a' and kind = 'not_allowed' and action = 'export_csv' and alert_wanted), null),
  ('COPY: the allowed copy is in the audit trail with its row count', exists (select 1 from public.security_events where actor_user_id = 'cccccccc-0000-4000-8000-00000000000a' and kind = 'data_export' and (detail ->> 'rows')::int = 1), null),
  ('COPY: the large copy raised a warning', exists (select 1 from public.security_events where actor_user_id = 'cccccccc-0000-4000-8000-00000000000a' and kind = 'large_copy'), null),
  ('COPY: the refused copy of someone else''s lead is a denial', exists (select 1 from public.security_events where actor_user_id = 'cccccccc-0000-4000-8000-00000000000a' and kind = 'denied' and action = 'copy_numbers'), null);

-- ── Messages: a phone match never reaches a message filed under another lead ──
insert into public.whatsapp_messages (direction, phone, status, test_mode, lead_id, body)
values ('outbound', '44' || public.phone_key((select mine_phone from t_fx)), 'failed', true, (select pauls from t_fx), 'guard-test: filed under another lead'),
       ('outbound', '44' || public.phone_key((select mine_phone from t_fx)), 'failed', true, null, 'guard-test: no lead');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-00000000000a', true);
do $$ begin
  insert into t_results (name, ok, detail) values ('MESSAGES: a message on ANOTHER lead with my lead''s phone is hidden',
    not exists (select 1 from public.whatsapp_messages where body = 'guard-test: filed under another lead'), null);
  insert into t_results (name, ok, detail) values ('MESSAGES: an unmatched message from my lead''s phone is still shown',
    exists (select 1 from public.whatsapp_messages where body = 'guard-test: no lead'), null);
end $$;
reset role;

-- ── Denials: the tenth in ten minutes raises one emailed warning ──
do $$ declare i int; begin
  for i in 1..10 loop perform public.record_denial('cccccccc-0000-4000-8000-00000000000c', 'admin-users', null, '{}'); end loop;
  insert into t_results (name, ok, detail) values ('DENIED: ten refusals in ten minutes raise a denied_burst alert',
    exists (select 1 from public.security_events where actor_user_id = 'cccccccc-0000-4000-8000-00000000000c' and kind = 'denied_burst' and alert_wanted), null);
end $$;

-- ── SUSPENDED: every protected action refused, the CRM still readable ──
update public.team_members set suspended_at = now() where user_id = 'cccccccc-0000-4000-8000-00000000000a';
do $$ declare r jsonb; a text; begin
  foreach a in array array['lead_search', 'place_details', 'enrich', 'hook_audit', 'ai_draft', 'prospect_preview', 'whatsapp_send', 'whatsapp_queue', 'copy_numbers'] loop
    r := public.guard_action('cccccccc-0000-4000-8000-00000000000a', a, null, 0, 1, 'test');
    insert into t_results (name, ok, detail) values ('SUSPENDED: ' || a || ' refused', not (r ->> 'ok')::boolean and r ->> 'reason' = 'suspended', r::text);
  end loop;
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-00000000000a', true);
do $$ declare r jsonb; h record; begin
  r := public.claim_lead((select spare from t_fx));
  insert into t_results (name, ok, detail) values ('SUSPENDED: claim refused', r ->> 'error' = 'usage_paused', r::text);
  r := public.sales_queue_opener(array[(select mine from t_fx)], 'initial_contact');
  insert into t_results (name, ok, detail) values ('SUSPENDED: queueing an opener refused', r ->> 'error' = 'usage_paused', r::text);
  r := public.sales_add_lead(jsonb_build_object('business_name', 'Guard Test Ltd', 'search_keyword', 'plumbers', 'phone', '07000000001'));
  insert into t_results (name, ok, detail) values ('SUSPENDED: adding a lead refused', r ->> 'error' = 'usage_paused', r::text);
  select * into h from public.lead_identity_lookup(jsonb_build_array(jsonb_build_object('k', 'x', 'place_id', 'nothing')));
  insert into t_results (name, ok, detail) values ('SUSPENDED: Find Leads lookup answers paused', h.state = 'paused', row_to_json(h)::text);
  r := public.log_data_access('copy_numbers', 1, array[(select mine from t_fx)], '{}');
  insert into t_results (name, ok, detail) values ('SUSPENDED: copy numbers refused', r ->> 'error' = 'usage_paused', r::text);
  insert into t_results (name, ok, detail) values ('SUSPENDED: own leads still readable (the CRM works)', exists (select 1 from public.sales_leads where id = (select mine from t_fx)), null);
  begin
    r := public.lead_add_note((select mine from t_fx), 'suspended note');
    insert into t_results (name, ok, detail) values ('SUSPENDED: notes still work', (r ->> 'ok')::boolean, r::text);
  exception when others then
    insert into t_results (name, ok, detail) values ('SUSPENDED: notes still work', false, sqlerrm || ' assigned=' || coalesce((select assigned_to_user_id::text from public.outreach_leads where id = (select mine from t_fx)), 'null'));
  end;
  insert into t_results (name, ok, detail) values ('SUSPENDED: the role is untouched (my_role still sales)', public.my_role() = 'sales', null);
end $$;
reset role;
insert into t_results (name, ok, detail) values ('SUSPENDED: attempts are recorded as security events',
  exists (select 1 from public.security_events where actor_user_id = 'cccccccc-0000-4000-8000-00000000000a' and kind = 'suspended'), null);
update public.team_members set suspended_at = null where user_id = 'cccccccc-0000-4000-8000-00000000000a';
do $$ declare r jsonb; begin
  r := public.guard_action('cccccccc-0000-4000-8000-00000000000a', 'whatsapp_send', null, 0, 1, 'test');
  insert into t_results (name, ok, detail) values ('REACTIVATED: works again at once', (r ->> 'ok')::boolean, r::text);
end $$;

-- ── Modes: prospecting pause and the emergency stop ──
update public.protection_settings set mode = 'prospecting_paused' where id = 1;
do $$ declare r jsonb; begin
  r := public.guard_action('cccccccc-0000-4000-8000-00000000000b', 'lead_search', null, 0, 1, 'test');
  insert into t_results (name, ok, detail) values ('PAUSE: a salesperson''s paid action is paused', r ->> 'reason' = 'paused', r::text);
  r := public.guard_action((select admin_id from t_fx), 'audit_manual', null, 0, 1, 'test');
  insert into t_results (name, ok, detail) values ('PAUSE: the admin''s manual paid work is paused too', r ->> 'reason' = 'paused', r::text);
  r := public.guard_action('cccccccc-0000-4000-8000-00000000000b', 'whatsapp_send', null, 0, 1, 'test');
  insert into t_results (name, ok, detail) values ('PAUSE: WhatsApp (not paid API) is untouched', (r ->> 'ok')::boolean, r::text);
  insert into t_results (name, ok, detail) values ('PAUSE: the admin''s own pause is never emailed back',
    not exists (select 1 from public.security_events where kind = 'paused' and alert_wanted and actor_user_id in ('cccccccc-0000-4000-8000-00000000000b', (select admin_id from t_fx))), null);
end $$;
update public.protection_settings set mode = 'all_stop' where id = 1;
do $$ declare r jsonb; begin
  r := public.guard_action((select admin_id from t_fx), 'niche_check', null, 0, 1, 'test');
  insert into t_results (name, ok, detail) values ('ALL STOP: even the admin''s paid action is stopped', r ->> 'reason' = 'all_stop', r::text);
end $$;
update public.protection_settings set mode = 'running' where id = 1;

-- ── Team cap: the whole team's real spend restricts SALES, never the admin ──
update public.protection_settings set limits = jsonb_set(limits, '{team_day_cap_usd}', '1') where id = 1;
do $$ declare r jsonb; begin
  r := public.guard_action('cccccccc-0000-4000-8000-00000000000c', 'lead_search', null, 0, 1, 'test');
  insert into t_results (name, ok, detail) values ('TEAM CAP: over the team cap a salesperson''s paid action is refused', r ->> 'reason' = 'team_cap', r::text);
  r := public.guard_action((select admin_id from t_fx), 'audit_manual', null, 0, 1, 'test');
  insert into t_results (name, ok, detail) values ('TEAM CAP: the admin is unaffected', (r ->> 'ok')::boolean, r::text);
  r := public.security_sweep();
  insert into t_results (name, ok, detail) values ('SWEEP: raises the team-cap alert and lists pending alerts',
    (r ->> 'ok')::boolean and exists (select 1 from public.security_events where kind = 'team_spend_cap' and alert_wanted)
    and jsonb_array_length(r -> 'pending') > 0, left(r::text, 300));
end $$;

-- ── The admin is never limited, whatever their spend ──
insert into public.api_usage_log (user_id, function_name, api_type, calls_made, estimated_cost_usd, created_at)
values ((select admin_id from t_fx), 'search-leads', 'text_search', 1, 500, now() - interval '1 minute');
do $$ declare r jsonb; begin
  r := public.guard_action((select admin_id from t_fx), 'lead_search', null, 0, 1, 'test');
  insert into t_results (name, ok, detail) values ('ADMIN: unaffected by per-user caps', (r ->> 'ok')::boolean and r ->> 'state' = 'normal', r::text);
end $$;

-- ── Unknown action = paid; a missing settings row = nothing allowed ──
do $$ declare r jsonb; begin
  update public.protection_settings set mode = 'prospecting_paused' where id = 1;
  r := public.guard_action('cccccccc-0000-4000-8000-00000000000c', 'some_new_paid_thing', null, 0, 1, 'test');
  insert into t_results (name, ok, detail) values ('ABSENT: an unknown action is treated as paid (the pause applies)', r ->> 'reason' = 'paused', r::text);
  update public.protection_settings set mode = 'running' where id = 1;
  r := public.guard_action('dddddddd-0000-4000-8000-00000000000d', 'lead_search', null, 0, 1, 'test');
  insert into t_results (name, ok, detail) values ('ABSENT: no role = refused', not (r ->> 'ok')::boolean and r ->> 'reason' = 'no_role', r::text);
end $$;

-- ── Performance: one guard call, measured ──
do $$ declare t0 timestamptz; i int; ms numeric; begin
  t0 := clock_timestamp();
  for i in 1..20 loop perform public.guard_action('cccccccc-0000-4000-8000-00000000000b', 'enrich', null, 0.035, 1, 'perf'); end loop;
  ms := extract(epoch from clock_timestamp() - t0) * 1000 / 20;
  insert into t_results (name, ok, detail) values ('PERF: one sales guard call under 25 ms', ms < 25, round(ms, 2)::text || ' ms per call');
end $$;

do $$ begin
  raise exception 'RESULTS %', (select json_agg(json_build_object('n', n, 'ok', ok, 'name', name, 'detail', detail) order by n) from t_results);
end $$;
