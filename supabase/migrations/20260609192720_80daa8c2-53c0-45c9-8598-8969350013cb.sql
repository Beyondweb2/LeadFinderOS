
DROP POLICY IF EXISTS "Public read barber-site-images" ON storage.objects;
CREATE POLICY "Public read barber-site-images"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'barber-site-images');

DROP POLICY IF EXISTS "Admins insert barber-site-images" ON storage.objects;
CREATE POLICY "Admins insert barber-site-images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'barber-site-images' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update barber-site-images" ON storage.objects;
CREATE POLICY "Admins update barber-site-images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'barber-site-images' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'barber-site-images' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins delete barber-site-images" ON storage.objects;
CREATE POLICY "Admins delete barber-site-images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'barber-site-images' AND public.has_role(auth.uid(), 'admin'));
