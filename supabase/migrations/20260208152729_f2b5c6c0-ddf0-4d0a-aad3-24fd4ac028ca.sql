-- Add ref_source column for acquisition tracking (ads, whatsapp, etc.)
-- This is separate from affiliate_code which is for commission tracking
ALTER TABLE public.user_trials 
ADD COLUMN IF NOT EXISTS ref_source text DEFAULT NULL;