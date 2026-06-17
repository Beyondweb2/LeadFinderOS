-- JOB 1 — campaign descriptions + intended method. ADDITIVE ONLY, nullable, NO
-- backfill. Both are plain text (validated app-side via a TS union, matching how
-- `status` / `default_sale_type` are handled), so adding a method later needs no
-- migration. Existing campaigns stay NULL and behave exactly as today.
-- campaigns RLS is unchanged (creator-only update already covers these columns).

alter table public.campaigns
  add column if not exists description text,
  add column if not exists method      text;  -- intended channel: 'whatsapp' | 'sms' | 'email'
