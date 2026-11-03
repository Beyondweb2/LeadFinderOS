-- STRIPE CHECK + UP-FRONT RATE: the database half, proved in a transaction that is always rolled back. Run after the migration's SQL in the
-- same transaction, or against a database where it is applied. Touches no real row: the lead and seller row are temporary and everything is rolled back.
do $$
declare
  v_seller uuid := (select user_id from public.team_members where is_book_owner limit 1);
  v_lead uuid; v_lead2 uuid; v_up public.payment_ledger; v_next public.payment_ledger; v_before bigint; v_real_before numeric; v_real_after numeric;
begin
  select coalesce(sum(commission_rate), 0) into v_real_before from public.payment_ledger;
  select count(*) into v_before from public.payment_ledger;

  insert into public.outreach_leads (user_id, business_name, amount_paid) values (v_seller, 'ZZ QA stripe check test', 999) returning id into v_lead;
  insert into public.outreach_leads (user_id, business_name, amount_paid) values (v_seller, 'ZZ QA stripe check test 2', 99) returning id into v_lead2;

  -- A real (not excluded) seller's up-front sale: the row itself stores 30%, whatever the tier.
  insert into public.payment_ledger (lead_id, kind, amount_gbp, occurred_at, stripe_object_id, sale_plan, sold_by_user_id)
    values (v_lead, 'initial', 999, now(), 'pi_zz_stripe_check_up', 'complete_upfront', v_seller);
  select * into v_up from public.payment_ledger where stripe_object_id = 'pi_zz_stripe_check_up';
  if v_up.commission_rule = 'test_excluded' then raise exception 'the seller is excluded, so this proves nothing'; end if;
  if v_up.commission_rule <> 'monthly_tier_v1' then raise exception 'rule: %', v_up.commission_rule; end if;
  if v_up.commission_rate <> 0.30 then raise exception 'up-front stored %, not 0.30', v_up.commission_rate; end if;
  if v_up.commission_month_seq is null then raise exception 'up-front lost its place in the month'; end if;
  if round(v_up.amount_gbp * v_up.commission_rate, 2) <> 299.70 then raise exception 'not 299.70'; end if;

  -- It still counts toward the seller's tier: the next sale takes the next seat.
  insert into public.payment_ledger (lead_id, kind, amount_gbp, occurred_at, stripe_object_id, sale_plan, sold_by_user_id)
    values (v_lead2, 'initial', 99, now() + interval '1 second', 'pi_zz_stripe_check_next', 'complete', v_seller);
  select * into v_next from public.payment_ledger where stripe_object_id = 'pi_zz_stripe_check_next';
  if v_next.commission_month_seq <> v_up.commission_month_seq + 1 then raise exception 'seat: % after %', v_next.commission_month_seq, v_up.commission_month_seq; end if;
  if v_next.commission_rate <> public.monthly_tier_rate(v_next.commission_month_seq) then raise exception 'normal sale rate: %', v_next.commission_rate; end if;

  -- Corrected from Stripe: the rate follows the plan, both ways, and the seat does not move.
  update public.payment_ledger set sale_plan = 'complete_upfront' where id = v_next.id;
  select * into v_next from public.payment_ledger where id = v_next.id;
  if v_next.commission_rate <> 0.30 then raise exception 'to up-front: %', v_next.commission_rate; end if;
  update public.payment_ledger set sale_plan = 'complete' where id = v_next.id;
  select * into v_next from public.payment_ledger where id = v_next.id;
  if v_next.commission_rate <> public.monthly_tier_rate(v_next.commission_month_seq) then raise exception 'back: %', v_next.commission_rate; end if;

  -- The daily check may write its own source; anything else is still refused.
  insert into public.payment_ledger (lead_id, kind, amount_gbp, occurred_at, stripe_object_id, source)
    values (v_lead, 'refund', 10, now(), 'ch_zz_stripe_check', 'reconcile');
  begin
    insert into public.payment_ledger (lead_id, kind, amount_gbp, occurred_at, stripe_object_id, source) values (v_lead, 'refund', 10, now(), 'ch_zz_stripe_check2', 'nonsense');
    raise exception 'a bad source was accepted';
  exception when check_violation then null;
  end;

  -- No other row's rate moved.
  select coalesce(sum(commission_rate), 0) into v_real_after from public.payment_ledger where lead_id not in (v_lead, v_lead2) or lead_id is null;
  if v_real_after <> v_real_before then raise exception 'other rows moved: % to %', v_real_before, v_real_after; end if;

  raise notice 'commission stripe check: all proofs passed (rolled back)';
end $$;
