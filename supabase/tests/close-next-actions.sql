-- Close dashboard items (2026-10-10, lead_close_work). RUN AGAINST THE LIVE DATABASE; ALWAYS ROLLED BACK.
-- The last statement raises an exception carrying the results as JSON, so the transaction can never commit:
-- the fake salespeople (example.invalid) and every change to the three borrowed leads disappear.
-- How to run: see docs/multi-user.md ("Re-running the security tests").
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated, anon; grant usage, select on sequence t_results_n_seq to authenticated, anon;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('eeeeeeee-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-cw-a@example.invalid', '{}', '{}', now(), now()),
  ('eeeeeeee-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-cw-b@example.invalid', '{}', '{}', now(), now());
insert into public.user_roles (user_id, role) values ('eeeeeeee-0000-4000-8000-00000000000a', 'sales'), ('eeeeeeee-0000-4000-8000-00000000000b', 'sales');
insert into public.team_members (user_id, display_name) values ('eeeeeeee-0000-4000-8000-00000000000a', 'CW A'), ('eeeeeeee-0000-4000-8000-00000000000b', 'CW B');

-- Three ordinary prospects, borrowed inside this transaction: two for A (one with a Next Action), one for B.
create temp table t_fx as
  select id, row_number() over (order by created_at desc) as k from public.outreach_leads l
   where l.is_archived is not true and not public.lead_is_client(l.amount_paid, l.status) and coalesce(l.next_action::text, 'none') = 'none'
   order by created_at desc limit 3;
update public.outreach_leads set assigned_to_user_id = 'eeeeeeee-0000-4000-8000-00000000000a' where id in (select id from t_fx where k in (1, 2));
update public.outreach_leads set assigned_to_user_id = 'eeeeeeee-0000-4000-8000-00000000000b' where id = (select id from t_fx where k = 3);
update public.outreach_leads set next_action = 'call', next_action_date = current_date - 1, next_action_note = 'ring them' where id = (select id from t_fx where k = 1);
create temp table t_before as select l.id, l.status, l.is_potential_work, l.campaign_id from public.outreach_leads l where l.id in (select id from t_fx);
create temp table t_admin as select user_id from public.team_members where is_book_owner limit 1;
grant select on t_fx, t_before, t_admin to authenticated, anon;

-- ── A salesperson closes three (bulk): their two, and B's one ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-00000000000a","role":"authenticated"}', true);
create temp table t_r1 as select public.lead_close_work(array(select id from t_fx order by k), 'done') as r;
insert into t_results (name, ok, detail) select 'bulk: A closes their own two', (r ->> 'closed')::int = 2, r::text from t_r1;
insert into t_results (name, ok, detail) select 'A cannot close B''s lead (refused by id)',
  (r -> 'refused') @> jsonb_build_array(jsonb_build_object('lead_id', (select id from t_fx where k = 3), 'error', 'not_your_lead')), r::text from t_r1;
insert into t_results (name, ok, detail) select 'a bad reason is refused', public.lead_close_work(array(select id from t_fx where k = 1), 'zap') ->> 'error' = 'bad_reason', null;
insert into t_results (name, ok, detail) select 'Dead lead must name an existing outcome', public.lead_close_work(array(select id from t_fx where k = 1), 'dead', 'lost') ->> 'error' = 'bad_outcome', null;
reset role;

insert into t_results (name, ok, detail)
select 'closing clears the Next Action', l.next_action::text = 'none' and l.next_action_date is null, l.next_action::text
  from public.outreach_leads l where l.id = (select id from t_fx where k = 1);
insert into t_results (name, ok, detail)
select 'status, star and campaign unchanged (' || b.id || ')',
  l.status is not distinct from b.status and l.is_potential_work is not distinct from b.is_potential_work and l.campaign_id is not distinct from b.campaign_id,
  l.status || ' / ' || coalesce(l.is_potential_work::text, 'null')
  from public.outreach_leads l join t_before b on b.id = l.id;
insert into t_results (name, ok, detail)
select 'who + when stamped on the lead', count(*) = 2, null from public.outreach_leads
 where id in (select id from t_fx where k in (1, 2)) and work_closed_by = 'eeeeeeee-0000-4000-8000-00000000000a' and work_closed_at is not null;
insert into t_results (name, ok, detail)
select 'B''s lead untouched', work_closed_at is null, null from public.outreach_leads where id = (select id from t_fx where k = 3);
insert into t_results (name, ok, detail)
select 'History: one "work_closed" line per closed lead, by A', count(*) = 2, null from public.lead_activity
 where lead_id in (select id from t_fx) and kind = 'work_closed' and actor_user_id = 'eeeeeeee-0000-4000-8000-00000000000a';
insert into t_results (name, ok, detail)
select 'History: the Next Action shows as completed', count(*) = 1, null from public.lead_activity
 where lead_id = (select id from t_fx where k = 1) and kind = 'follow_up_set' and data ->> 'change' = 'completed';

-- ── The owner (admin) can close any lead ──
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select user_id from t_admin), 'role', 'authenticated')::text, true);
insert into t_results (name, ok, detail) select 'the owner can close B''s lead', (r ->> 'closed')::int = 1, r::text
  from (select public.lead_close_work(array(select id from t_fx where k = 3), 'done') as r) x;
reset role;

-- ── Nobody signed in ──
set local role anon;
do $$ begin
  perform public.lead_close_work(array(select id from t_fx where k = 1), 'done');
  insert into t_results (name, ok, detail) values ('anon is refused', false, 'it ran');
exception when others then
  insert into t_results (name, ok, detail) values ('anon is refused', true, sqlerrm);
end $$;
reset role;

do $$ begin
  raise exception 'RESULTS %', (select json_agg(json_build_object('n', n, 'ok', ok, 'name', name, 'detail', detail) order by n) from t_results);
end $$;
