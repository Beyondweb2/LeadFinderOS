-- ============================================================================
-- geocode_cache.viewport — cache the geocoded area's bounding box (viewport/bounds)
-- so Region Tiling searches don't re-geocode the area on every run.
--
-- APPLIED MANUALLY in the Supabase SQL editor on 2026-07-02. This file exists to
-- keep the repo a true source of truth — it is NOT for `supabase db push` (this
-- project's migration history is desynced). Idempotent (add column if not exists).
--
-- The column is nullable and backfilled lazily: geocodeLocation writes it on the
-- next geocode of an area; region search re-geocodes once ($0.005) if a cached row
-- predates this column.
-- ============================================================================

alter table public.geocode_cache
  add column if not exists viewport jsonb;
