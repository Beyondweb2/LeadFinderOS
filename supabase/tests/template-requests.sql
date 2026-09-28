-- Template requests (2026-09-28): who can write and read them. RUN AGAINST THE LIVE DATABASE; ALWAYS
-- ROLLED BACK (the last statement raises the results). Fake users on example.invalid.
begin;
create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated, anon; grant usage, select on sequence t_results_n_seq to authenticated, anon;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('eeeeeeee-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-tr-a@example.invalid', '{}', '{}', now(), now()),
  ('eeeeeeee-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-tr-b@example.invalid', '{}', '{}', now(), now());
insert into public.user_roles (user_id, role) values ('eeeeeeee-0000-4000-8000-00000000000a', 'sales'), ('eeeeeeee-0000-4000-8000-00000000000b', 'sales');
insert into public.team_members (user_id, display_name) values ('eeeeeeee-0000-4000-8000-00000000000a', 'TR A'), ('eeeeeeee-0000-4000-8000-00000000000b', 'TR B');
-- What the edge function writes (as the service role): one request each for A and B.
insert into public.template_requests (id, requested_by, requester_name, message_text, use_case, why_not_existing, source) values
  ('eeeeeeee-0000-4000-8000-0000000000a1', 'eeeeeeee-0000-4000-8000-00000000000a', 'TR A', E'Hi [name],\n\nexact  wording 👋', 'after a call', 'no warm template', 'queue'),
  ('eeeeeeee-0000-4000-8000-0000000000b1', 'eeeeeeee-0000-4000-8000-00000000000b', 'TR B', 'B''s wording', 'x', 'y', 'inbox');
insert into t_results (name, ok, detail) values ('stored exactly as written (newlines, double space, emoji)',
  (select message_text from public.template_requests where id = 'eeeeeeee-0000-4000-8000-0000000000a1') = E'Hi [name],\n\nexact  wording 👋', null);
insert into t_results (name, ok, detail) values ('a new request starts as email pending', (select email_status from public.template_requests where id = 'eeeeeeee-0000-4000-8000-0000000000a1') = 'pending', null);
do $$ begin
  insert into public.template_requests (requested_by, message_text, use_case, why_not_existing) values ('eeeeeeee-0000-4000-8000-00000000000a', repeat('x', 1025), 'u', 'w');
  insert into t_results (name, ok) values ('over 1,024 characters refused by the table', false);
exception when check_violation then insert into t_results (name, ok) values ('over 1,024 characters refused by the table', true); end $$;
insert into t_results (name, ok, detail) values ('anon holds no privilege on the table',
  not has_table_privilege('anon', 'public.template_requests', 'select') and not has_table_privilege('anon', 'public.template_requests', 'insert'), null);

create temp table t_fx as select (select user_id from public.team_members where is_book_owner limit 1) as admin_id;
grant select on t_fx to authenticated;

-- ── as Sales A ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-4000-8000-00000000000a', true);
do $$ declare n int; begin
  insert into t_results (name, ok, detail) values ('Sales reads its OWN request', exists (select 1 from public.template_requests where id = 'eeeeeeee-0000-4000-8000-0000000000a1'), null);
  insert into t_results (name, ok, detail) values ('Sales cannot read another person''s request', not exists (select 1 from public.template_requests where id = 'eeeeeeee-0000-4000-8000-0000000000b1'), null);
  begin
    insert into public.template_requests (requested_by, message_text, use_case, why_not_existing) values ('eeeeeeee-0000-4000-8000-00000000000a', 'direct', 'u', 'w');
    insert into t_results (name, ok) values ('Sales cannot write the table directly (only the function saves requests)', false);
  exception when others then insert into t_results (name, ok, detail) values ('Sales cannot write the table directly (only the function saves requests)', sqlstate = '42501', sqlerrm); end;
  update public.template_requests set message_text = 'edited' where id = 'eeeeeeee-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count;
  insert into t_results (name, ok, detail) values ('Sales cannot edit even its own request', n = 0, n::text);
  delete from public.template_requests where id = 'eeeeeeee-0000-4000-8000-0000000000b1';
  get diagnostics n = row_count;
  insert into t_results (name, ok, detail) values ('Sales cannot delete a request', n = 0, n::text);
end $$;
reset role;

-- ── as the admin ──
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from t_fx), 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', (select admin_id::text from t_fx), true);
do $$ begin
  insert into t_results (name, ok, detail) values ('the admin reads every request', (select count(*) from public.template_requests where id::text like 'eeeeeeee-%') = 2, null);
end $$;
reset role;

do $$ begin
  raise exception 'RESULTS %', (select json_agg(json_build_object('n', n, 'ok', ok, 'name', name, 'detail', detail) order by n) from t_results);
end $$;
