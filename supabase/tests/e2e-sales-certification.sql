-- END-TO-END SALES CERTIFICATION (2026-10-05, branch qa/end-to-end-sales-certification).
-- RUN AGAINST THE LIVE DATABASE; ALWAYS ROLLED BACK — the last statement raises the results as JSON, so nothing
-- commits. Fake users on example.invalid, fake leads named "ZZ E2E …" with no contact details (one reserved
-- 07700 900 9xx drama number that has no message history), no message, no payment, no real lead touched.
-- What it proves (docs/pre-sales-certification/end-to-end-sales-certification.md):
--   A  Ready to Sell: each practical item, missing ALONE, blocks; the rep can still sign in; Paul is never gated.
--   B  Find Leads / Add: a ready rep's add is theirs (no owner choice); a not-ready rep is refused; isolation.
--   D  Call workspace (server side): call log, duplicate tap, next action, notes; another rep is refused;
--      a rep who stops being ready keeps notes but loses calls.
--   E/H Sign-up creation snapshot → reassignment → creator not ready AND disabled → payment → creator stays seller;
--      the same flow with TWO sign-ups (manual payment) → review, never Paul.
--   I  An open review holds commission (hold function true), Not credited keeps it held.
begin;
create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated, anon, service_role; grant usage, select on sequence t_results_n_seq to authenticated, anon, service_role;

-- Sarah (S) and Tom (T) complete; N never onboarded; O complete (the "other" rep).
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('e2e00000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'e2e-sarah@example.invalid', '{}', '{}', now(), now()),
  ('e2e00000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'e2e-tom@example.invalid', '{}', '{}', now(), now()),
  ('e2e00000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'e2e-new@example.invalid', '{}', '{}', now(), now()),
  ('e2e00000-0000-4000-8000-0000000000a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'e2e-other@example.invalid', '{}', '{}', now(), now());
insert into public.user_roles (user_id, role) values
  ('e2e00000-0000-4000-8000-0000000000a1', 'sales'), ('e2e00000-0000-4000-8000-0000000000a2', 'sales'),
  ('e2e00000-0000-4000-8000-0000000000a3', 'sales'), ('e2e00000-0000-4000-8000-0000000000a4', 'sales');
insert into public.team_members (user_id, display_name) values
  ('e2e00000-0000-4000-8000-0000000000a1', 'E2E Sarah'), ('e2e00000-0000-4000-8000-0000000000a2', 'E2E Tom'),
  ('e2e00000-0000-4000-8000-0000000000a3', 'E2E New'), ('e2e00000-0000-4000-8000-0000000000a4', 'E2E Other');

create temp table t_fx as select
  (select user_id from public.team_members where is_book_owner limit 1) as admin_id,
  (select id from public.salesperson_document_versions where kind = 'team_guide' and status = 'approved' order by id desc limit 1) as guide,
  (select md5(string_agg(id::text || ':' || sold_by_user_id::text, ',' order by id)) from public.outreach_leads where sold_by_user_id is not null) as sold_hash_before,
  (select count(*) from public.sale_attribution_reviews) as reviews_before;
grant select on t_fx to authenticated, anon, service_role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.salesperson_onboarding (user_id, age_18_confirmed_on, rtw_method, rtw_checked_on, rtw_checked_by, rtw_result, rtw_evidence_ref,
  bank_details_received_on, vat_registered, contractor_type, start_date, team_guide_version, team_guide_acknowledged_on, updated_by)
select u, current_date, 'manual_video_call', current_date, 'Paul', 'pass', 'Secure folder / RTW / E2E', current_date, false, 'individual',
  current_date, (select guide from t_fx), current_date, (select admin_id from t_fx)
  from unnest(array['e2e00000-0000-4000-8000-0000000000a1', 'e2e00000-0000-4000-8000-0000000000a2', 'e2e00000-0000-4000-8000-0000000000a4']::uuid[]) u;
reset role;

insert into t_results (name, ok, detail) select 'setup: the approved team guide exists; Sarah, Tom, Other READY; New NOT ready', guide is not null
  and public.salesperson_ready_to_sell('e2e00000-0000-4000-8000-0000000000a1') and public.salesperson_ready_to_sell('e2e00000-0000-4000-8000-0000000000a2')
  and public.salesperson_ready_to_sell('e2e00000-0000-4000-8000-0000000000a4') and not public.salesperson_ready_to_sell('e2e00000-0000-4000-8000-0000000000a3'), guide from t_fx;

-- ── A. Ready to Sell, item by item (on Other's complete row; each item removed ALONE, then restored) ──
do $$
declare
  o uuid := 'e2e00000-0000-4000-8000-0000000000a4';
  m text[]; g jsonb; item text;
  base public.salesperson_onboarding%rowtype;
begin
  select * into base from public.salesperson_onboarding where user_id = o;
  foreach item in array array['age_18', 'right_to_work', 'right_to_work_result', 'bank_details', 'vat', 'vat_number', 'contractor_status',
                              'company_details', 'start_date', 'team_guide', 'login', 'suspended'] loop
    case item
      when 'age_18' then update public.salesperson_onboarding set age_18_confirmed_on = null where user_id = o;
      when 'right_to_work' then update public.salesperson_onboarding set rtw_checked_on = null where user_id = o;
      when 'right_to_work_result' then update public.salesperson_onboarding set rtw_result = 'fail' where user_id = o;
      when 'bank_details' then update public.salesperson_onboarding set bank_details_received_on = null where user_id = o;
      when 'vat' then update public.salesperson_onboarding set vat_registered = null where user_id = o;
      when 'vat_number' then update public.salesperson_onboarding set vat_registered = true, vat_number = null where user_id = o;
      when 'contractor_status' then update public.salesperson_onboarding set contractor_type = null where user_id = o;
      when 'company_details' then update public.salesperson_onboarding set contractor_type = 'limited_company', company_name = 'E2E Ltd', company_number = null where user_id = o;
      when 'start_date' then update public.salesperson_onboarding set start_date = null where user_id = o;
      when 'team_guide' then update public.salesperson_onboarding set team_guide_acknowledged_on = null where user_id = o;
      when 'login' then update public.team_members set status = 'disabled', disabled_at = now() where user_id = o;
      when 'suspended' then update public.team_members set suspended_at = now() where user_id = o;
    end case;
    m := public.salesperson_onboarding_missing(o);
    g := public.guard_action(o, 'lead_search', null, 0, 1, 'search-leads');
    insert into t_results (name, ok, detail) values ('A: missing ' || item || ' ALONE → not Ready, Find Leads refused (' ||
        case item when 'suspended' then 'suspended' else 'not_onboarded' end || '), only that item listed',
      not public.salesperson_ready_to_sell(o) and coalesce((g ->> 'ok')::boolean, false) = false
        and g ->> 'reason' = case item when 'suspended' then 'suspended' else 'not_onboarded' end
        and cardinality(m) = 1
        and m[1] = case item when 'right_to_work_result' then 'right_to_work' when 'vat_number' then 'vat' when 'company_details' then 'contractor_status'
                             when 'team_guide_version' then 'team_guide' else item end,
      array_to_string(m, ',') || ' / ' || coalesce(g ->> 'reason', '?'));
    -- restore
    update public.salesperson_onboarding set age_18_confirmed_on = base.age_18_confirmed_on, rtw_checked_on = base.rtw_checked_on, rtw_result = base.rtw_result,
      bank_details_received_on = base.bank_details_received_on, vat_registered = base.vat_registered, vat_number = base.vat_number,
      contractor_type = base.contractor_type, company_name = base.company_name, company_number = base.company_number, start_date = base.start_date,
      team_guide_acknowledged_on = base.team_guide_acknowledged_on, team_guide_version = base.team_guide_version where user_id = o;
    update public.team_members set status = 'active', disabled_at = null, suspended_at = null where user_id = o;
  end loop;
  insert into t_results (name, ok, detail) values ('A: after every item is restored the rep is Ready again', public.salesperson_ready_to_sell(o), null);
  begin update public.salesperson_onboarding set team_guide_version = 'not-a-guide' where user_id = o;
    insert into t_results (name, ok) values ('A: acknowledging something that is not the team guide is refused by the database', false);
  exception when others then insert into t_results (name, ok, detail) values ('A: acknowledging something that is not the team guide is refused by the database', true, sqlerrm); end;
  -- VAT registered WITH a number, and a limited company with full details, are both fine.
  update public.salesperson_onboarding set vat_registered = true, vat_number = 'GB123456789', contractor_type = 'limited_company', company_name = 'E2E Ltd',
    company_number = '01234567', company_contract_confirmed_on = current_date where user_id = o;
  insert into t_results (name, ok, detail) values ('A: VAT registered with a number + a limited company with full details → Ready', public.salesperson_ready_to_sell(o),
    array_to_string(public.salesperson_onboarding_missing(o), ','));
  update public.salesperson_onboarding set vat_registered = false, vat_number = null, contractor_type = 'individual', company_name = null, company_number = null,
    company_contract_confirmed_on = null where user_id = o;
  -- INFORMATION (not a pass/fail rule today): a start date in the FUTURE.
  update public.salesperson_onboarding set start_date = current_date + 30 where user_id = o;
  insert into t_results (name, ok, detail) values ('A (info): a start date 30 days in the future — Ready to Sell today?', true,
    case when public.salesperson_ready_to_sell(o) then 'READY (only a missing start date blocks)' else 'not ready' end);
  update public.salesperson_onboarding set start_date = current_date where user_id = o;
  -- Never-onboarded rep: every practical item listed, the paperwork never.
  m := public.salesperson_onboarding_missing('e2e00000-0000-4000-8000-0000000000a3');
  insert into t_results (name, ok, detail) values ('A: a never-onboarded rep lists the 7 practical items and NO paperwork / TPS',
    m @> array['age_18', 'right_to_work', 'bank_details', 'vat', 'contractor_status', 'start_date', 'team_guide']
      and not (m && array['agreement', 'contractor_agreement', 'privacy_notice', 'tps', 'ctps']), array_to_string(m, ','));
  -- Paul.
  g := public.guard_action((select admin_id from t_fx), 'lead_search', null, 0, 1, 'search-leads');
  insert into t_results (name, ok, detail) values ('A: Paul (admin) is never gated by onboarding (Find Leads guard ok)',
    coalesce(g ->> 'reason', '') <> 'not_onboarded' and (g ->> 'ok')::boolean, g::text);
  foreach item in array array['claim', 'whatsapp_queue', 'whatsapp_send', 'sales_check', 'hook_audit', 'prospect_preview', 'lead_add'] loop
    g := public.guard_action('e2e00000-0000-4000-8000-0000000000a3', item, null, 0, 1, 'e2e');
    insert into t_results (name, ok, detail) values ('A: not-ready rep refused ' || item || ' (not_onboarded)', g ->> 'reason' = 'not_onboarded', g::text);
    g := public.guard_action('e2e00000-0000-4000-8000-0000000000a1', item, null, 0, 1, 'e2e');
    insert into t_results (name, ok, detail) values ('A: ready rep NOT refused ' || item || ' for onboarding', coalesce(g ->> 'reason', '') <> 'not_onboarded', g::text);
  end loop;
end $$;

-- The not-ready rep can sign in and read their own status.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2e00000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'e2e00000-0000-4000-8000-0000000000a3', true);
do $$ declare s jsonb; r jsonb; begin
  s := to_jsonb(public.my_onboarding_status());
  insert into t_results (name, ok, detail) values ('A: the not-ready rep (signed in) reads their own status: not ready, with the missing items',
    s::text like '%false%' and s::text like '%bank_details%', left(s::text, 300));
  r := public.sales_add_lead(jsonb_build_object('business_name', 'ZZ E2E not-ready add', 'search_keyword', 'plumber', 'search_location', 'Leeds'));
  insert into t_results (name, ok, detail) values ('B: a NOT-ready rep cannot add a lead', coalesce((r ->> 'ok')::boolean, false) = false, r::text);
  insert into t_results (name, ok, detail) values ('B: …and nothing was created', not exists (select 1 from public.sales_leads where business_name = 'ZZ E2E not-ready add'), null);
end $$;
reset role;

-- ── B. Find Leads / Add as Sarah (ready) ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2e00000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'e2e00000-0000-4000-8000-0000000000a1', true);
do $$ declare r jsonb; r2 jsonb; begin
  r := public.sales_add_lead(jsonb_build_object('business_name', 'ZZ E2E Sarah Plumbing', 'search_keyword', 'plumber', 'search_location', 'Leeds',
         'phone', '+447700900951', 'assigned_to_user_id', 'e2e00000-0000-4000-8000-0000000000a2', 'user_id', 'e2e00000-0000-4000-8000-0000000000a2'));
  insert into t_results (name, ok, detail) values ('B: Sarah (ready) adds a lead', (r ->> 'ok')::boolean, r::text);
  r2 := public.sales_add_lead(jsonb_build_object('business_name', 'ZZ E2E Sarah Plumbing again', 'search_keyword', 'plumber', 'search_location', 'Leeds', 'phone', '07700 900951'));
  insert into t_results (name, ok, detail) values ('B: the same phone again → "exists, yours" (one business, one record)', r2 ->> 'error' = 'exists' and r2 ->> 'state' = 'yours', r2::text);
  insert into t_results (name, ok, detail) values ('B: Sarah sees it in her own leads', exists (select 1 from public.sales_leads where business_name = 'ZZ E2E Sarah Plumbing'), null);
end $$;
reset role;
create temp table t_lead as select id from public.outreach_leads where business_name = 'ZZ E2E Sarah Plumbing';
grant select on t_lead to authenticated, service_role;
insert into t_results (name, ok, detail) select 'B: owner = Sarah, added by Sarah, book = Paul — the owner/user_id she tried to pass (Tom) was ignored',
  assigned_to_user_id = 'e2e00000-0000-4000-8000-0000000000a1' and added_by_user_id = 'e2e00000-0000-4000-8000-0000000000a1' and user_id = (select admin_id from t_fx),
  assigned_to_user_id::text from public.outreach_leads where id = (select id from t_lead);

-- Other (ready) cannot see, claim, call, note or schedule Sarah's lead.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2e00000-0000-4000-8000-0000000000a4","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'e2e00000-0000-4000-8000-0000000000a4', true);
do $$ declare r jsonb; v uuid := (select id from t_lead); begin
  insert into t_results (name, ok, detail) values ('B/D: another rep cannot read Sarah''s lead (sales_leads, outreach_leads)',
    not exists (select 1 from public.sales_leads where id = v) and not exists (select 1 from public.outreach_leads where id = v), null);
  r := public.claim_lead(v);
  insert into t_results (name, ok, detail) values ('B: another rep claiming it → already_owned (by name)', r ->> 'error' = 'already_owned', r::text);
  begin perform public.lead_log_contact(v, 'call', 'no_answer', 'x'); insert into t_results (name, ok) values ('D: another rep cannot log a call on it', false);
  exception when others then insert into t_results (name, ok, detail) values ('D: another rep cannot log a call on it', sqlerrm = 'not_your_lead', sqlerrm); end;
  begin perform public.lead_set_follow_up(v, 'call', current_date + 1, 'x', null, false, null); insert into t_results (name, ok) values ('D: another rep cannot set its Next Action', false);
  exception when others then insert into t_results (name, ok, detail) values ('D: another rep cannot set its Next Action', sqlerrm = 'not_your_lead', sqlerrm); end;
  begin perform public.lead_set_details(v, 'Hijack', null, null); insert into t_results (name, ok) values ('D: another rep cannot edit its details', false);
  exception when others then insert into t_results (name, ok, detail) values ('D: another rep cannot edit its details', sqlerrm = 'not_your_lead', sqlerrm); end;
  begin perform public.lead_set_stage(v, 'not_interested'); insert into t_results (name, ok) values ('D: another rep cannot change its stage', false);
  exception when others then insert into t_results (name, ok, detail) values ('D: another rep cannot change its stage', sqlerrm = 'not_your_lead', sqlerrm); end;
end $$;
reset role;

-- ── D. Call workspace as Sarah on her own lead ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2e00000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'e2e00000-0000-4000-8000-0000000000a1', true);
do $$ declare r jsonb; r2 jsonb; v uuid := (select id from t_lead); st text; begin
  select status into st from public.sales_leads where id = v;
  r := public.lead_log_contact(v, 'call', 'no_answer', 'E2E rang, no answer');
  r2 := public.lead_log_contact(v, 'call', 'no_answer', 'E2E rang, no answer');
  insert into t_results (name, ok, detail) values ('D: Sarah logs a call (no answer); an identical second tap is a duplicate, not a second row',
    (r ->> 'ok')::boolean and (r2 ->> 'duplicate')::boolean
      and (select count(*) from public.lead_activity where lead_id = v and kind = 'call_outcome') = 1, r::text || r2::text);
  r := public.lead_log_contact(v, 'call', 'bad_outcome_value', null);
  insert into t_results (name, ok, detail) values ('D: an unknown call outcome is refused', r ->> 'error' = 'bad_outcome', r::text);
  r := public.lead_set_follow_up(v, 'call', current_date + 1, 'E2E call back after 10', '10:30', false, null);
  insert into t_results (name, ok, detail) values ('D: Sarah sets a Next Action (Call, tomorrow 10:30, note)', coalesce((r ->> 'ok')::boolean, true)
    and exists (select 1 from public.sales_leads where id = v and next_action = 'call'), r::text);
  r := public.lead_set_details(v, 'E2E Owner Name', null, null);
  insert into t_results (name, ok, detail) values ('D: Sarah records the contact name (Details)', coalesce((r ->> 'ok')::boolean, true)
    and exists (select 1 from public.sales_leads where id = v and contact_name = 'E2E Owner Name'), r::text);
  insert into t_results (name, ok, detail) values ('D: History shows the call, the Next Action and the details under Sarah',
    (select count(distinct kind) from public.lead_activity where lead_id = v and actor_user_id = 'e2e00000-0000-4000-8000-0000000000a1') >= 3,
    (select string_agg(distinct kind, ',') from public.lead_activity where lead_id = v));
end $$;
reset role;

-- Sarah's readiness lapses (bank details withdrawn): notes allowed, calls refused; Paul can still act.
update public.salesperson_onboarding set bank_details_received_on = null where user_id = 'e2e00000-0000-4000-8000-0000000000a1';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2e00000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'e2e00000-0000-4000-8000-0000000000a1', true);
do $$ declare v uuid := (select id from t_lead); r jsonb; begin
  begin perform public.lead_log_contact(v, 'call', 'spoke_to_owner', 'E2E not ready'); insert into t_results (name, ok) values ('D: a rep who stops being ready cannot log a call', false);
  exception when others then insert into t_results (name, ok, detail) values ('D: a rep who stops being ready cannot log a call', sqlerrm = 'not_ready_to_sell', sqlerrm); end;
  r := public.claim_lead(gen_random_uuid());
  insert into t_results (name, ok, detail) values ('D: …and a claim attempt returns no success (claim refusal itself: salesperson-onboarding-rls.sql)', coalesce((r ->> 'ok')::boolean, false) = false, r::text);
end $$;
reset role;
update public.salesperson_onboarding set bank_details_received_on = current_date where user_id = 'e2e00000-0000-4000-8000-0000000000a1';

-- ── E/H. THE SCENARIO: Sarah (ready) creates the sign-up → lead reassigned to Tom → Sarah not ready AND disabled → paid ──
create temp table t_su (k text primary key, id uuid);
grant select on t_su to authenticated, service_role;
insert into t_su values ('S1', gen_random_uuid()), ('M1', gen_random_uuid()), ('M2', gen_random_uuid());
insert into public.outreach_leads (id, user_id, assigned_to_user_id, added_by_user_id, business_name, search_keyword, search_location, country, status)
values (gen_random_uuid(), (select admin_id from t_fx), 'e2e00000-0000-4000-8000-0000000000a1', 'e2e00000-0000-4000-8000-0000000000a1',
        'ZZ E2E manual two signups', 'roofer', 'Leeds', 'UK', 'not_contacted');
create temp table t_lead2 as select id from public.outreach_leads where business_name = 'ZZ E2E manual two signups';
grant select on t_lead2 to authenticated, service_role;
insert into public.onboarding_responses (id, lead_id, business_name) values
  ((select id from t_su where k = 'S1'), (select id from t_lead), 'ZZ E2E Sarah Plumbing'),
  ((select id from t_su where k = 'M1'), (select id from t_lead2), 'ZZ E2E manual two signups'),
  ((select id from t_su where k = 'M2'), (select id from t_lead2), 'ZZ E2E manual two signups');
-- What quick-close logs after its Ready-to-Sell gate (server-written; v3: NO Stripe session yet).
insert into public.quick_close_events (lead_id, onboarding_id, actor_user_id, kind, data) values
  ((select id from t_lead), (select id from t_su where k = 'S1'), 'e2e00000-0000-4000-8000-0000000000a1', 'link_generated', '{"e2e": true, "session": null}'),
  ((select id from t_lead2), (select id from t_su where k = 'M1'), 'e2e00000-0000-4000-8000-0000000000a1', 'link_generated', '{"e2e": true, "session": null}'),
  ((select id from t_lead2), (select id from t_su where k = 'M2'), 'e2e00000-0000-4000-8000-0000000000a1', 'link_generated', '{"e2e": true, "session": null}');
insert into t_results (name, ok, detail) select 'E: the sign-up creation is snapshotted — creator Sarah, role sales, READY at that moment, no session, this exact sign-up + lead',
  creator_user_id = 'e2e00000-0000-4000-8000-0000000000a1' and creator_role = 'sales' and creator_ready is true and checkout_session_id is null
  and lead_id = (select id from t_lead), null from public.sale_creations where onboarding_id = (select id from t_su where k = 'S1');
do $$ begin
  begin update public.sale_creations set creator_user_id = 'e2e00000-0000-4000-8000-0000000000a2' where onboarding_id = (select id from t_su where k = 'S1');
    insert into t_results (name, ok) values ('E: the creation snapshot cannot be rewritten (even by the database owner)', false);
  exception when others then insert into t_results (name, ok, detail) values ('E: the creation snapshot cannot be rewritten (even by the database owner)', true, sqlerrm); end;
end $$;
-- Tuesday: Paul reassigns to Tom; Sarah becomes not ready and is then DISABLED.
update public.outreach_leads set assigned_to_user_id = 'e2e00000-0000-4000-8000-0000000000a2', assigned_at = now() where id = (select id from t_lead);
update public.salesperson_onboarding set bank_details_received_on = null where user_id = 'e2e00000-0000-4000-8000-0000000000a1';
update public.team_members set status = 'disabled', disabled_at = now() where user_id = 'e2e00000-0000-4000-8000-0000000000a1';
insert into t_results (name, ok, detail) select 'H setup: lead now Tom''s, Sarah not ready AND disabled',
  (select assigned_to_user_id = 'e2e00000-0000-4000-8000-0000000000a2' from public.outreach_leads where id = (select id from t_lead))
  and not public.salesperson_ready_to_sell('e2e00000-0000-4000-8000-0000000000a1'), null;
-- Wednesday: the client signs v3 and pays (what stripe-webhook writes in ONE update with the money).
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.outreach_leads set amount_paid = 99, status = 'payment_received', payment_date = now(),
  paid_checkout_session_id = 'cs_e2e_after_sign_1', paid_signup_id = (select id from t_su where k = 'S1') where id = (select id from t_lead);
update public.outreach_leads set amount_paid = 99, status = 'payment_received', payment_date = now() where id = (select id from t_lead2);
reset role;
insert into t_results (name, ok, detail) select 'H: SELLER = SARAH (creator of the paid sign-up) — not Tom (owner), not Paul; no review',
  sold_by_user_id = 'e2e00000-0000-4000-8000-0000000000a1' and paid_signup_id = (select id from t_su where k = 'S1')
  and not exists (select 1 from public.sale_attribution_reviews where lead_id = (select id from t_lead)) and not public.sale_attribution_held((select id from t_lead)),
  coalesce(sold_by_user_id::text, 'null') from public.outreach_leads where id = (select id from t_lead);
update public.outreach_leads set assigned_to_user_id = (select admin_id from t_fx), sold_by_user_id = (select admin_id from t_fx), status = 'in_delivery' where id = (select id from t_lead);
insert into t_results (name, ok, detail) select 'H: a later reassignment to Paul + a direct seller rewrite leave Sarah as seller',
  sold_by_user_id = 'e2e00000-0000-4000-8000-0000000000a1', coalesce(sold_by_user_id::text, 'null') from public.outreach_leads where id = (select id from t_lead);
insert into t_results (name, ok, detail) select 'H: manual payment with TWO plausible sign-ups → NO seller (never Paul, never "latest"), REVIEW ambiguous_manual_payment, HELD',
  (select sold_by_user_id is null and sold_at is not null from public.outreach_leads where id = (select id from t_lead2))
  and (select reason = 'ambiguous_manual_payment' and status = 'open' from public.sale_attribution_reviews where lead_id = (select id from t_lead2))
  and public.sale_attribution_held((select id from t_lead2))
  and exists (select 1 from public.sale_attribution_holds where lead_id = (select id from t_lead2)), null;

-- ── I. Not credited keeps the hold; a decided review cannot be re-decided ──
do $$ declare r jsonb; begin
  r := to_jsonb(public.resolve_sale_attribution_review((select id from t_lead2), 'not_credited', 'E2E not credited', (select admin_id from t_fx)));
  insert into t_results (name, ok, detail) values ('I: Not credited → no seller, still HELD (no commission), evidence kept',
    (select sold_by_user_id is null from public.outreach_leads where id = (select id from t_lead2))
    and public.sale_attribution_held((select id from t_lead2))
    and (select status = 'not_credited' and evidence <> '{}'::jsonb from public.sale_attribution_reviews where lead_id = (select id from t_lead2)), r::text);
  begin
    r := to_jsonb(public.resolve_sale_attribution_review((select id from t_lead2), 'confirmed', 'E2E second decision', (select admin_id from t_fx)));
    insert into t_results (name, ok, detail) values ('I: a decided review cannot be decided again', coalesce((r ->> 'ok')::boolean, false) = false
      and (select status = 'not_credited' from public.sale_attribution_reviews where lead_id = (select id from t_lead2)), r::text);
  exception when others then insert into t_results (name, ok, detail) values ('I: a decided review cannot be decided again', true, sqlerrm); end;
end $$;

insert into t_results (name, ok, detail) select 'HISTORY: every pre-existing seller untouched (hash) and no pre-existing review touched',
  (select md5(string_agg(id::text || ':' || sold_by_user_id::text, ',' order by id)) from public.outreach_leads where sold_by_user_id is not null
     and id not in ((select id from t_lead), (select id from t_lead2))) = sold_hash_before, null from t_fx;

do $$ begin
  raise exception 'QA_RESULT %', (select jsonb_build_object('passed', count(*) filter (where ok), 'failed', count(*) filter (where ok is not true),
    'results', jsonb_agg(jsonb_build_object('n', n, 'ok', ok, 'name', name, 'detail', detail) order by n)) from t_results);
end $$;
