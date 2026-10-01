-- FINDABLE'S OWN SITE IN SEARCH CONSOLE (2026-10-02). Rides the EXISTING performance-sync (same
-- function, same 05:00 cron, same GOOGLE_SERVICE_ACCOUNT_JSON credential, same read-only scope).
-- ⛔ SEPARATE TABLES FROM PAID-CLIENT REPORTING, deliberately. The client tables require a lead and the
-- sync only reads paying leads; making findable.live a fake "paid lead" would have put Findable's own
-- traffic into client revenue/client counts. These tables carry a site_key instead and nothing in the
-- client path reads them.
-- ⛔ ONE property record: site_key 'findable' → sc-domain:findable.live. Status starts 'not_connected'
-- and only the sync may move it. No credential → no rows → the panel says Not connected. Nothing is
-- ever estimated.
-- RLS on, NO policies (service role only), like the client tables. Additive and idempotent.

create table if not exists public.own_site_search_property (
  site_key text primary key,
  gsc_property text not null,
  canonical_domain text not null,
  status text not null default 'not_connected' check (status in ('not_connected', 'connected', 'error')),
  last_synced_at timestamptz,
  last_sync_error text,
  last_sync_row_count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.own_site_search_property enable row level security;

insert into public.own_site_search_property (site_key, gsc_property, canonical_domain)
values ('findable', 'sc-domain:findable.live', 'findable.live')
on conflict (site_key) do nothing;

create table if not exists public.own_site_search_page_daily (
  id uuid primary key default gen_random_uuid(),
  site_key text not null references public.own_site_search_property(site_key) on delete cascade,
  date date not null,
  page text not null,
  clicks integer,
  impressions integer,
  ctr numeric,
  position numeric,
  synced_at timestamptz not null default now(),
  unique (site_key, date, page)
);
create index if not exists own_site_search_page_daily_site_date_idx on public.own_site_search_page_daily (site_key, date);
alter table public.own_site_search_page_daily enable row level security;

create table if not exists public.own_site_search_query_daily (
  id uuid primary key default gen_random_uuid(),
  site_key text not null references public.own_site_search_property(site_key) on delete cascade,
  date date not null,
  page text not null,
  query text not null,
  clicks integer,
  impressions integer,
  ctr numeric,
  position numeric,
  synced_at timestamptz not null default now(),
  unique (site_key, date, page, query)
);
create index if not exists own_site_search_query_daily_site_date_idx on public.own_site_search_query_daily (site_key, date);
alter table public.own_site_search_query_daily enable row level security;

-- Sums only — never a rate (CTR and position are computed once, in src/lib/searchPerformance.ts).
create or replace function public.own_site_search_page_totals(p_site text, p_from date, p_to date)
returns table (page text, clicks bigint, impressions bigint, position_impressions numeric)
language sql stable security invoker set search_path = public as $$
  select d.page, coalesce(sum(d.clicks), 0)::bigint, coalesce(sum(d.impressions), 0)::bigint, coalesce(sum(d.position * d.impressions), 0)::numeric
  from public.own_site_search_page_daily d
  where d.site_key = p_site and d.date >= p_from and d.date <= p_to
  group by d.page
$$;
create or replace function public.own_site_search_query_totals(p_site text, p_from date, p_to date)
returns table (query text, clicks bigint, impressions bigint, position_impressions numeric)
language sql stable security invoker set search_path = public as $$
  select d.query, coalesce(sum(d.clicks), 0)::bigint, coalesce(sum(d.impressions), 0)::bigint, coalesce(sum(d.position * d.impressions), 0)::numeric
  from public.own_site_search_query_daily d
  where d.site_key = p_site and d.date >= p_from and d.date <= p_to
  group by d.query
$$;
create or replace function public.own_site_search_coverage(p_site text)
returns table (first_date date, last_date date, row_count bigint)
language sql stable security invoker set search_path = public as $$
  select min(d.date), max(d.date), count(*)::bigint from public.own_site_search_page_daily d where d.site_key = p_site
$$;
revoke all on function public.own_site_search_page_totals(text, date, date) from public, anon, authenticated;
revoke all on function public.own_site_search_query_totals(text, date, date) from public, anon, authenticated;
revoke all on function public.own_site_search_coverage(text) from public, anon, authenticated;
grant execute on function public.own_site_search_page_totals(text, date, date) to service_role;
grant execute on function public.own_site_search_query_totals(text, date, date) to service_role;
grant execute on function public.own_site_search_coverage(text) to service_role;
