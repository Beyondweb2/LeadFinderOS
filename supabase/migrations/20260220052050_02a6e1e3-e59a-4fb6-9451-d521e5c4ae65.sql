
-- Search results cache (24h TTL, managed by edge functions)
CREATE TABLE public.search_cache (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key text NOT NULL UNIQUE,
  results jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_search_cache_key ON public.search_cache (cache_key);

ALTER TABLE public.search_cache ENABLE ROW LEVEL SECURITY;

-- Service-role only (edge functions use service role key)
CREATE POLICY "No public access to search_cache" ON public.search_cache FOR ALL USING (false);

-- Phone/details lookup cache (30-day TTL, managed by edge functions)
CREATE TABLE public.phone_cache (
  place_id text PRIMARY KEY,
  phone text,
  address text,
  category text,
  google_maps_uri text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.phone_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No public access to phone_cache" ON public.phone_cache FOR ALL USING (false);
