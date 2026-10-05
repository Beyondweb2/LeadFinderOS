-- Outreach lead ownership (2026-10-05, fix/outreach-lead-ownership). RUN AGAINST THE LIVE DATABASE; ALWAYS ROLLED BACK.
-- The last statement raises an exception carrying the results as JSON, so the transaction can never commit:
-- the fake salespeople (example.invalid), their campaigns, claims, adds and queue writes all disappear.
-- How to run: send the whole file as ONE query to the Management API (CLAUDE.md §2). Expect every row ok = true.
-- docs/pre-sales-certification/outreach-ownership-safety.md
begin;
create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated; grant usage, select on sequence t_results_n_seq to authenticated;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('bbbbbbbb-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'own-sales-a@example.invalid', '{}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'own-sales-b@example.invalid', '{}', '{}', now(), now());
insert into public.user_roles (user_id, role) values ('bbbbbbbb-0000-4000-8000-00000000000a', 'sales'), ('bbbbbbbb-0000-4000-8000-00000000000b', 'sales');
insert into public.team_members (user_id, display_name) values ('bbbbbbbb-0000-4000-8000-00000000000a', 'Own A'), ('bbbbbbbb-0000-4000-8000-00000000000b', 'Own B');
-- Three never-contacted unassigned mobiles: [1] → A, [2] → B, [3] stays unassigned. Plus one of Paul's leads.
create temp table t_fx as select array(
  select l.id from public.outreach_leads l
  where l.assigned_to_user_id is null and l.is_archived is not true and l.status = 'not_contacted' and l.campaign_id is null
    and not public.lead_is_client(l.amount_paid, l.status) and public.phone_key(l.phone) ~ '^7[0-9]{9}$'
    and public.lead_first_contact_at(l.id) is null and public.opener_contact_block(l.id) is null
    and not exists (select 1 from public.contact_suppressions s where public.phone_key(s.phone_e164) = public.phone_key(l.phone))
  order by l.created_at limit 3) as mob,
  (select l.id from public.outreach_leads l where l.assigned_to_user_id = public.book_owner_id() and l.is_archived is not true
     and not public.lead_is_client(l.amount_paid, l.status) order by l.created_at desc limit 1) as pauls,
  null::uuid as camp_a, null::uuid as camp_b, null::uuid as camp_admin, null::uuid as added, null::uuid as paul_add;
grant select, update on t_fx to authenticated;
insert into t_results (name, ok, detail) select 'fixtures: 3 unassigned mobiles + a Paul lead', array_length(mob, 1) = 3 and pauls is not null, array_length(mob, 1)::text from t_fx;

-- ── Salesperson B claims [2] and makes a campaign ────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-00000000000b', true);
do $$ declare r jsonb; begin
  perform public.claim_lead((select mob[2] from t_fx));
  r := public.campaign_create('ZZ QA ownership B');
  update t_fx set camp_b = (r ->> 'id')::uuid;
  r := public.lead_set_campaign((select mob[2] from t_fx), (select camp_b from t_fx));
  insert into t_results (name, ok, detail) values ('B: own lead into own campaign', (r ->> 'ok')::boolean, r::text);
end $$;
reset role;

-- ── Salesperson A ────────────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-00000000000a', true);
do $$ declare r jsonb; n int; e text; begin
  perform public.claim_lead((select mob[1] from t_fx));
  -- SEES ONLY OWN LEADS
  select count(*) into n from public.sales_leads where id = any ((select mob from t_fx) || (select pauls from t_fx));
  insert into t_results (name, ok, detail) values ('A sees only own lead in sales_leads (1 of 4)', n = 1 and exists (select 1 from public.sales_leads where id = (select mob[1] from t_fx)), n::text);
  select count(*) into n from public.sales_leads where assigned_to_user_id is distinct from auth.uid();
  insert into t_results (name, ok, detail) values ('A: sales_leads holds nothing of anyone else', n = 0, n::text);
  -- CANNOT QUERY ANOTHER REP'S LEADS
  select count(*) into n from public.outreach_leads where id in ((select mob[2] from t_fx), (select pauls from t_fx));
  insert into t_results (name, ok, detail) values ('A: outreach_leads direct read of B / Paul = 0 rows', n = 0, n::text);
  select count(*) into n from public.lead_crawl_checks where lead_id in ((select mob[2] from t_fx), (select pauls from t_fx));
  insert into t_results (name, ok, detail) values ('A: crawl checks of B / Paul = 0 rows', n = 0, n::text);
  -- CANNOT QUEUE WHATSAPP FOR ANOTHER REP (bulk "select all" sending foreign ids)
  r := public.sales_queue_opener((select array[mob[2], mob[3], pauls] from t_fx), 'initial_contact');
  insert into t_results (name, ok, detail) values ('A: queue B / unassigned / Paul → 0 queued, 3 not_yours', (r ->> 'queued')::int = 0 and (r -> 'skipped' ->> 'not_yours')::int = 3, r::text);
  -- CANNOT ALTER STATUS / NEXT ACTION / STAR / CAMPAIGN FOR ANOTHER REP
  begin perform public.lead_set_stage((select mob[2] from t_fx), 'interested'); e := 'allowed'; exception when insufficient_privilege then e := sqlerrm; end;
  insert into t_results (name, ok, detail) values ('A: lead_set_stage on B''s lead refused', e = 'not_your_lead', e);
  begin perform public.lead_set_follow_up((select mob[2] from t_fx), 'call', current_date + 1, 'x', null, null, null); e := 'allowed'; exception when insufficient_privilege then e := sqlerrm; end;
  insert into t_results (name, ok, detail) values ('A: Next Action on B''s lead refused', e = 'not_your_lead', e);
  begin perform public.lead_set_follow_up((select pauls from t_fx), 'call', current_date + 1, 'x', null, null, null); e := 'allowed'; exception when insufficient_privilege then e := sqlerrm; end;
  insert into t_results (name, ok, detail) values ('A: Next Action on Paul''s lead refused', e = 'not_your_lead', e);
  begin perform public.lead_mark_interested((select mob[2] from t_fx), true); e := 'allowed'; exception when insufficient_privilege then e := sqlerrm; end;
  insert into t_results (name, ok, detail) values ('A: star on B''s lead refused', e = 'not_your_lead', e);
  begin perform public.lead_set_archived((select mob[2] from t_fx), true); e := 'allowed'; exception when insufficient_privilege then e := sqlerrm; end;
  insert into t_results (name, ok, detail) values ('A: archive B''s lead refused', e = 'not_your_lead', e);
  update public.outreach_leads set next_action = 'call' where id = (select mob[2] from t_fx);
  get diagnostics n = row_count;
  insert into t_results (name, ok, detail) values ('A: direct UPDATE of B''s lead = 0 rows', n = 0, n::text);
  r := public.lead_unqueue((select mob[2] from t_fx));
  insert into t_results (name, ok, detail) values ('A: unqueue B''s lead refused', r ->> 'error' = 'not_yours', r::text);
  -- CAMPAIGNS DO NOT BYPASS OWNERSHIP
  r := public.campaign_create('ZZ QA ownership A');
  update t_fx set camp_a = (r ->> 'id')::uuid;
  r := public.leads_set_campaign((select array[mob[2], pauls] from t_fx), (select camp_a from t_fx));
  insert into t_results (name, ok, detail) values ('A: cannot pull B / Paul leads into own campaign', (r ->> 'moved')::int = 0 and (r -> 'skipped' ->> 'not_yours')::int = 2, r::text);
  r := public.lead_set_campaign((select mob[1] from t_fx), (select camp_b from t_fx));
  insert into t_results (name, ok, detail) values ('A: cannot put own lead into B''s campaign', r ->> 'error' = 'unknown_campaign', r::text);
  r := public.campaign_leads((select camp_b from t_fx));
  insert into t_results (name, ok, detail) values ('A: B''s campaign leads = not_found', r ->> 'error' = 'not_found', r::text);
  r := public.campaign_launch((select camp_b from t_fx));
  insert into t_results (name, ok, detail) values ('A: launching B''s campaign = not_found', r ->> 'error' = 'not_found', r::text);
  r := public.campaign_candidates(null, null);
  insert into t_results (name, ok, detail) values ('A: campaign candidates are own leads only',
    not exists (select 1 from jsonb_array_elements(r -> 'leads') x where (x ->> 'id')::uuid in ((select mob[2] from t_fx), (select mob[3] from t_fx), (select pauls from t_fx))), null);
  -- ADDING A LEAD KEEPS THE RIGHT OWNER
  r := public.sales_add_lead(jsonb_build_object('business_name', 'ZZ QA Ownership Added Ltd', 'search_keyword', 'Plumber', 'campaign_id', (select camp_a from t_fx)));
  update t_fx set added = (r ->> 'lead_id')::uuid where (r ->> 'ok')::boolean;
  insert into t_results (name, ok, detail) values ('A: add a lead → owned by A, in A''s campaign',
    exists (select 1 from public.sales_leads s where s.id = (select added from t_fx) and s.assigned_to_user_id = auth.uid() and s.campaign_id = (select camp_a from t_fx)), r::text);
  r := public.lead_set_campaign((select mob[1] from t_fx), (select camp_a from t_fx));
  insert into t_results (name, ok, detail) values ('A: own lead into own campaign', (r ->> 'ok')::boolean, r::text);
  -- A SALESPERSON CANNOT NOMINATE ANOTHER OWNER
  r := public.sales_add_lead(jsonb_build_object('business_name', 'ZZ QA Ownership Nominate Ltd', 'search_keyword', 'Plumber',
         'assigned_to_user_id', 'bbbbbbbb-0000-4000-8000-00000000000b', 'user_id', 'bbbbbbbb-0000-4000-8000-00000000000b'));
  insert into t_results (name, ok, detail) values ('A: sales_add_lead ignores a nominated owner — the lead is A''s',
    (r ->> 'ok')::boolean and exists (select 1 from public.sales_leads s where s.id = (r ->> 'lead_id')::uuid and s.assigned_to_user_id = auth.uid()), r::text);
  begin
    insert into public.outreach_leads (user_id, business_name, status, assigned_to_user_id)
    values (public.book_owner_id(), 'ZZ QA Ownership Direct B Ltd', 'not_contacted', 'bbbbbbbb-0000-4000-8000-00000000000b');
    e := 'inserted';
  exception when others then e := sqlstate || ' ' || sqlerrm;
  end;
  insert into t_results (name, ok, detail) values ('A: a direct insert owned by B is refused', e <> 'inserted'
    and not exists (select 1 from public.outreach_leads where business_name = 'ZZ QA Ownership Direct B Ltd'), e);
end $$;
reset role;

-- ── The admin (the book owner) ───────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', public.book_owner_id(), 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', public.book_owner_id()::text, true);
do $$ declare r jsonb; v uuid; begin
  -- PAUL'S FIND LEADS ADD: the browser's insert (useOutreach addLead) WITHOUT any owner field → owned by Paul.
  insert into public.outreach_leads (user_id, business_name, phone, status, next_action, country, list_type, search_keyword)
  values (public.book_owner_id(), 'ZZ QA Ownership Paul Add Ltd', '07700 900987', 'not_contacted', 'none', 'UK', 'no_website', 'Plumber')
  returning id into v;
  update t_fx set paul_add = v;
  insert into t_results (name, ok, detail) values ('Paul: a Find Leads add with no owner field is owned by Paul (server-side)',
    (select assigned_to_user_id = public.book_owner_id() and added_by_user_id = public.book_owner_id() and assigned_at is not null from public.outreach_leads where id = v), null);
  -- The admin may still choose an owner explicitly.
  insert into public.outreach_leads (user_id, business_name, status, next_action, list_type, assigned_to_user_id)
  values (public.book_owner_id(), 'ZZ QA Ownership For A Ltd', 'not_contacted', 'none', 'manual', 'bbbbbbbb-0000-4000-8000-00000000000a') returning id into v;
  insert into t_results (name, ok, detail) values ('Paul: an explicit owner chosen by the admin is kept',
    (select assigned_to_user_id = 'bbbbbbbb-0000-4000-8000-00000000000a'::uuid from public.outreach_leads where id = v), null);
  r := public.campaign_create('ZZ QA ownership admin');
  update t_fx set camp_admin = (r ->> 'id')::uuid;
  -- A's lead [1] and B's lead [2] put into the ADMIN's campaign (the admin may), plus the unassigned [3].
  perform public.lead_set_campaign((select mob[1] from t_fx), (select camp_admin from t_fx));
  perform public.lead_set_campaign((select mob[2] from t_fx), (select camp_admin from t_fx));
  perform public.lead_set_campaign((select mob[3] from t_fx), (select camp_admin from t_fx));
  perform public.lead_set_campaign((select paul_add from t_fx), (select camp_admin from t_fx));
  r := public.campaign_launch((select camp_admin from t_fx));
  insert into t_results (name, ok, detail) values ('admin launch: membership never overrides ownership (A + B leads skipped as other_owner)',
    (r -> 'skipped' ->> 'other_owner')::int = 2, r::text);
  insert into t_results (name, ok, detail) values ('admin launch: A''s and B''s leads were NOT queued',
    (select count(*) from public.outreach_leads where id in ((select mob[1] from t_fx), (select mob[2] from t_fx)) and status = 'queued') = 0, null);
  insert into t_results (name, ok, detail) values ('admin launch: the UNASSIGNED member is not Paul''s — skipped as unassigned, not queued',
    (r -> 'skipped' ->> 'unassigned')::int = 1 and (select status from public.outreach_leads where id = (select mob[3] from t_fx)) = 'not_contacted', r::text);
  insert into t_results (name, ok, detail) values ('admin launch: only Paul''s OWN lead was considered and queued',
    (r ->> 'considered')::int = 1 and (select status from public.outreach_leads where id = (select paul_add from t_fx)) = 'queued', r::text);
  -- CLAIM: the admin takes the unassigned lead through assign_lead (the Unassigned view's "Claim for me").
  r := public.assign_lead((select mob[3] from t_fx), public.book_owner_id());
  insert into t_results (name, ok, detail) values ('Paul: claiming an unassigned lead makes it his (assign_lead)',
    (r ->> 'ok')::boolean and (select assigned_to_user_id from public.outreach_leads where id = (select mob[3] from t_fx)) = public.book_owner_id(), r::text);
  -- Launching a salesperson's campaign as the admin reaches only THAT salesperson's leads.
  r := public.campaign_launch((select camp_b from t_fx));
  insert into t_results (name, ok, detail) values ('admin launch of B''s campaign: B''s lead (moved out) not touched, nothing foreign queued',
    coalesce((r ->> 'queued')::int, 0) = 0, r::text);
end $$;
reset role;
-- ── No signed-in user (the service role: free check, onboarding, crons) → stays unassigned ─────────
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);
do $$ declare v uuid; begin
  insert into public.outreach_leads (user_id, business_name, status, next_action)
  values (public.book_owner_id(), 'ZZ QA Ownership System Ltd', 'not_contacted', 'none') returning id into v;
  insert into t_results (name, ok, detail) values ('system: an insert with no signed-in user stays unassigned',
    (select assigned_to_user_id is null from public.outreach_leads where id = v), null);
end $$;
do $$ begin
  raise exception 'RESULTS %', (select json_agg(json_build_object('n', n, 'ok', ok, 'name', name, 'detail', detail) order by n) from t_results);
end $$;
