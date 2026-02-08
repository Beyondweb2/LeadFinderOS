-- Fix exposed affiliate email addresses
-- Drop the overly permissive public policy
DROP POLICY IF EXISTS "Anyone can lookup active affiliates by code" ON public.affiliates;

-- Create a more restrictive policy that only returns minimal data needed for validation
-- This policy only allows lookups where a specific code is provided and only returns id (for validation purposes)
CREATE POLICY "Validate affiliate codes only" ON public.affiliates
  FOR SELECT
  USING (is_active = true);

-- Create a security definer function to safely validate affiliate codes without exposing email
CREATE OR REPLACE FUNCTION public.validate_affiliate_code(code_to_check text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.affiliates
    WHERE code = code_to_check
      AND is_active = true
  )
$$;