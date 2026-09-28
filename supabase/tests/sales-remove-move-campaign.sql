-- Sales "Remove from my leads" + bulk "Move to campaign" (2026-09-28). RUN AGAINST THE LIVE DATABASE;
-- ALWAYS ROLLED BACK — the last statement raises the results as JSON, so nothing commits (fake users on
-- example.invalid; real leads borrowed and changed only inside this transaction). docs/multi-user.md §6.
begin;
create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated, anon; grant usage, select on sequence t_results_n_seq to authenticated, anon;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('eeeeeeee-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-srm-a@example.invalid', '{}', '{}', now(), now()),
  ('eeeeeeee-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-srm-b@example.invalid', '{}', '{}', now(), now());
insert into public.user_roles (user_id, role) values ('eeeeeeee-0000-4000-8000-00000000000a', 'sales'), ('eeeeeeee-0000-4000-8000-00000000000b', 'sales');
insert into public.team_members (user_id, display_name) values ('eeeeeeee-0000-4000-8000-00000000000a', 'SRM A'), ('eeeeeeee-0000-4000-8000-00000000000b', 'SRM B');

-- Ten unassigned, never-contacted leads, one per case.
create temp table t_case (k text primary key, lead uuid, name text);
insert into t_case (k, lead, name)
  select k, l.id, l.business_name from (
    select l.id, l.business_name, row_number() over (order by l.created_at) rn
    from public.outreach_leads l
    where l.assigned_to_user_id is null and l.is_archived is not true and l.status = 'not_contacted'
      and not public.lead_is_client(l.amount_paid, l.status) and public.lead_contact_attempt_at(l.id) is null
      and not exists (select 1 from public.onboarding_responses o where o.lead_id = l.id)
    order by l.created_at limit 10) l
  join (select k, row_number() over () rn from unnest(array[
    'untouched', 'called', 'messaged', 'b_lead', 'queued', 'won', 'camp1', 'camp2', 'camp3', 'admin_lead']) k) x using (rn);
grant select on t_case to authenticated, anon;
create temp table t_fx as select
  (select id from public.campaigns order by created_at limit 1) as camp,
  (select id from public.campaigns order by created_at offset 1 limit 1) as camp2,
  (select user_id from public.team_members where is_book_owner limit 1) as admin_id,
  (select id from public.outreach_leads where public.lead_is_client(amount_paid, status) limit 1) as client_lead;
grant select on t_fx to authenticated, anon;
insert into t_results (name, ok, detail) select 'fixtures: 10 leads, two campaigns, the admin, a client', (select count(*) from t_case) = 10
  and camp is not null and camp2 is not null and admin_id is not null and client_lead is not null, null from t_fx;
insert into t_results (name, ok, detail) select 'anon cannot execute ' || f, not has_function_privilege('anon', f, 'execute'), null
  from unnest(array['public.sales_remove_leads(uuid[])', 'public.leads_set_campaign(uuid[], uuid)']) f;
insert into t_results (name, ok, detail) select 'authenticated may execute ' || f, has_function_privilege('authenticated', f, 'execute'), null
  from unnest(array['public.sales_remove_leads(uuid[])', 'public.leads_set_campaign(uuid[], uuid)']) f;

update public.outreach_leads set assigned_to_user_id = 'eeeeeeee-0000-4000-8000-00000000000a', assigned_at = now()
  where id in (select lead from t_case where k in ('untouched', 'called', 'messaged', 'queued', 'won', 'camp1', 'camp2', 'camp3'));
update public.outreach_leads set assigned_to_user_id = 'eeeeeeee-0000-4000-8000-00000000000b', assigned_at = now()
  where id = (select lead from t_case where k = 'b_lead');
update public.outreach_leads set assigned_to_user_id = (select admin_id from t_fx), assigned_at = now()
  where id = (select lead from t_case where k = 'admin_lead');
update public.outreach_leads set status = 'queued', queued_at = now() where id = (select lead from t_case where k = 'queued');
update public.outreach_leads set status = 'won_pending_onboarding' where id = (select lead from t_case where k = 'won');
-- A genuine WhatsApp send on 'messaged' (the system's own write, as the queue would).
insert into public.whatsapp_messages (user_id, lead_id, direction, status, body, phone, test_mode, created_at)
  select l.user_id, l.id, 'outbound', 'delivered', 'srm test', l.phone, false, now() from public.outreach_leads l where l.id = (select lead from t_case where k = 'messaged');
-- Non-contact history on 'untouched' (must NOT make it count as contacted): an audit run + a note.
insert into public.lead_activity (lead_id, actor_user_id, kind, data, body) values
  ((select lead from t_case where k = 'untouched'), 'eeeeeeee-0000-4000-8000-00000000000a', 'audit_run', '{}', null),
  ((select lead from t_case where k = 'untouched'), 'eeeeeeee-0000-4000-8000-00000000000a', 'note', '{}', 'srm internal note');

-- ── as Sales A ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-4000-8000-00000000000a', true);
do $$ declare r jsonb; v uuid; n int; begin
  -- a phone call logged by A on 'called'
  r := public.lead_log_contact((select lead from t_case where k = 'called'), 'call', 'no_answer', null);
  insert into t_results (name, ok, detail) values ('setup: A logs a no-answer call', (r ->> 'ok')::boolean, r::text);

  -- ── MOVE TO CAMPAIGN ──
  r := public.leads_set_campaign(array[(select lead from t_case where k = 'camp1')], (select camp from t_fx));
  insert into t_results (name, ok, detail) values ('campaign: ONE own lead moves', (r ->> 'moved')::int = 1
    and (select campaign_id from public.sales_leads where id = (select lead from t_case where k = 'camp1')) = (select camp from t_fx), r::text);
  r := public.leads_set_campaign(array[(select lead from t_case where k = 'camp1'), (select lead from t_case where k = 'camp2'), (select lead from t_case where k = 'camp3')], (select camp2 from t_fx));
  insert into t_results (name, ok, detail) values ('campaign: THREE own leads move together', (r ->> 'moved')::int = 3
    and (select count(*) from public.sales_leads where id in (select lead from t_case where k in ('camp1', 'camp2', 'camp3')) and campaign_id = (select camp2 from t_fx)) = 3, r::text);
  r := public.leads_set_campaign(array[(select lead from t_case where k = 'camp2')], (select camp2 from t_fx));
  insert into t_results (name, ok, detail) values ('campaign: same campaign again = unchanged, not moved', (r ->> 'unchanged')::int = 1 and (r ->> 'moved')::int = 0, r::text);
  insert into t_results (name, ok, detail) values ('campaign: one details_set activity row per real change',
    (select count(*) from public.lead_activity where lead_id = (select lead from t_case where k = 'camp1') and kind = 'details_set' and data ? 'campaign_id') = 2
    and (select count(*) from public.lead_activity where lead_id = (select lead from t_case where k = 'camp2') and kind = 'details_set' and data ? 'campaign_id') = 1, null);
  r := public.leads_set_campaign(array[(select lead from t_case where k = 'camp3'), (select lead from t_case where k = 'b_lead')], (select camp from t_fx));
  insert into t_results (name, ok, detail) values ('campaign: another rep''s lead is skipped, own lead still moves', (r ->> 'moved')::int = 1 and (r -> 'skipped' ->> 'not_yours')::int = 1, r::text);
  r := public.leads_set_campaign(array[(select lead from t_case where k = 'admin_lead'), (select client_lead from t_fx)], (select camp from t_fx));
  insert into t_results (name, ok, detail) values ('campaign: Paul''s lead and a client are refused', (r ->> 'moved')::int = 0 and (r -> 'skipped' ->> 'not_yours')::int = 2, r::text);
  r := public.leads_set_campaign(array[(select lead from t_case where k = 'camp1')], 'eeeeeeee-0000-4000-8000-0000000000ff');
  insert into t_results (name, ok, detail) values ('campaign: an unknown campaign moves nothing', r ->> 'error' = 'unknown_campaign'
    and (select campaign_id from public.sales_leads where id = (select lead from t_case where k = 'camp1')) = (select camp2 from t_fx), r::text);
  r := public.leads_set_campaign(array[(select lead from t_case where k = 'camp1')], null);
  insert into t_results (name, ok, detail) values ('campaign: "No campaign" clears it', (r ->> 'moved')::int = 1
    and (select campaign_id from public.sales_leads where id = (select lead from t_case where k = 'camp1')) is null, r::text);
  begin
    insert into public.campaigns (name, created_by) values ('SRM should not create', 'eeeeeeee-0000-4000-8000-00000000000a');
    insert into t_results (name, ok) values ('campaign: Sales still cannot CREATE a campaign', false);
  exception when others then insert into t_results (name, ok, detail) values ('campaign: Sales still cannot CREATE a campaign', sqlstate = '42501', sqlerrm); end;

  -- ── REMOVE FROM MY LEADS ──
  r := public.sales_remove_leads(array[(select lead from t_case where k = 'untouched')]);
  insert into t_results (name, ok, detail) values ('remove: untouched own lead → released', (r ->> 'released')::int = 1, r::text);
  insert into t_results (name, ok, detail) values ('remove: it has left A''s leads', not exists (select 1 from public.sales_leads where id = (select lead from t_case where k = 'untouched')), null);
  insert into t_results (name, ok, detail) values ('remove: it is back in Available to claim', exists (select 1 from public.sales_pool((select name from t_case where k = 'untouched'), 200, 0) p where p.id = (select lead from t_case where k = 'untouched')), null);
  insert into t_results (name, ok, detail) values ('remove: still never contacted (audit + note do not count)', public.lead_contact_attempt_at((select lead from t_case where k = 'untouched')) is null, null);

  r := public.sales_remove_leads(array[(select lead from t_case where k = 'called'), (select lead from t_case where k = 'messaged')]);
  insert into t_results (name, ok, detail) values ('remove: called + WhatsApp-messaged → archived, not released', (r ->> 'archived')::int = 2 and (r ->> 'released')::int = 0, r::text);
  insert into t_results (name, ok, detail) values ('remove: contacted leads keep their owner (A), archived',
    (select count(*) from public.sales_leads where id in (select lead from t_case where k in ('called', 'messaged')) and assigned_to_user_id = 'eeeeeeee-0000-4000-8000-00000000000a' and is_archived) = 2, null);
  insert into t_results (name, ok, detail) values ('remove: contacted leads are NOT in Available to claim',
    not exists (select 1 from public.sales_pool('', 200, 0) p where p.id in (select lead from t_case where k in ('called', 'messaged')))
    and not exists (select 1 from t_case c, lateral public.sales_pool(c.name, 200, 0) p where c.k in ('called', 'messaged') and p.id = c.lead), null);

  r := public.sales_remove_leads(array[(select lead from t_case where k = 'b_lead'), (select lead from t_case where k = 'admin_lead'), (select client_lead from t_fx)]);
  insert into t_results (name, ok, detail) values ('remove: another rep''s lead, Paul''s lead and a client are refused', (r -> 'skipped' ->> 'not_yours')::int = 3
    and (r ->> 'released')::int = 0 and (r ->> 'archived')::int = 0, r::text);
  r := public.sales_remove_leads(array[(select lead from t_case where k = 'queued')]);
  insert into t_results (name, ok, detail) values ('remove: an opener waiting in the queue is refused', (r -> 'skipped' ->> 'queued')::int = 1, r::text);
  r := public.sales_remove_leads(array[(select lead from t_case where k = 'won')]);
  insert into t_results (name, ok, detail) values ('remove: a won / onboarding lead is refused', (r -> 'skipped' ->> 'onboarding')::int = 1, r::text);
  r := public.sales_remove_leads(array[]::uuid[]);
  insert into t_results (name, ok, detail) values ('remove: an empty selection is refused', r ->> 'error' = 'no_leads', r::text);
  insert into t_results (name, ok, detail) values ('remove: the contacted lead still counts as contacted', public.lead_contact_attempt_at((select lead from t_case where k = 'called')) is not null
    and public.lead_contact_attempt_at((select lead from t_case where k = 'messaged')) is not null, null);
  update public.outreach_leads set assigned_to_user_id = null where id = (select lead from t_case where k = 'b_lead');
  get diagnostics n = row_count;
  insert into t_results (name, ok, detail) values ('direct table write from Sales still changes nothing', n = 0, n::text);
end $$;
reset role;

-- ── as Sales B: the released lead can be claimed; the contacted ones cannot ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-4000-8000-00000000000b', true);
do $$ declare r jsonb; begin
  r := public.claim_lead((select lead from t_case where k = 'untouched'));
  insert into t_results (name, ok, detail) values ('B claims the released lead (same record)', (r ->> 'ok')::boolean
    and (select assigned_to_user_id from public.sales_leads where id = (select lead from t_case where k = 'untouched')) = 'eeeeeeee-0000-4000-8000-00000000000b', r::text);
  insert into t_results (name, ok, detail) values ('B sees none of A''s archived contacted leads', not exists (select 1 from public.sales_leads where id in (select lead from t_case where k in ('called', 'messaged'))), null);
  r := public.claim_lead((select lead from t_case where k = 'messaged'));
  insert into t_results (name, ok, detail) values ('B cannot claim the contacted, archived lead', (r ->> 'ok')::boolean is not true, r::text);
end $$;
reset role;

-- ── history survives; the admin is refused the sales-only function but keeps the bulk campaign ──
insert into t_results (name, ok, detail) values ('history: every activity row on the released lead is kept',
  (select count(*) from public.lead_activity where lead_id = (select lead from t_case where k = 'untouched') and kind in ('audit_run', 'note', 'lead_unassigned', 'lead_claimed')) = 4, null);
insert into t_results (name, ok, detail) values ('history: the release is logged with its reason',
  (select data ->> 'reason' from public.lead_activity where lead_id = (select lead from t_case where k = 'untouched') and kind = 'lead_unassigned') = 'removed_from_my_leads', null);
insert into t_results (name, ok, detail) values ('history: the contacted lead keeps its call and its message',
  exists (select 1 from public.lead_activity where lead_id = (select lead from t_case where k = 'called') and kind = 'call_outcome')
  and exists (select 1 from public.whatsapp_messages where lead_id = (select lead from t_case where k = 'messaged') and status = 'delivered')
  and exists (select 1 from public.lead_activity where lead_id = (select lead from t_case where k = 'called') and kind = 'archived_set' and data ->> 'reason' = 'removed_from_my_leads'), null);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from t_fx), 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', (select admin_id::text from t_fx), true);
do $$ declare r jsonb; begin
  r := public.sales_remove_leads(array[(select lead from t_case where k = 'admin_lead')]);
  insert into t_results (name, ok, detail) values ('admin: sales_remove_leads is sales-only', r ->> 'error' = 'sales_only', r::text);
  r := public.leads_set_campaign(array[(select lead from t_case where k = 'b_lead'), (select lead from t_case where k = 'admin_lead')], (select camp from t_fx));
  insert into t_results (name, ok, detail) values ('admin: bulk campaign on any lead', (r ->> 'moved')::int = 2, r::text);
end $$;
reset role;

do $$ begin
  raise exception 'RESULTS %', (select json_agg(json_build_object('n', n, 'ok', ok, 'name', name, 'detail', detail) order by n) from t_results);
end $$;
