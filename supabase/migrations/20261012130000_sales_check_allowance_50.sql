-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- "CHECK BEFORE CALLING" — THE DAILY ALLOWANCE 30 → 50 (Paul, 2026-10-06, improve/one-click-checks-50).
--
-- The rep's daily allowance of FRESH checks is protection_settings.limits.actions.sales_check.per_day:
-- public.guard_action counts it (api_usage_log, action 'sales_check', rolling 24 h) and fn
-- sales-prospect-check reads it for "Checks left today". src/lib/protectionLimits.ts
-- DEFAULT_PROTECTION_LIMITS.actions.sales_check is the fallback and holds the same value.
-- Unchanged: the batch maximum (SALES_CHECK_BATCH_MAX, code), reused results never counting, every other
-- limit in the row. Idempotent: writes only while the value is not already 50.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
set local lock_timeout = '5s';

update public.protection_settings
   set limits = jsonb_set(limits, '{actions,sales_check}', '{"paid": true, "per_day": 50}'::jsonb, true),
       updated_at = now()
 where id = 1
   and (limits -> 'actions' -> 'sales_check' ->> 'per_day') is distinct from '50';
