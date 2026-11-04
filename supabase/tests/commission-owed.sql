-- COMMISSION OWED: the database half, proved in a transaction that is always rolled back. Run after the migration's SQL in the same
-- transaction, or against a database where it is applied. Touches no real row: the lead is a temporary fixture and everything is rolled back.
do $$
declare
  v_seller uuid := (select user_id from public.team_members where is_book_owner limit 1);
  v_lead uuid; v_lead2 uuid; v_row public.payment_ledger; v_row2 public.payment_ledger; v_old_count bigint; v_batch uuid := gen_random_uuid(); v_sent timestamptz := '2026-12-01T10:00:00Z';
  v_prev text; v_first boolean; v_h jsonb; v_failed boolean := false;
begin
  -- Every row that was already there is legacy.
  select count(*) into v_old_count from public.payment_ledger where payout_rule <> 'legacy';
  if v_old_count <> 0 then raise exception 'existing rows moved off legacy: %', v_old_count; end if;

  insert into public.outreach_leads (user_id, business_name, phone, amount_paid) values (v_seller, 'ZZ QA commission owed test', '07700900999', 99) returning id into v_lead;
  insert into public.client_service_terms (lead_id, commercial_terms, initial_paid_at) values (v_lead, 'csa_v7_two_plans', now());
  insert into public.metric_exclusions (kind, value, reason) values ('lead', v_lead::text, 'rolled-back commission test');

  -- A new row takes plan_v1, with no payable date.
  insert into public.payment_ledger (lead_id, kind, amount_gbp, occurred_at, stripe_object_id, sale_plan, sold_by_user_id)
    values (v_lead, 'initial', 99, now(), 'pi_zz_commission_test', 'complete', v_seller) returning * into v_row;
  if v_row.payout_rule <> 'plan_v1' then raise exception 'new row rule: %', v_row.payout_rule; end if;
  if v_row.commission_payable_on is not null then raise exception 'no results yet, but a date: %', v_row.commission_payable_on; end if;

  -- Results sent: the date appears, the day after the 7-day window on v7.
  update public.outreach_leads set remeasure_results_sent_at = v_sent where id = v_lead;
  select * into v_row from public.payment_ledger where id = v_row.id;
  if v_row.commission_payable_on <> date '2026-12-09' then raise exception 'payable: %', v_row.commission_payable_on; end if;

  -- A failed send un-stamps: the date goes with it.
  update public.outreach_leads set remeasure_results_sent_at = null where id = v_lead;
  select * into v_row from public.payment_ledger where id = v_row.id;
  if v_row.commission_payable_on is not null then raise exception 'date survived the un-stamp'; end if;

  -- An older agreement: 14 days. Late in the UK evening counts as that UK day.
  insert into public.outreach_leads (user_id, business_name, phone, amount_paid) values (v_seller, 'ZZ QA commission owed test 2', '07700900998', 99) returning id into v_lead2;
  insert into public.client_service_terms (lead_id, commercial_terms, initial_paid_at) values (v_lead2, 'csa_v5_option_b', now());
  insert into public.metric_exclusions (kind, value, reason) values ('lead', v_lead2::text, 'rolled-back commission test');
  insert into public.payment_ledger (lead_id, kind, amount_gbp, occurred_at, stripe_object_id, sold_by_user_id)
    values (v_lead2, 'initial', 99, now(), 'pi_zz_commission_test2', v_seller) returning * into v_row2;
  update public.outreach_leads set remeasure_results_sent_at = timestamptz '2026-07-01T23:30:00Z' where id = v_lead2;
  select * into v_row2 from public.payment_ledger where id = v_row2.id;
  if v_row2.commission_payable_on <> date '2026-07-17' then raise exception 'older terms, BST day: %', v_row2.commission_payable_on; end if;

  -- A legacy row is never given a date.
  update public.payment_ledger set payout_rule = 'legacy', commission_payable_on = null where id = v_row2.id;
  update public.outreach_leads set remeasure_results_sent_at = timestamptz '2026-08-01T10:00:00Z' where id = v_lead2;
  select * into v_row2 from public.payment_ledger where id = v_row2.id;
  if v_row2.commission_payable_on is not null then raise exception 'a legacy row got a date'; end if;

  -- Mark as paid: one live row per line.
  perform public.commission_record_line_payments(v_batch, v_seller, jsonb_build_array(jsonb_build_object('line_key', 'pay:' || v_row.id, 'part', 1, 'user_id', v_seller, 'lead_id', v_lead, 'amount_gbp', 29.70, 'business_name', 'ZZ', 'plan', 'complete', 'label', 'First payment', 'rate', 0.3, 'client_amount_gbp', 99, 'collected_at', now(), 'payable_on', '2026-12-08')));
  begin
    perform public.commission_record_line_payments(gen_random_uuid(), v_seller, jsonb_build_array(jsonb_build_object('line_key', 'pay:' || v_row.id, 'part', 1, 'user_id', v_seller, 'amount_gbp', 29.70)));
    v_failed := true;
  exception when unique_violation then null;
  end;
  if v_failed then raise exception 'the same line was paid twice'; end if;
  -- Undo frees the line.
  update public.commission_line_payments set undone_at = now(), undone_by = v_seller where batch_id = v_batch;
  perform public.commission_record_line_payments(gen_random_uuid(), v_seller, jsonb_build_array(jsonb_build_object('line_key', 'pay:' || v_row.id, 'part', 1, 'user_id', v_seller, 'amount_gbp', 29.70)));

  -- One handoff field: the other stays. Null clears. Stamps once.
  select * into v_prev, v_first from public.sales_handoff_set_field(v_lead, 'decision_maker_name', 'Sam', v_seller);
  if not v_first then raise exception 'first save not reported'; end if;
  select * into v_prev, v_first from public.sales_handoff_set_field(v_lead, 'notes_for_paul', 'Mornings', v_seller);
  if v_first or v_prev is null then raise exception 'second save reported as first'; end if;
  select sales_handoff into v_h from public.outreach_leads where id = v_lead;
  if v_h->>'decision_maker_name' <> 'Sam' or v_h->>'notes_for_paul' <> 'Mornings' or v_h->>'completed_at' is null then raise exception 'handoff: %', v_h; end if;
  perform public.sales_handoff_set_field(v_lead, 'notes_for_paul', null, v_seller);
  select sales_handoff into v_h from public.outreach_leads where id = v_lead;
  if v_h ? 'notes_for_paul' or v_h->>'decision_maker_name' <> 'Sam' then raise exception 'clear: %', v_h; end if;

  -- The columns New paid clients reads.
  perform id, business_name, amount_paid, payment_date, status, sold_by_user_id, payment_plan, sales_handoff from public.outreach_leads where id = v_lead;
  perform lead_id, website_manager, payment_plan, quick_close, updated_at from public.onboarding_responses limit 1;

  raise notice 'COMMISSION OWED SQL: ALL PASS';
end $$;
