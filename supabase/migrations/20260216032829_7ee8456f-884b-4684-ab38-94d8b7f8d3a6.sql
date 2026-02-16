
ALTER TABLE public.outreach_leads
  ADD COLUMN facebook_url text,
  ADD COLUMN facebook_confidence integer,
  ADD COLUMN facebook_method text,
  ADD COLUMN facebook_last_checked_at timestamp with time zone;
