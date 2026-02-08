-- Remove the permissive policy that exposes all affiliate data
DROP POLICY IF EXISTS "Validate affiliate codes only" ON public.affiliates;
DROP POLICY IF EXISTS "Anyone can lookup active affiliates by code" ON public.affiliates;

-- Create a restrictive SELECT policy - no direct public access 
-- All affiliate lookups will go through server-side (service role) edge functions
-- This means unauthenticated users cannot query the affiliates table at all
CREATE POLICY "No public access to affiliates" ON public.affiliates
  FOR SELECT
  USING (false);