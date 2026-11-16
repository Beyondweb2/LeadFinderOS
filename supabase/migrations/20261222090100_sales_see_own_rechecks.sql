-- A REP SEES THEIR OWN LEADS' RE-CHECKS (v1-prospect-recheck, 2026-11-16; src/lib/prospectRecheck.ts).
-- Found on the live QA run: a salesperson could START a prospect re-check (create-ai-audit purpose 'recheck') but not READ it,
-- because the sales SELECT policies on ai_audits / ai_audit_runs / ai_audit_queue admit only audit_purpose 'audit'
-- (my_sales_audit_ids). The re-check panel and the Opportunity score were therefore empty for reps.
-- ONE change: the purpose list is 'audit' + 'recheck'. The lead scope is untouched (my_sales_lead_ids: the rep's own,
-- non-client leads), measurements stay excluded, the admin path is untouched (the function returns nothing for a non-rep).
-- Grants are unchanged by create or replace (authenticated + service_role execute; never anon) and re-asserted below.
-- Rollback: re-run the function body from 20260927100500_sales_rls_once_per_query.sql.

create or replace function public.my_sales_audit_ids()
returns setof uuid language plpgsql stable security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'sales' then return; end if;
  return query
    select a.id from public.ai_audits a
    where a.lead_id in (select public.my_sales_lead_ids())
      and coalesce(a.audit_purpose, 'audit') in ('audit', 'recheck') and a.is_measurement is not true;
end
$$;
revoke execute on function public.my_sales_audit_ids() from public, anon;
grant execute on function public.my_sales_audit_ids() to authenticated;

-- Read back: select prosrc like '%in (''audit'', ''recheck'')%' from pg_proc where proname = 'my_sales_audit_ids';
