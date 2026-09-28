-- Dashboard hide/show is per person (2026-09-28). RUN AGAINST THE LIVE DATABASE; ALWAYS ROLLED BACK.
-- Fake users on example.invalid; the last statement raises the results so nothing commits.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';
create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated, anon; grant usage, select on sequence t_results_n_seq to authenticated, anon;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('eeeeeeee-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-dv-a@example.invalid', '{}', '{}', now(), now()),
  ('eeeeeeee-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-dv-b@example.invalid', '{}', '{}', now(), now()),
  ('eeeeeeee-0000-4000-8000-0000000000ad', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-dv-admin@example.invalid', '{}', '{}', now(), now());
insert into public.user_roles (user_id, role) values ('eeeeeeee-0000-4000-8000-00000000000a', 'sales'), ('eeeeeeee-0000-4000-8000-00000000000b', 'sales'), ('eeeeeeee-0000-4000-8000-0000000000ad', 'admin');

-- Sales A hides a campaign
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-00000000000a","role":"authenticated"}', true);
insert into public.user_preferences (user_id, dashboard_hidden) values ('eeeeeeee-0000-4000-8000-00000000000a', '{"campaigns":["barbers-old"],"templates":[]}')
  on conflict (user_id) do update set dashboard_hidden = excluded.dashboard_hidden;
insert into t_results (name, ok) select 'Sales A saves a hidden campaign', count(*) = 1 from public.user_preferences where dashboard_hidden -> 'campaigns' ? 'barbers-old';
do $$ begin
  begin insert into public.user_preferences (user_id, dashboard_hidden) values ('eeeeeeee-0000-4000-8000-00000000000b', '{"campaigns":["x"]}'); insert into t_results (name, ok) values ('A cannot write B''s preferences', false);
  exception when others then insert into t_results (name, ok, detail) values ('A cannot write B''s preferences', true, sqlerrm); end;
end $$;
reset role;

-- Sales B: sees nothing of A's choice, still sees the campaign
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-00000000000b","role":"authenticated"}', true);
insert into t_results (name, ok, detail) select 'Sales B cannot read A''s preferences (so B still sees the campaign)', count(*) = 0, count(*)::text from public.user_preferences;
update public.user_preferences set dashboard_hidden = '{"campaigns":[]}' where user_id = 'eeeeeeee-0000-4000-8000-00000000000a';
reset role;
insert into t_results (name, ok) select 'B''s update of A''s row changed nothing', (dashboard_hidden -> 'campaigns' ? 'barbers-old') from public.user_preferences where user_id = 'eeeeeeee-0000-4000-8000-00000000000a';

-- Admin: independent
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-0000000000ad","role":"authenticated"}', true);
insert into t_results (name, ok, detail) select 'the admin does not read a salesperson''s preferences', count(*) = 0, count(*)::text from public.user_preferences;
insert into public.user_preferences (user_id, dashboard_hidden) values ('eeeeeeee-0000-4000-8000-0000000000ad', '{"templates":["old_barber"]}');
insert into t_results (name, ok) select 'the admin keeps their own, separate choice', count(*) = 1 from public.user_preferences where dashboard_hidden -> 'templates' ? 'old_barber';
reset role;

-- A "reload": a fresh read as A still has the choice
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-00000000000a","role":"authenticated"}', true);
insert into t_results (name, ok) select 'A''s choice survives a reload (read back fresh)', count(*) = 1 from public.user_preferences where dashboard_hidden -> 'campaigns' ? 'barbers-old' and not (dashboard_hidden ? 'templates' and dashboard_hidden -> 'templates' ? 'old_barber');
update public.user_preferences set dashboard_hidden = '{"campaigns":[],"templates":[]}' where user_id = 'eeeeeeee-0000-4000-8000-00000000000a';
insert into t_results (name, ok) select 'Show all (an empty list) is saved', count(*) = 1 from public.user_preferences where jsonb_array_length(dashboard_hidden -> 'campaigns') = 0;
reset role;

set local role anon;
do $$ begin
  begin perform 1 from public.user_preferences limit 1; insert into t_results (name, ok) values ('anon cannot read preferences', false);
  exception when others then insert into t_results (name, ok, detail) values ('anon cannot read preferences', sqlstate = '42501', sqlerrm); end;
end $$;
reset role;

insert into t_results (name, ok) select 'campaigns untouched (nothing deleted)', (select count(*) from public.campaigns) >= 19;

do $$ begin
  raise exception 'RESULTS %', (select json_agg(json_build_object('n', n, 'ok', ok, 'name', name, 'detail', detail) order by n) from t_results);
end $$;
