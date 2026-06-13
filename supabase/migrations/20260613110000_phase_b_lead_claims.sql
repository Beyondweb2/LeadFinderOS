-- Phase B — per-campaign claim registry. ADDITIVE ONLY.
-- One new team-readable table. outreach_leads RLS is NOT touched.
--
-- lead_claims is the ONLY shared surface for "who is working which business in
-- which campaign". It deliberately holds NO sensitive fields — no revenue, no
-- private notes, no detailed pipeline status. Just the claimed/contacted facts
-- plus public business identifiers (Google place id / maps url / name).

CREATE TABLE IF NOT EXISTS public.lead_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- the claimant
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE, -- claim is per-campaign (null = "no campaign")
  place_id text,            -- primary business key (Google Place ID)
  google_maps_url text,     -- fallback business key
  business_name text NOT NULL,
  contacted boolean NOT NULL DEFAULT false,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Dedup: at most one claim per (claimant, campaign, business). Lets the app
-- upsert on add and again on "contacted" without creating duplicates.
-- (Rows with a NULL place_id are treated as distinct by Postgres — acceptable
-- for v1; the search-result avatar de-dupes per claimant on the client anyway.)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_lead_claims_user_campaign_place
  ON public.lead_claims (user_id, campaign_id, place_id);

-- Read paths: by campaign (search-result avatar lookup) and by business key.
CREATE INDEX IF NOT EXISTS idx_lead_claims_campaign ON public.lead_claims (campaign_id);
CREATE INDEX IF NOT EXISTS idx_lead_claims_place_id ON public.lead_claims (place_id);

ALTER TABLE public.lead_claims ENABLE ROW LEVEL SECURITY;

-- Team-readable: any authenticated user can see every claim (no sensitive data here).
CREATE POLICY "Authenticated users can view all claims"
  ON public.lead_claims FOR SELECT TO authenticated
  USING (true);

-- Write only your own claims.
CREATE POLICY "Users can insert their own claims"
  ON public.lead_claims FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own claims"
  ON public.lead_claims FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own claims"
  ON public.lead_claims FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER lead_claims_set_updated_at
  BEFORE UPDATE ON public.lead_claims
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
