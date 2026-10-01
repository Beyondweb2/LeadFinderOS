-- MONTHLY COMMISSION TIERS (Paul, 2026-10-01). Replaces the weekly ladder (20260929180000) from today.
--
-- Per salesperson, per CALENDAR MONTH (London time): sales 1–12 earn 30% of the initial payment,
-- sales 13–24 earn 40%, sale 25 onwards 50%. Resets on the 1st. Recurring commission (20% of the next
-- three monthly payments) is unchanged and not stored here.
--
-- ⛔ STAMPED ONCE, NEVER REWRITTEN. A sale's place and rate are written when its payment lands and are
--    not changed by anything that happens later (a refund, a dispute, another sale). Non-retroactive.
-- ⛔ A SALE THAT DID NOT STICK DOES NOT LIFT THE NEXT ONE. The place of a new sale = 1 + the earlier sales
--    this month (same seller) that still count: not fully refunded, not lost to a chargeback. So a
--    refunded sale never pushes a later sale into a higher tier — and the refunded sale itself keeps the
--    rate it was stamped with (its commission is reversed by the existing rules).
-- ⛔ TEST SALES NEVER COUNT: a sale by a test account (metric_exclusions kind 'user') or on a test lead
--    (kind 'lead') is stamped 'test_excluded' at 0% and is never a place in anyone's month.
-- ⛔ PROSPECTIVE: rows stamped under an earlier rule (flat_30_v0, weekly_tier_v1) are never touched.
--    Live on 2026-10-01: one ledger row, the admin's 17 Sep sale (flat_30_v0); no weekly_tier_v1 rows.
-- Additive. The weekly columns and functions stay for any row that carries them; only the trigger moves.

alter table public.payment_ledger add column if not exists commission_month_start date;
alter table public.payment_ledger add column if not exists commission_month_seq integer;

-- The 1st (London) of a payment's month.
create or replace function public.commission_month_of(_at timestamptz)
returns date language sql immutable as $$
  select date_trunc('month', _at at time zone 'Europe/London')::date
$$;

-- The tier table, in ONE place on the database side (mirrored by MONTHLY_TIERS in src/lib/commission.ts;
-- the pair is pinned by scripts/monthly-commission-tiers.test.ts).
create or replace function public.monthly_tier_rate(_seq integer)
returns numeric language sql immutable as $$
  select case when _seq <= 12 then 0.30 when _seq <= 24 then 0.40 else 0.50 end::numeric
$$;

-- Does this initial payment still count as a sale (not fully refunded, not lost to a chargeback)?
create or replace function public.commission_sale_stuck(_p public.payment_ledger)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.payment_ledger r
    where r.lead_id is not distinct from _p.lead_id
      and ((r.stripe_payment_intent_id is not null and r.stripe_payment_intent_id = _p.stripe_payment_intent_id)
        or (r.stripe_charge_id is not null and r.stripe_charge_id = _p.stripe_charge_id))
      and ((r.kind = 'refund' and r.amount_gbp >= _p.amount_gbp) or (r.kind = 'chargeback' and r.status = 'lost'))
  )
$$;

-- Stamp the not-yet-stamped initial payments of one seller's month, in payment order, under a
-- per-seller-month lock (two payments landing together can never take the same place).
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
           commission_month_seq = v_seq, commission_rate = public.monthly_tier_rate(v_seq)
     where id = r.id;
  end loop;
end $$;
revoke all on function public.stamp_monthly_commission_for(uuid, date) from public, anon, authenticated;
revoke all on function public.commission_sale_stuck(public.payment_ledger) from public, anon, authenticated;

-- Stamp on arrival, and when the seller is attached later (only rows not yet stamped are written).
-- The stamp writes only commission_* columns, which this trigger does not watch, so it never re-fires.
create or replace function public.stamp_monthly_commission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'initial' and new.sold_by_user_id is not null and new.commission_rule is null then
    perform public.stamp_monthly_commission_for(new.sold_by_user_id, public.commission_month_of(new.occurred_at));
  end if;
  return null;
end $$;

drop trigger if exists trg_payment_ledger_weekly_commission on public.payment_ledger;
drop trigger if exists trg_payment_ledger_monthly_commission on public.payment_ledger;
create trigger trg_payment_ledger_monthly_commission
  after insert or update of sold_by_user_id, occurred_at, status, amount_gbp, kind on public.payment_ledger
  for each row execute function public.stamp_monthly_commission();
