-- API cost ownership (2026-09-30, docs/api-cost-ownership.md).
-- Each provider moved from Move37's credentials to Paul's own on a different date. Usage before a
-- provider's move was paid for by Move37 and is not a Findable expense. The dates and the rule that
-- applies them live in ONE place, src/lib/apiCostAccounting.ts (PROVIDER_MIGRATIONS) — this SQL does
-- not know them. The caller passes the switch instants as _bounds, and every row reports which
-- interval it fell in (seg = how many bounds are at or before it), so the TypeScript decides.
-- ADDITIVE: admin_api_cost and admin_api_cost_detail are left exactly as they are. No row is changed.
-- Read-only; service role only.

create or replace function public.admin_api_cost_seg(_from timestamptz, _to timestamptz, _bounds timestamptz[])
returns table (user_id uuid, function_name text, api_type text, seg int, usd numeric, calls bigint)
language sql
stable
security definer
set search_path = public
as $$
  select u.user_id, u.function_name, u.api_type,
         (select count(*) from unnest(coalesce(_bounds, '{}'::timestamptz[])) b where b <= u.created_at)::int as seg,
         coalesce(sum(u.estimated_cost_usd), 0)::numeric as usd,
         count(*)::bigint as calls
  from public.api_usage_log u
  where (_from is null or u.created_at >= _from)
    and u.created_at < _to
    and coalesce(u.api_type, '') <> 'guard'
  group by 1, 2, 3, 4
$$;

create or replace function public.admin_api_cost_detail_seg(_from timestamptz, _to timestamptz, _findable_start timestamptz, _bounds timestamptz[])
returns table (month text, user_id uuid, function_name text, api_type text, pre_findable boolean, seg int, usd numeric, calls bigint)
language sql
stable
security definer
set search_path = public
as $$
  select to_char(u.created_at at time zone 'Europe/London', 'YYYY-MM') as month,
         u.user_id, u.function_name, u.api_type,
         (u.created_at < _findable_start) as pre_findable,
         (select count(*) from unnest(coalesce(_bounds, '{}'::timestamptz[])) b where b <= u.created_at)::int as seg,
         coalesce(sum(u.estimated_cost_usd), 0)::numeric as usd,
         coalesce(sum(greatest(coalesce(u.calls_made, 1), 1)) filter (where coalesce(u.estimated_cost_usd, 0) > 0 and u.cache_hit is not true), 0)::bigint as calls
  from public.api_usage_log u
  where (_from is null or u.created_at >= _from)
    and u.created_at < _to
    and coalesce(u.api_type, '') <> 'guard'
  group by 1, 2, 3, 4, 5, 6
$$;

revoke all on function public.admin_api_cost_seg(timestamptz, timestamptz, timestamptz[]) from public;
revoke all on function public.admin_api_cost_seg(timestamptz, timestamptz, timestamptz[]) from anon, authenticated;
grant execute on function public.admin_api_cost_seg(timestamptz, timestamptz, timestamptz[]) to service_role;
revoke all on function public.admin_api_cost_detail_seg(timestamptz, timestamptz, timestamptz, timestamptz[]) from public;
revoke all on function public.admin_api_cost_detail_seg(timestamptz, timestamptz, timestamptz, timestamptz[]) from anon, authenticated;
grant execute on function public.admin_api_cost_detail_seg(timestamptz, timestamptz, timestamptz, timestamptz[]) to service_role;
