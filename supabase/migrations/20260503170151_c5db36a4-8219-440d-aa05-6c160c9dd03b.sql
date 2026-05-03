-- Geocode cache table to prevent repeated geocoding of the same locations
CREATE TABLE public.geocode_cache (
  location_key text NOT NULL PRIMARY KEY,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  raw_location text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS: service-role only
ALTER TABLE public.geocode_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No public access to geocode_cache"
  ON public.geocode_cache
  FOR ALL
  USING (false);

-- Add trigger_source to api_usage_log for better cost tracking
ALTER TABLE public.api_usage_log
  ADD COLUMN IF NOT EXISTS trigger_source text;