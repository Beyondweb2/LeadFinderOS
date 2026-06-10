-- Phase 2 prep: let a barber write image objects under their OWN site's folder.
--
-- SiteImageManager uploads to "<site_id>/<file>", so the leading path folder is
-- the site id. An owner is allowed to write when a generated_sites row with that
-- id has owner_id = auth.uid(). Compared as text (no uuid cast) so a malformed
-- path simply fails to match and is denied, rather than erroring.
--
-- ADDITIVE to the existing "Admins ..." policies (RLS ORs permissive policies),
-- so admins keep full access; service_role bypasses RLS entirely. SELECT stays
-- public; anon still has no write policy.
--
-- Verified live (browser-console upload probe): barber → own-site path = ALLOWED,
-- barber → another site's path = BLOCKED ("new row violates row-level security
-- policy"), admin → anywhere = ALLOWED.

DROP POLICY IF EXISTS "Owners insert barber-site-images" ON storage.objects;
CREATE POLICY "Owners insert barber-site-images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'barber-site-images'
    AND EXISTS (
      SELECT 1 FROM public.generated_sites gs
      WHERE gs.id::text = (storage.foldername(name))[1]
        AND gs.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners update barber-site-images" ON storage.objects;
CREATE POLICY "Owners update barber-site-images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'barber-site-images'
    AND EXISTS (
      SELECT 1 FROM public.generated_sites gs
      WHERE gs.id::text = (storage.foldername(name))[1]
        AND gs.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'barber-site-images'
    AND EXISTS (
      SELECT 1 FROM public.generated_sites gs
      WHERE gs.id::text = (storage.foldername(name))[1]
        AND gs.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners delete barber-site-images" ON storage.objects;
CREATE POLICY "Owners delete barber-site-images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'barber-site-images'
    AND EXISTS (
      SELECT 1 FROM public.generated_sites gs
      WHERE gs.id::text = (storage.foldername(name))[1]
        AND gs.owner_id = auth.uid()
    )
  );
