-- AUDIT BUDGET POOLS (fix/04-ai-measurement, 2026-10-04 — master plan M-010).
--
-- WHY. Every audit question — a rep's hook check and a paying client's baseline or day-28
-- re-measure alike — was capped by ONE rolling-24h sum of enrichment_usage per user. A day of
-- prospecting could leave a client's guarantee measurement `capped`.
--
-- WHAT. One nullable column saying which pool a ledger row belongs to (src/lib/auditBudget.ts):
--   'guarantee'   baseline + remeasure
--   'client'      measurement, discovery, weekly_check
--   'prospecting' everything else
-- NULL = written before pools existed (or by a non-audit enrichment source) and is read as
-- PROSPECTING by the cap check — never against a client's measurement.
--
-- ADDITIVE AND IDEMPOTENT. The code is migration-tolerant (it retries the ledger insert without the
-- column), but the guarantee pool is only separately capped once this has run: run it BEFORE
-- deploying process-ai-audit-queue / create-ai-audit, then read it back.

alter table public.enrichment_usage add column if not exists budget_pool text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'enrichment_usage_budget_pool_check') then
    alter table public.enrichment_usage
      add constraint enrichment_usage_budget_pool_check
      check (budget_pool is null or budget_pool in ('guarantee', 'client', 'prospecting'));
  end if;
end $$;

-- The cap check reads one user's last 24 hours in one pool on every question start.
create index if not exists enrichment_usage_user_pool_created_idx
  on public.enrichment_usage (user_id, budget_pool, created_at desc);

comment on column public.enrichment_usage.budget_pool is
  'Audit budget pool (src/lib/auditBudget.ts): guarantee | client | prospecting. NULL = legacy / non-audit, read as prospecting.';

-- Read back:
--   select column_name, data_type from information_schema.columns
--   where table_schema = 'public' and table_name = 'enrichment_usage' and column_name = 'budget_pool';
