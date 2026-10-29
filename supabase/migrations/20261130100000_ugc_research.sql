-- UGC auto-research + page details (2026-10-29, feat/ugc-research-and-fixes, docs/ugc-brand-finder.md).
-- Additive and idempotent. UGC tables only.

-- Research state per brand. The research itself lives in ugc_brands.research.verified (every field with its source
-- URL and a quote that was checked against that page). 'queued' brands are researched one at a time by fn ugc-brands.
alter table public.ugc_brands add column if not exists research_status text;
alter table public.ugc_brands add column if not exists researched_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ugc_brands_research_status_check') then
    alter table public.ugc_brands add constraint ugc_brands_research_status_check
      check (research_status is null or research_status in ('queued','running','done','failed'));
  end if;
end $$;
create index if not exists ugc_brands_research_queue on public.ugc_brands (owner_user_id, research_status) where research_status = 'queued';

-- Two more kinds of spend on UGC's own run log: a brand's research (one model call over its pages) and the Ads
-- Library page-details pass (page age + admin countries for the dropshipping flags).
alter table public.ugc_runs drop constraint if exists ugc_runs_source_check;
alter table public.ugc_runs add constraint ugc_runs_source_check
  check (source in ('fb_ads','creator_collabs','places','google_search','contacts','named_contacts','research','page_details'));

-- History: a research run is its own event kind.
alter table public.ugc_brand_events drop constraint if exists ugc_brand_events_kind_check;
alter table public.ugc_brand_events add constraint ugc_brand_events_kind_check
  check (kind in ('found','contacts','status','note','todo','pitch','contacted','check','research'));
