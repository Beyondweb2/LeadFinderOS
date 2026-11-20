-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- FIND LEADS ADD IS FAST AGAIN: place_details 40 → 400 a minute, 500 → 3000 an hour (Paul, 2026-11-20, v1-fast-bulk-add).
--
-- "Adding 111 leads crawls." The add was paced at 36 lookups a minute to stay under this guard's 40. Google's own
-- Place Details quota is 600 a minute per project, and search-leads now fills phone_cache so most add-time lookups are
-- free cache hits. The browser paces at 90 % of the new figure (src/lib/findLeadsBulkAdd.ts), so a normal add never meets
-- the limit and never raises a restriction alert. src/lib/protectionLimits.ts DEFAULT_PROTECTION_LIMITS holds the same value.
-- Unchanged, and still the real safety net: the per-person and team spend caps, suspension and the pause modes.
-- Idempotent: writes only while the value differs.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
set local lock_timeout = '5s';

update public.protection_settings
   set limits = jsonb_set(limits, '{actions,place_details}', '{"paid": true, "per_min": 400, "per_hour": 3000}'::jsonb, true),
       updated_at = now()
 where id = 1
   and (limits -> 'actions' -> 'place_details') is distinct from '{"paid": true, "per_min": 400, "per_hour": 3000}'::jsonb;
