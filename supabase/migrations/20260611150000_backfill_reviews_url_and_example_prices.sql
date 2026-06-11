-- Backfill existing barber sites with the two defaults new sites now ship with
-- (see generate-barber-site): a pre-filled Google reviews/Maps link, and
-- example prices on by default. Idempotent — only fills what is unset, never
-- overrides a value a barber/admin has chosen.
--
-- Only the `content` JSONB is touched (not owner_id/lead_id/site_name), so the
-- lock_generated_sites_protected_fields trigger does not block these updates.
-- Run via the Supabase SQL editor (raw SQL), NOT the Lovable build chat.

-- 1. googleReviewsUrl: build Google's documented "search a place" Maps link
--    (query + query_place_id) from the lead's real place_id. The query is only a
--    fallback Google uses if the place_id can't be resolved, so a URL-safe form of
--    the business name (non-alphanumerics -> '+') is sufficient and needs no
--    URL-encoding. Only where the site has no link yet and the lead has a place_id.
--    This is a real, verifiable URL — not invented content.
UPDATE public.generated_sites AS gs
SET content = jsonb_set(
  gs.content,
  '{googleReviewsUrl}',
  to_jsonb(
    'https://www.google.com/maps/search/?api=1&query='
      || COALESCE(NULLIF(regexp_replace(btrim(COALESCE(ol.business_name, '')), '[^a-zA-Z0-9]+', '+', 'g'), ''), 'barber')
      || '&query_place_id=' || ol.place_id
  ),
  true
)
FROM public.outreach_leads AS ol
WHERE gs.lead_id = ol.id
  AND ol.place_id IS NOT NULL
  AND btrim(ol.place_id) <> ''
  AND NULLIF(btrim(COALESCE(gs.content->>'googleReviewsUrl', '')), '') IS NULL;

-- 2. showExamplePrices: default ON for any site that has never set it. An
--    explicit `false` (a barber who turned it off) is left untouched.
UPDATE public.generated_sites
SET content = jsonb_set(content, '{showExamplePrices}', 'true'::jsonb, true)
WHERE NOT (content ? 'showExamplePrices');

-- Verify (expect 0 rows missing a reviews link where a place_id exists, and 0
-- sites without the showExamplePrices key):
--   SELECT count(*) FROM public.generated_sites gs JOIN public.outreach_leads ol
--     ON gs.lead_id = ol.id
--     WHERE COALESCE(btrim(ol.place_id),'') <> ''
--       AND NULLIF(btrim(COALESCE(gs.content->>'googleReviewsUrl','')),'') IS NULL;
--   SELECT count(*) FROM public.generated_sites WHERE NOT (content ? 'showExamplePrices');
