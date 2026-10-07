-- TEAM TEMPLATES — rolled-back RLS proof (2026-10-07). Run through the Management API as ONE statement (a DO block ending in
-- RAISE EXCEPTION, so nothing persists; the API ignores BEGIN/ROLLBACK). Read the report from the error text.
do $$
declare
  admin_id uuid := '9d5a7629-3171-4091-b3a4-43010a1d424d';
  a uuid := 'ce25c3d1-2d45-4782-aaa1-98bbd8043786';  -- a salesperson
  b uuid := '262c1d64-05ad-42e8-a81b-7d25553aeff3';  -- a second one (given the sales role inside this rolled-back block only)
  t uuid; p uuid; pb uuid; n int; r text := ''; c text;
begin
  insert into public.user_roles (user_id, role) values (b, 'sales') on conflict do nothing;
  -- admin creates a TEAM template
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true); set local role authenticated;
  insert into public.templates (user_id, template_type, category, title, content, scope) values (admin_id, 'text', 'initial', 'T team opener', 'Hi {{business_name}}', 'team') returning id into t;
  r := r || E'PASS admin creates a team template\n';
  reset role;
  -- both salespeople see it, cannot edit or delete it, cannot create a team row
  foreach c in array array[a::text, b::text] loop
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true); set local role authenticated;
    select count(*) into n from public.templates where id = t;
    r := r || case when n = 1 then 'PASS' else 'FAIL' end || ' salesperson ' || left(c, 8) || E' sees the team template\n';
    update public.templates set content = 'HACKED' where id = t; get diagnostics n = row_count;
    r := r || case when n = 0 then 'PASS' else 'FAIL' end || ' salesperson ' || left(c, 8) || E' cannot edit the team template\n';
    delete from public.templates where id = t; get diagnostics n = row_count;
    r := r || case when n = 0 then 'PASS' else 'FAIL' end || ' salesperson ' || left(c, 8) || E' cannot delete the team template\n';
    begin
      insert into public.templates (user_id, template_type, category, title, content, scope) values (c::uuid, 'text', 'other', 'sneaky', 'x', 'team');
      r := r || E'FAIL salesperson created a team template\n';
    exception when insufficient_privilege or check_violation then r := r || E'PASS salesperson cannot create a team template\n'; end;
    reset role;
  end loop;
  -- A makes a personal one, duplicates the team one, edits the copy
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); set local role authenticated;
  insert into public.templates (user_id, template_type, category, title, content, scope) values (a, 'text', 'other', 'A mine', 'mine', 'personal') returning id into p;
  insert into public.templates (user_id, template_type, category, title, content, scope) select a, template_type, category, title || ' (my copy)', content, 'personal' from public.templates where id = t returning id into pb;
  r := r || E'PASS salesperson duplicates a team template into My templates\n';
  update public.templates set content = 'edited copy' where id = pb; get diagnostics n = row_count;
  r := r || case when n = 1 then 'PASS' else 'FAIL' end || E' salesperson edits their own copy\n';
  select content into c from public.templates where id = t;
  r := r || case when c = 'Hi {{business_name}}' then 'PASS' else 'FAIL' end || E' the team master is unchanged by the copy and its edit\n';
  begin
    update public.templates set scope = 'team' where id = p;
    r := r || E'FAIL salesperson promoted their own row to team\n';
  exception when insufficient_privilege or check_violation then r := r || E'PASS salesperson cannot promote their row to team\n'; end;
  reset role;
  -- B cannot see or touch A's personal rows
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true); set local role authenticated;
  select count(*) into n from public.templates where id in (p, pb);
  r := r || case when n = 0 then 'PASS' else 'FAIL' end || E' salesperson B cannot see salesperson A personal templates\n';
  update public.templates set content = 'B was here' where id = p; get diagnostics n = row_count;
  r := r || case when n = 0 then 'PASS' else 'FAIL' end || E' salesperson B cannot edit A personal template\n';
  reset role;
  -- admin edits the master: both see the change
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true); set local role authenticated;
  update public.templates set content = 'Hi {{business_name}} - updated' where id = t; get diagnostics n = row_count;
  r := r || case when n = 1 then 'PASS' else 'FAIL' end || E' admin edits the team template\n';
  select count(*) into n from public.templates where id in (p, pb);
  r := r || case when n = 0 then 'PASS' else 'FAIL' end || E' admin does not read salespeople personal templates\n';
  reset role;
  foreach c in array array[a::text, b::text] loop
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true); set local role authenticated;
    select count(*) into n from public.templates where id = t and content like '%updated';
    r := r || case when n = 1 then 'PASS' else 'FAIL' end || ' salesperson ' || left(c, 8) || E' sees the admin edit immediately\n';
    reset role;
  end loop;
  -- archive: salespeople stop seeing it, admin still does, a copy stays with its owner
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true); set local role authenticated;
  update public.templates set archived_at = now() where id = t;
  select count(*) into n from public.templates where id = t;
  r := r || case when n = 1 then 'PASS' else 'FAIL' end || E' admin still sees an archived team template\n';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); set local role authenticated;
  select count(*) into n from public.templates where id = t;
  r := r || case when n = 0 then 'PASS' else 'FAIL' end || E' an archived team template disappears for salespeople\n';
  select count(*) into n from public.templates where id = pb;
  r := r || case when n = 1 then 'PASS' else 'FAIL' end || E' but the copy a salesperson made is still theirs\n';
  reset role;
  -- the admin existing personal rows are still his
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true); set local role authenticated;
  select count(*) into n from public.templates where user_id = admin_id and scope = 'personal' and is_default;
  r := r || case when n >= 1 then 'PASS' else 'FAIL' end || E' the admin existing personal templates are untouched\n';
  reset role;
  raise exception E'\nTEAM TEMPLATES RLS REPORT\n%', r;
end $$;
