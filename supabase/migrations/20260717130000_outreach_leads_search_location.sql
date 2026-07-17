-- Add a nullable search_location column to outreach_leads.
-- Stores the town/area the lead was searched under (e.g. "Leeds"), used to pre-fill
-- the AI-audit location. Nullable, no default; existing rows get NULL (wizard falls back to address/blank).
ALTER TABLE public.outreach_leads ADD COLUMN IF NOT EXISTS search_location TEXT;
