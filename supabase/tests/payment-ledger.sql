-- Payment ledger (migration 20260929130000). ONE query to the Management API; ALWAYS ROLLED BACK (ends by RAISING).
-- Expect: dup_blocked=t auth_denied=t anon_denied=t payout_dup_blocked=t bad_month_blocked=t neg_amount_blocked=t
do $$
declare dup boolean := false; ad boolean := false; an boolean := false; pd boolean := false; bm boolean := false; na boolean := false;
  lid uuid; sid uuid; n int;
begin
  select id into lid from outreach_leads limit 1;
  select user_id into sid from team_members tm join user_roles r using (user_id) where r.role = 'sales' limit 1;
  insert into payment_ledger (lead_id, kind, amount_gbp, occurred_at, stripe_object_id, source) values (lid, 'initial', 99, now(), 'pi_QA_rolled_back', 'backfill');
  begin insert into payment_ledger (lead_id, kind, amount_gbp, occurred_at, stripe_object_id, source) values (lid, 'initial', 99, now(), 'pi_QA_rolled_back', 'webhook'); exception when unique_violation then dup := true; end;
  begin insert into payment_ledger (lead_id, kind, amount_gbp, occurred_at, stripe_object_id) values (lid, 'initial', -1, now(), 'pi_QA_neg'); exception when check_violation then na := true; end;
  insert into commission_payouts (user_id, period_month, amount_gbp, paid_at) values (sid, '2026-09-01', 1, '2026-10-01');
  begin insert into commission_payouts (user_id, period_month, amount_gbp, paid_at) values (sid, '2026-09-01', 2, '2026-10-01'); exception when unique_violation then pd := true; end;
  begin insert into commission_payouts (user_id, period_month, amount_gbp, paid_at) values (sid, '2026-09-15', 2, '2026-10-01'); exception when check_violation then bm := true; end;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', sid, 'role', 'authenticated')::text, true);
  begin select count(*) into n from payment_ledger; exception when insufficient_privilege then ad := true; end;
  reset role;
  set local role anon;
  begin select count(*) into n from commission_payouts; exception when insufficient_privilege then an := true; end;
  reset role;
  raise exception 'RESULT dup_blocked=% auth_denied=% anon_denied=% payout_dup_blocked=% bad_month_blocked=% neg_amount_blocked=% (rolled back)', dup, ad, an, pd, bm, na;
end $$;
