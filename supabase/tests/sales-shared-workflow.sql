-- Shared Outreach + Inbox security tests (2026-09-27). RUN AGAINST THE LIVE DATABASE; ALWAYS ROLLED BACK.
-- The last statement raises an exception carrying the results as JSON, so the transaction can never
-- commit: every fixture (fake auth users on example.invalid, roles, claims, edits) disappears.
-- How to run: see docs/multi-user.md ("Re-running the security tests").
begin;
create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated, anon; grant usage, select on sequence t_results_n_seq to authenticated, anon;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('bbbbbbbb-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-shared-a@example.invalid', '{}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-shared-b@example.invalid', '{}', '{}', now(), now());
insert into public.user_roles (user_id, role) values ('bbbbbbbb-0000-4000-8000-00000000000a', 'sales'), ('bbbbbbbb-0000-4000-8000-00000000000b', 'sales');
insert into public.team_members (user_id, display_name) values ('bbbbbbbb-0000-4000-8000-00000000000a', 'Shared A'), ('bbbbbbbb-0000-4000-8000-00000000000b', 'Shared B');
create temp table t_fx as select
  (select l.id from public.outreach_leads l
    where l.assigned_to_user_id is null and l.is_archived is not true and l.status = 'not_contacted'
      and not public.lead_is_client(l.amount_paid, l.status) and public.lead_first_contact_at(l.id) is null
    order by l.created_at limit 1) as mine,
  (select l.id from public.outreach_leads l where l.assigned_to_user_id = l.user_id and not public.lead_is_client(l.amount_paid, l.status) order by l.created_at limit 1) as pauls,
  (select l.id from public.outreach_leads l where public.lead_is_client(l.amount_paid, l.status) order by l.created_at limit 1) as client,
  (select user_id from public.team_members where is_book_owner limit 1) as admin_id;
grant select on t_fx to authenticated, anon;
insert into t_results (name, ok, detail) select 'fixtures', mine is not null and pauls is not null and client is not null and admin_id is not null, null from t_fx;
insert into t_results (name, ok, detail) select 'anon cannot execute ' || f, not has_function_privilege('anon', f, 'execute'), null
  from unnest(array['public.lead_mark_interested(uuid, boolean)', 'public.lead_set_details(uuid, text, text, text)', 'public.lead_set_archived(uuid, boolean)', 'public.sales_queue_opener(uuid[], text)', 'public.lead_set_follow_up(uuid, text, date, text)']) f;

-- ── as Sales A ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-00000000000a', true);
do $$ declare r jsonb; n int; before record; after record; begin
  r := public.claim_lead((select mine from t_fx));
  insert into t_results (name, ok, detail) values ('A: claims an unassigned never-contacted lead', (r ->> 'ok')::boolean, r::text);

  r := public.lead_mark_interested((select mine from t_fx), true);
  insert into t_results (name, ok, detail) values ('A: marks own lead interested', (r ->> 'ok')::boolean and (select is_potential_work from public.sales_leads where id = (select mine from t_fx)), r::text);

  select status, is_potential_work, business_name, phone into before from public.sales_leads where id = (select mine from t_fx);
  r := public.lead_set_details((select mine from t_fx), 'Mark', 'plumbers', 'Leeds');
  select status, is_potential_work, business_name, phone, contact_name, search_keyword, search_location into after from public.sales_leads where id = (select mine from t_fx);
  insert into t_results (name, ok, detail) values ('A: saves contact name / trade / town on own lead',
    (r ->> 'ok')::boolean and after.contact_name = 'Mark' and after.search_keyword = 'plumbers' and after.search_location = 'Leeds', r::text);
  insert into t_results (name, ok, detail) values ('A: …and nothing else on the row changes',
    after.status is not distinct from before.status and after.business_name is not distinct from before.business_name and after.phone is not distinct from before.phone, null);
  r := public.lead_set_details((select mine from t_fx), null, null, 'York');
  insert into t_results (name, ok, detail) values ('A: a NULL leaves a field alone', (select contact_name from public.sales_leads where id = (select mine from t_fx)) = 'Mark'
    and (select search_location from public.sales_leads where id = (select mine from t_fx)) = 'York', r::text);

  r := public.lead_set_follow_up((select mine from t_fx), 'send_draft', current_date + 3, 'after lunch');
  insert into t_results (name, ok, detail) values ('A: sets any stored next-action type', (r ->> 'ok')::boolean
    and (select next_action::text from public.sales_leads where id = (select mine from t_fx)) = 'send_draft', r::text);
  r := public.lead_set_follow_up((select mine from t_fx), 'not_a_thing', null, null);
  insert into t_results (name, ok, detail) values ('A: an unknown next action is refused', r ->> 'error' = 'bad_next_action', r::text);

  r := public.lead_set_stage((select mine from t_fx), 'payment_received');
  insert into t_results (name, ok, detail) values ('A: cannot set a client status', r ->> 'error' = 'stage_not_allowed', r::text);

  r := public.lead_set_archived((select mine from t_fx), true);
  insert into t_results (name, ok, detail) values ('A: archives own lead', (r ->> 'ok')::boolean and (select is_archived from public.sales_leads where id = (select mine from t_fx)), r::text);
  r := public.lead_set_archived((select mine from t_fx), false);
  insert into t_results (name, ok, detail) values ('A: …and restores it (same record, same owner)', (r ->> 'ok')::boolean
    and (select assigned_to_user_id from public.sales_leads where id = (select mine from t_fx)) = 'bbbbbbbb-0000-4000-8000-00000000000a', r::text);
  insert into t_results (name, ok, detail) values ('A: every change is on the timeline',
    (select count(*) from public.lead_activity where lead_id = (select mine from t_fx) and kind in ('marked_interested', 'details_set', 'archived_set', 'follow_up_set')) >= 5, null);

  -- Paul's lead and a client: every new function refuses.
  begin perform public.lead_mark_interested((select pauls from t_fx), true); insert into t_results (name, ok) values ('A: cannot star Pauls lead', false);
  exception when others then insert into t_results (name, ok, detail) values ('A: cannot star Pauls lead', sqlerrm = 'not_your_lead', sqlerrm); end;
  begin perform public.lead_set_details((select pauls from t_fx), 'x', null, null); insert into t_results (name, ok) values ('A: cannot edit Pauls lead details', false);
  exception when others then insert into t_results (name, ok, detail) values ('A: cannot edit Pauls lead details', sqlerrm = 'not_your_lead', sqlerrm); end;
  begin perform public.lead_set_archived((select pauls from t_fx), true); insert into t_results (name, ok) values ('A: cannot archive Pauls lead', false);
  exception when others then insert into t_results (name, ok, detail) values ('A: cannot archive Pauls lead', sqlerrm = 'not_your_lead', sqlerrm); end;
  begin perform public.lead_set_follow_up((select pauls from t_fx), 'call', null, null); insert into t_results (name, ok) values ('A: cannot set a follow-up on Pauls lead', false);
  exception when others then insert into t_results (name, ok, detail) values ('A: cannot set a follow-up on Pauls lead', sqlerrm = 'not_your_lead', sqlerrm); end;
  begin perform public.lead_set_details((select client from t_fx), 'x', null, null); insert into t_results (name, ok) values ('A: cannot touch a client', false);
  exception when others then insert into t_results (name, ok, detail) values ('A: cannot touch a client', sqlerrm = 'not_your_lead', sqlerrm); end;
  begin perform public.assign_lead((select mine from t_fx), 'bbbbbbbb-0000-4000-8000-00000000000b'); insert into t_results (name, ok) values ('A: cannot reassign', false);
  exception when others then insert into t_results (name, ok, detail) values ('A: cannot reassign', true, sqlerrm); end;

  -- The browser cannot go round the functions.
  update public.outreach_leads set business_name = 'hijack', is_potential_work = false where id = (select mine from t_fx);
  get diagnostics n = row_count;
  insert into t_results (name, ok, detail) values ('A: a direct UPDATE of own lead changes nothing (RLS)', n = 0, n::text);
  update public.outreach_leads set business_name = 'hijack' where id = (select pauls from t_fx);
  get diagnostics n = row_count;
  insert into t_results (name, ok, detail) values ('A: a direct UPDATE of Pauls lead changes nothing (RLS)', n = 0, n::text);
  insert into t_results (name, ok, detail) values ('A: reads nothing from outreach_leads', (select count(*) from public.outreach_leads) = 0, null);
  insert into t_results (name, ok, detail) values ('A: the view holds only A''s leads', (select count(*) from public.sales_leads where assigned_to_user_id is distinct from 'bbbbbbbb-0000-4000-8000-00000000000a') = 0
    and (select count(*) from public.sales_leads) >= 1, null);
  insert into t_results (name, ok, detail) values ('A: no amount paid reaches the browser', (select count(*) from public.sales_leads where amount_paid is not null) = 0, null);
  insert into t_results (name, ok, detail) values ('A: Pauls lead is not in the view', not exists (select 1 from public.sales_leads where id = (select pauls from t_fx)), null);
end $$;
reset role;
insert into t_results (name, ok, detail) values ('the view has no notes / payment / delivery columns',
  not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sales_leads'
    and column_name in ('notes', 'paid_for', 'payment_date', 'subscription_status', 'delivery_checklist', 'delivery_notes', 'user_id')), null);

-- ── as Sales B: A's lead is not theirs ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-00000000000b', true);
do $$ declare r jsonb; begin
  begin perform public.lead_mark_interested((select mine from t_fx), false); insert into t_results (name, ok) values ('B: cannot work A''s lead', false);
  exception when others then insert into t_results (name, ok, detail) values ('B: cannot work A''s lead', sqlerrm = 'not_your_lead', sqlerrm); end;
  r := public.claim_lead((select mine from t_fx));
  insert into t_results (name, ok, detail) values ('B: cannot claim A''s lead', not coalesce((r ->> 'ok')::boolean, false), r::text);
  insert into t_results (name, ok, detail) values ('B: does not see A''s lead', not exists (select 1 from public.sales_leads where id = (select mine from t_fx)), null);
  r := public.sales_queue_opener(array[(select mine from t_fx)], 'initial_contact');
  insert into t_results (name, ok, detail) values ('B: cannot queue A''s lead', (r ->> 'queued')::int = 0 and (r -> 'skipped' ->> 'not_yours')::int = 1, r::text);
end $$;
reset role;

-- ── as the admin: reassignment keeps the same record and its history ──
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from t_fx), 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', (select admin_id::text from t_fx), true);
do $$ declare r jsonb; h int; begin
  h := (select count(*) from public.lead_activity where lead_id = (select mine from t_fx));
  r := public.assign_lead((select mine from t_fx), 'bbbbbbbb-0000-4000-8000-00000000000b');
  insert into t_results (name, ok, detail) values ('admin: reassigns A''s lead to B', (r ->> 'ok')::boolean, r::text);
  insert into t_results (name, ok, detail) values ('admin: same record, history kept', (select count(*) from public.lead_activity where lead_id = (select mine from t_fx)) = h + 1
    and (select assigned_to_user_id from public.outreach_leads where id = (select mine from t_fx)) = 'bbbbbbbb-0000-4000-8000-00000000000b', null);
  r := public.lead_mark_interested((select pauls from t_fx), true);
  insert into t_results (name, ok, detail) values ('admin: works any prospect through the same functions', (r ->> 'ok')::boolean, r::text);
end $$;
reset role;

do $$ begin
  raise exception 'RESULTS %', (select json_agg(json_build_object('n', n, 'ok', ok, 'name', name, 'detail', detail) order by n) from t_results);
end $$;
