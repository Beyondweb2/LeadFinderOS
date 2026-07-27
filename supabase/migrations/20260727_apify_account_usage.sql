-- APIFY ACCOUNT USAGE, recorded in our own system.
--
-- WHY. Until now the only place real Apify spend existed was Apify's dashboard. Internally,
-- sum(enrichment_usage.cost_usd) read $1.36 while the account had consumed $73.55 of a $90 monthly
-- cap, because most actor calls recorded an estimate and several recorded nothing. That means no cap
-- could protect anything and there was no warning before Apify would simply stop serving at $90 -
-- which halts audits AND directory scrapes together.
--
-- The queue writes one row here every APIFY_USAGE_REFRESH_MS (a snapshot, not an event stream), so
-- the figure is visible in the app and queryable for alerting.
--
-- monthly_usage_usd / max_monthly_usage_usd  the numbers that matter: spend against the hard cap.
-- cycle_start / cycle_end                    Apify's usage cycle, so "runway left" is answerable.
-- active_actor_jobs / max_concurrent         live concurrency against the plan limit, which is what
--                                            the audit queue's in-flight ceiling is reserving from.
-- raw                                        the whole limits payload, so a later question about a
--                                            different limit does not need a new deploy.

create table if not exists public.apify_account_usage (
  id                     uuid primary key default gen_random_uuid(),
  captured_at            timestamptz not null default now(),
  monthly_usage_usd      numeric,
  max_monthly_usage_usd  numeric,
  usage_pct              numeric,          -- convenience: monthly_usage_usd / max_monthly_usage_usd
  cycle_start            timestamptz,
  cycle_end              timestamptz,
  active_actor_jobs      integer,
  max_concurrent_runs    integer,
  max_actor_memory_gb    integer,
  plan_id                text,
  raw                    jsonb
);

create index if not exists apify_account_usage_captured_idx
  on public.apify_account_usage (captured_at desc);

-- Service-role only: this is operator/billing data, never customer-facing. RLS on with no policies
-- means the anon and authenticated roles get nothing, while the service key (used by the queue)
-- bypasses RLS as normal.
alter table public.apify_account_usage enable row level security;

-- The latest snapshot, for a dashboard tile:
--   select monthly_usage_usd, max_monthly_usage_usd, usage_pct, cycle_end
--   from apify_account_usage order by captured_at desc limit 1;
