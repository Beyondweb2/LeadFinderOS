-- COVERAGE: FOUND vs ADDED, WITH / WITHOUT A WEBSITE (Paul, 2026-09-29). Additive, reporting only.
--
-- Per search run (search_history row), recorded WHEN THE RUN HAPPENS:
--   found_keys  — every business the search returned (the discovery result, BEFORE the browser's own
--                 exclusions), as { business key: true when it has no website }. The website verdict is
--                 the search's own websiteStatus (NO_WEBSITE / DIRECTORY_ONLY = without a website — the
--                 one definition, src/lib/websiteStatusClass.ts).
--   found_with_website / found_without_website — the same, counted.
--   added_keys  — every one of those businesses that was then SUCCESSFULLY inserted into the CRM, written
--                 by record_search_addition() after the insert returned, with the same verdict.
-- ⛔ Rows written before this (423 on 2026-09-29) stay NULL = "not recorded": their counts were taken
-- AFTER the browser's exclusions, not from the discovery result, so nothing is back-filled or inferred.
-- ⛔ Search, qualification, dedupe, ownership and claiming are untouched: this only records.

alter table public.search_history add column if not exists found_with_website integer;
alter table public.search_history add column if not exists found_without_website integer;
alter table public.search_history add column if not exists found_keys jsonb;
alter table public.search_history add column if not exists added_keys jsonb;

-- Record one successful CRM insertion against the run it came from. Idempotent per business (object key).
-- Only the person who ran the search, only on a run that recorded what it found.
create or replace function public.record_search_addition(_run_id uuid, _key text, _without_website boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if _run_id is null or coalesce(trim(_key), '') = '' or _without_website is null then return false; end if;
  update public.search_history
     set added_keys = coalesce(added_keys, '{}'::jsonb) || jsonb_build_object(left(_key, 300), _without_website)
   where id = _run_id and user_id = auth.uid() and found_keys is not null;
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke all on function public.record_search_addition(uuid, text, boolean) from public, anon;
grant execute on function public.record_search_addition(uuid, text, boolean) to authenticated;
