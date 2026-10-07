-- THE SEEDED TEAM LIBRARY — rolled-back permission proof on the LIVE rows (2026-10-07). One DO block ending in RAISE EXCEPTION (nothing persists).
do $$
declare
  admin_id uuid := '9d5a7629-3171-4091-b3a4-43010a1d424d';
  a uuid := 'ce25c3d1-2d45-4782-aaa1-98bbd8043786';  -- a salesperson
  n int; m int; r text := ''; t uuid; before_content text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); set local role authenticated;
  select count(*) into n from public.templates where scope = 'team' and archived_at is null;
  r := r || case when n = 8 then 'PASS' else 'FAIL' end || ' salesperson sees exactly 8 Team templates (' || n || E')\n';
  select count(*) into n from public.templates where user_id = admin_id and scope = 'personal';
  r := r || case when n = 0 then 'PASS' else 'FAIL' end || E' salesperson sees none of the admin personal (old barber) templates\n';
  select id, content into t, before_content from public.templates where seed_key = 'findable_sales_audit_reply';
  update public.templates set content = 'HACKED' where scope = 'team'; get diagnostics n = row_count;
  r := r || case when n = 0 then 'PASS' else 'FAIL' end || E' salesperson cannot edit any Team master\n';
  delete from public.templates where scope = 'team'; get diagnostics n = row_count;
  r := r || case when n = 0 then 'PASS' else 'FAIL' end || E' salesperson cannot delete any Team master\n';
  insert into public.templates (user_id, template_type, category, title, content, scope) select a, template_type, category, title || ' (my copy)', content, 'personal' from public.templates where id = t;
  get diagnostics n = row_count;
  r := r || case when n = 1 then 'PASS' else 'FAIL' end || E' salesperson saves a personal copy\n';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true); set local role authenticated;
  select count(*) into n from public.templates where scope = 'team';
  select count(*) into m from public.templates where scope = 'personal' and user_id = admin_id;
  r := r || case when n = 8 and m >= 10 then 'PASS' else 'FAIL' end || ' admin sees the 8 Team templates (' || n || ') and his own personal ones (' || m || E')\n';
  update public.templates set content = before_content || ' (edited)' where id = t; get diagnostics n = row_count;
  r := r || case when n = 1 then 'PASS' else 'FAIL' end || E' admin can edit a Team master\n';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); set local role authenticated;
  select count(*) into n from public.templates where id = t and content = before_content || ' (edited)';
  r := r || case when n = 1 then 'PASS' else 'FAIL' end || E' the salesperson sees the admin edit at once\n';
  reset role;
  select count(*) into n from public.templates where scope = 'personal' and title ilike '%barber%' and seed_key is null;
  r := r || case when n >= 1 then 'PASS' else 'FAIL' end || E' the old barber template is still personal\n';
  raise exception E'\nSEEDED TEAM LIBRARY REPORT\n%', r;
end $$;
