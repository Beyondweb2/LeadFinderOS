-- Paid-client page records are admin-only to WRITE (2026-09-28, migration 20260928240000). RUN AGAINST
-- THE LIVE DATABASE; ALWAYS ROLLED BACK — the last statement raises the results as JSON, so nothing
-- commits (fake users on example.invalid; one real lead borrowed and changed only inside this transaction).
begin;
create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated, anon; grant usage, select on sequence t_results_n_seq to authenticated, anon;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('ffffffff-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-cta-a@example.invalid', '{}', '{}', now(), now());
insert into public.user_roles (user_id, role) values ('ffffffff-0000-4000-8000-00000000000a', 'sales');
insert into public.team_members (user_id, display_name) values ('ffffffff-0000-4000-8000-00000000000a', 'CTA A');

create temp table t_fx as select
  (select id from public.outreach_leads l where l.assigned_to_user_id is null and l.is_archived is not true and l.status = 'not_contacted'
     and not public.lead_is_client(l.amount_paid, l.status) and public.lead_contact_attempt_at(l.id) is null order by created_at limit 1) as own_lead,
  (select id from public.outreach_leads where public.lead_is_client(amount_paid, status) order by created_at limit 1) as client_lead,
  (select id from public.outreach_leads where assigned_to_user_id = (select user_id from public.team_members where is_book_owner limit 1) order by created_at limit 1) as paul_lead,
  (select user_id from public.team_members where is_book_owner limit 1) as admin_id,
  (select id from public.client_pages order by created_at limit 1) as real_page;
grant select on t_fx to authenticated, anon;
update public.outreach_leads set assigned_to_user_id = 'ffffffff-0000-4000-8000-00000000000a', assigned_at = now() where id = (select own_lead from t_fx);
insert into t_results (name, ok, detail) select 'fixtures: own lead, a client, Paul''s lead, the admin, a real page',
  own_lead is not null and client_lead is not null and paul_lead is not null and admin_id is not null and real_page is not null, null from t_fx;
insert into t_results (name, ok, detail) select 'restrictive admin-only policy present: ' || t || ' ' || c,
  exists (select 1 from pg_policies where tablename = t and permissive = 'RESTRICTIVE' and cmd = c), null
  from unnest(array['client_pages', 'client_page_questions', 'client_listings']) t, unnest(array['INSERT', 'UPDATE', 'DELETE']) c;

-- ── as Sales A ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ffffffff-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'ffffffff-0000-4000-8000-00000000000a', true);
do $$ declare n int; r jsonb; begin
  begin
    insert into public.client_pages (user_id, lead_id, page_type, status) values ('ffffffff-0000-4000-8000-00000000000a', (select own_lead from t_fx), 'qa', 'planned');
    insert into t_results (name, ok) values ('Sales cannot create a page record against its OWN lead', false);
  exception when others then insert into t_results (name, ok, detail) values ('Sales cannot create a page record against its OWN lead', sqlstate = '42501', sqlerrm); end;
  begin
    insert into public.client_pages (user_id, lead_id, page_type, status) values ('ffffffff-0000-4000-8000-00000000000a', (select client_lead from t_fx), 'service', 'live');
    insert into t_results (name, ok) values ('Sales cannot create a page record against a paying CLIENT', false);
  exception when others then insert into t_results (name, ok, detail) values ('Sales cannot create a page record against a paying CLIENT', sqlstate = '42501', sqlerrm); end;
  begin
    insert into public.client_pages (user_id, lead_id, page_type, status) values ('ffffffff-0000-4000-8000-00000000000a', (select paul_lead from t_fx), 'qa', 'planned');
    insert into t_results (name, ok) values ('Sales cannot create a page record against Paul''s lead', false);
  exception when others then insert into t_results (name, ok, detail) values ('Sales cannot create a page record against Paul''s lead', sqlstate = '42501', sqlerrm); end;
  begin
    insert into public.client_pages (user_id, page_type) values ('ffffffff-0000-4000-8000-00000000000a', 'qa');
    insert into t_results (name, ok) values ('Sales cannot create a page record with no lead at all', false);
  exception when others then insert into t_results (name, ok, detail) values ('Sales cannot create a page record with no lead at all', sqlstate = '42501', sqlerrm); end;
  begin
    insert into public.client_page_questions (page_id, question_text) values ((select real_page from t_fx), 'cta injected question');
    insert into t_results (name, ok) values ('Sales cannot add a question to a real client page', false);
  exception when others then insert into t_results (name, ok, detail) values ('Sales cannot add a question to a real client page', sqlstate = '42501', sqlerrm); end;
  begin
    insert into public.client_listings (user_id, host, lead_id) values ('ffffffff-0000-4000-8000-00000000000a', 'example.invalid', (select own_lead from t_fx));
    insert into t_results (name, ok) values ('Sales cannot create a client listing', false);
  exception when others then insert into t_results (name, ok, detail) values ('Sales cannot create a client listing', sqlstate = '42501', sqlerrm); end;
  update public.client_pages set status = 'removed' where id = (select real_page from t_fx);
  get diagnostics n = row_count;
  insert into t_results (name, ok, detail) values ('Sales cannot change a real client page', n = 0, n::text);
  delete from public.client_pages where id = (select real_page from t_fx);
  get diagnostics n = row_count;
  insert into t_results (name, ok, detail) values ('Sales cannot delete a real client page', n = 0, n::text);
  update public.client_page_questions set question_text = 'x' where page_id = (select real_page from t_fx);
  get diagnostics n = row_count;
  insert into t_results (name, ok, detail) values ('Sales cannot change a client page''s questions', n = 0, n::text);
  update public.outreach_leads set amount_paid = 99 where id = (select own_lead from t_fx);
  get diagnostics n = row_count;
  insert into t_results (name, ok, detail) values ('Sales cannot mark its own lead paid directly', n = 0, n::text);
  insert into t_results (name, ok, detail) values ('Sales reads no client page', (select count(*) from public.client_pages) = 0, null);
  -- the legitimate Sales path: close it as won, the admin onboards
  r := public.lead_set_stage((select own_lead from t_fx), 'won_pending_onboarding');
  insert into t_results (name, ok, detail) values ('Sales still marks its own lead Won (awaiting onboarding)', (r ->> 'ok')::boolean, r::text);
end $$;
reset role;

-- ── the server's payment path (stripe-webhook runs on the service role; RLS does not apply) ──
update public.outreach_leads set amount_paid = 99, status = 'payment_received', payment_date = now() where id = (select own_lead from t_fx);
insert into t_results (name, ok, detail) values ('payment path: the lead becomes a paying client (isPaidLead / lead_is_client)',
  (select public.lead_is_client(amount_paid, status) from public.outreach_leads where id = (select own_lead from t_fx)), null);
insert into public.client_pages (user_id, lead_id, page_type, status) values ((select admin_id from t_fx), (select own_lead from t_fx), 'qa', 'planned');
insert into t_results (name, ok, detail) values ('server (service role / page-generator) still writes page records', exists (select 1 from public.client_pages where lead_id = (select own_lead from t_fx)), null);

-- ── as Sales A again: the paid lead has left their workable set ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ffffffff-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'ffffffff-0000-4000-8000-00000000000a', true);
do $$ begin
  insert into t_results (name, ok, detail) values ('after payment the client leaves the salesperson''s view', not exists (select 1 from public.sales_leads where id = (select own_lead from t_fx)), null);
end $$;
reset role;

-- ── as the admin: every write still allowed ──
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from t_fx), 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', (select admin_id::text from t_fx), true);
do $$ declare n int; v uuid; begin
  insert into public.client_pages (user_id, lead_id, page_type, status) values ((select admin_id from t_fx), (select client_lead from t_fx), 'qa', 'planned') returning id into v;
  insert into t_results (name, ok, detail) values ('admin creates a page record', v is not null, null);
  insert into public.client_page_questions (page_id, question_text) values (v, 'cta admin question');
  insert into t_results (name, ok, detail) values ('admin adds a question', exists (select 1 from public.client_page_questions where page_id = v), null);
  update public.client_pages set status = 'live', updated_at = now() where id = v;
  get diagnostics n = row_count;
  insert into t_results (name, ok, detail) values ('admin marks a page built (setPageBuilt)', n = 1, n::text);
  update public.client_pages set updated_at = now() where id = (select real_page from t_fx);
  get diagnostics n = row_count;
  insert into t_results (name, ok, detail) values ('admin updates a real page', n = 1, n::text);
  insert into public.client_listings (user_id, host, lead_id) values ((select admin_id from t_fx), 'example.invalid', (select client_lead from t_fx));
  insert into t_results (name, ok, detail) values ('admin creates a client listing', exists (select 1 from public.client_listings where host = 'example.invalid'), null);
  delete from public.client_pages where id = v;
  get diagnostics n = row_count;
  insert into t_results (name, ok, detail) values ('admin deletes a page record', n = 1, n::text);
  insert into t_results (name, ok, detail) values ('admin still reads every page', (select count(*) from public.client_pages) > 0, null);
end $$;
reset role;

do $$ begin
  raise exception 'RESULTS %', (select json_agg(json_build_object('n', n, 'ok', ok, 'name', name, 'detail', detail) order by n) from t_results);
end $$;
