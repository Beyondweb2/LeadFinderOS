
ALTER TABLE public.outreach_leads ADD COLUMN IF NOT EXISTS place_id text;

-- Create an index for quick lookups
CREATE INDEX IF NOT EXISTS idx_outreach_leads_place_id ON public.outreach_leads(place_id);
