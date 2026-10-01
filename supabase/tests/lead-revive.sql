-- Rolled-back live test of lead_revive (2026-10-02). Run through the Management API; the final RAISE
-- rolls everything back. Output: QA_RESULT [ {check: bool}, ... ].
do $$
declare
  paul uuid := '9d5a7629-3171-4091-b3a4-43010a1d424d';
  test uuid := '262c1d64-05ad-42e8-a81b-7d25553aeff3';
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); d uuid := gen_random_uuid();
  e uuid := gen_random_uuid(); f uuid := gen_random_uuid(); g uuid := gen_random_uuid(); h uuid := gen_random_uuid();
  r jsonb; res jsonb := '[]'::jsonb; refused text;
begin
  insert into public.outreach_leads (id, user_id, business_name, status, phone, assigned_to_user_id, whatsapp_sent_at, whatsapp_ever_delivered, is_potential_work) values
    (a, paul, 'QA revive replied-last',  'not_interested', '+447700900201', paul, now() - interval '5 days', true, false),
    (b, paul, 'QA revive ours-last',     'not_interested', '+447700900202', paul, now() - interval '5 days', true, false),
    (c, paul, 'QA revive opener only',   'not_interested', '+447700900203', paul, now() - interval '5 days', true, false),
    (d, paul, 'QA revive phone only',    'not_interested', null,            paul, null, false, false),
    (e, paul, 'QA revive closed',        'closed',         '+447700900205', paul, null, false, false),
    (f, paul, 'QA revive opted out',     'opted_out',      '+447700900206', paul, null, false, false),
    (g, paul, 'QA trigger won',          'not_interested', '+447700900207', paul, null, false, false),
    (h, paul, 'QA not mine',             'not_interested', '+447700900208', paul, null, false, false);
  insert into public.whatsapp_messages (lead_id, phone, direction, status, created_at, test_mode) values
    (a, '+447700900201', 'outbound', 'delivered', now() - interval '5 days', true),
    (a, '+447700900201', 'inbound',  'received',  now() - interval '2 days', true),
    (b, '+447700900202', 'inbound',  'received',  now() - interval '4 days', true),
    (b, '+447700900202', 'outbound', 'delivered', now() - interval '3 days', true),
    (c, '+447700900203', 'outbound', 'delivered', now() - interval '5 days', true);
  insert into public.contact_suppressions (lead_id, phone_e164, reason) values
    (a, public.phone_e164_key('+447700900201'), 'not_interested'),
    (e, public.phone_e164_key('+447700900205'), 'not_interested'),
    (g, public.phone_e164_key('+447700900207'), 'not_interested');
  insert into public.contact_suppressions (lead_id, phone_e164, reason, wrong_number_at) values
    (b, public.phone_e164_key('+447700900202'), 'not_interested', now());

  perform set_config('request.jwt.claims', json_build_object('sub', paul, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', paul::text, true);

  r := public.lead_revive(a);
  res := res || jsonb_build_object('their reply last -> replied', r->>'status' = 'replied' and (select status from outreach_leads where id = a) = 'replied');
  res := res || jsonb_build_object('the Not interested block is lifted', (r->>'block_lifted')::boolean and not exists (select 1 from contact_suppressions where lead_id = a));
  res := res || jsonb_build_object('the star is not touched by a revive', (select is_potential_work from outreach_leads where id = a) = false);
  res := res || jsonb_build_object('History: stage_changed not_interested -> replied', exists (select 1 from lead_activity where lead_id = a and kind = 'stage_changed' and data->>'from' = 'not_interested' and data->>'to' = 'replied'));
  res := res || jsonb_build_object('History: the block lift', exists (select 1 from lead_activity where lead_id = a and kind = 'details_set' and data->>'suppression_cleared' = 'not_interested'));

  r := public.lead_revive(b);
  res := res || jsonb_build_object('our reply last -> awaiting_reply (You replied)', r->>'status' = 'awaiting_reply');
  res := res || jsonb_build_object('a wrong-number block is never lifted', exists (select 1 from contact_suppressions where lead_id = b and wrong_number_at is not null));

  r := public.lead_revive(c);
  res := res || jsonb_build_object('opener delivered, no reply -> initial_contact', r->>'status' = 'initial_contact');
  r := public.lead_revive(d);
  res := res || jsonb_build_object('phone only -> not_contacted (the pill reads the logged call)', r->>'status' = 'not_contacted');
  r := public.lead_revive(e);
  res := res || jsonb_build_object('closed -> revived', r->>'status' = 'not_contacted');
  res := res || jsonb_build_object('closed keeps its old rule: no block lifted', not (r->>'block_lifted')::boolean and exists (select 1 from contact_suppressions where lead_id = e));
  r := public.lead_revive(f);
  res := res || jsonb_build_object('opted out is never revived', (r->>'unchanged')::boolean and (select status from outreach_leads where id = f) = 'opted_out');
  r := public.lead_revive(a);
  res := res || jsonb_build_object('a second revive is a no-op', (r->>'unchanged')::boolean);
  res := res || jsonb_build_object('no revive ever writes interested', not exists (select 1 from outreach_leads where id in (a, b, c, d, e) and status = 'interested'));

  -- After the revive, the edge rules: an inbound flips anything below price_given to replied, and an
  -- Inbox reply moves replied -> awaiting_reply. Simulated with the SAME predicates the edge code uses.
  update outreach_leads set status = 'replied' where id = b and status not in ('price_given','interested','won_pending_onboarding','payment_received','in_delivery','completed','refunded','opted_out');
  res := res || jsonb_build_object('a later reply moves the revived lead to Replied', (select status from outreach_leads where id = b) = 'replied');
  update outreach_leads set status = 'awaiting_reply' where id = b and status = 'replied';
  res := res || jsonb_build_object('…and our reply then reads You replied', (select status from outreach_leads where id = b) = 'awaiting_reply');

  -- The trigger path is unchanged: not_interested -> won still lifts the block.
  update outreach_leads set status = 'won_pending_onboarding' where id = g;
  res := res || jsonb_build_object('trigger: not_interested -> won still lifts the block', not exists (select 1 from contact_suppressions where lead_id = g));

  -- A salesperson cannot revive a lead that is not theirs.
  perform set_config('request.jwt.claims', json_build_object('sub', test, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', test::text, true);
  begin
    r := public.lead_revive(h);
    refused := coalesce(r->>'error', 'ran');
  exception when others then refused := sqlerrm;
  end;
  res := res || jsonb_build_object('a salesperson cannot revive another person''s lead', refused <> 'ran' and (select status from outreach_leads where id = h) = 'not_interested');

  raise exception 'QA_RESULT %', res;
end $$;
