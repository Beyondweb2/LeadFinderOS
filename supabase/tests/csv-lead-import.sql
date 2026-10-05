-- CSV LEAD IMPORT (migration 20261010170000, fix/csv-lead-import). RUN AGAINST THE LIVE DATABASE; ALWAYS ROLLED BACK.
-- The last statement raises an exception carrying the results as JSON, so nothing here can ever commit: the fake
-- salespeople (example.invalid), their fixture leads (Ofcom's fictional 07700 900xxx numbers) and every imported row
-- disappear. Before the migration is applied, prepend it after `begin;`. Expect every row ok = true.
-- docs/pre-sales-certification/csv-import-fix.md
begin;
create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated; grant usage, select on sequence t_results_n_seq to authenticated;
insert into t_results (name, ok, detail) select 'fixtures: no live lead already uses the fictional 07700 900xxx range',
  count(*) = 0, count(*)::text from public.outreach_leads where public.phone_key(phone) like '7700900%';

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('eeeeeeee-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'imp-sales-a@example.invalid', '{}', '{}', now(), now()),
  ('eeeeeeee-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'imp-sales-b@example.invalid', '{}', '{}', now(), now()),
  ('eeeeeeee-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'imp-sales-c@example.invalid', '{}', '{}', now(), now()),
  ('eeeeeeee-0000-4000-8000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'imp-norole@example.invalid', '{}', '{}', now(), now());
insert into public.user_roles (user_id, role) values
  ('eeeeeeee-0000-4000-8000-0000000000a1', 'sales'), ('eeeeeeee-0000-4000-8000-0000000000b1', 'sales'), ('eeeeeeee-0000-4000-8000-0000000000c1', 'sales');
insert into public.team_members (user_id, display_name) values
  ('eeeeeeee-0000-4000-8000-0000000000a1', 'Imp A'), ('eeeeeeee-0000-4000-8000-0000000000b1', 'Imp B'), ('eeeeeeee-0000-4000-8000-0000000000c1', 'Imp C');
-- A and B are ready to sell; C has no onboarding record (not ready).
insert into public.salesperson_onboarding (user_id, age_18_confirmed_on, rtw_method, rtw_checked_on, rtw_checked_by, rtw_result, rtw_evidence_ref,
  bank_details_received_on, vat_registered, contractor_type, start_date, team_guide_version, team_guide_acknowledged_on)
select u, '2026-10-06', 'manual_video_call', '2026-10-06', 'QA', 'pass', 'QA', '2026-10-06', false, 'individual', '2026-10-06', 'team-guide-2026-10-02', '2026-10-06'
  from unnest(array['eeeeeeee-0000-4000-8000-0000000000a1', 'eeeeeeee-0000-4000-8000-0000000000b1']::uuid[]) u;
insert into t_results (name, ok, detail) select 'fixtures: A and B ready to sell, C not',
  public.salesperson_ready_to_sell('eeeeeeee-0000-4000-8000-0000000000a1') and public.salesperson_ready_to_sell('eeeeeeee-0000-4000-8000-0000000000b1')
  and not public.salesperson_ready_to_sell('eeeeeeee-0000-4000-8000-0000000000c1'), null;

-- Fixture leads, written with no signed-in user (the owner trigger leaves them as given).
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);
create temp table t_fx (k text primary key, id uuid);
grant select on t_fx to authenticated;
with ins as (
  insert into public.outreach_leads (user_id, business_name, phone, email, website, assigned_to_user_id, status, next_action, amount_paid) values
    (public.book_owner_id(), 'ZZ QA Import A Own Ltd',     '07700 900101', null, null, 'eeeeeeee-0000-4000-8000-0000000000a1', 'not_contacted', 'none', null),
    (public.book_owner_id(), 'ZZ QA Import B Own Ltd',     '07700 900202', null, null, 'eeeeeeee-0000-4000-8000-0000000000b1', 'not_contacted', 'none', null),
    (public.book_owner_id(), 'ZZ QA Import Unassigned',    '07700 900303', null, null, null,                                   'not_contacted', 'none', null),
    (public.book_owner_id(), 'ZZ QA Import Paul Own',      '07700 900404', 'paul-own@example.invalid', 'https://zz-qa-import-paul.example', public.book_owner_id(), 'not_contacted', 'none', null),
    (public.book_owner_id(), 'ZZ QA Import A Client',      '07700 900505', null, null, 'eeeeeeee-0000-4000-8000-0000000000a1', 'payment_received', 'none', 99)
  returning id, business_name)
insert into t_fx select case business_name when 'ZZ QA Import A Own Ltd' then 'a' when 'ZZ QA Import B Own Ltd' then 'b'
  when 'ZZ QA Import Unassigned' then 'u' when 'ZZ QA Import Paul Own' then 'p' else 'ac' end, id from ins;

-- ── Salesperson A ─────────────────────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-4000-8000-0000000000a1', true);
do $$
declare
  rows jsonb := jsonb_build_array(
    -- 1 new, with every protected field a CSV might try to inject
    jsonb_build_object('row', 2, 'business_name', '  ZZ QA Import New One  ', 'contact_name', 'Jo   Bloggs', 'phone', '07700 900601',
      'email', 'NEW1@Example.invalid', 'website', 'www.zz-qa-import-new1.example', 'address', '1 High St', 'postcode', 'zz1 1zz',
      'town', 'Testtown', 'trade', 'Plumber', 'notes', 'Met at the expo',
      'assigned_to_user_id', 'eeeeeeee-0000-4000-8000-0000000000b1', 'user_id', 'eeeeeeee-0000-4000-8000-0000000000b1',
      'status', 'payment_received', 'amount_paid', 999, 'sold_by_user_id', 'eeeeeeee-0000-4000-8000-0000000000b1',
      'list_type', 'imported', 'is_archived', true, 'is_potential_work', true, 'whatsapp_template', 'initial_contact',
      'queued_at', '2026-10-05T10:00:00Z', 'campaign_id', gen_random_uuid(), 'paid_signup_id', gen_random_uuid(),
      'contract_total_payments', 12, 'subscription_status', 'active', 'lead_source', 'referral'),
    -- 2 invalid phone (letters)
    jsonb_build_object('row', 3, 'business_name', 'ZZ QA Import Bad Phone', 'phone', 'call me'),
    -- 3 invalid phone (too short)
    jsonb_build_object('row', 4, 'business_name', 'ZZ QA Import Short Phone', 'phone', '12345'),
    -- 4 missing business name
    jsonb_build_object('row', 5, 'phone', '07700 900602'),
    -- 5 neither phone nor email
    jsonb_build_object('row', 6, 'business_name', 'ZZ QA Import No Contact', 'website', 'zz-qa-nocontact.example'),
    -- 6 invalid email
    jsonb_build_object('row', 7, 'business_name', 'ZZ QA Import Bad Email', 'email', 'not-an-email'),
    -- 7 duplicate inside the file (row 2's phone, other format)
    jsonb_build_object('row', 8, 'business_name', 'ZZ QA Import New One Again', 'phone', '+44 7700 900601'),
    -- 8 A's own existing lead → fill blanks (contact, email), never the phone
    jsonb_build_object('row', 9, 'business_name', 'ZZ QA Import A Own Ltd', 'phone', '+447700900101', 'contact_name', 'Alice', 'email', 'a-own@example.invalid'),
    -- 9 B's lead → skipped, no name, no id
    jsonb_build_object('row', 10, 'business_name', 'ZZ QA Import B (renamed)', 'phone', '07700900202', 'email', 'steal@example.invalid'),
    -- 10 unassigned existing → skipped, never claimed
    jsonb_build_object('row', 11, 'business_name', 'ZZ QA Import Unassigned', 'phone', '07700 900303'),
    -- 11 same name as Paul's lead, different phone → possible duplicate
    jsonb_build_object('row', 12, 'business_name', 'zz qa import paul own', 'phone', '07700 900603'),
    -- 12 same website as Paul's lead → possible duplicate
    jsonb_build_object('row', 13, 'business_name', 'ZZ QA Import Same Site', 'phone', '07700 900604', 'website', 'http://www.zz-qa-import-paul.example/contact'),
    -- 13 "+44 (0)" and a spreadsheet-dropped leading zero
    jsonb_build_object('row', 14, 'business_name', 'ZZ QA Import Paren Zero', 'phone', '+44 (0) 7700 900605'),
    jsonb_build_object('row', 15, 'business_name', 'ZZ QA Import Lost Zero', 'phone', '7700900606'),
    -- 15 A's CLIENT lead → skipped as already yours, never filled
    jsonb_build_object('row', 16, 'business_name', 'ZZ QA Import A Client', 'phone', '07700 900505', 'email', 'client-fill@example.invalid'));
  r jsonb; c jsonb; n int; byrow jsonb; l record; v_new uuid;
begin
  -- PREVIEW writes nothing
  select count(*) into n from public.outreach_leads where business_name ilike 'ZZ QA Import%';
  r := public.import_leads(rows, false, 'qa.csv');
  c := r -> 'counts';
  select jsonb_object_agg(x ->> 'row', x) into byrow from jsonb_array_elements(r -> 'rows') x;
  insert into t_results (name, ok, detail) values ('A preview: ok, not committed, 15 rows', (r ->> 'ok')::boolean and not (r ->> 'committed')::boolean and (c ->> 'rows')::int = 15, c::text);
  insert into t_results (name, ok, detail) values ('A preview: invalid 5 (2 phones, no name, no contact, bad email)', (c ->> 'invalid')::int = 5,
    (select string_agg((byrow -> k ->> 'reasons'), ' ') from unnest(array['3','4','5','6','7']) k));
  insert into t_results (name, ok, detail) values ('A preview: reasons named', byrow -> '3' -> 'reasons' ? 'invalid_phone' and byrow -> '4' -> 'reasons' ? 'invalid_phone'
    and byrow -> '5' -> 'reasons' ? 'missing_business_name' and byrow -> '6' -> 'reasons' ? 'no_phone_or_email' and byrow -> '7' -> 'reasons' ? 'invalid_email', null);
  insert into t_results (name, ok, detail) values ('A preview: in-file duplicate points at row 2', byrow -> '8' ->> 'outcome' = 'duplicate_in_file' and (byrow -> '8' ->> 'first_row')::int = 2, (byrow -> '8')::text);
  insert into t_results (name, ok, detail) values ('A preview: own lead → update (contact_name, email)', byrow -> '9' ->> 'outcome' = 'update'
    and byrow -> '9' -> 'fields' @> '["contact_name","email"]' and not (byrow -> '9' -> 'fields' ? 'phone'), (byrow -> '9')::text);
  insert into t_results (name, ok, detail) values ('A preview: B''s lead → skipped owned_by_other, NO owner name, NO id', byrow -> '10' ->> 'outcome' = 'skipped'
    and byrow -> '10' -> 'reasons' ? 'owned_by_other' and not (byrow -> '10' ? 'owner_name') and not (byrow -> '10' ? 'lead_id'), (byrow -> '10')::text);
  insert into t_results (name, ok, detail) values ('A preview: unassigned → skipped exists_unassigned', byrow -> '11' -> 'reasons' ? 'exists_unassigned' and not (byrow -> '11' ? 'lead_id'), (byrow -> '11')::text);
  insert into t_results (name, ok, detail) values ('A preview: same name → possible_duplicate_name; same website → possible_duplicate_website',
    byrow -> '12' -> 'reasons' ? 'possible_duplicate_name' and byrow -> '13' -> 'reasons' ? 'possible_duplicate_website', (byrow -> '12')::text || (byrow -> '13')::text);
  insert into t_results (name, ok, detail) values ('A preview: own CLIENT lead → skipped already_yours, nothing to fill', byrow -> '16' ->> 'outcome' = 'skipped'
    and byrow -> '16' -> 'reasons' ? 'already_yours' and not (byrow -> '16' ? 'fields'), (byrow -> '16')::text);
  insert into t_results (name, ok, detail) values ('A preview: new = 3 (rows 2, 14, 15)', (c ->> 'new')::int = 3 and byrow -> '2' ->> 'outcome' = 'new', c::text);
  insert into t_results (name, ok, detail) values ('A preview: wrote nothing', (select count(*) from public.outreach_leads where business_name ilike 'ZZ QA Import%') = n, null);

  -- COMMIT
  r := public.import_leads(rows, true, 'qa.csv');
  c := r -> 'counts';
  select jsonb_object_agg(x ->> 'row', x) into byrow from jsonb_array_elements(r -> 'rows') x;
  insert into t_results (name, ok, detail) values ('A commit: 3 created, 1 updated, 0 failed, 5 invalid kept out', (c ->> 'created')::int = 3 and (c ->> 'updated')::int = 1
    and (c ->> 'failed')::int = 0 and (c ->> 'invalid')::int = 5 and (r ->> 'import_id') is not null, c::text);
  v_new := (byrow -> '2' ->> 'lead_id')::uuid;
  insert into t_results (name, ok, detail) values ('A commit: created rows return their ids; skipped ones do not', v_new is not null and not (byrow -> '10' ? 'lead_id') and not (byrow -> '12' ? 'lead_id'), null);
end $$;
reset role;

-- Read back as the system (no RLS in the way).
do $$
declare l record; n int; v uuid;
begin
  select * into l from public.outreach_leads where business_name = 'ZZ QA Import New One';
  insert into t_results (name, ok, detail) values ('new row: owned by A, added by A, user_id = the book owner',
    l.assigned_to_user_id = 'eeeeeeee-0000-4000-8000-0000000000a1' and l.added_by_user_id = 'eeeeeeee-0000-4000-8000-0000000000a1' and l.user_id = public.book_owner_id(), l.assigned_to_user_id::text);
  insert into t_results (name, ok, detail) values ('new row: list_type manual (no ''imported''), country UK', l.list_type = 'manual' and l.country = 'UK', l.list_type);
  insert into t_results (name, ok, detail) values ('new row: NO injected field landed (status, paid, seller, archive, star, queue, campaign, sign-up, contract, subscription, source)',
    l.status = 'not_contacted' and l.next_action = 'none' and l.amount_paid is null and l.sold_by_user_id is null and l.sold_at is null
    and l.is_archived = false and l.is_potential_work = false and l.whatsapp_template is null and l.queued_at is null and l.campaign_id is null
    and l.paid_signup_id is null and l.contract_total_payments is null and l.subscription_status is null and l.lead_source is null
    and l.whatsapp_sent_at is null and l.outreach_attempts = 0, row_to_json(l)::text);
  insert into t_results (name, ok, detail) values ('new row: cleaned (trimmed name, collapsed contact, lower email, https website, postcode joined, trade, town)',
    l.business_name = 'ZZ QA Import New One' and l.contact_name = 'Jo Bloggs' and l.email = 'new1@example.invalid'
    and l.website = 'https://www.zz-qa-import-new1.example' and l.address = '1 High St, ZZ1 1ZZ' and l.search_keyword = 'Plumber'
    and l.category = 'Plumber' and l.search_location = 'Testtown' and l.phone = '07700 900601', row_to_json(l)::text);
  insert into t_results (name, ok, detail) values ('new row: history says CSV import (lead_added source csv_import, file, row) + the note',
    exists (select 1 from public.lead_activity where lead_id = l.id and kind = 'lead_added' and data ->> 'source' = 'csv_import' and data ->> 'file' = 'qa.csv' and (data ->> 'row')::int = 2
            and actor_user_id = 'eeeeeeee-0000-4000-8000-0000000000a1')
    and exists (select 1 from public.lead_activity where lead_id = l.id and kind = 'note' and body = 'Met at the expo'), null);
  insert into t_results (name, ok, detail) values ('new row: added to the Find Leads exclusion history',
    exists (select 1 from public.outreach_history where business_name = 'ZZ QA Import New One' and user_id = public.book_owner_id()), null);
  insert into t_results (name, ok, detail) values ('phones: "+44 (0) 7700 900605" → "+44 7700 900605"; "7700900606" → "07700900606"',
    (select phone from public.outreach_leads where business_name = 'ZZ QA Import Paren Zero') = '+44 7700 900605'
    and (select phone from public.outreach_leads where business_name = 'ZZ QA Import Lost Zero') = '07700900606', null);
  select * into l from public.outreach_leads where id = (select id from t_fx where k = 'a');
  insert into t_results (name, ok, detail) values ('A''s own lead: blanks filled (contact, email), phone and name untouched, details_set says CSV import',
    l.contact_name = 'Alice' and l.email = 'a-own@example.invalid' and l.phone = '07700 900101' and l.business_name = 'ZZ QA Import A Own Ltd'
    and exists (select 1 from public.lead_activity where lead_id = l.id and kind = 'details_set' and data ->> 'source' = 'CSV import'), row_to_json(l)::text);
  select * into l from public.outreach_leads where id = (select id from t_fx where k = 'b');
  insert into t_results (name, ok, detail) values ('B''s lead: untouched (still B''s, no email, no activity)',
    l.assigned_to_user_id = 'eeeeeeee-0000-4000-8000-0000000000b1' and l.email is null and l.business_name = 'ZZ QA Import B Own Ltd'
    and not exists (select 1 from public.lead_activity where lead_id = l.id), row_to_json(l)::text);
  insert into t_results (name, ok, detail) values ('unassigned lead: still unassigned, no activity (never claimed)',
    (select assigned_to_user_id is null from public.outreach_leads where id = (select id from t_fx where k = 'u'))
    and not exists (select 1 from public.lead_activity where lead_id = (select id from t_fx where k = 'u')), null);
  insert into t_results (name, ok, detail) values ('A''s client lead: email NOT filled',
    (select email is null from public.outreach_leads where id = (select id from t_fx where k = 'ac')), null);
  insert into t_results (name, ok, detail) values ('no bad row landed (bad phone / no contact / bad email / in-file duplicate / possible duplicates)',
    not exists (select 1 from public.outreach_leads where business_name in ('ZZ QA Import Bad Phone', 'ZZ QA Import Short Phone', 'ZZ QA Import No Contact',
      'ZZ QA Import Bad Email', 'ZZ QA Import New One Again', 'zz qa import paul own', 'ZZ QA Import Same Site')), null);
  insert into t_results (name, ok, detail) values ('NO CONTACT: nothing queued or sent for any ZZ import row',
    not exists (select 1 from public.outreach_leads where business_name ilike 'ZZ QA Import%' and (queued_at is not null or whatsapp_sent_at is not null or sms_queued_at is not null))
    and not exists (select 1 from public.whatsapp_sends s join public.outreach_leads ol on ol.id = s.lead_id where ol.business_name ilike 'ZZ QA Import%'), null);
end $$;

-- ── A again: the same file a second time creates nothing; 501 rows refused; 120 rows land ───────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-4000-8000-0000000000a1', true);
do $$
declare r jsonb; big jsonb;
begin
  r := public.import_leads(jsonb_build_array(
    jsonb_build_object('row', 2, 'business_name', 'ZZ QA Import New One', 'phone', '07700 900601'),
    jsonb_build_object('row', 3, 'business_name', 'ZZ QA Import Paren Zero', 'phone', '07700900605')), true, 'qa.csv');
  insert into t_results (name, ok, detail) values ('re-import: 0 created, both already yours', (r -> 'counts' ->> 'created')::int = 0
    and (select bool_and(x -> 'reasons' ? 'already_yours') from jsonb_array_elements(r -> 'rows') x), (r -> 'counts')::text);
  select jsonb_agg(jsonb_build_object('row', g + 1, 'business_name', 'ZZ QA Big ' || g, 'phone', '07700 900' || lpad((g % 1000)::text, 3, '0'))) into big
    from generate_series(1, 501) g;
  r := public.import_leads(big, false, 'big.csv');
  insert into t_results (name, ok, detail) values ('501 rows in one call → too_many_rows (max 500)', r ->> 'error' = 'too_many_rows' and (r ->> 'max')::int = 500, r::text);
  select jsonb_agg(jsonb_build_object('row', g + 1, 'business_name', 'ZZ QA Bulk ' || g, 'phone', '07700 900' || (700 + g)::text,
    'email', case when g = 60 then 'broken' else 'bulk' || g || '@example.invalid' end)) into big
    from generate_series(1, 120) g;
  r := public.import_leads(big, true, 'bulk.csv');
  insert into t_results (name, ok, detail) values ('120 rows with ONE bad row: 119 created, 1 invalid named, nothing else lost',
    (r -> 'counts' ->> 'created')::int = 119 and (r -> 'counts' ->> 'invalid')::int = 1
    and (select x ->> 'business_name' from jsonb_array_elements(r -> 'rows') x where x ->> 'outcome' = 'invalid') = 'ZZ QA Bulk 60', (r -> 'counts')::text);
  insert into t_results (name, ok, detail) values ('120 rows: every created lead is A''s',
    (select count(*) from public.sales_leads where business_name like 'ZZ QA Bulk %') = 119, null);
end $$;
reset role;

-- ── Salesperson B: sees A's import as someone else's ─────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-4000-8000-0000000000b1', true);
do $$
declare r jsonb; x jsonb;
begin
  r := public.import_leads(jsonb_build_array(jsonb_build_object('row', 2, 'business_name', 'Anything', 'phone', '07700 900601')), true, 'b.csv');
  x := r -> 'rows' -> 0;
  insert into t_results (name, ok, detail) values ('B importing A''s phone: skipped owned_by_other, no name, no id, nothing created',
    x -> 'reasons' ? 'owned_by_other' and not (x ? 'owner_name') and not (x ? 'lead_id') and (r -> 'counts' ->> 'created')::int = 0, x::text);
  insert into t_results (name, ok, detail) values ('B still cannot read A''s lead after the import',
    (select count(*) from public.sales_leads where business_name = 'ZZ QA Import New One') = 0, null);
end $$;
reset role;

-- ── Salesperson C (not onboarded) and a signed-in user with no role ──────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-4000-8000-0000000000c1', true);
do $$
declare r jsonb;
begin
  r := public.import_leads(jsonb_build_array(jsonb_build_object('business_name', 'ZZ QA Import C', 'phone', '07700 900990')), true, null);
  insert into t_results (name, ok, detail) values ('not-onboarded salesperson: refused (usage_paused, no reason shown), nothing created',
    r ->> 'error' = 'usage_paused' and r ->> 'reason' is null and not exists (select 1 from public.sales_leads where business_name = 'ZZ QA Import C'), r::text);
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-4000-8000-0000000000d1', true);
do $$
declare e text;
begin
  begin
    perform public.import_leads(jsonb_build_array(jsonb_build_object('business_name', 'ZZ QA Import NoRole', 'phone', '07700 900991')), true, null);
    e := 'no error';
  exception when others then e := sqlerrm;
  end;
  insert into t_results (name, ok, detail) values ('signed-in user with no role: refused (no_role)', e = 'no_role', e);
end $$;
reset role;
insert into t_results (name, ok, detail) select 'anon cannot execute import_leads; authenticated can',
  not has_function_privilege('anon', 'public.import_leads(jsonb, boolean, text)', 'execute')
  and has_function_privilege('authenticated', 'public.import_leads(jsonb, boolean, text)', 'execute'), null;

-- ── Paul (the admin) ─────────────────────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', public.book_owner_id(), 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', public.book_owner_id()::text, true);
do $$
declare r jsonb; byrow jsonb; l record;
begin
  r := public.import_leads(jsonb_build_array(
    jsonb_build_object('row', 2, 'business_name', 'ZZ QA Import Paul New', 'phone', '07700 900901', 'assigned_to_user_id', 'eeeeeeee-0000-4000-8000-0000000000a1'),
    jsonb_build_object('row', 3, 'business_name', 'Whatever', 'phone', '07700 900601')), true, 'paul.csv');
  select jsonb_object_agg(x ->> 'row', x) into byrow from jsonb_array_elements(r -> 'rows') x;
  select * into l from public.outreach_leads where business_name = 'ZZ QA Import Paul New';
  insert into t_results (name, ok, detail) values ('Paul import: owned by Paul even when the CSV names a salesperson',
    l.assigned_to_user_id = public.book_owner_id() and l.added_by_user_id = public.book_owner_id() and l.list_type = 'manual', (r -> 'counts')::text);
  insert into t_results (name, ok, detail) values ('Paul importing A''s lead: skipped owned_by_other, the admin sees the owner''s name, not reassigned',
    byrow -> '3' -> 'reasons' ? 'owned_by_other' and byrow -> '3' ->> 'owner_name' = 'Imp A'
    and (select assigned_to_user_id from public.outreach_leads where business_name = 'ZZ QA Import New One') = 'eeeeeeee-0000-4000-8000-0000000000a1', (byrow -> '3')::text);
end $$;
reset role;
-- Read as the system: every call went through the guard (A: preview, commit, re-import, bulk; Paul: one).
insert into t_results (name, ok, detail) select 'the guard logged every import call (4 for A, 1 for Paul; 501 refused before it)',
  count(*) filter (where user_id = 'eeeeeeee-0000-4000-8000-0000000000a1') = 4 and count(*) filter (where user_id = public.book_owner_id()) = 1,
  count(*)::text from public.api_usage_log where action = 'lead_import' and created_at >= now()
    and user_id in ('eeeeeeee-0000-4000-8000-0000000000a1', public.book_owner_id());

do $$ begin
  raise exception 'RESULTS %', (select json_agg(json_build_object('n', n, 'ok', ok, 'name', name, 'detail', left(detail, 400)) order by n) from t_results);
end $$;
