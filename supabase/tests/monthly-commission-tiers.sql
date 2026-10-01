-- LIVE, ROLLED-BACK proof of migration 20261003100000 (monthly commission tiers). Paste the migration's
-- statements where marked (scripts generate this), run against the live database: the block applies the
-- migration, inserts fictional ledger rows, reads what the trigger stamped, then RAISEs — so every write,
-- the DDL included, is undone. The results come back in the error text (QA_RESULT {...}).
do $qa$
declare r jsonb := '{}'::jsonb; x jsonb; v_lead uuid; v_test_lead uuid; i int;
  v_seller uuid := '9d5a7629-3171-4091-b3a4-43010a1d424d';   -- the admin (not an excluded account)
  v_test uuid := 'c6e21a37-e342-4b99-9cf6-0489cb9af775';     -- test1 (metric_exclusions kind user)
begin
  -- @@MIGRATION@@
  insert into public.outreach_leads (user_id, business_name, status) values (v_seller, 'ZZ QA commission lead', 'payment_received') returning id into v_lead;
  insert into public.outreach_leads (user_id, business_name, status) values (v_seller, 'ZZ QA commission test lead', 'payment_received') returning id into v_test_lead;
  insert into public.metric_exclusions (kind, value, reason) values ('lead', v_test_lead::text, 'QA rolled back');
  -- 13 October sales by one seller, an hour apart.
  for i in 1..13 loop
    insert into public.payment_ledger (lead_id, kind, status, amount_gbp, occurred_at, stripe_object_id, stripe_payment_intent_id, stripe_charge_id, sold_by_user_id, source)
    values (v_lead, 'initial', 'succeeded', 99, timestamptz '2026-10-02 09:00+01' + (i || ' hours')::interval, 'qa_pi_' || i, 'qa_pi_' || i, 'qa_ch_' || i, v_seller, 'backfill');
  end loop;
  select to_jsonb(string_agg(commission_month_seq || ':' || commission_rate::numeric(3,2) || ':' || commission_rule || ':' || commission_month_start, ' ' order by occurred_at))
    into x from public.payment_ledger where stripe_object_id like 'qa_pi_%';
  r := r || jsonb_build_object('a_first_13', x);
  -- Sale 3 is fully refunded; then a 14th sale lands: it counts 12 earlier sales that stuck → place 13 → 40%.
  insert into public.payment_ledger (lead_id, kind, status, amount_gbp, occurred_at, stripe_object_id, stripe_payment_intent_id, stripe_charge_id, sold_by_user_id, source)
  values (v_lead, 'refund', 'succeeded', 99, '2026-10-10 10:00+01', 'qa_re_3', 'qa_pi_3', 'qa_ch_3', v_seller, 'backfill');
  insert into public.payment_ledger (lead_id, kind, status, amount_gbp, occurred_at, stripe_object_id, stripe_payment_intent_id, stripe_charge_id, sold_by_user_id, source)
  values (v_lead, 'initial', 'succeeded', 99, '2026-10-12 10:00+01', 'qa_pi_14', 'qa_pi_14', 'qa_ch_14', v_seller, 'backfill');
  select jsonb_build_object('seq', commission_month_seq, 'rate', commission_rate) into x from public.payment_ledger where stripe_object_id = 'qa_pi_14';
  r := r || jsonb_build_object('b_after_refund_14th', x);
  select jsonb_build_object('seq', commission_month_seq, 'rate', commission_rate) into x from public.payment_ledger where stripe_object_id = 'qa_pi_3';
  r := r || jsonb_build_object('c_refunded_sale_keeps_stamp', x);
  select jsonb_build_object('seq', commission_month_seq, 'rate', commission_rate) into x from public.payment_ledger where stripe_object_id = 'qa_pi_13';
  r := r || jsonb_build_object('d_sale13_unchanged', x);
  -- A status touch on a stamped row never re-stamps it.
  update public.payment_ledger set status = 'succeeded' where stripe_object_id = 'qa_pi_1';
  select jsonb_build_object('seq', commission_month_seq, 'rate', commission_rate) into x from public.payment_ledger where stripe_object_id = 'qa_pi_1';
  r := r || jsonb_build_object('e_sale1_after_update', x);
  -- 1 November (London): the count starts again.
  insert into public.payment_ledger (lead_id, kind, status, amount_gbp, occurred_at, stripe_object_id, stripe_payment_intent_id, stripe_charge_id, sold_by_user_id, source)
  values (v_lead, 'initial', 'succeeded', 99, '2026-11-01 00:30+00', 'qa_pi_nov', 'qa_pi_nov', 'qa_ch_nov', v_seller, 'backfill');
  select jsonb_build_object('seq', commission_month_seq, 'rate', commission_rate, 'month', commission_month_start) into x from public.payment_ledger where stripe_object_id = 'qa_pi_nov';
  r := r || jsonb_build_object('f_november_first', x);
  -- 31 Oct 23:30 London is still October.
  insert into public.payment_ledger (lead_id, kind, status, amount_gbp, occurred_at, stripe_object_id, stripe_payment_intent_id, stripe_charge_id, sold_by_user_id, source)
  values (v_lead, 'initial', 'succeeded', 99, '2026-10-31 23:30+00', 'qa_pi_oct31', 'qa_pi_oct31', 'qa_ch_oct31', v_seller, 'backfill');
  select jsonb_build_object('seq', commission_month_seq, 'month', commission_month_start) into x from public.payment_ledger where stripe_object_id = 'qa_pi_oct31';
  r := r || jsonb_build_object('g_oct31_2330_is_october', x);
  -- Test sales: a test account's, and one on a test lead.
  insert into public.payment_ledger (lead_id, kind, status, amount_gbp, occurred_at, stripe_object_id, stripe_payment_intent_id, sold_by_user_id, source)
  values (v_lead, 'initial', 'succeeded', 99, '2026-10-05 10:00+01', 'qa_pi_test1', 'qa_pi_test1', v_test, 'backfill');
  insert into public.payment_ledger (lead_id, kind, status, amount_gbp, occurred_at, stripe_object_id, stripe_payment_intent_id, sold_by_user_id, source)
  values (v_test_lead, 'initial', 'succeeded', 99, '2026-10-05 11:00+01', 'qa_pi_testlead', 'qa_pi_testlead', v_seller, 'backfill');
  select jsonb_agg(jsonb_build_object('obj', stripe_object_id, 'rule', commission_rule, 'rate', commission_rate, 'seq', commission_month_seq)) into x
    from public.payment_ledger where stripe_object_id in ('qa_pi_test1', 'qa_pi_testlead');
  r := r || jsonb_build_object('h_test_sales', x);
  -- The next real sale after the test-lead sale: the test sale did not take a place (counted 13 → 14 → 40%).
  insert into public.payment_ledger (lead_id, kind, status, amount_gbp, occurred_at, stripe_object_id, stripe_payment_intent_id, sold_by_user_id, source)
  values (v_lead, 'initial', 'succeeded', 99, '2026-10-20 10:00+01', 'qa_pi_15', 'qa_pi_15', v_seller, 'backfill');
  select jsonb_build_object('seq', commission_month_seq, 'rate', commission_rate) into x from public.payment_ledger where stripe_object_id = 'qa_pi_15';
  r := r || jsonb_build_object('i_next_real_sale', x);
  -- The one real pre-existing row (17 Sep, flat_30_v0) is untouched.
  select jsonb_agg(jsonb_build_object('rule', commission_rule, 'rate', commission_rate, 'month', commission_month_start)) into x from public.payment_ledger where stripe_object_id not like 'qa_%';
  r := r || jsonb_build_object('j_existing_rows', x);
  raise exception 'QA_RESULT %', r::text;
end $qa$;
