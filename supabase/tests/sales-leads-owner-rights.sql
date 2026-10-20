-- sales_leads runs as its owner (migration 20261112090000). Read-only; safe to re-run against live.
-- Fails (raises) if the Supabase advisor, or anyone, turns security_invoker back on.
do $$
declare v_opts text[];
begin
  select reloptions into v_opts from pg_class where oid = 'public.sales_leads'::regclass;
  if v_opts is null or not ('security_barrier=true' = any (v_opts)) then
    raise exception 'sales_leads lost security_barrier: %', v_opts;
  end if;
  if exists (select 1 from unnest(v_opts) o where o in ('security_invoker=true', 'security_invoker=on', 'security_invoker=1')) then
    raise exception 'sales_leads has security_invoker on — every salesperson reads 0 rows: %', v_opts;
  end if;
  if has_table_privilege('anon', 'public.sales_leads', 'select') then
    raise exception 'anon can read sales_leads';
  end if;
  raise notice 'sales_leads owner rights OK: %', v_opts;
end $$;
