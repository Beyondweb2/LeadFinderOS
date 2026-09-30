-- ADMIN CONTROL CENTRE, release 5 (2026-09-30): Google Search Console for paid clients.
-- PORTED from the parked 2026-09-22 branch feat/client-performance (e712b980) after an audit, with its
-- faults fixed (docs/admin-control-centre.md §Search Console):
--   · NO browser access: RLS on, NO policies (the branch's owner FOR ALL policies would have let a browser
--     session write traffic rows and flip a connection to 'connected' — a path to invented numbers);
--   · the reporting domain lives on the connection row, not a second outreach_leads column (the
--     domain already exists as website_build->>'canonical_domain');
--   · the SQL functions are service-role only; the cron invoker is revoked from public / anon /
--     authenticated (the branch's was callable with the public key);
--   · client_tracked_pages is not ported yet — nothing reads it.
-- ⛔ Absent credentials, absent rows = "Not connected". No traffic figure is ever estimated.
-- Additive and idempotent.

create table if not exists public.client_search_connections (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.outreach_leads(id) on delete cascade,
  -- Owner of the data rows: the lead's user_id (the book owner's data account), never hardcoded.
  user_id uuid not null,
  -- The EXACT Search Console property: 'https://example.com/' (URL-prefix) or 'sc-domain:example.com'.
  gsc_property text,
  -- Bare reporting host (no scheme, no www); pre-filled from website_build->>'canonical_domain'.
  canonical_domain text,
  status text not null default 'not_connected' check (status in ('not_connected', 'connected', 'error')),
  last_synced_at timestamptz,
  last_sync_error text,
  last_sync_row_count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.client_search_connections enable row level security;

create table if not exists public.search_console_page_daily (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.outreach_leads(id) on delete cascade,
  user_id uuid not null,
  date date not null,
  page text not null,
  clicks integer,
  impressions integer,
  ctr numeric,
  position numeric,
  synced_at timestamptz not null default now(),
  unique (lead_id, date, page)
);
create index if not exists search_console_page_daily_lead_date_idx on public.search_console_page_daily (lead_id, date);
alter table public.search_console_page_daily enable row level security;

create table if not exists public.search_console_query_daily (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.outreach_leads(id) on delete cascade,
  user_id uuid not null,
  date date not null,
  page text not null,
  query text not null,
  clicks integer,
  impressions integer,
  ctr numeric,
  position numeric,
  synced_at timestamptz not null default now(),
  unique (lead_id, date, page, query)
);
create index if not exists search_console_query_daily_lead_date_idx on public.search_console_query_daily (lead_id, date);
alter table public.search_console_query_daily enable row level security;

-- Sums only — never a rate (CTR and position are computed once, in src/lib/searchPerformance.ts).
create or replace function public.search_console_page_totals(p_lead uuid, p_from date, p_to date)
returns table (page text, clicks bigint, impressions bigint, position_impressions numeric)
language sql stable security invoker set search_path = public as $$
  select d.page, coalesce(sum(d.clicks), 0)::bigint, coalesce(sum(d.impressions), 0)::bigint, coalesce(sum(d.position * d.impressions), 0)::numeric
  from public.search_console_page_daily d
  where d.lead_id = p_lead and d.date >= p_from and d.date <= p_to
  group by d.page
$$;
create or replace function public.search_console_coverage(p_lead uuid)
returns table (first_date date, last_date date, row_count bigint)
language sql stable security invoker set search_path = public as $$
  select min(d.date), max(d.date), count(*)::bigint from public.search_console_page_daily d where d.lead_id = p_lead
$$;
revoke all on function public.search_console_page_totals(uuid, date, date) from public, anon, authenticated;
revoke all on function public.search_console_coverage(uuid) from public, anon, authenticated;
grant execute on function public.search_console_page_totals(uuid, date, date) to service_role;
grant execute on function public.search_console_coverage(uuid) to service_role;

-- The cron invoker (same shape as the others: CRON_SECRET from the vault + x-internal-job). Revoked.
create or replace function public.invoke_performance_sync()
returns void language plpgsql security definer set search_path = public
as $function$
declare v_cron_secret text;
begin
  select decrypted_secret into v_cron_secret from vault.decrypted_secrets where name = 'CRON_SECRET' limit 1;
  perform net.http_post(
    url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/performance-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', coalesce(v_cron_secret, ''), 'x-internal-job', '1'),
    body := '{"mode":"daily"}'::jsonb
  );
end $function$;
revoke all on function public.invoke_performance_sync() from public;
revoke all on function public.invoke_performance_sync() from anon, authenticated;

-- Daily at 05:00 UTC. With no connected client (or no Google credential) the run records "not
-- configured" / "no connected clients" and spends nothing — Search Console is free.
select cron.unschedule('performance-sync-run') where exists (select 1 from cron.job where jobname = 'performance-sync-run');
select cron.schedule('performance-sync-run', '0 5 * * *', 'select public.invoke_performance_sync()');
