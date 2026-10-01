-- Rolled-back live test: no current request can store status 'interested' (2026-10-02).
-- Output: QA_RESULT [ {check: bool}, ... ]; the final RAISE rolls everything back.
do $$
declare
  paul uuid := '9d5a7629-3171-4091-b3a4-43010a1d424d';
  test uuid := '262c1d64-05ad-42e8-a81b-7d25553aeff3';
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); d uuid := gen_random_uuid();
  e uuid := gen_random_uuid(); f uuid := gen_random_uuid(); g uuid := gen_random_uuid(); h uuid := gen_random_uuid();
  r jsonb; res jsonb := '[]'::jsonb;
begin
  insert into public.outreach_leads (id, user_id, business_name, status, phone, assigned_to_user_id, is_potential_work) values
    (a, paul, 'QA direct update',      'replied',        '+447700900401', paul, false),
    (c, paul, 'QA admin rpc',          'initial_contact','+447700900403', paul, false),
    (d, paul, 'QA sales rpc',          'not_contacted',  '+447700900404', test, false),
    (e, paul, 'QA raw revive',         'not_interested', '+447700900405', paul, false),
    (g, paul, 'QA previous_status',    'queued',         '+447700900407', paul, false),
    (h, paul, 'QA revive still works', 'not_interested', '+447700900408', paul, false);
  -- a legacy row that already holds the old status (history)
  alter table public.outreach_leads disable trigger trg_outreach_leads_no_legacy_interested;
  insert into public.outreach_leads (id, user_id, business_name, status, phone, assigned_to_user_id, is_potential_work)
  values (f, paul, 'QA legacy row', 'interested', '+447700900406', paul, false);
  alter table public.outreach_leads enable trigger trg_outreach_leads_no_legacy_interested;
  insert into public.contact_suppressions (lead_id, phone_e164, reason) values
    (e, public.phone_e164_key('+447700900405'), 'not_interested'),
    (h, public.phone_e164_key('+447700900408'), 'not_interested');

  -- 1. a direct row write (the admin's RLS / the service role / SQL)
  update public.outreach_leads set status = 'interested' where id = a;
  res := res || jsonb_build_object('direct update to interested → status kept (replied) + the star', (select status = 'replied' and is_potential_work from outreach_leads where id = a));
  -- 2. an insert
  insert into public.outreach_leads (id, user_id, business_name, status, phone) values (b, paul, 'QA insert', 'interested', '+447700900402');
  res := res || jsonb_build_object('insert with interested → not_contacted + the star', (select status = 'not_contacted' and is_potential_work from outreach_leads where id = b));

  perform set_config('request.jwt.claims', json_build_object('sub', paul, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', paul::text, true);
  -- 3. lead_set_stage('interested') as the admin
  r := public.lead_set_stage(c, 'interested');
  res := res || jsonb_build_object('admin lead_set_stage(interested) → ok, status kept, the star', (r->>'ok')::boolean and (select status = 'initial_contact' and is_potential_work from outreach_leads where id = c));
  res := res || jsonb_build_object('…History says Starred, not a stage change to interested', exists (select 1 from lead_activity where lead_id = c and kind = 'marked_interested') and not exists (select 1 from lead_activity where lead_id = c and kind = 'stage_changed'));
  -- 4. the raw legacy revive no longer revives or lifts a block
  update public.outreach_leads set status = 'interested' where id = e;
  res := res || jsonb_build_object('raw not_interested → interested stays Not interested (+ the star)', (select status = 'not_interested' and is_potential_work from outreach_leads where id = e));
  res := res || jsonb_build_object('…and lifts no block (only lead_revive revives)', exists (select 1 from contact_suppressions where lead_id = e));
  r := public.lead_revive(h);
  res := res || jsonb_build_object('lead_revive is unchanged: revives and lifts the block', r->>'status' = 'not_contacted' and not exists (select 1 from contact_suppressions where lead_id = h));
  -- 5. a restore from previous_status = 'interested' (queue cancel)
  update public.outreach_leads set previous_status = 'interested' where id = g;
  update public.outreach_leads set status = previous_status, previous_status = null where id = g;
  res := res || jsonb_build_object('restoring previous_status interested → status kept (queued) + the star', (select status = 'queued' and is_potential_work from outreach_leads where id = g));
  -- 6. history is untouched
  update public.outreach_leads set notes = 'touched' where id = f;
  update public.outreach_leads set status = 'interested' where id = f;
  res := res || jsonb_build_object('a legacy row keeps its stored interested (history is not rewritten)', (select status = 'interested' and not is_potential_work from outreach_leads where id = f));
  update public.outreach_leads set status = 'replied' where id = f;
  res := res || jsonb_build_object('…and can still move on to a real status', (select status = 'replied' from outreach_leads where id = f));
  -- 7. the other stages are unchanged
  r := public.lead_set_stage(c, 'price_given');
  res := res || jsonb_build_object('lead_set_stage(price_given) still writes the stage', (select status = 'price_given' from outreach_leads where id = c));

  -- 8. lead_set_stage('interested') as the salesperson who owns the lead
  perform set_config('request.jwt.claims', json_build_object('sub', test, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', test::text, true);
  r := public.lead_set_stage(d, 'interested');
  res := res || jsonb_build_object('sales lead_set_stage(interested) → ok, status kept, the star', (r->>'ok')::boolean and (select status = 'not_contacted' and is_potential_work from outreach_leads where id = d));
  res := res || jsonb_build_object('no new row anywhere stores interested', not exists (select 1 from outreach_leads where id in (a, b, c, d, e, g, h) and status = 'interested'));

  raise exception 'QA_RESULT %', res;
end $$;
