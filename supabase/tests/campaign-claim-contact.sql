-- Campaign admin-only + the claim rule by contact method (2026-09-28). RUN AGAINST THE LIVE DATABASE;
-- ALWAYS ROLLED BACK — the last statement raises the results as JSON, so nothing commits (fake users on
-- example.invalid, fixture campaigns, logged contacts, messages, audits). docs/multi-user.md §6.
begin;
-- sales_pool lost its authenticated grant on 2026-09-29 (no caller; it paged the whole pool). This suite still
-- uses it as the oracle for "is this lead in the claimable pool" -- a TEST-ONLY grant, rolled back with the rest.
grant execute on function public.sales_pool(text, integer, integer) to authenticated;
create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated, anon; grant usage, select on sequence t_results_n_seq to authenticated, anon;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('dddddddd-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ccc-a@example.invalid', '{}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ccc-b@example.invalid', '{}', '{}', now(), now());
insert into public.user_roles (user_id, role) values ('dddddddd-0000-4000-8000-00000000000a', 'sales'), ('dddddddd-0000-4000-8000-00000000000b', 'sales');
insert into public.team_members (user_id, display_name) values ('dddddddd-0000-4000-8000-00000000000a', 'CCC A'), ('dddddddd-0000-4000-8000-00000000000b', 'CCC B');

-- 22 unassigned, never-contacted leads (by the OLD rule and the new one), one per case below.
create temp table t_case (k text primary key, lead uuid, name text, pid text);
insert into t_case (k, lead, name, pid)
  select k, l.id, l.business_name, l.place_id from (
    select l.id, l.business_name, l.place_id, row_number() over (order by l.created_at) rn
    from public.outreach_leads l
    where l.assigned_to_user_id is null and l.is_archived is not true and l.status = 'not_contacted'
      and not public.lead_is_client(l.amount_paid, l.status) and public.lead_contact_attempt_at(l.id) is null
      and public.phone_key(l.phone) is not null
      and l.place_id is not null and not exists (select 1 from public.outreach_leads o where o.place_id = l.place_id and o.id <> l.id)
    order by l.created_at limit 22) l
  join (select k, row_number() over () rn from unnest(array[
    'call_no_answer', 'voicemail', 'email', 'linkedin', 'linkedin_voice', 'social', 'in_person', 'referral', 'video', 'sms', 'other',
    'whatsapp_sent', 'whatsapp_failed', 'audit_only', 'crawl_only', 'note_only', 'report_generated', 'link_sent_email',
    'own_campaign', 'b_lead', 'sync', 'spare']) k) x using (rn);
grant select on t_case to authenticated, anon;
create temp table t_fx as select
  (select id from public.campaigns order by created_at limit 1) as camp,
  (select user_id from public.team_members where is_book_owner limit 1) as admin_id;
insert into public.campaigns (id, name, created_by) values ('dddddddd-0000-4000-8000-0000000000c1', 'CCC A own campaign', 'dddddddd-0000-4000-8000-00000000000a');
grant select on t_fx to authenticated, anon;
insert into t_results (name, ok, detail) select 'fixtures: 22 claimable leads, a campaign, the admin', (select count(*) from t_case) = 22 and camp is not null and admin_id is not null, null from t_fx;
insert into t_results (name, ok, detail) select 'anon cannot execute ' || f, not has_function_privilege('anon', f, 'execute'), null
  from unnest(array['public.lead_contact_attempt_at(uuid)', 'public.lead_log_contact(uuid, text, text, text)', 'public.claim_lead(uuid)', 'public.sales_pool(text, integer, integer)']) f;

-- Every contact case starts as A's lead (so A may log on it); the non-contact cases stay unassigned.
update public.outreach_leads set assigned_to_user_id = 'dddddddd-0000-4000-8000-00000000000a', assigned_at = now()
  where id in (select lead from t_case where k in ('call_no_answer', 'voicemail', 'email', 'linkedin', 'linkedin_voice', 'social', 'in_person', 'referral', 'video', 'sms', 'other', 'own_campaign', 'sync'));
update public.outreach_leads set assigned_to_user_id = 'dddddddd-0000-4000-8000-00000000000b', assigned_at = now()
  where id = (select lead from t_case where k = 'b_lead');

-- ── as Sales A: campaigns, then log one contact per method ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'dddddddd-0000-4000-8000-00000000000a', true);
do $$ declare r jsonb; n int; begin
  -- CAMPAIGNS
  begin
    insert into public.campaigns (name, created_by) values ('CCC sales should not create', 'dddddddd-0000-4000-8000-00000000000a');
    insert into t_results (name, ok) values ('campaigns: Sales CREATE denied', false);
  exception when others then insert into t_results (name, ok, detail) values ('campaigns: Sales CREATE denied', sqlstate = '42501', sqlerrm); end;
  update public.campaigns set name = 'hijacked' where id = 'dddddddd-0000-4000-8000-0000000000c1';
  get diagnostics n = row_count;
  insert into t_results (name, ok, detail) values ('campaigns: Sales EDIT denied (even a campaign it created)', n = 0, n::text);
  update public.campaigns set name = 'hijacked' where id = (select camp from t_fx);
  get diagnostics n = row_count;
  insert into t_results (name, ok, detail) values ('campaigns: Sales EDIT of the admin''s campaign denied', n = 0, n::text);
  delete from public.campaigns where id = 'dddddddd-0000-4000-8000-0000000000c1';
  get diagnostics n = row_count;
  insert into t_results (name, ok, detail) values ('campaigns: Sales DELETE denied', n = 0, n::text);
  insert into t_results (name, ok, detail) values ('campaigns: Sales still SEES the campaigns', (select count(*) from public.campaigns) > 1, null);
  r := public.lead_set_campaign((select lead from t_case where k = 'own_campaign'), (select camp from t_fx));
  insert into t_results (name, ok, detail) values ('campaigns: Sales assigns an existing campaign to its OWN lead', (r ->> 'ok')::boolean
    and (select campaign_id from public.sales_leads where id = (select lead from t_case where k = 'own_campaign')) = (select camp from t_fx), r::text);
  begin perform public.lead_set_campaign((select lead from t_case where k = 'b_lead'), (select camp from t_fx)); insert into t_results (name, ok) values ('campaigns: Sales cannot set another rep''s lead', false);
  exception when others then insert into t_results (name, ok, detail) values ('campaigns: Sales cannot set another rep''s lead', sqlerrm = 'not_your_lead', sqlerrm); end;

  -- ONE LOGGED CONTACT PER METHOD
  r := public.lead_log_contact((select lead from t_case where k = 'call_no_answer'), 'call', 'no_answer', null);
  insert into t_results (name, ok, detail) values ('log: phone call / no answer', (r ->> 'ok')::boolean, r::text);
  r := public.lead_log_contact((select lead from t_case where k = 'voicemail'), 'call', 'left_voicemail', 'left a message');
  insert into t_results (name, ok, detail) values ('log: voicemail (call → left voicemail)', (r ->> 'ok')::boolean, r::text);
  r := public.lead_log_contact((select lead from t_case where k = 'email'), 'email', 'message_sent', null);
  insert into t_results (name, ok, detail) values ('log: email sent', (r ->> 'ok')::boolean, r::text);
  r := public.lead_log_contact((select lead from t_case where k = 'linkedin'), 'linkedin', 'message_sent', null);
  insert into t_results (name, ok, detail) values ('log: LinkedIn message', (r ->> 'ok')::boolean, r::text);
  r := public.lead_log_contact((select lead from t_case where k = 'linkedin_voice'), 'linkedin_voice', 'message_sent', null);
  insert into t_results (name, ok, detail) values ('log: LinkedIn voice note', (r ->> 'ok')::boolean, r::text);
  r := public.lead_log_contact((select lead from t_case where k = 'social'), 'social', 'message_sent', null);
  insert into t_results (name, ok, detail) values ('log: Facebook / social message', (r ->> 'ok')::boolean, r::text);
  r := public.lead_log_contact((select lead from t_case where k = 'in_person'), 'in_person', 'spoke_to_owner', null);
  insert into t_results (name, ok, detail) values ('log: in person / networking', (r ->> 'ok')::boolean, r::text);
  r := public.lead_log_contact((select lead from t_case where k = 'referral'), 'referral', 'message_sent', null);
  insert into t_results (name, ok, detail) values ('log: referral contact', (r ->> 'ok')::boolean, r::text);
  r := public.lead_log_contact((select lead from t_case where k = 'video'), 'video', 'message_sent', null);
  insert into t_results (name, ok, detail) values ('log: video outreach', (r ->> 'ok')::boolean, r::text);
  r := public.lead_log_contact((select lead from t_case where k = 'sms'), 'sms', 'message_sent', null);
  insert into t_results (name, ok, detail) values ('log: text message', (r ->> 'ok')::boolean, r::text);
  r := public.lead_log_contact((select lead from t_case where k = 'other'), 'other', 'message_sent', null);
  insert into t_results (name, ok, detail) values ('log: other', (r ->> 'ok')::boolean, r::text);
  r := public.lead_log_contact((select lead from t_case where k = 'sync'), 'whatsapp', 'message_sent', null);
  insert into t_results (name, ok, detail) values ('log: WhatsApp is refused by hand (the send records it)', r ->> 'error' = 'bad_channel', r::text);
  r := public.lead_log_contact((select lead from t_case where k = 'sync'), 'carrier_pigeon', 'message_sent', null);
  insert into t_results (name, ok, detail) values ('log: an unknown method is refused', r ->> 'error' = 'bad_channel', r::text);
  r := public.lead_log_contact((select lead from t_case where k = 'sync'), 'email', 'message_sent', 'intro email');
  insert into t_results (name, ok, detail) values ('sync: exactly ONE activity row per logged contact, with its method',
    (select count(*) from public.lead_activity where lead_id = (select lead from t_case where k = 'sync') and kind in ('contact_logged', 'call_outcome')) = 1
    and (select data ->> 'channel' from public.lead_activity where lead_id = (select lead from t_case where k = 'sync') and kind = 'contact_logged') = 'email'
    and (select body from public.lead_activity where lead_id = (select lead from t_case where k = 'sync') and kind = 'contact_logged') = 'intro email', null);
  insert into t_results (name, ok, detail) values ('sync: the call is stored as call_outcome, the rest as contact_logged',
    (select kind from public.lead_activity where lead_id = (select lead from t_case where k = 'call_no_answer') and kind in ('contact_logged', 'call_outcome')) = 'call_outcome'
    and (select kind from public.lead_activity where lead_id = (select lead from t_case where k = 'linkedin') and kind in ('contact_logged', 'call_outcome')) = 'contact_logged', null);
  insert into t_results (name, ok, detail) values ('sync: ownership unchanged by logging (same record, still A)',
    (select assigned_to_user_id from public.sales_leads where id = (select lead from t_case where k = 'sync')) = 'dddddddd-0000-4000-8000-00000000000a', null);
end $$;
reset role;

-- As the system: the non-hand-logged cases, then take every contact case back to UNASSIGNED
-- (the way an admin unassigning would leave it), so only "contacted" can protect it.
insert into public.whatsapp_messages (user_id, lead_id, direction, status, body, phone, test_mode, created_at)
  select l.user_id, l.id, 'outbound', 'delivered', 'ccc test', l.phone, false, now() from public.outreach_leads l where l.id = (select lead from t_case where k = 'whatsapp_sent');
insert into public.whatsapp_messages (user_id, lead_id, direction, status, body, phone, test_mode, created_at)
  select l.user_id, l.id, 'outbound', 'failed', 'ccc test', l.phone, false, now() from public.outreach_leads l where l.id = (select lead from t_case where k = 'whatsapp_failed');
insert into public.ai_audits (user_id, business_name, lead_id)
  select l.user_id, l.business_name, l.id from public.outreach_leads l where l.id in (select lead from t_case where k in ('audit_only', 'report_generated'));
insert into public.lead_activity (lead_id, actor_user_id, kind, data) values
  ((select lead from t_case where k = 'audit_only'), 'dddddddd-0000-4000-8000-00000000000a', 'audit_run', '{}'),
  ((select lead from t_case where k = 'crawl_only'), 'dddddddd-0000-4000-8000-00000000000a', 'crawl_run', '{}');
insert into public.lead_crawl_checks (lead_id, result) values ((select lead from t_case where k = 'crawl_only'), '{}');
insert into public.lead_activity (lead_id, actor_user_id, kind, body) values ((select lead from t_case where k = 'note_only'), 'dddddddd-0000-4000-8000-00000000000a', 'note', 'internal only');
insert into public.report_link_events (lead_id, audit_id, kind, channel)
  select a.lead_id, a.id, 'generated', 'copy' from public.ai_audits a where a.lead_id = (select lead from t_case where k = 'report_generated') order by a.created_at desc limit 1;
insert into public.onboarding_link_events (lead_id, kind, channel) values ((select lead from t_case where k = 'link_sent_email'), 'sent', 'email');
update public.outreach_leads set assigned_to_user_id = null, assigned_at = null where id in (select lead from t_case);

-- ── as Sales B: which of them may be claimed? ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'dddddddd-0000-4000-8000-00000000000b', true);
do $$ declare c record; r jsonb; want_claimable boolean; in_pool boolean; ident text; begin
  for c in select * from t_case where k not in ('own_campaign', 'b_lead', 'spare') order by k loop
    want_claimable := c.k in ('whatsapp_failed', 'audit_only', 'crawl_only', 'note_only', 'report_generated');
    in_pool := exists (select 1 from public.sales_pool(c.name, 200, 0) p where p.id = c.lead);
    select state into ident from public.lead_identity_lookup(jsonb_build_array(jsonb_build_object('k', '1', 'place_id', c.pid)));
    insert into t_results (name, ok, detail) values (
      c.k || ': ' || case when want_claimable then 'STILL claimable (in the pool, Find Leads says claimable)' else 'NOT claimable (out of the pool, Find Leads says protected)' end,
      in_pool = want_claimable and ident = case when want_claimable then 'claimable' else 'protected' end,
      json_build_object('in_pool', in_pool, 'identity', ident)::text);
    if not want_claimable then
      r := public.claim_lead(c.lead);
      insert into t_results (name, ok, detail) values (c.k || ': claim refused', r ->> 'error' = 'already_contacted', r::text);
    end if;
  end loop;
  r := public.claim_lead((select lead from t_case where k = 'audit_only'));
  insert into t_results (name, ok, detail) values ('audit_only: claim succeeds, same record', (r ->> 'ok')::boolean
    and (select assigned_to_user_id from public.sales_leads where id = (select lead from t_case where k = 'audit_only')) = 'dddddddd-0000-4000-8000-00000000000b', r::text);
end $$;
reset role;

-- ── the admin keeps every campaign power ──
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from t_fx), 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', (select admin_id::text from t_fx), true);
do $$ declare n int; begin
  insert into public.campaigns (id, name, created_by) values ('dddddddd-0000-4000-8000-0000000000c2', 'CCC admin campaign', (select admin_id from t_fx));
  insert into t_results (name, ok, detail) values ('campaigns: admin CREATE allowed', exists (select 1 from public.campaigns where id = 'dddddddd-0000-4000-8000-0000000000c2'), null);
  update public.campaigns set name = 'CCC renamed by admin' where id = 'dddddddd-0000-4000-8000-0000000000c2';
  get diagnostics n = row_count;
  insert into t_results (name, ok, detail) values ('campaigns: admin EDIT of own campaign allowed', n = 1, n::text);
  update public.campaigns set name = 'CCC renamed by admin' where id = 'dddddddd-0000-4000-8000-0000000000c1';
  get diagnostics n = row_count;
  insert into t_results (name, ok, detail) values ('campaigns: admin EDIT of a campaign a rep created allowed', n = 1, n::text);
  delete from public.campaigns where id in ('dddddddd-0000-4000-8000-0000000000c1', 'dddddddd-0000-4000-8000-0000000000c2');
  get diagnostics n = row_count;
  insert into t_results (name, ok, detail) values ('campaigns: admin DELETE allowed', n = 2, n::text);
end $$;
reset role;

do $$ begin
  raise exception 'RESULTS %', (select json_agg(json_build_object('n', n, 'ok', ok, 'name', name, 'detail', detail) order by n) from t_results);
end $$;
