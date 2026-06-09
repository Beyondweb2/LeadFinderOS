
-- 1) Realtime channel authorization: restrict realtime.messages so users can only
-- subscribe to their own subscriptions channel topic.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read their own subscription topic" ON realtime.messages;
CREATE POLICY "Authenticated users can read their own subscription topic"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() = 'subscriptions:' || (auth.uid())::text
  );

-- 2) Storage: remove blanket public SELECT policies (public URL fetches still work
-- because both buckets are marked public and bypass RLS on direct object URLs).
-- API-level listing/enumeration is now restricted to the file owner.
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Lead images are publicly accessible" ON storage.objects;

DROP POLICY IF EXISTS "Users can read their own avatar" ON storage.objects;
CREATE POLICY "Users can read their own avatar"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can read their own lead images" ON storage.objects;
CREATE POLICY "Users can read their own lead images"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'lead-images'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

-- 3) phone_cache / search_cache: tighten deny to explicitly block INSERT/UPDATE/DELETE
-- with WITH CHECK false (the previous ALL+USING(false) does not constrain WITH CHECK).
DROP POLICY IF EXISTS "No public access to phone_cache" ON public.phone_cache;
CREATE POLICY "Deny all client access to phone_cache"
  ON public.phone_cache
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "No public access to search_cache" ON public.search_cache;
CREATE POLICY "Deny all client access to search_cache"
  ON public.search_cache
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- 4) Revoke EXECUTE on SECURITY DEFINER functions that should never be callable
-- by clients (they are triggers or pg_cron-only).
REVOKE EXECUTE ON FUNCTION public.invoke_cron_run() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_trial() FROM anon, authenticated, PUBLIC;

-- Tighten executor surface for has_role: only authenticated needs to call it.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, PUBLIC;

-- 5) funnel_analytics: replace WITH CHECK (true) with bounded validation so the
-- insert policy is no longer trivially permissive.
DROP POLICY IF EXISTS "Anyone can insert funnel analytics" ON public.funnel_analytics;
CREATE POLICY "Public can insert validated funnel analytics"
  ON public.funnel_analytics
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    length(event_type) BETWEEN 1 AND 100
    AND (session_id IS NULL OR length(session_id) <= 200)
  );
