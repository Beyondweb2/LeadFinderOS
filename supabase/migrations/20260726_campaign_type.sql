-- Campaign types drive which metrics each dashboard card shows.
-- 'audit'   → the current audit→pitch→pay funnel (report opened, paid)
-- 'site'    → the legacy barber-site flow (site opened, claimed, add-on)
-- 'service' → generic (a future app/service sell): sent/replied/paid only
-- Values are constrained in the UI (no CHECK constraint — house style; old rows
-- with an unknown value just render the default audit layout).

alter table public.campaigns
  add column if not exists campaign_type text not null default 'audit';

-- Backfill: the legacy barber campaigns → 'site'; everything else keeps 'audit'.
update public.campaigns set campaign_type = 'site' where name ilike '%barber%';
