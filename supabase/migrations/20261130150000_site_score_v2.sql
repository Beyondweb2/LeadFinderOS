-- Room to improve the website, rubric v2 (2026-10-30, feat/site-score-v2; docs/site-score.md, src/lib/siteScore.ts).
--
-- 1. site_score_evidence: every point lost with the page URL and the quote the crawl read, the cap and what was not judged.
--    Read by the one lead's detail view only, never by the lists (they keep reading the small columns).
-- 2. site_score_v1: the v1 score each row had, kept as it was (score, state, version, reasons, detail, at) before v2 is
--    written over the live columns. Copied once, only where it is still empty.
-- 3. The state list widens: v2 names each site it could not judge (js_only, robots_blocked, unreachable, profile_only)
--    instead of v1's one 'unreadable'; 'unreadable' stays allowed for any v1 row not yet re-scored.
-- 4. ⛔ The ADMIN could not read lead_crawl_checks at all: the table has RLS on and its only policy was the salesperson's
--    (sales_select_crawl_checks), so the admin's Outreach ring, Inbox pill and crawl icons read `200 []` (tested as the admin
--    account on 2026-10-30: 0 of 1,615 rows). The admin reads every row, the same book Outreach shows (my_role() = 'admin',
--    the one role rule); the salesperson's policy is unchanged.
-- 5. lead_crawl_checks joins the realtime publication: the Inbox already listens for a crawl finishing
--    (useInbox → refreshLeadCrawlsSoon) but the table was never published, so a score written while the Inbox was open
--    never appeared until a full reload (L J Rainford, crawled 09:29 on 2026-10-30).
--
-- ⛔ Additive: two nullable plain columns, one check widened, one policy added, nothing dropped or rewritten. The v1 copy
--    writes only the new column (the result_slim trigger fires on UPDATE OF result only).

set lock_timeout = '5s';

alter table public.lead_crawl_checks add column if not exists site_score_evidence jsonb;
alter table public.lead_crawl_checks add column if not exists site_score_v1 jsonb;

alter table public.lead_crawl_checks drop constraint if exists lead_crawl_checks_site_score_state_check;
alter table public.lead_crawl_checks add constraint lead_crawl_checks_site_score_state_check
  check (site_score_state is null or site_score_state in ('scored', 'partial', 'unreadable', 'js_only', 'robots_blocked', 'unreachable', 'profile_only'));

update public.lead_crawl_checks
   set site_score_v1 = jsonb_build_object(
         'score', site_score, 'state', site_score_state, 'version', site_score_version,
         'reasons', site_score_reasons, 'detail', site_score_detail, 'at', site_score_at)
 where site_score_version = 1 and site_score_v1 is null;

drop policy if exists admin_select_crawl_checks on public.lead_crawl_checks;
create policy admin_select_crawl_checks on public.lead_crawl_checks for select to authenticated
  using ((select public.my_role()) = 'admin');

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lead_crawl_checks') then
    alter publication supabase_realtime add table public.lead_crawl_checks;
  end if;
end $$;

comment on column public.lead_crawl_checks.site_score_evidence is
  'Team-only: every point the site score lost, with the page URL and quote the crawl read (src/lib/siteScore.ts v2). Never shown to prospects.';
comment on column public.lead_crawl_checks.site_score_v1 is
  'The v1 site score this row had before rubric v2 was written (2026-10-30). Kept, never updated.';
comment on column public.lead_crawl_checks.site_score_state is
  'scored | partial (quick check only) | js_only | robots_blocked | unreachable | profile_only (v2) | unreadable (v1). Only scored has a number.';
