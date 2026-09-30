-- ADMIN CONTROL CENTRE, release 1 (2026-09-30). Additive and idempotent.
-- 1. metric_exclusions: the explicit, visible list of internal/test identities kept OUT of business
--    numbers (src/lib/metricExclusions.ts). Nothing is deleted; a row only stops activity counting.
--    Paul, 2026-09-30: exclude the accounts "test1" and "Test".
-- 2. admin_api_cost(from, to): api_usage_log summed per (user, function, type) for a range, so the
--    dashboard never pages 30,000+ cost rows. Service role only.

create table if not exists public.metric_exclusions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('user', 'lead', 'phone', 'email')),
  value text not null,
  reason text not null,
  added_by uuid,
  created_at timestamptz not null default now(),
  unique (kind, value)
);
-- RLS on, no policies: read and written only by the admin edge functions on the service role.
alter table public.metric_exclusions enable row level security;

insert into public.metric_exclusions (kind, value, reason)
values
  ('user', 'c6e21a37-e342-4b99-9cf6-0489cb9af775', 'Test sales account "test1" (Paul, 2026-09-30)'),
  ('user', '262c1d64-05ad-42e8-a81b-7d25553aeff3', 'Test sales account "Test" (Paul, 2026-09-30)')
on conflict (kind, value) do nothing;

create or replace function public.admin_api_cost(_from timestamptz, _to timestamptz)
returns table (user_id uuid, function_name text, api_type text, usd numeric, calls bigint)
language sql
stable
security definer
set search_path = public
as $$
  select u.user_id, u.function_name, u.api_type,
         coalesce(sum(u.estimated_cost_usd), 0)::numeric as usd,
         count(*)::bigint as calls
  from public.api_usage_log u
  where (_from is null or u.created_at >= _from)
    and u.created_at < _to
    and coalesce(u.api_type, '') <> 'guard'
  group by u.user_id, u.function_name, u.api_type
$$;

revoke all on function public.admin_api_cost(timestamptz, timestamptz) from public;
revoke all on function public.admin_api_cost(timestamptz, timestamptz) from anon, authenticated;
grant execute on function public.admin_api_cost(timestamptz, timestamptz) to service_role;
