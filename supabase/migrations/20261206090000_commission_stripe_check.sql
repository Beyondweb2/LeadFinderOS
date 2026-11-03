-- STRIPE IS THE SOURCE OF TRUTH FOR COMMISSION (Paul, 2026-11-03, docs/commission-owed.md). Additive and idempotent.
--
--  1. The rate a plan fixes (Complete paid up front = 30%) is what the ledger row STORES, not the tier rate. The place in the month
--     stands, so the sale still counts toward the seller's tier for their other sales.
--  2. A row whose plan is corrected from Stripe takes that plan's rate in the same update (a trigger, so no caller can forget).
--  3. The one existing-row fix this task allows: an up-front row stamped with a tier rate. Nothing else is recalculated.
--  4. payment_ledger.source may say 'reconcile': a row the daily check wrote because the webhook missed it.
--  5. commission_stripe_checks: one row per run of the daily check, with what it changed and what it could not.
--
-- ⛔ Test sales keep 0%. Rows with no plan, legacy rows and every other plan are not touched.

set local lock_timeout = '5s';

-- ── 1. THE RATE A PLAN FIXES ─────────────────────────────────────────────────────────────────────────────────────────────────
-- ⛔ Mirrors commissionFixedRateForPlan in src/lib/commissionConfig.ts (scripts/commission-owed.test.ts pins the two).
create or replace function public.commission_fixed_rate_for_plan(_plan text)
returns numeric language sql immutable as $$
  select case when _plan = 'complete_upfront' then 0.30 else null end::numeric
$$;

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
           commission_rate = coalesce(public.commission_fixed_rate_for_plan(r.sale_plan), public.monthly_tier_rate(v_seq))
     where id = r.id;
  end loop;
end $$;
revoke all on function public.stamp_monthly_commission_for(uuid, date) from public, anon, authenticated;

-- ── 2. A PLAN CORRECTED FROM STRIPE TAKES ITS RATE ───────────────────────────────────────────────────────────────────────────
create or replace function public.ledger_rate_follows_plan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'initial' and new.commission_rule = 'monthly_tier_v1' and new.commission_month_seq is not null then
    new.commission_rate := coalesce(public.commission_fixed_rate_for_plan(new.sale_plan), public.monthly_tier_rate(new.commission_month_seq));
  end if;
  return new;
end $$;
revoke all on function public.ledger_rate_follows_plan() from public, anon, authenticated;
drop trigger if exists trg_payment_ledger_rate_follows_plan on public.payment_ledger;
create trigger trg_payment_ledger_rate_follows_plan
  before update of sale_plan on public.payment_ledger
  for each row when (old.sale_plan is distinct from new.sale_plan)
  execute function public.ledger_rate_follows_plan();

-- ── 3. THE ONE BACKFILL ──────────────────────────────────────────────────────────────────────────────────────────────────────
update public.payment_ledger
   set commission_rate = public.commission_fixed_rate_for_plan(sale_plan)
 where kind = 'initial' and sale_plan = 'complete_upfront' and commission_rule = 'monthly_tier_v1'
   and commission_rate is distinct from public.commission_fixed_rate_for_plan(sale_plan);

-- ── 4. WHO WROTE THE ROW ─────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.payment_ledger drop constraint if exists payment_ledger_source_check;
alter table public.payment_ledger add constraint payment_ledger_source_check check (source in ('webhook', 'backfill', 'reconcile'));

-- ── 5. THE DAILY CHECK'S LOG ─────────────────────────────────────────────────────────────────────────────────────────────────
-- RLS on, no policies, no grants: written by fn commission-stripe-check, read by fn sales-earnings for the admin.
create table if not exists public.commission_stripe_checks (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean not null default false,
  applied boolean not null default false,
  window_days integer not null,
  charges_seen integer not null default 0,
  disputes_seen integer not null default 0,
  fixed_count integer not null default 0,
  needs_you_count integer not null default 0,
  -- What it changed, one entry per change.
  changes jsonb not null default '[]'::jsonb,
  -- What it could not safely change. Each entry says what and why.
  needs_you jsonb not null default '[]'::jsonb,
  webhook jsonb,
  error text
);
create index if not exists commission_stripe_checks_recent on public.commission_stripe_checks (started_at desc);
alter table public.commission_stripe_checks enable row level security;
revoke all on public.commission_stripe_checks from anon, authenticated;

-- ── 6. THE SCHEDULE ──────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.invoke_commission_stripe_check()
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_service_key text; v_anon_key text; v_cron_secret text;
begin
  select decrypted_secret into v_service_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
  select decrypted_secret into v_anon_key    from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY'         limit 1;
  select decrypted_secret into v_cron_secret from vault.decrypted_secrets where name = 'CRON_SECRET'               limit 1;
  perform net.http_post(
    url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/commission-stripe-check',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || coalesce(v_service_key, ''),
      'apikey', coalesce(v_anon_key, ''), 'x-cron-secret', coalesce(v_cron_secret, ''), 'x-internal-job', '1'),
    body := jsonb_build_object('mode', 'run'),
    timeout_milliseconds := 140000
  );
end $function$;
revoke all on function public.invoke_commission_stripe_check() from public, anon, authenticated;

-- ⛔ Cron jobs live only in the database: this line is what schedules it. 04:10 UTC, daily.
select cron.unschedule(jobid) from cron.job where jobname = 'commission-stripe-check-daily';
select cron.schedule('commission-stripe-check-daily', '10 4 * * *', $$select public.invoke_commission_stripe_check()$$);
