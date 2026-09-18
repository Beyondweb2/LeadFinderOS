-- Manual paid clients use the same lead + paid onboarding relationship as checkout clients.
-- These columns only preserve operator-entered provenance and the chosen website route.
ALTER TABLE public.onboarding_responses
  ADD COLUMN IF NOT EXISTS client_source text,
  ADD COLUMN IF NOT EXISTS website_route text,
  ADD COLUMN IF NOT EXISTS access_status text;

ALTER TABLE public.onboarding_responses
  ADD CONSTRAINT onboarding_responses_client_source_check
  CHECK (client_source IS NULL OR client_source IN ('onboarding', 'manual'));

ALTER TABLE public.onboarding_responses
  ADD CONSTRAINT onboarding_responses_website_route_check
  CHECK (website_route IS NULL OR website_route IN ('optimise_existing', 'rebuild_existing', 'new_site'));

CREATE INDEX IF NOT EXISTS onboarding_responses_paid_client_source_idx
  ON public.onboarding_responses (lead_id, status, client_source, updated_at DESC);
