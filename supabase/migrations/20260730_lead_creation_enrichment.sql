-- Lead-creation enrichment: address, rating, review count and the real town, fetched in the phone
-- call that already runs. Plus the diagnostic that made the missing enrichment findable.
--
-- ⚠️ APPLIED BY HAND in the Supabase SQL editor. `supabase db push` is broken in this project
-- (migration history desynced), so THIS FILE EXISTING DOES NOT MEAN IT IS LIVE. See CLAUDE.md §6.
-- Every code path that touches these columns is migration-tolerant and degrades rather than failing,
-- so applying this late is safe — the features simply stay inert until it runs.
--
-- WHY THESE COLUMNS. Two leads added 30 Jul had a valid place_id and a phone fetched 2.5s after
-- creation, but address, derived_town and town_fetched_at were all null. The audit location chain is
-- confirmed_location || derived_town || search_location, so an audit on those leads had no town to
-- work from at all. Root cause: google-place-details asked Google for phone + website only, on the
-- strength of a stale comment claiming the lead search already returned the address. It hadn't for a
-- long time. No address meant no addressComponents, so no derived town either.
--
-- COST: unchanged. Google bills a Place Details request ONCE, at the highest SKU tier any requested
-- field touches. Phone is Enterprise, so that call was already Enterprise; rating and userRatingCount
-- are Enterprise too, and formattedAddress/addressComponents are Essentials (cheaper). Nothing about
-- the extra fields moves the price. Verified against Google's docs, not inferred from a constant.

alter table public.outreach_leads
  add column if not exists rating          numeric,
  add column if not exists review_count    integer,
  add column if not exists town_fetch_note text;

comment on column public.outreach_leads.rating is
  'Google star rating at the last Place Details fetch. Enterprise-tier field, free alongside the phone number we already fetch.';
comment on column public.outreach_leads.review_count is
  'Google userRatingCount at the last Place Details fetch. Same call, same tier, no extra cost.';
comment on column public.outreach_leads.town_fetch_note is
  'Why derived_town is null despite town_fetched_at being set: no_place_id | no_api_key | cost_cap_reached | place_details_unavailable | no_town_in_address. NULL means a town WAS found. town_fetched_at alone only separates "never ran" from "ran"; this separates the reasons, which is what decides whether re-asking Google would help. See TownFetchNote in supabase/functions/_shared/place-details.ts.';

-- phone_cache: cache the extra fields so re-adding a business costs nothing.
alter table public.phone_cache
  add column if not exists website         text,
  add column if not exists rating          numeric,
  add column if not exists review_count    integer,
  add column if not exists derived_town    text,
  add column if not exists details_version integer not null default 1;

comment on column public.phone_cache.details_version is
  'Shape of the cached Place Details response. 1 = phone/website only (pre-2026-07-30). 2 = also address, addressComponents-derived town, rating and review count. google-place-details treats a row below the current version as a MISS and re-fetches once. Explicit rather than inferred, because "address is null" cannot distinguish a legacy row from a place Google has no address for — and without this gate every lead already in this cache would stay unenriched for 30 days, making the fix look broken on exactly the leads that exposed the bug.';

-- ── FOR THE RECORD: applied earlier (2026-07-30, commits ef86c9bf / 3b93284d) ──────────────────
-- These went out via TASKS.md as inline SQL with no migration file. Repeated here idempotently so
-- the schema history is complete and a fresh environment can be built from these files alone.
alter table public.outreach_leads
  add column if not exists derived_town    text,
  add column if not exists town_fetched_at timestamptz;

alter table public.ai_audits
  add column if not exists location_source text,
  add column if not exists location_note   text;

comment on column public.outreach_leads.derived_town is
  'Town from Google Place Details addressComponents (postal_town > locality > admin_area_2). The town the business is IN, as opposed to search_location which is the town I SEARCHED.';
comment on column public.outreach_leads.town_fetched_at is
  'When Place Details last COMPLETED for this lead. Stamped even when no town was found, so "never ran" stays distinguishable from "ran and found nothing" — read together with town_fetch_note. 30-day cache key.';
comment on column public.ai_audits.location_source is
  'confirmed | derived | search | none — which town this audit used and why. "search" means UNVERIFIED.';
