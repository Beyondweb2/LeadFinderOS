ALTER TABLE public.checkout_attempts
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_adset text,
  ADD COLUMN IF NOT EXISTS utm_ad text,
  ADD COLUMN IF NOT EXISTS fbclid text,
  ADD COLUMN IF NOT EXISTS traffic_source text,
  ADD COLUMN IF NOT EXISTS ref_source text,
  ADD COLUMN IF NOT EXISTS affiliate_code text;