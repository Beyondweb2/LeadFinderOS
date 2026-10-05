-- WS-1 (fix/01-security-inbound) rolled-back live QA, 2026-10-04. Applies both WS-1 migrations INSIDE a
-- DO block that always ends in RAISE, so every change (the policy drop, the function, the fictional
-- leads, the template, the inbound row, the role removal) is rolled back. Results come back in the error
-- message (QA_RESULT {...}). Re-runnable via the Management API query route. No secrets in this file.
do $qa$
declare
  paul uuid := '9d5a7629-3171-4091-b3a4-43010a1d424d';
  rep_a uuid := '262c1d64-05ad-42e8-a81b-7d25553aeff3';
  rep_b uuid := 'c6e21a37-e342-4b99-9cf6-0489cb9af775';
  la uuid := gen_random_uuid(); lb1 uuid := gen_random_uuid(); lb2 uuid := gen_random_uuid(); lc uuid := gen_random_uuid();
  msg uuid;
  r jsonb := '{}'::jsonb; n int; t text;
begin
  
  drop policy if exists sales_select_templates on public.templates;
create or replace function public.inbound_lead_candidates(_phone text)
returns table (id uuid, user_id uuid, assigned_to_user_id uuid, is_archived boolean)
language sql
stable
security invoker
set search_path = public
as $fn$
  select l.id, l.user_id, l.assigned_to_user_id, l.is_archived
  from public.outreach_leads l
  where public.phone_key(_phone) is not null
    and public.phone_key(l.phone) = public.phone_key(_phone)
  order by l.id
  limit 50
$fn$;
revoke all on function public.inbound_lead_candidates(text) from public;
revoke all on function public.inbound_lead_candidates(text) from anon;
revoke all on function public.inbound_lead_candidates(text) from authenticated;
grant execute on function public.inbound_lead_candidates(text) to service_role;
  insert into outreach_leads (id, user_id, business_name, phone, assigned_to_user_id, status) values
    (la,  paul, 'ZZ WS1 rollback A',  '07700 900611',     rep_a, 'not_contacted'),
    (lb1, paul, 'ZZ WS1 rollback B1', '07700900612',      rep_a, 'not_contacted'),
    (lb2, paul, 'ZZ WS1 rollback B2', '+44 7700 900612',  rep_b, 'not_contacted');
  insert into outreach_leads (id, user_id, business_name, phone, assigned_to_user_id, status, is_archived) values
    (lc, paul, 'ZZ WS1 rollback C archived', '07700 900613', rep_a, 'not_contacted', true);
  insert into templates (user_id, template_type, category, title, content) values (rep_a, 'text', 'other', 'ZZ rep A own', 'hello');

  -- candidates (service side)
  r := r || jsonb_build_object(
    'cand_611_meta',   (select count(*) from inbound_lead_candidates('447700900611')),
    'cand_611_spaced', (select count(*) from inbound_lead_candidates('07700 900611')),
    'cand_611_plus',   (select count(*) from inbound_lead_candidates('+44 7700 900611')),
    'cand_611_lead',   (select (array_agg(id))[1] = la from inbound_lead_candidates('447700900611')),
    'cand_612',        (select count(*) from inbound_lead_candidates('447700900612')),
    'cand_613_archived', (select jsonb_agg(is_archived) from inbound_lead_candidates('447700900613')),
    'cand_none',       (select count(*) from inbound_lead_candidates('447700900699')),
    'cand_short',      (select count(*) from inbound_lead_candidates('123')),
    'exec_anon',       has_function_privilege('anon', 'public.inbound_lead_candidates(text)', 'execute'),
    'exec_auth',       has_function_privilege('authenticated', 'public.inbound_lead_candidates(text)', 'execute'),
    'exec_service',    has_function_privilege('service_role', 'public.inbound_lead_candidates(text)', 'execute'),
    'policies',        (select jsonb_agg(policyname order by policyname) from pg_policies where tablename='templates'));

  -- what handleInboundMessages writes for a matched never-messaged lead (lead A)
  insert into whatsapp_messages (direction, user_id, lead_id, phone, body, status, test_mode, wa_message_id)
    values ('inbound', paul, la, '447700900611', 'ZZ WS1 rollback reply', 'received', false, 'wamid.QA_ws1_rollback_1') returning id into msg;
  r := r || jsonb_build_object(
    'notif_rep_a', (select count(*) from notifications where user_id = rep_a and lead_id = la and kind = 'whatsapp_reply'),
    'notif_rep_b', (select count(*) from notifications where user_id = rep_b and lead_id = la),
    'notif_paul',  (select count(*) from notifications where user_id = paul and lead_id = la));

  -- as rep A
  perform set_config('request.jwt.claims', json_build_object('sub', rep_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object(
    'repA_templates_total', (select count(*) from templates),
    'repA_templates_paul',  (select count(*) from templates where user_id = paul),
    'repA_templates_own',   (select count(*) from templates where user_id = rep_a),
    'repA_sees_msg',        (select count(*) from whatsapp_messages where id = msg),
    'repA_unread_lead',     (select count(*) from my_whatsapp_unread() u where u.lead_id = la),
    'repA_can_work',        can_work_lead(la));
  execute 'reset role';
  -- as rep B
  perform set_config('request.jwt.claims', json_build_object('sub', rep_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object(
    'repB_templates_paul', (select count(*) from templates where user_id = paul),
    'repB_templates_repA', (select count(*) from templates where user_id = rep_a),
    'repB_sees_msg',       (select count(*) from whatsapp_messages where id = msg),
    'repB_unread_lead',    (select count(*) from my_whatsapp_unread() u where u.lead_id = la),
    'repB_can_work_A',     can_work_lead(la));
  execute 'reset role';
  -- as Paul (admin)
  perform set_config('request.jwt.claims', json_build_object('sub', paul, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object(
    'paul_templates_own', (select count(*) from templates where user_id = paul),
    'paul_templates_repA', (select count(*) from templates where user_id = rep_a),
    'paul_sees_msg', (select count(*) from whatsapp_messages where id = msg));
  execute 'reset role';
  -- off-boarding: rep A's role removed mid-session (what Team -> Disable does first)
  delete from user_roles where user_id = rep_a and role = 'sales';
  perform set_config('request.jwt.claims', json_build_object('sub', rep_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object(
    'removed_my_role', my_role(),
    'removed_can_work', can_work_lead(la),
    'removed_sees_msg', (select count(*) from whatsapp_messages where id = msg),
    'removed_sales_leads', (select count(*) from sales_leads),
    'removed_unread', (select count(*) from my_whatsapp_unread()));
  execute 'reset role';
  raise exception 'QA_RESULT %', r::text;
end
$qa$;
