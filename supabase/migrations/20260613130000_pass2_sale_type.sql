-- Pass 2 — "what we're selling" type. ADDITIVE ONLY, nullable, NO backfill.
-- Both columns are plain text (validated app-side via a TS union, matching how
-- `status` is handled) so adding a 4th sale type later needs no migration.
--
-- Effective type is resolved in the app:
--   lead.sale_type ?? campaign.default_sale_type ?? 'website'
-- Every existing row stays NULL → inherits the campaign default → falls back to
-- 'website', i.e. behaves exactly as today. Nothing is backfilled.
-- outreach_leads RLS and the status free-text column are untouched.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS default_sale_type text;

ALTER TABLE public.outreach_leads
  ADD COLUMN IF NOT EXISTS sale_type text;
