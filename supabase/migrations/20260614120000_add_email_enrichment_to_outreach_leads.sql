-- Phase 1 email enrichment (website scrape).
-- Additive only — mirrors the existing facebook_* enrichment columns. The
-- `email` column already exists on outreach_leads, so it is NOT (re)added.
-- No backfill, no RLS change: these columns inherit outreach_leads' existing
-- per-user RLS (owner can read/update their own rows).
--
--   email_status         : 'found' | 'none' | 'error' | null
--   email_method         : 'website_scrape' | 'manual' | null
--   email_last_checked_at: when the last lookup ran

ALTER TABLE public.outreach_leads
  ADD COLUMN IF NOT EXISTS email_status text,
  ADD COLUMN IF NOT EXISTS email_method text,
  ADD COLUMN IF NOT EXISTS email_last_checked_at timestamptz;
