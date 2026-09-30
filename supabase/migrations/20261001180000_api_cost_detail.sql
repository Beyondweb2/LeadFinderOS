-- API cost accuracy (2026-09-30, docs/sales-workflow-nav.md §Release B).
-- admin_api_cost stays exactly as it is (the Team / feature / person split). This ADDS a second read that
-- the honest cost panel needs: the same api_usage_log rows by London calendar MONTH (Google's free
-- allowances are monthly), split at the date Findable's work began (_findable_start: before it, lead
-- finding cannot be attributed to Findable), with the count of calls that were actually made
-- (a cache hit or a zero-cost row is not a billable call). Read-only; service role only.
create or replace function public.admin_api_cost_detail(_from timestamptz, _to timestamptz, _findable_start timestamptz)
returns table(month text, user_id uuid, function_name text, api_type text, pre_findable boolean, usd numeric, calls bigint)
language sql stable security definer set search_path = public as $$
  select to_char(u.created_at at time zone 'Europe/London', 'YYYY-MM') as month,
         u.user_id, u.function_name, u.api_type,
         (u.created_at < _findable_start) as pre_findable,
         coalesce(sum(u.estimated_cost_usd), 0)::numeric as usd,
         coalesce(sum(greatest(coalesce(u.calls_made, 1), 1)) filter (where coalesce(u.estimated_cost_usd, 0) > 0 and u.cache_hit is not true), 0)::bigint as calls
  from public.api_usage_log u
  where (_from is null or u.created_at >= _from)
    and u.created_at < _to
    and coalesce(u.api_type, '') <> 'guard'
  group by 1, 2, 3, 4, 5
$$;
revoke all on function public.admin_api_cost_detail(timestamptz, timestamptz, timestamptz) from public;
revoke all on function public.admin_api_cost_detail(timestamptz, timestamptz, timestamptz) from anon, authenticated;
grant execute on function public.admin_api_cost_detail(timestamptz, timestamptz, timestamptz) to service_role;
