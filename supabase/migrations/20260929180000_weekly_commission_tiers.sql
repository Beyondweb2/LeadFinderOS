-- WEEKLY COMMISSION TIERS (Paul, 2026-09-29). Additive. src/lib/commission.ts reads what this stores.
--
-- The initial-payment rate is set by the salesperson's place in their Monday–Sunday week (London time):
--   clients 1–3 → 30%, clients 4–6 → 40%, client 7 onwards → 50%. NOT retrospective: each sale keeps the
--   rate of its own place in the sequence. The sequence resets every Monday.
-- A client counts when their successful INITIAL payment is received (a payment_ledger row — never a
-- manually set Paid status). Order: payment timestamp, then payment id (the Stripe object id).
-- ⛔ STORED, so a later rule change cannot rewrite history: each initial row carries the rule, its week,
-- its place and its rate. Refunds and disputes are separate ledger rows, so they never renumber a week.
-- ⛔ PROSPECTIVE: rows that existed before this rule keep the flat 30% they were earned under
-- (commission_rule 'flat_30_v0'), and are never counted in a weekly sequence.
-- Recurring commission (20% of the next three monthly payments) is unchanged and not stored here.

alter table public.payment_ledger add column if not exists commission_rule text;
alter table public.payment_ledger add column if not exists commission_week_start date;
alter table public.payment_ledger add column if not exists commission_week_seq integer;
alter table public.payment_ledger add column if not exists commission_rate numeric(5,4);
alter table public.payment_ledger drop constraint if exists payment_ledger_commission_rate_check;
alter table public.payment_ledger add constraint payment_ledger_commission_rate_check
  check (commission_rate is null or (commission_rate >= 0 and commission_rate <= 1));

-- The rows earned before the rule (live on 2026-09-29: one admin initial payment) keep the flat rate.
update public.payment_ledger set commission_rule = 'flat_30_v0', commission_rate = 0.30
  where kind = 'initial' and commission_rule is null;

-- The Monday (London) of a payment's week.
create or replace function public.commission_week_of(_at timestamptz)
returns date language sql immutable as $$
  select date_trunc('week', _at at time zone 'Europe/London')::date
$$;

-- The tier table, in ONE place on the database side (mirrored by WEEKLY_TIERS in src/lib/commission.ts,
-- and the pair is pinned by scripts/weekly-commission-tiers.test.ts).
create or replace function public.weekly_tier_rate(_seq integer)
returns numeric language sql immutable as $$
  select case when _seq <= 3 then 0.30 when _seq <= 6 then 0.40 else 0.50 end::numeric
$$;

-- Number one seller's week, in payment order, under a per-seller-week lock (so two payments landing at
-- the same moment can never both take the same place). Only rows on THIS rule are touched: a row earned
-- under another rule is never rewritten.
create or replace function public.restamp_weekly_commission(_seller uuid, _week date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if _seller is null or _week is null then return; end if;
  perform pg_advisory_xact_lock(hashtext('commission_week:' || _seller::text || ':' || _week::text));
  with ranked as (
    select id, row_number() over (order by occurred_at, stripe_object_id, id) as seq
    from public.payment_ledger
    where kind = 'initial' and status = 'succeeded' and amount_gbp > 0
      and sold_by_user_id = _seller
      and (commission_rule is null or commission_rule = 'weekly_tier_v1')
      and public.commission_week_of(occurred_at) = _week
  )
  update public.payment_ledger p
     set commission_rule = 'weekly_tier_v1', commission_week_start = _week,
         commission_week_seq = r.seq, commission_rate = public.weekly_tier_rate(r.seq::integer)
    from ranked r
   where p.id = r.id
     and (p.commission_rule is distinct from 'weekly_tier_v1' or p.commission_week_start is distinct from _week
          or p.commission_week_seq is distinct from r.seq);
end $$;
revoke all on function public.restamp_weekly_commission(uuid, date) from public, anon, authenticated;

-- Stamp on arrival (and if the seller is attached later). The restamp only writes commission_* columns,
-- which this trigger does not watch, so it never re-fires itself.
create or replace function public.stamp_weekly_commission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'initial' and new.sold_by_user_id is not null then
    perform public.restamp_weekly_commission(new.sold_by_user_id, public.commission_week_of(new.occurred_at));
  end if;
  if tg_op = 'UPDATE' and old.kind = 'initial' and old.sold_by_user_id is not null
     and (old.sold_by_user_id is distinct from new.sold_by_user_id or old.occurred_at is distinct from new.occurred_at) then
    perform public.restamp_weekly_commission(old.sold_by_user_id, public.commission_week_of(old.occurred_at));
  end if;
  return null;
end $$;
drop trigger if exists trg_payment_ledger_weekly_commission on public.payment_ledger;
create trigger trg_payment_ledger_weekly_commission
  after insert or update of sold_by_user_id, occurred_at, status, amount_gbp, kind on public.payment_ledger
  for each row execute function public.stamp_weekly_commission();
