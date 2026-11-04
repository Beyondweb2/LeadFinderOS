-- FIXED-AMOUNT COMMISSION (Paul, 2026-11-04, docs/commission-owed.md). Additive and idempotent.
--
--  1. payout_rule gains 'fixed_v1', the default for new rows. The pounds live only in src/lib/commissionConfig.ts; the database keeps
--     numbering sales (stamp_monthly_commission_for), which is what the big-month bonus reads.
--  2. commission_claim_at / _by: a guarantee claim is an email, so this is how the app knows about one before any refund lands.
--     Written only by fn sales-earnings `set_claim`.
--  3. The payable date also covers fixed_v1 sales (one date per sale, on its first payment's row).
--  4. A fixed_v1 row stores rate 0: its money does not come from a rate.
--
-- ⛔ HISTORY DOES NOT MOVE. No row is updated. On 2026-11-04 the ledger held no real earning sale (test sales, a QA fixture, and the
--    admin's own sale at £0). Old rows keep payout_rule and rate exactly as they are.

set local lock_timeout = '5s';

-- ── 1. THE RULE ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.payment_ledger drop constraint if exists payment_ledger_payout_rule_check;
alter table public.payment_ledger add constraint payment_ledger_payout_rule_check check (payout_rule in ('legacy', 'plan_v1', 'fixed_v1'));
alter table public.payment_ledger alter column payout_rule set default 'fixed_v1';

-- ── 2. THE CLAIM ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.payment_ledger add column if not exists commission_claim_at timestamptz;
alter table public.payment_ledger add column if not exists commission_claim_by uuid references auth.users(id);

-- ── 3. THE PAYABLE DATE ──────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.sync_commission_payable_on()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.payment_ledger
     set commission_payable_on = public.commission_payable_on_for(new.id, new.remeasure_results_sent_at)
   where lead_id = new.id and kind = 'initial' and payout_rule in ('plan_v1', 'fixed_v1');
  return null;
end $$;
revoke all on function public.sync_commission_payable_on() from public, anon, authenticated;

create or replace function public.ledger_commission_payable_on()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'initial' and new.payout_rule in ('plan_v1', 'fixed_v1') and new.lead_id is not null then
    new.commission_payable_on := public.commission_payable_on_for(
      new.lead_id, (select remeasure_results_sent_at from public.outreach_leads where id = new.lead_id));
  end if;
  return new;
end $$;
revoke all on function public.ledger_commission_payable_on() from public, anon, authenticated;

-- ── 4. THE NUMBERING KEEPS GOING; A FIXED SALE STORES NO RATE ────────────────────────────────────────────────────────────────
-- The same function as live (20261206090000) apart from the rate line.
create or replace function public.stamp_monthly_commission_for(_seller uuid, _month date)
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_seq integer;
begin
  if _seller is null or _month is null then return; end if;
  perform pg_advisory_xact_lock(hashtext('commission_month:' || _seller::text || ':' || _month::text));
  for r in
    select p.* from public.payment_ledger p
     where p.kind = 'initial' and p.status = 'succeeded' and p.amount_gbp > 0
       and p.sold_by_user_id = _seller and p.commission_rule is null
       and public.commission_month_of(p.occurred_at) = _month
     order by p.occurred_at, p.stripe_object_id, p.id
  loop
    if exists (select 1 from public.metric_exclusions e
                where (e.kind = 'user' and e.value = _seller::text) or (e.kind = 'lead' and e.value = r.lead_id::text)) then
      update public.payment_ledger set commission_rule = 'test_excluded', commission_rate = 0,
             commission_month_start = _month, commission_month_seq = null
       where id = r.id;
      continue;
    end if;
    select 1 + count(*) into v_seq from public.payment_ledger q
     where q.kind = 'initial' and q.sold_by_user_id = _seller and q.commission_rule = 'monthly_tier_v1'
       and q.commission_month_start = _month and q.id <> r.id
       and public.commission_sale_stuck(q);
    update public.payment_ledger
       set commission_rule = 'monthly_tier_v1', commission_month_start = _month,
           commission_month_seq = v_seq,
           commission_rate = case when r.payout_rule = 'fixed_v1' then 0
             else coalesce(public.commission_fixed_rate_for_plan(r.sale_plan), public.monthly_tier_rate(v_seq)) end
     where id = r.id;
  end loop;
end $$;

create or replace function public.ledger_rate_follows_plan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'initial' and new.commission_rule = 'monthly_tier_v1' and new.commission_month_seq is not null and new.payout_rule is distinct from 'fixed_v1' then
    new.commission_rate := coalesce(public.commission_fixed_rate_for_plan(new.sale_plan), public.monthly_tier_rate(new.commission_month_seq));
  end if;
  return new;
end $$;
revoke all on function public.ledger_rate_follows_plan() from public, anon, authenticated;
