-- Public read of PUBLISHED generated sites only, for the public /p/:slug route.
-- Scope: SELECT-only · published-only · generated_sites only · no writes · no other table.
-- Idempotent so it is safe to (re)apply.

-- Anonymous role may read ONLY the two columns the public page needs
-- (excludes id, lead_id, status, timestamps from public queries).
GRANT SELECT (site_name, content) ON public.generated_sites TO anon;

-- Row filter: anon + logged-in visitors may read ONLY rows where status = 'published'.
-- Drafts/archived stay private; the existing "Admins manage generated_sites"
-- policy is untouched, so admins keep full access (and can preview drafts).
DROP POLICY IF EXISTS "Public can read published generated_sites" ON public.generated_sites;
CREATE POLICY "Public can read published generated_sites"
  ON public.generated_sites
  FOR SELECT
  TO anon, authenticated
  USING (status = 'published');