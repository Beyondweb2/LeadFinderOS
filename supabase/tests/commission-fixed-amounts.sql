-- FIXED-AMOUNT COMMISSION: the database half, proved in a transaction that is always rolled back. Run after the migration's SQL in the same
-- transaction, or against a database where it is applied. Touches no real row: the leads are temporary and everything is rolled back.
do $$
declare
  v_seller uuid := (select user_id from public.team_members where is_book_owner limit 1);
  v_lead uuid; v_lead2 uuid; v_old uuid; v_a public.payment_ledger; v_b public.payment_ledger; v_c public.payment_ledger;
  v_real_rate numeric; v_real_rule text; v_real_after_rate numeric; v_real_after_rule text;
begin
  select coalesce(sum(commission_rate), 0), string_agg(id::text || payout_rule, ',' order by id) into v_real_rate, v_real_rule from public.payment_ledger;

  insert into public.outreach_leads (user_id, business_name, amount_paid) values (v_seller, 'ZZ QA fixed commission test', 99) returning id into v_lead;
  insert into public.outreach_leads (user_id, business_name, amount_paid) values (v_seller, 'ZZ QA fixed commission test 2', 99) returning id into v_lead2;
  insert into public.outreach_leads (user_id, business_name, amount_paid) values (v_seller, 'ZZ QA fixed commission test 3', 99) returning id into v_old;

  -- A new row with no rule named takes the default, stores no rate, and still gets a number in its UK month.
  insert into public.payment_ledger (lead_id, kind, amount_gbp, occurred_at, stripe_object_id, sale_plan, sold_by_user_id)
    values (v_lead, 'initial', 99, '2031-10-31 23:50:00+00', 'pi_zz_fixed_a', 'complete', v_seller);
  select * into v_a from public.payment_ledger where stripe_object_id = 'pi_zz_fixed_a';
  if v_a.commission_rule = 'test_excluded' then raise exception 'the seller is excluded, so this proves nothing'; end if;
  if v_a.payout_rule <> 'fixed_v1' then raise exception 'default rule: %', v_a.payout_rule; end if;
  if v_a.commission_rule <> 'monthly_tier_v1' then raise exception 'rule: %', v_a.commission_rule; end if;
  if v_a.commission_rate <> 0 then raise exception 'a fixed sale stored rate %', v_a.commission_rate; end if;
  if v_a.commission_month_start <> date '2031-10-01' or v_a.commission_month_seq <> 1 then raise exception 'number: % %', v_a.commission_month_start, v_a.commission_month_seq; end if;

  -- 00:10 on the 1st (UK) is the next month: sale 1 again. (BST ended on 26 October 2031, so UTC is UK time here.)
  insert into public.payment_ledger (lead_id, kind, amount_gbp, occurred_at, stripe_object_id, sale_plan, sold_by_user_id)
    values (v_lead2, 'initial', 999, '2031-11-01 00:10:00+00', 'pi_zz_fixed_b', 'complete_upfront', v_seller);
  select * into v_b from public.payment_ledger where stripe_object_id = 'pi_zz_fixed_b';
  if v_b.commission_month_start <> date '2031-11-01' or v_b.commission_month_seq <> 1 then raise exception 'reset: % %', v_b.commission_month_start, v_b.commission_month_seq; end if;
  if v_b.commission_rate <> 0 then raise exception 'up front on the fixed rules stored rate %', v_b.commission_rate; end if;

  -- A plan correction leaves the rate at 0.
  update public.payment_ledger set sale_plan = 'complete' where id = v_b.id;
  select * into v_b from public.payment_ledger where id = v_b.id;
  if v_b.commission_rate <> 0 then raise exception 'plan change wrote rate %', v_b.commission_rate; end if;

  -- The payable date covers a fixed sale, and follows the send back to null.
  if v_a.commission_payable_on is not null then raise exception 'a date before results: %', v_a.commission_payable_on; end if;
  update public.outreach_leads set remeasure_results_sent_at = '2031-12-01 10:00:00+00' where id = v_lead;
  select * into v_a from public.payment_ledger where id = v_a.id;
  if v_a.commission_payable_on <> date '2031-12-01' + public.commission_payable_days(null) then raise exception 'payable: %', v_a.commission_payable_on; end if;
  update public.outreach_leads set remeasure_results_sent_at = null where id = v_lead;
  select * into v_a from public.payment_ledger where id = v_a.id;
  if v_a.commission_payable_on is not null then raise exception 'not cleared: %', v_a.commission_payable_on; end if;

  -- A sale recorded on the older rule keeps being stamped with its rate.
  insert into public.payment_ledger (lead_id, kind, amount_gbp, occurred_at, stripe_object_id, sale_plan, sold_by_user_id, payout_rule)
    values (v_old, 'initial', 99, '2031-11-02 10:00:00+00', 'pi_zz_fixed_old', 'complete', v_seller, 'plan_v1');
  select * into v_c from public.payment_ledger where stripe_object_id = 'pi_zz_fixed_old';
  if v_c.commission_rate <> public.monthly_tier_rate(v_c.commission_month_seq) then raise exception 'plan_v1 rate: %', v_c.commission_rate; end if;
  if v_c.commission_month_seq <> 2 then raise exception 'plan_v1 number: %', v_c.commission_month_seq; end if;

  -- A claim can be recorded and taken back; a bad rule is refused.
  update public.payment_ledger set commission_claim_at = now(), commission_claim_by = v_seller where id = v_a.id;
  update public.payment_ledger set commission_claim_at = null, commission_claim_by = null where id = v_a.id;
  begin
    insert into public.payment_ledger (lead_id, kind, amount_gbp, occurred_at, stripe_object_id, payout_rule) values (v_lead, 'refund', 1, now(), 'ch_zz_fixed', 'nonsense');
    raise exception 'a bad rule was accepted';
  exception when check_violation then null;
  end;

  -- No other row moved.
  select coalesce(sum(commission_rate), 0), string_agg(id::text || payout_rule, ',' order by id) into v_real_after_rate, v_real_after_rule from public.payment_ledger where lead_id not in (v_lead, v_lead2, v_old) or lead_id is null;
  if v_real_after_rate <> v_real_rate or v_real_after_rule <> v_real_rule then raise exception 'other rows moved'; end if;
  raise notice 'commission-fixed-amounts.sql: all passed';
end $$;
