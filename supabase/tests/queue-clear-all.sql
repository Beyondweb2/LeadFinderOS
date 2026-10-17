-- lead_unqueue_all (2026-10-17). RUN AGAINST THE LIVE DATABASE; ALWAYS ROLLED BACK (the last statement raises with the results).
-- Proves: sales clears only THEIR OWN waiting leads; admin clears every waiting lead; each lead returns to previous_status;
-- the count is exact; a lead that is not waiting is untouched; a caller with no role is refused. Fake users are example.invalid.
begin;
create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated; grant usage, select on sequence t_results_n_seq to authenticated;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('cccccccc-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qclear-a@example.invalid', '{}', '{}', now(), now()),
  ('cccccccc-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qclear-b@example.invalid', '{}', '{}', now(), now());
insert into public.user_roles (user_id, role) values ('cccccccc-0000-4000-8000-00000000000a', 'sales'), ('cccccccc-0000-4000-8000-00000000000b', 'sales');
-- four leads: [1] A's queued, [2] B's queued, [3] A's NOT queued, [4] admin's own, queued.
create temp table t_fx as select array(select id from public.outreach_leads where is_archived = false and status = 'not_contacted' and amount_paid is null order by created_at limit 4) as l;
grant select on t_fx to authenticated;
update public.outreach_leads set assigned_to_user_id = 'cccccccc-0000-4000-8000-00000000000a', status = 'queued', previous_status = 'not_contacted', queued_at = now() where id = (select l[1] from t_fx);
update public.outreach_leads set assigned_to_user_id = 'cccccccc-0000-4000-8000-00000000000b', status = 'queued', previous_status = 'not_contacted', queued_at = now() where id = (select l[2] from t_fx);
update public.outreach_leads set assigned_to_user_id = 'cccccccc-0000-4000-8000-00000000000a' where id = (select l[3] from t_fx);
update public.outreach_leads set status = 'queued', previous_status = 'not_contacted', queued_at = now() where id = (select l[4] from t_fx);
insert into t_results (name, ok, detail) select 'fixtures: 4 leads', array_length(l, 1) = 4, array_length(l, 1)::text from t_fx;
create temp table t_r (who text, r jsonb); grant all on t_r to authenticated;

-- ── salesperson A ────────────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-00000000000a', true);
insert into t_r select 'A', public.lead_unqueue_all();
reset role;
insert into t_results (name, ok, detail) select 'A: removed exactly 1 (their own waiting lead)', (r ->> 'removed')::int = 1, r::text from t_r where who = 'A';
insert into t_results (name, ok, detail) select 'A: lead[1] back to previous status, queue stamp cleared', status = 'not_contacted' and queued_at is null and previous_status is null, status from public.outreach_leads where id = (select l[1] from t_fx);
insert into t_results (name, ok, detail) select 'A: B''s waiting lead untouched', status = 'queued', status from public.outreach_leads where id = (select l[2] from t_fx);
insert into t_results (name, ok, detail) select 'A: admin''s waiting lead untouched', status = 'queued', status from public.outreach_leads where id = (select l[4] from t_fx);
insert into t_results (name, ok, detail) select 'A: one history line for the removed lead', count(*) = 1, count(*)::text from public.lead_activity where lead_id = (select l[1] from t_fx) and data ->> 'queue' = 'removed';

-- ── admin ────────────────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.user_roles where role = 'admin' limit 1), 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', (select user_id::text from public.user_roles where role = 'admin' limit 1), true);
set local role authenticated;
insert into t_r select 'ADMIN', public.lead_unqueue_all();
reset role;
insert into t_results (name, ok, detail) select 'ADMIN: no waiting lead left (whole queue cleared)', count(*) = 0, count(*)::text from public.outreach_leads where status = 'queued' and is_archived = false;
insert into t_results (name, ok, detail) select 'ADMIN: count includes B''s and the admin''s own lead (>= 2)', (r ->> 'removed')::int >= 2, r::text from t_r where who = 'ADMIN';
insert into t_results (name, ok, detail) select 'ADMIN: lead[2] and lead[4] restored to previous status', count(*) = 2, count(*)::text from public.outreach_leads where id in ((select l[2] from t_fx), (select l[4] from t_fx)) and status = 'not_contacted' and queued_at is null;

-- ── no role ──────────────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-0000000000ff","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-0000000000ff', true);
set local role authenticated;
do $$ begin
  begin perform public.lead_unqueue_all(); insert into t_results (name, ok, detail) values ('no role refused', false, 'did not raise');
  exception when others then insert into t_results (name, ok, detail) values ('no role refused', sqlerrm = 'no_role', sqlerrm); end;
end $$;
reset role;
do $$ begin
  raise exception 'ROLLBACK_RESULTS %', (select json_agg(json_build_object('name', name, 'ok', ok, 'detail', detail) order by n) from t_results);
end $$;
