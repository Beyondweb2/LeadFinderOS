-- ════════════════════════════════════════════════════════════════════════════════════════════
-- outreach_leads.lat / lng — where the business actually is.
--
-- ⛔ WHY STRING EQUALITY CANNOT ANSWER THE QUESTION IT IS BEING ASKED. "Is this business inside
--    the town its audit asked about?" was answered by comparing derived_town to location_text.
--    That passes Wilson's Mobile Valeting — a village outside Cambridge whose postal_town IS
--    Cambridge — while he sits outside the built-up area, which is exactly why he was audited
--    against a market he is not in. Same shape as the Southsea/Portsmouth caveat in CLAUDE.md §8.
--    Only a distance answers it, and a distance needs coordinates.
--
-- ✅ THE DATA IS ALREADY BOUGHT. place-details.ts's ESSENTIALS_FIELDS has asked Google for
--    "location" on every town lookup since the mask was written, and place-town.ts has been
--    discarding it. So this stores something already paid for at $0.005 — adding it costs nothing
--    per lead, and uk_towns already carries lat/lng on all 733 rows to measure against.
--
-- ⚠️ NULLABLE, AND NULL MEANS "WE HAVE NOT ASKED". Never 0/0, which is a real place in the Gulf of
--    Guinea and would read as a business 5,000 km from every town in Britain.
-- ════════════════════════════════════════════════════════════════════════════════════════════

alter table public.outreach_leads add column if not exists lat double precision;
alter table public.outreach_leads add column if not exists lng double precision;

comment on column public.outreach_leads.lat is
  'Google Places location.latitude, stored from the Essentials-tier call place-town.ts already makes. NULL = never asked, never 0.';
comment on column public.outreach_leads.lng is
  'Google Places location.longitude. See lat.';

-- ── VERIFY ─────────────────────────────────────────────────────────────────────────────────
-- select count(*) as total,
--        count(lat) as with_coords,
--        count(*) filter (where lat = 0 or lng = 0) as suspicious_zeroes
--   from public.outreach_leads;
-- expect: with_coords = 0 immediately after this runs, suspicious_zeroes = 0 always.
