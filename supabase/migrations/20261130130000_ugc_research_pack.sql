-- UGC research pack + pasted pitch (2026-10-29, feat/ugc-research-pack, docs/ugc-brand-finder.md).
-- Additive and idempotent. UGC tables only.

-- Her "Your experience fit" field (pitch-system section 2): the quoted line from About Jess that fits this brand.
-- NULL = not set; the research pack then says "none, lead with the problem".
alter table public.ugc_brands add column if not exists experience_fit text;

-- A pitch Jess wrote in her own Claude Project and pasted in is its own event kind (it must not count against the
-- AI draft's daily limit, which counts kind = 'pitch').
alter table public.ugc_brand_events drop constraint if exists ugc_brand_events_kind_check;
alter table public.ugc_brand_events add constraint ugc_brand_events_kind_check
  check (kind in ('found','contacts','status','note','todo','pitch','contacted','check','research','pitch_pasted','research_pack','exported'));

-- The UGC page is a lead source (Paul, 2026-10-29): "Export ready leads" writes her Brands & Contacts layout and marks
-- each exported brand with the date, so a brand is never exported twice. NULL = not exported yet.
alter table public.ugc_brands add column if not exists exported_at timestamptz;
