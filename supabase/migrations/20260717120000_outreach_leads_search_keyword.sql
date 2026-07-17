-- Add a nullable search_keyword column to outreach_leads.
-- Stores the search keyword the lead was found under (e.g. "barber", "plumber"),
-- used to pre-fill the AI-audit business type. Nullable, no default — existing rows
-- get NULL, which is the intended fallback (wizard falls back to category/blank).
ALTER TABLE public.outreach_leads ADD COLUMN IF NOT EXISTS search_keyword TEXT;
