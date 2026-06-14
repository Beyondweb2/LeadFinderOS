-- Phase 2 — Apify enrichment backbone (Apify STUBBED in this build).
-- Additive only. email_* columns already exist from Phase 1 — NOT re-added.

-- 1) Instagram enrichment columns + facebook_status + provenance, mirroring the
--    existing email_* / facebook_* pattern on outreach_leads.
ALTER TABLE public.outreach_leads
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS instagram_status text,            -- 'found' | 'none' | 'error' | null
  ADD COLUMN IF NOT EXISTS instagram_method text,            -- 'apify' | 'manual' | null
  ADD COLUMN IF NOT EXISTS instagram_last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS facebook_status text,             -- 'found' | 'none' | 'error' | null
  ADD COLUMN IF NOT EXISTS enrichment_source text;           -- 'website_scrape' | 'apify' | 'manual'

-- 2) enrichment_cache — so we never pay twice. Keyed by '<place_id>:<type>'.
CREATE TABLE IF NOT EXISTS public.enrichment_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  enrichment_type text NOT NULL,                              -- 'email' | 'facebook' | 'instagram'
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_enrichment_cache_cache_key ON public.enrichment_cache (cache_key);

-- 3) enrichment_usage — durable per-user daily spend cap (the source of truth;
--    the in-memory limiter isn't enough for real money).
CREATE TABLE IF NOT EXISTS public.enrichment_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  enrichment_type text,
  cost_usd numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enrichment_usage_user_created ON public.enrichment_usage (user_id, created_at DESC);

-- Both tables are server-only (written/read by the enrich-lead edge function via
-- the service-role client). Enable RLS with NO client policies → clients are
-- denied; the service role bypasses RLS.
ALTER TABLE public.enrichment_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_usage ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.enrichment_cache TO service_role;
GRANT ALL ON public.enrichment_usage TO service_role;
