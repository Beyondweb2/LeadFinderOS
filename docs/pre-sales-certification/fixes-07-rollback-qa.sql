-- WS-7 (fix/07-sales-bulk-audit) rolled-back live QA, 2026-10-04. Applies the WS-7 migration INSIDE a DO
-- block that always ends in RAISE, so everything — the two tables, the policies, the grants, the new
-- protection_settings action, the fixture leads, batches, items, guard rows, the mode flip — is rolled back.
-- Results come back in the error message (QA_RESULT {...}). The runner replaces the @@DDL@@ line with the
-- migration's statements (its `set local lock_timeout` line dropped). QA accounts only: "Test" (rep A) and
-- "test1" (rep B), both sales; Paul's data account owns the fixture leads. No secrets in this file.
do $qa$
declare
  paul uuid := '9d5a7629-3171-4091-b3a4-43010a1d424d';
  rep_a uuid := '262c1d64-05ad-42e8-a81b-7d25553aeff3';
  rep_b uuid := 'c6e21a37-e342-4b99-9cf6-0489cb9af775';
  la uuid := gen_random_uuid(); lb uuid := gen_random_uuid();
  ba uuid := gen_random_uuid(); bb uuid := gen_random_uuid();
  before_limits jsonb;
  g jsonb;
  r jsonb := '{}'::jsonb;
begin
  select limits into before_limits from public.protection_settings where id = 1;

  -- @@DDL@@

  -- ── the action reached the live row, nothing else moved ─────────────────────────────────────────
  r := r || jsonb_build_object(
    'action_added', (select limits -> 'actions' -> 'sales_check' from public.protection_settings where id = 1),
    'other_limits_unchanged', (select (limits #- '{actions,sales_check}') = before_limits from public.protection_settings where id = 1));

  -- ── fixtures (service side) ────────────────────────────────────────────────────────────────────
  insert into public.outreach_leads (id, user_id, business_name, phone, assigned_to_user_id, status) values
    (la, paul, 'ZZ WS7 rollback A', '07700 900621', rep_a, 'not_contacted'),
    (lb, paul, 'ZZ WS7 rollback B', '07700 900622', rep_b, 'not_contacted');
  insert into public.sales_check_batches (id, actor_user_id, client_request_id, status, total) values
    (ba, rep_a, 'qa-ws7-a-0001', 'active', 2), (bb, rep_b, 'qa-ws7-b-0001', 'active', 1);
  insert into public.sales_check_items (batch_id, actor_user_id, lead_id, status) values
    (ba, rep_a, la, 'queued'), (bb, rep_b, lb, 'queued');
  -- an id that is not a lead is accepted as an item (it is answered "not yours", never fails the batch)
  insert into public.sales_check_items (batch_id, actor_user_id, lead_id, status, reason) values (ba, rep_a, gen_random_uuid(), 'skipped', 'not_yours');
  insert into public.lead_activity (lead_id, actor_user_id, kind, data) values (la, rep_a, 'audit_run', '{"source":"sales_check"}');
  r := r || '{"activity_kind_ok": true}'::jsonb;

  -- ── the dedupe is the database's ─────────────────────────────────────────────────────────────────
  begin insert into public.sales_check_batches (actor_user_id, client_request_id, status, total) values (rep_a, 'qa-ws7-a-0002', 'active', 1);
        r := r || '{"second_active_batch":"INSERTED"}'::jsonb;
  exception when unique_violation then r := r || '{"second_active_batch":"refused"}'::jsonb; end;
  begin insert into public.sales_check_batches (actor_user_id, client_request_id, status, total) values (rep_a, 'qa-ws7-a-0001', 'waiting', 1);
        r := r || '{"same_request_id":"INSERTED"}'::jsonb;
  exception when unique_violation then r := r || '{"same_request_id":"refused"}'::jsonb; end;
  begin insert into public.sales_check_batches (actor_user_id, client_request_id, status, total) values (rep_a, 'qa-ws7-a-0003', 'waiting', 1);
        r := r || '{"waiting_beside_active":"allowed"}'::jsonb;
  exception when others then r := r || jsonb_build_object('waiting_beside_active', sqlerrm); end;
  begin insert into public.sales_check_items (batch_id, actor_user_id, lead_id) values (ba, rep_a, la);
        r := r || '{"same_lead_twice":"INSERTED"}'::jsonb;
  exception when unique_violation then r := r || '{"same_lead_twice":"refused"}'::jsonb; end;
  begin insert into public.sales_check_items (batch_id, actor_user_id, lead_id, status) values (ba, rep_a, lb, 'sent');
        r := r || '{"bad_item_status":"INSERTED"}'::jsonb;
  exception when check_violation then r := r || '{"bad_item_status":"refused"}'::jsonb; end;
  begin insert into public.sales_check_batches (actor_user_id, client_request_id, status, total) values (rep_b, 'x', 'finished', 1);
        r := r || '{"bad_request_id":"INSERTED"}'::jsonb;
  exception when check_violation then r := r || '{"bad_request_id":"refused"}'::jsonb; end;

  -- ── grants ───────────────────────────────────────────────────────────────────────────────────────
  r := r || jsonb_build_object(
    'auth_select', has_table_privilege('authenticated', 'public.sales_check_items', 'SELECT'),
    'auth_insert', has_table_privilege('authenticated', 'public.sales_check_items', 'INSERT'),
    'auth_update', has_table_privilege('authenticated', 'public.sales_check_items', 'UPDATE'),
    'auth_delete', has_table_privilege('authenticated', 'public.sales_check_batches', 'DELETE'),
    'anon_select', has_table_privilege('anon', 'public.sales_check_batches', 'SELECT'),
    'service_all', has_table_privilege('service_role', 'public.sales_check_items', 'INSERT'),
    'policies', (select jsonb_agg(tablename || ':' || policyname || ':' || cmd order by tablename) from pg_policies where tablename in ('sales_check_batches', 'sales_check_items')));

  -- ── as rep A ────────────────────────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', rep_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object(
    'repA_batches', (select count(*) from public.sales_check_batches),
    'repA_items', (select count(*) from public.sales_check_items),
    'repA_sees_repB', (select count(*) from public.sales_check_items where actor_user_id = rep_b));
  begin insert into public.sales_check_items (batch_id, actor_user_id, lead_id) values (ba, rep_a, lb);
        r := r || '{"repA_insert":"INSERTED"}'::jsonb;
  exception when insufficient_privilege then r := r || '{"repA_insert":"refused"}'::jsonb; end;
  begin update public.sales_check_items set status = 'done' where batch_id = ba;
        r := r || '{"repA_update":"UPDATED"}'::jsonb;
  exception when insufficient_privilege then r := r || '{"repA_update":"refused"}'::jsonb; end;
  execute 'reset role';

  -- ── as rep B ────────────────────────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', rep_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object(
    'repB_batches', (select count(*) from public.sales_check_batches),
    'repB_sees_repA', (select count(*) from public.sales_check_items where actor_user_id = rep_a));
  execute 'reset role';

  -- ── as the admin ────────────────────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', paul, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object('admin_items', (select count(*) from public.sales_check_items));
  execute 'reset role';

  -- ── anon ─────────────────────────────────────────────────────────────────────────────────────────
  execute 'set local role anon';
  begin perform count(*) from public.sales_check_batches; r := r || '{"anon_read":"READ"}'::jsonb;
  exception when insufficient_privilege then r := r || '{"anon_read":"refused"}'::jsonb; end;
  execute 'reset role';

  -- ── the live guard with the new action: one row per fresh check, the per-day allowance enforced ─
  g := public.guard_action(rep_a, 'sales_check', la, 0.0331, 1, 'sales-prospect-check');
  r := r || jsonb_build_object('guard_first', g ->> 'ok', 'guard_row',
    (select jsonb_build_object('action', action, 'actor_role', actor_role, 'est', estimated_cost_usd, 'outcome', outcome)
       from public.api_usage_log where user_id = rep_a and action = 'sales_check' order by created_at desc limit 1));
  insert into public.api_usage_log (user_id, function_name, api_type, calls_made, cache_hit, estimated_cost_usd, trigger_source, action, actor_role, outcome)
    select rep_a, 'sales-prospect-check', 'guard', 1, false, 0.0331, 'guard', 'sales_check', 'sales', 'allowed'
      from generate_series(1, ((select (limits -> 'actions' -> 'sales_check' ->> 'per_day')::int from public.protection_settings where id = 1)
                               - (select count(*)::int from public.api_usage_log where user_id = rep_a and action = 'sales_check' and outcome in ('allowed', 'warned') and created_at > now() - interval '24 hours')));
  g := public.guard_action(rep_a, 'sales_check', la, 0.0331, 1, 'sales-prospect-check');
  r := r || jsonb_build_object('guard_over_allowance', g ->> 'reason');
  g := public.guard_action(rep_b, 'sales_check', lb, 0.0331, 1, 'sales-prospect-check');
  r := r || jsonb_build_object('guard_other_rep', g ->> 'ok');
  update public.protection_settings set mode = 'prospecting_paused' where id = 1;
  g := public.guard_action(rep_b, 'sales_check', lb, 0.0331, 1, 'sales-prospect-check');
  r := r || jsonb_build_object('guard_when_paused', g ->> 'reason');

  raise exception 'QA_RESULT %', r;
end
$qa$;
