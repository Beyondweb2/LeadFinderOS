-- The site score (2026-10-23, feat/site-score; docs/site-score.md, src/lib/siteScore.ts).
--
-- A number out of 100 for each lead's website, shown on the Outreach and Inbox rows to the team only. It is
-- computed in TypeScript from the ONE stored website check (result.websiteCheck) and written beside `result`
-- by both crawls (crawl-check, _shared/crawl-job.ts) and once by scripts/site-score-backfill.ts.
--
-- ⛔ Additive only: six nullable plain columns (no default, no generated column, no rewrite of the table).
--    Nothing is dropped; `result`, `result_slim` and their trigger are untouched (the slim trigger fires on
--    UPDATE OF result only, so writing these columns alone fires nothing).
-- ⛔ "Could not read" and "quick check only" are their own states (site_score_state), never a zero:
--    site_score is NULL unless the state is 'scored'.
-- Read access is the table's own: the lists read these columns through the same select as result_slim.

set lock_timeout = '5s';

alter table public.lead_crawl_checks add column if not exists site_score smallint;
alter table public.lead_crawl_checks add column if not exists site_score_state text;
alter table public.lead_crawl_checks add column if not exists site_score_version smallint;
alter table public.lead_crawl_checks add column if not exists site_score_reasons jsonb;
alter table public.lead_crawl_checks add column if not exists site_score_detail jsonb;
alter table public.lead_crawl_checks add column if not exists site_score_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lead_crawl_checks_site_score_state_check') then
    alter table public.lead_crawl_checks add constraint lead_crawl_checks_site_score_state_check
      check (site_score_state is null or site_score_state in ('scored', 'unreadable', 'partial'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lead_crawl_checks_site_score_range_check') then
    alter table public.lead_crawl_checks add constraint lead_crawl_checks_site_score_range_check
      check (site_score is null or (site_score between 0 and 100 and site_score_state = 'scored'));
  end if;
end $$;

comment on column public.lead_crawl_checks.site_score is
  'Team-only site score 0-100 (src/lib/siteScore.ts). NULL unless site_score_state = scored. Never shown to prospects.';
comment on column public.lead_crawl_checks.site_score_state is
  'scored | unreadable (site could not be read) | partial (quick check only). Never a zero for unreadable.';
comment on column public.lead_crawl_checks.site_score_version is 'SITE_SCORE_VERSION of the rubric that gave this score.';
