-- The small per-lead website-check summary the Outreach and Inbox LISTS read (perf, 2026-10-22).
--
-- Both lists drew a few icons from lead_crawl_checks.result and downloaded all of it: ~18.9 MB for
-- 1,339 rows on every open. result_slim is the same JSON with only the heavy parts the lists never
-- read taken out. Everything a list reads stays byte-for-byte:
--   · the icon / tooltip  = websiteCheck (version, depth, checkedAt, pagesRead, pagesFound, capped,
--                           failure, and each issue's id / severity / count / pages / absence)
--   · the template gates  = version, status, checked_at, signals (minus the page inventory), evidence
--                           (resolveSiteFault, hasSiteFindings — src/lib/crawlCheck.ts, siteFindings.ts)
-- Taken out: contentTrust, insights, visibility, siteInfo, verdict, homeFetch, job_id, the page list
-- signals.checkedPages, websiteCheck's strengths / notChecked / owner (emptied, not removed) and each
-- issue's words (title, saw, meaning, examples). The popup reads the FULL row when it opens.
-- ⛔ A row whose websiteCheck is not one the app reads (version 1 + an issues array) is copied WHOLE,
--    so the old summarise-from-signals fallback still sees everything it needs.
-- Additive: one nullable column + a trigger; `result` is untouched and the old app keeps reading it.

set lock_timeout = '5s';

alter table public.lead_crawl_checks add column if not exists result_slim jsonb;

create or replace function public.lead_crawl_result_slim(r jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when r is null or jsonb_typeof(r) <> 'object' then r
    when not (r->'websiteCheck'->>'version' = '1' and jsonb_typeof(r->'websiteCheck'->'issues') = 'array') then r
    else
      (r - array['contentTrust', 'insights', 'visibility', 'siteInfo', 'verdict', 'homeFetch', 'job_id'])
      || case when jsonb_typeof(r->'signals') = 'object'
              then jsonb_build_object('signals', (r->'signals') - 'checkedPages')
              else '{}'::jsonb end
      || jsonb_build_object('websiteCheck',
           ((r->'websiteCheck') - array['strengths', 'notChecked', 'owner'])
           || jsonb_build_object(
                'strengths', '[]'::jsonb,
                'notChecked', '[]'::jsonb,
                'issues', coalesce((
                  select jsonb_agg(case when jsonb_typeof(i) = 'object'
                                        then i - array['title', 'saw', 'meaning', 'examples']
                                        else i end order by n)
                  from jsonb_array_elements(r->'websiteCheck'->'issues') with ordinality as e(i, n)
                ), '[]'::jsonb)))
  end
$$;

create or replace function public.lead_crawl_checks_set_slim()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  begin
    new.result_slim := public.lead_crawl_result_slim(new.result);
  exception when others then
    -- ⛔ Never fail a crawl's write over the summary: an odd row is copied whole (correct, just not small).
    new.result_slim := new.result;
  end;
  return new;
end
$$;

drop trigger if exists trg_lead_crawl_checks_slim on public.lead_crawl_checks;
create trigger trg_lead_crawl_checks_slim
  before insert or update of result on public.lead_crawl_checks
  for each row execute function public.lead_crawl_checks_set_slim();

-- Backfill (1,339 rows on 2026-10-22; a small table). Does not touch `result`, so the trigger does not fire.
update public.lead_crawl_checks
   set result_slim = public.lead_crawl_result_slim(result)
 where result_slim is distinct from public.lead_crawl_result_slim(result);
