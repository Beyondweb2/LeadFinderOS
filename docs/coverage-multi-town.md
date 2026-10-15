# Coverage: find leads in many towns, add them in one go (2026-10-15)

**Problem.** Coverage searched one town at a time (each row's "Find leads" link opens Find Leads), and adding from
Find Leads made one request per lead.

**What it does.** Tick towns (or "select all towns in this list") → one **Find leads** press searches up to
`MULTI_TOWN_MAX_TOWNS` (10) of them, two at a time, results appearing as each town finishes → one merged list with a
Town column → tick rows ("Select all on this page" and a separate "Select all N results") → **Add to CRM** asks which
campaign and adds them in one call, with progress and a summary. The one-town link on each row is unchanged.

**Where.**
- Rules (pure, tested): `src/lib/multiTownSearch.ts` — the town cap, the estimate, `mergeTownResults` (same business =
  same place id, Maps link, name + phone, or name + website; kept once under the first town, the others in `alsoIn`),
  `runTownSearches` (limit vs failure), `runBulkAdd` (preview → paced lookups → one save), the words.
- Network: `src/hooks/useMultiTownLeads.ts`. UI: `src/components/CoverageMultiTown.tsx`, ticks in `src/pages/Coverage.tsx`.
- Database: `public.coverage_add_leads(_rows, _campaign_id, _commit)` (migration `20261031090000`, additive; rollback =
  drop the function). Live check: `supabase/tests/coverage-add-leads.sql` (always rolls back).
- Tests: `scripts/coverage-multi-town.test.ts`.

**The search.** Each town is the same `search-leads` call a row's link makes, with `townOnly: true` (always the
Google path — never Apify, so nothing comes out of the Apify cap or its 85% reserve; `DISCOVERY_SOURCE` is unset
anyway, read 2026-10-15). search-leads writes the run's `search_history` row and returns its id, so Found vs Added
stays right. Every server cap applies per town exactly as before (usage guard: pause modes; for a salesperson 10/min,
60/hour, spend caps; plus search-leads' own 10/min limiter). The first **limit** refusal stops new towns from starting:
what was found is kept, the rest are listed "not searched" with the limit's own words and stay ticked. A one-town
failure does not stop the others. Price line: towns × `MARKET_SEARCH_USD`, **admin only** (a salesperson sees the town
count only); a town searched in the last 72 h is free from the cache.

**The add.** One `coverage_add_leads` preview (free; also marks "In CRM" rows after a search) → a Place Details lookup
for each NEW lead (phone, address, town — what a single add does), at most `PLACE_LOOKUPS_PER_MINUTE` (25, under
google-place-details' 30/min) → a lookup that answered with no phone and no email is not added (the single add's
rule); a failed lookup still adds → **one** committing call. A lookup limit stops the lookups: those rows are reported
"not added yet", never added without their lookup. "Stop" saves what was looked up.

`coverage_add_leads` writes exactly what a single search add writes: `user_id` = book owner, `added_by` =
`assigned_to` = the caller; trade, searched town, `list_type 'no_website'`, campaign only via `campaign_usable`; no
`lead_source`, no `import_batch` (search adds never had them); the looked-up town (stamped only when the lookup
reported on it); `lead_activity 'lead_added'` (`via: coverage_multi_town`), `outreach_history`, the run's `added_keys`.
Skipped as duplicate: the canonical identity lookup (`_lead_identity_rows`), same name in the same country, previously
added (history), same website (a chain branch is added from Find Leads, one at a time), repeats inside the call.
`guard_action('lead_add')` once per new lead (same accounting as single adds); the first refusal marks the rest `limit`.
At most 500 rows per call. A salesperson is never told whose lead a duplicate is.

**Not done / to test.** No live search or lookup was run (Apify at 84%). Paul to test with 2 towns. The search runs in
the browser (two at a time), not as a server job: leaving the page stops it; each town is a few seconds.
