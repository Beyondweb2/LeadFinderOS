-- Let anon read generated_sites.id (and ONLY id) so the public booking flow's
-- FK embed works.
--
-- Why: anon has column-level SELECT on generated_sites limited to (site_name,
-- content) — the deliberate metadata-exposure fix that hides owner_id/status/etc.
-- The public booking flow embeds booking_staff -> generated_sites filtered by slug
-- (to find a site's active staff). PostgREST must evaluate the join
-- booking_staff.site_id = generated_sites.id, which requires reading
-- generated_sites.id — a column anon could NOT read -> "42501 permission denied
-- for table generated_sites" -> staff detection failed -> "Book now" fell back to
-- scrolling to contact.
--
-- This ADDS ONLY the `id` column to the anon SELECT grant. id is a random uuid and
-- is not sensitive (it is NOT owner_id). All other columns — owner_id, status,
-- lead_id, created_at, updated_at, etc. — remain ungranted, so anon still cannot
-- read them. Idempotent (re-granting is a no-op).
--
-- Run via the Supabase SQL editor / Lovable SQL runner (raw SQL), NOT the build chat.

GRANT SELECT (id) ON public.generated_sites TO anon;
