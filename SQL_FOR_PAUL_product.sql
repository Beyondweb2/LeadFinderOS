-- The PRODUCT field: what we are selling them, separate from status (where they are).
-- Nullable, NO default, NO check constraint:
--   · NULL means UNDECIDED, so there is no backfill of 3,203 rows and no default to go stale.
--   · no CHECK, so a value added later cannot be refused by a constraint nobody remembers.
-- Values used by the app: 'rebuild' | 'ai_only' | 'no_website'.  Anything else flags, never blocks.
alter table public.outreach_leads add column if not exists product text;

-- Working one pile at a time is the whole point, and the pile is filtered WITH status.
create index if not exists outreach_leads_product_idx
  on public.outreach_leads (user_id, product, status)
  where is_archived is not true;
