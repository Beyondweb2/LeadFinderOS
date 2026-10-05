-- READY-TO-SELL FIXTURE (2026-10-05, E2E certification; inside this suite's own rolled-back transaction). Since
-- migration 20261010120000 a salesperson who has not finished onboarding is refused claims, calls, campaigns and
-- queueing, so this suite could no longer reach its own rules. The readiness rule itself is tested by
-- salesperson-onboarding-rls.sql and ready-to-sell-paperwork.sql. Here: every FAKE salesperson the suite creates
-- (auth.users email ending .invalid) is onboarded complete, so pre-gate suites exercise their own rules again.
create function public.qa_tmp_autoonboard() returns trigger language plpgsql security definer set search_path = public as $q$
begin
  if new.role = 'sales' and exists (select 1 from auth.users u where u.id = new.user_id and u.email like '%.invalid') then
    insert into public.salesperson_onboarding (user_id, age_18_confirmed_on, rtw_method, rtw_checked_on, rtw_checked_by, rtw_result,
      rtw_evidence_ref, bank_details_received_on, vat_registered, contractor_type, start_date, team_guide_version, team_guide_acknowledged_on)
    values (new.user_id, current_date, 'manual_video_call', current_date, 'QA', 'pass', 'QA', current_date, false, 'individual', current_date,
      (select id from public.salesperson_document_versions where kind = 'team_guide' and status = 'approved' order by id desc limit 1), current_date)
    on conflict (user_id) do nothing;
  end if;
  return new;
end $q$;
create trigger qa_tmp_autoonboard after insert on public.user_roles for each row execute function public.qa_tmp_autoonboard();
-- Existing sales accounts (Test, test1) made Ready INSIDE this rolled-back transaction only.
insert into public.salesperson_onboarding (user_id, age_18_confirmed_on, rtw_method, rtw_checked_on, rtw_checked_by, rtw_result,
  rtw_evidence_ref, bank_details_received_on, vat_registered, contractor_type, start_date, team_guide_version, team_guide_acknowledged_on)
select r.user_id, current_date, 'manual_video_call', current_date, 'QA', 'pass', 'QA', current_date, false, 'individual', current_date,
  (select id from public.salesperson_document_versions where kind = 'team_guide' and status = 'approved' order by id desc limit 1), current_date
from public.user_roles r where r.role = 'sales'
on conflict (user_id) do update set age_18_confirmed_on = excluded.age_18_confirmed_on, rtw_method = excluded.rtw_method,
  rtw_checked_on = excluded.rtw_checked_on, rtw_checked_by = excluded.rtw_checked_by, rtw_result = excluded.rtw_result,
  rtw_evidence_ref = excluded.rtw_evidence_ref, bank_details_received_on = excluded.bank_details_received_on,
  vat_registered = excluded.vat_registered, contractor_type = excluded.contractor_type, start_date = excluded.start_date,
  team_guide_version = excluded.team_guide_version, team_guide_acknowledged_on = excluded.team_guide_acknowledged_on, end_date = null;
-- The claim rule (lead_claim_block, 2026-10-01). RUN AGAINST THE LIVE DATABASE; ALWAYS ROLLED BACK (the block
-- ends by RAISING its results). Fake leads only; no message, no real lead touched.
do $$
declare
  rep uuid := 'dddddddd-0000-4000-8000-00000000000a';
  other uuid := 'dddddddd-0000-4000-8000-00000000000b';
  owner uuid := (select user_id from public.team_members where is_book_owner limit 1);
  res jsonb := '[]'::jsonb; r jsonb;
  l_nowa uuid := gen_random_uuid(); l_owned uuid := gen_random_uuid(); l_optout uuid := gen_random_uuid();
  l_notint uuid := gen_random_uuid(); l_wrong uuid := gen_random_uuid(); l_client uuid := gen_random_uuid();
  l_arch uuid := gen_random_uuid(); l_worked uuid := gen_random_uuid(); l_real uuid := gen_random_uuid(); l_bounced uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (rep, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'claim-rep@example.invalid', '{}', '{}', now(), now()),
    (other, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'claim-other@example.invalid', '{}', '{}', now(), now());
  insert into public.user_roles (user_id, role) values (rep, 'sales'), (other, 'sales');
  insert into public.team_members (user_id, display_name) values (rep, 'Claim Rep'), (other, 'Claim Other');
  insert into public.outreach_leads (id, user_id, business_name, status, phone, whatsapp_sent_at, assigned_to_user_id, is_archived, amount_paid) values
    (l_nowa,   owner, 'T No WhatsApp',   'no_whatsapp',    '+447700900901', now() - interval '3 days', null, false, null),
    (l_owned,  owner, 'T Owned',         'no_whatsapp',    '+447700900902', now() - interval '3 days', other, false, null),
    (l_optout, owner, 'T Opted out',     'opted_out',      '+447700900903', null, null, false, null),
    (l_notint, owner, 'T Not interested','not_interested', '+447700900904', null, null, false, null),
    (l_wrong,  owner, 'T Wrong number',  'not_contacted',  '+447700900905', null, null, false, null),
    (l_client, owner, 'T Client',        'payment_received','+447700900906', null, null, false, 99),
    (l_arch,   owner, 'T Archived',      'no_whatsapp',    '+447700900907', now() - interval '3 days', null, true, null),
    (l_worked, owner, 'T Worked',        'not_contacted',  '+447700900908', null, null, false, null),
    (l_real,   owner, 'T Really sent',   'initial_contact','+447700900909', now() - interval '3 days', null, false, null),
    (l_bounced,owner, 'T Bounced email', 'bounced',        '+447700900910', null, null, false, null);
  insert into public.contact_suppressions (phone_e164, reason, source, lead_id, wrong_number_at, wrong_number_by)
    values (public.phone_e164_key('+447700900905'), null, 'test', l_wrong, now(), owner);
  insert into public.lead_activity (lead_id, actor_user_id, kind, data) values (l_worked, other, 'call_outcome', '{"outcome":"no_answer"}');

  res := res || jsonb_build_object('a failed-WhatsApp lead is claimable (No WhatsApp is a channel fact)', public.lead_claim_block(l_nowa, rep) is null);
  res := res || jsonb_build_object('owned by someone else → already_owned', public.lead_claim_block(l_owned, rep) = 'already_owned');
  res := res || jsonb_build_object('opted out → opted_out', public.lead_claim_block(l_optout, rep) = 'opted_out');
  res := res || jsonb_build_object('not interested → not_interested', public.lead_claim_block(l_notint, rep) = 'not_interested');
  res := res || jsonb_build_object('wrong number → wrong_number', public.lead_claim_block(l_wrong, rep) = 'wrong_number');
  res := res || jsonb_build_object('client → client', public.lead_claim_block(l_client, rep) = 'client');
  res := res || jsonb_build_object('archived → archived', public.lead_claim_block(l_arch, rep) = 'archived');
  res := res || jsonb_build_object('someone logged an attempt → already_contacted', public.lead_claim_block(l_worked, rep) = 'already_contacted');
  res := res || jsonb_build_object('a really-sent opener → already_contacted', public.lead_claim_block(l_real, rep) = 'already_contacted');
  res := res || jsonb_build_object('a bounced email is a channel fact, not a block', public.lead_claim_block(l_bounced, rep) is null);
  res := res || jsonb_build_object('the stamp of a failed send is not a first contact', public.lead_first_contact_at(l_nowa) is null and public.lead_first_contact_at(l_real) is not null);
  res := res || jsonb_build_object('a lead put back to New keeps a stamp that is not contact', not public.lead_opener_really_sent('not_contacted', now(), false) and public.lead_opener_really_sent('not_contacted', now(), true));

  perform set_config('request.jwt.claims', json_build_object('sub', rep, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', rep::text, true);
  execute 'set local role authenticated';
  r := public.claim_lead(l_nowa);
  res := res || jsonb_build_object('the rep claims the No WhatsApp lead', (r->>'ok')::boolean);
  r := public.claim_lead(l_notint);
  res := res || jsonb_build_object('…and is refused a Not interested one', r->>'error' = 'not_interested');
  r := public.claim_lead(l_owned);
  res := res || jsonb_build_object('…and someone else''s, by name', r->>'error' = 'already_owned' and r->>'owner_name' = 'Claim Other');
  execute 'reset role';
  res := res || jsonb_build_object('the claimed lead keeps its No WhatsApp status (not Contacted)', (select status = 'no_whatsapp' and assigned_to_user_id = rep from public.outreach_leads where id = l_nowa));
  raise exception 'QA_RESULT %', res::text;
end $$;
