-- THE NAME ON YOUR MESSAGES NEEDS PAUL'S APPROVAL (2026-10-27, migration 20261128100000). RUN AGAINST THE LIVE DATABASE;
-- ALWAYS ROLLED BACK (the last statement raises the results). One FAKE salesperson on example.invalid; nothing is sent.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated, anon; grant usage, select on sequence t_results_n_seq to authenticated, anon;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('eeeeeeee-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-mna-r@example.invalid', '{}', '{}', now(), now());
insert into public.user_roles (user_id, role) values ('eeeeeeee-0000-4000-8000-0000000000c1', 'sales');
insert into public.team_members (user_id, display_name) values ('eeeeeeee-0000-4000-8000-0000000000c1', 'QA Name Rep');
-- As the service (no signed-in user): an existing approved name, written as before.
insert into public.profiles (user_id, message_name, message_name_set_at) values ('eeeeeeee-0000-4000-8000-0000000000c1', 'Sam', now())
  on conflict (user_id) do update set message_name = 'Sam', message_name_set_at = now();
insert into t_results (name, ok, detail) select 'the service writes a name directly (setup)', message_name = 'Sam', message_name from public.profiles where user_id = 'eeeeeeee-0000-4000-8000-0000000000c1';

-- ── the salesperson ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
update public.profiles set message_name = 'Paul', message_name_set_at = now() where user_id = 'eeeeeeee-0000-4000-8000-0000000000c1';
insert into t_results (name, ok, detail) select 'a rep writing message_name directly: kept "Sam", "Paul" waits',
  message_name = 'Sam' and message_name_pending = 'Paul' and message_name_pending_at is not null, coalesce(message_name, '-') || ' / ' || coalesce(message_name_pending, '-')
  from public.profiles where user_id = 'eeeeeeee-0000-4000-8000-0000000000c1';
update public.profiles set message_name_pending = 'Sammy', message_name_pending_at = now() where user_id = 'eeeeeeee-0000-4000-8000-0000000000c1';
insert into t_results (name, ok, detail) select 'the name box writes the waiting name', message_name = 'Sam' and message_name_pending = 'Sammy', message_name_pending
  from public.profiles where user_id = 'eeeeeeee-0000-4000-8000-0000000000c1';
update public.profiles set message_name_set_at = now() - interval '1 day' where user_id = 'eeeeeeee-0000-4000-8000-0000000000c1';
do $$ begin
  perform public.review_message_name('eeeeeeee-0000-4000-8000-0000000000c1', true);
  insert into t_results (name, ok, detail) values ('a rep cannot approve their own name', false, 'ALLOWED');
exception when others then insert into t_results (name, ok, detail) values ('a rep cannot approve their own name', sqlstate = '42501', sqlerrm);
end $$;
insert into t_results (name, ok, detail) select 'still "Sam" on messages until Paul approves', message_name = 'Sam', message_name
  from public.profiles where user_id = 'eeeeeeee-0000-4000-8000-0000000000c1';

-- ── the admin ──
reset role;
insert into t_results (name, ok, detail) values ('anon cannot run the review', not has_function_privilege('anon', 'public.review_message_name(uuid,boolean)', 'execute'), null);
-- (the book owner is read BEFORE the role switch: as the salesperson, team_members shows only their own row)
select set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.team_members where is_book_owner limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare r jsonb; begin
  insert into t_results (name, ok, detail) values ('the admin sees it waiting',
    exists (select 1 from public.profiles where user_id = 'eeeeeeee-0000-4000-8000-0000000000c1' and message_name_pending = 'Sammy'), null);
  r := public.review_message_name('eeeeeeee-0000-4000-8000-0000000000c1', true);
  insert into t_results (name, ok, detail) select 'approve: "Sammy" becomes the name, nothing waiting',
    (r ->> 'ok')::boolean and message_name = 'Sammy' and message_name_pending is null, r::text
    from public.profiles where user_id = 'eeeeeeee-0000-4000-8000-0000000000c1';
  r := public.review_message_name('eeeeeeee-0000-4000-8000-0000000000c1', true);
  insert into t_results (name, ok, detail) values ('approving again: nothing waiting', r ->> 'error' = 'nothing_waiting', r::text);
end $$;
-- reject
reset role;
update public.profiles set message_name_pending = 'Paul', message_name_pending_at = now() where user_id = 'eeeeeeee-0000-4000-8000-0000000000c1';
set local role authenticated;
do $$ declare r jsonb; begin
  r := public.review_message_name('eeeeeeee-0000-4000-8000-0000000000c1', false);
  insert into t_results (name, ok, detail) select 'reject: the waiting name is dropped, "Sammy" stays',
    (r ->> 'ok')::boolean and message_name = 'Sammy' and message_name_pending is null, r::text
    from public.profiles where user_id = 'eeeeeeee-0000-4000-8000-0000000000c1';
end $$;
-- the admin's own name still changes at once
do $$ declare v_admin uuid := (select user_id from public.team_members where is_book_owner limit 1); v_old text; begin
  select message_name into v_old from public.profiles where user_id = v_admin;
  update public.profiles set message_name = 'QA Admin Name' where user_id = v_admin;
  insert into t_results (name, ok, detail) select 'the admin''s own name changes at once', message_name = 'QA Admin Name' and message_name_pending is null, message_name
    from public.profiles where user_id = v_admin;
end $$;

reset role;
do $$ begin
  raise exception 'RESULTS %', (select json_agg(json_build_object('n', n, 'ok', ok, 'name', name, 'detail', detail) order by n) from t_results);
end $$;
rollback;
