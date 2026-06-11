-- Backfill content.googleReviewsUrl for existing barber sites from the lead's
-- google_maps_url column (the SAME source the Outreach page displays), mirroring
-- the generator change that now PREFERS lead.google_maps_url.
--
-- Idempotent and safe:
--  * Only fills sites that have NO reviews URL yet (absent or empty) — never
--    overrides a value already present.
--  * Only uses a non-empty google_maps_url from the linked lead.
--  * Touches only the content JSONB (not owner_id/lead_id/site_name), so the
--    lock_generated_sites_protected_fields trigger does not block it.
--
-- Run via the Supabase SQL editor / Lovable SQL runner (raw SQL), NOT the build
-- chat. (Supersedes the place_id-based reviews-url backfill in the earlier,
-- unran 20260611150000 migration for any site whose lead has a google_maps_url;
-- run this one for the curated source.)

UPDATE public.generated_sites AS gs
SET content = jsonb_set(
  gs.content,
  '{googleReviewsUrl}',
  to_jsonb(btrim(ol.google_maps_url)),
  true
)
FROM public.outreach_leads AS ol
WHERE gs.lead_id = ol.id
  AND ol.google_maps_url IS NOT NULL
  AND btrim(ol.google_maps_url) <> ''
  AND NULLIF(btrim(COALESCE(gs.content->>'googleReviewsUrl', '')), '') IS NULL;

-- Verify (expect 0 rows still missing a reviews URL where the lead has a maps URL):
--   SELECT count(*) FROM public.generated_sites gs
--     JOIN public.outreach_leads ol ON gs.lead_id = ol.id
--     WHERE COALESCE(btrim(ol.google_maps_url), '') <> ''
--       AND NULLIF(btrim(COALESCE(gs.content->>'googleReviewsUrl', '')), '') IS NULL;
