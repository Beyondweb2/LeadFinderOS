# Sales flow reliability: Coverage → Find Leads → Add to CRM → Outreach (2026-09-28)

Paul's brief, from using the live Sales account: one coherent pass over the Sales workflow, no redesign.
Branch `feat/sales-flow-reliability`. Migration `20260928200000_sales_flow_reliability.sql`.

## 1. The causes

| Symptom | Cause | Fix |
|---|---|---|
| Coverage → Find Leads: "10 found … 10 new to add" over "No leads match your current filters" | `LeadsTable` remembered its website/listing filters per PERSON (`searchResultsPrefs`, localStorage) and applied them, unseen, to every LATER search. An earlier "Listing = Instagram" or website-only choice hid all ten. The banner and the heading counted the whole search; the rows were the filtered set. | The saved view carries `sig` (`resultSetSignature`: the result ids) and is restored only onto that same set; a new result set clears every filter; whenever a filter hides anything the heading says "Showing X of Y — filters hide Z · Show all", and an all-hidden table says "Your filters hide all N results" with Show all (`searchResultsView.ts`). |
| Leave Find Leads, come back, Add → "Run a search first … no search behind them" | `LeadSearchContext` restored results from `leadfinder_demo_leads:<uid>` (localStorage, `{leads}` only, written after EVERY search) BEFORE the sessionStorage `{leads, lastSearch}` copy — so a reload, a new tab or a new sign-in brought the results back with no search, and addLead's no-trade guard refused every one. The 168-row fix had only covered the sessionStorage copy. Also: `lastSearch` was set BEFORE the request, so a failed search left the old results under the new trade/town. | One store, `leadfinder_search_results:<uid>` (localStorage) = results + search in one value (`searchResultsCache.ts`); a stored set without a usable search (a trade) is never restored and never written; the legacy keys are read once (sessionStorage copy, if it had a search) and removed; `lastSearch` is set in the same update as its results. Option A (keep context) with B as the floor. |
| A lead added from Find Leads arrived in the CRM with no phone | Google text search returns no phone (search-leads' field mask has none). The admin's addLead fetches Place Details AFTER its insert and writes phone/address/rating/town onto the row directly; a salesperson cannot write `outreach_leads`, so for them the step never ran (it was a known limitation in multi-user.md §7). | Sales: `google-place-details` (role-checked, cached) runs BEFORE the add; `salesAddPayload` maps result + lookup + search into the one `sales_add_lead` call (phone, address, category, website, email carried from enrichment, rating, reviews, derived town + stamp). `sales_add_lead` now stores rating / review_count / derived_town / town_fetched_at / town_fetch_note; every refusal unchanged, and the phone now also takes part in its phone dedupe. The admin's rule "no phone AND no email → not added" applies to Sales too; a FAILED lookup never blocks the add. |

## 2. What else changed

- **Nav** (`SALES_NAV_ORDER`, `orderNavForRole` in `src/lib/access.ts`): Sales = Sales dashboard, Find Leads,
  Outreach, Coverage, Inbox; an unlisted sales item goes after them, never to the top. Admin = Dashboard,
  Find Leads, Outreach, **Coverage (moved up, directly below Outreach)**, Inbox, Sales dashboard, … (every
  admin item kept). Mobile Sales bar: Results, Search, Outreach, **Inbox kept on the bar** (the daily tool;
  4 + More fit 320 px), Coverage under More. Admin mobile: bar unchanged, Coverage added under More.
  Sales still LANDS on `/outreach` (`homeFor` unchanged — not asked).
- **Coverage**: "Find leads · ~9p" → "Find leads" (the cost is still what search-leads spends and is still
  accounted server-side). **Suppress removed** — what it did: `coverage` action `suppress`/`unsuppress`
  (admin-only on the server) set `uk_towns.suppressed_at`/`reason`, which hides the town from the list for
  the whole team. 0 of 733 towns were suppressed. Removed: the per-row Suppress/Restore button, the "Show
  suppressed" toggle and the row's "suppressed — reason" text. Kept: the server action, the columns, the
  hook's `setSuppressed`, and the rule that a suppressed town stays off the list. No row was changed.
- **Who worked it** (Coverage): `coverage` `pairs` now also returns `workedBy` — per raw trade+town, the
  `assigned_to_user_id` of each CONTACTED lead there (the same contacted test as the `worked` rung; the
  owner column the Sales dashboard scopes by). A contacted lead with no owner names nobody. Counts go to
  the admin only (`{id, n}`); a salesperson gets `{id}` — names they already see as "Already added · name".
  Folded on the client by `coverageKey` (`workersByPair`), worded by `describeWorkers` ("Worked by Paul and
  Test"; an id the team directory cannot name is "1 other", never a made-up name), drawn by
  `CoverageWorkers` (avatar, stack of ≤3 + "+N", names on hover). Measured 2026-09-28: all 2,779 contacted
  leads are Paul's, so today every worked row shows Paul until a salesperson contacts someone.
- **Banner removed**: the "N found for X in Y: N new to add. Use Add…" line (`searchOutcome.ts` deleted with
  its test lines in coverage-lead-counts). The heading keeps "Found N businesses • M without websites".
- **Campaign on a lead** (`lead_set_campaign(_lead_id, _campaign_id)`, both roles): `_require_work` (admin
  any lead; sales only a lead assigned to them that is not a client), the campaign must exist
  (`unknown_campaign`), writes the ONE column `outreach_leads.campaign_id` (the admin's bulk "Move to
  campaign" writes the same), logs a `details_set` activity row with the campaign (no CHECK change),
  anon revoked. UI: a pick-only **Campaign** card in the lead workspace (`LeadCampaign` in
  `LeadCrmPanel`, `CampaignPicker hideCreate`), instant via the leadSync patch. Find Leads' two campaign
  pickers hide New / Manage campaigns for anyone but the admin. There is no per-person campaign
  permission in the data model, so Sales picks from every existing campaign. The Sales dashboard groups
  by the lead's current `campaign_id`, so a change shows there on the next read.
  ⚠️ Pre-existing, NOT changed: the `campaigns` INSERT policy (`auth.uid() = created_by`) would let any
  signed-in user create a campaign by calling the API directly; only the UI stops Sales.
- **Available to claim**: `CLAIM_POOL_HELP` — "Leads nobody owns and nobody has contacted yet. Claim one to
  add it to your pipeline — it becomes yours, with its history." — on the tab's hover and as the panel's
  subtitle, plus "Once a business has been contacted it leaves this list…". The rules are unchanged
  (`sales_pool`, `claim_lead`).
- **Ownership labels** unchanged in wording (Add to CRM / Yours / Claim lead / Already added · name); Yours
  and Claim gained hover text.
- **Coverage → Find Leads** was already the canonical search (`findLeadsHref` → `?run=search` →
  `SearchForm.runSearch` → the same `onSearch` as the button). No parallel path existed or was added.

## 3. Tests

- `scripts/sales-flow-reliability.test.ts` (in `npm test`): nav order both roles + mobile, admin pages
  still closed to sales; no price / Suppress on Coverage; workedBy admin-only counts, fold, names, unknown
  ids; filter view restore by signature, "Showing X of Y", the all-hidden sentence; banner gone; the
  results store round trip, the leads-only legacy copy restores nothing, search set with its results;
  `salesAddPayload` with a phone fixture (phone, address, trade, town, rating, place id, nothing invented);
  the lookup-before-add order; `lead_set_campaign` shape; hideCreate; dashboard groups by campaign_id;
  claim wording; ownership labels. `access-matrix` now points here for the order.
- `supabase/tests/sales-flow-reliability.sql` — **33/33 on the live schema 2026-09-28, rolled back**:
  anon refused; pool lists an unassigned never-contacted lead, never a contacted or owned one; a contacted
  lead cannot be claimed (`already_contacted`); the claim keeps the same record + history; campaign set /
  unchanged / changed / unknown refused / cleared; Paul's lead and a client refused; a direct table write
  changes nothing; the add stores phone, address, trade, town, place id, campaign, rating, reviews, town
  (+ stamp only when looked up); same phone refused; bad numbers dropped; B cannot set A's campaign;
  admin sets any lead. Re-run the same day, all green: self-sourced-handoff 41/41, sales-readiness 38/38,
  sales-shared-workflow 37/37, multi-user-rls 70/70, multi-user-queue 11/11, sales-media-rls 23/23,
  next-action-human-only 18/18, dashboard-visibility 10/10.
- Gate: 214/222 — the same eight failures as untouched main `d7bf5e04` (check-cross-repo-sync,
  coverage-lead-counts, manual-onboarding, onboarding-audit-fields, report-attribution,
  self-sourced-handoff [findable-site preview flag], site-origin, verdict); typecheck 9 = baseline.
- **Rendered locally** (throwaway harness, real pages, fake data, deleted): Coverage (no price, no Suppress,
  avatars + "Worked by Test and Paul"), a planted Instagram-only filter then Coverage → Find leads → all
  10 shown, leave → return → Add (no re-search; payload carried the phone), full reload → Add, the legacy
  leads-only copy → an empty page (not a dead list) and removed, Show all notice, a new search clears
  filters, the Campaign card (options without New/Manage; saved via lead_set_campaign), claim wording,
  375 px (bar: Results, Search, Outreach, Inbox, More; no sideways scroll), admin nav + counts, admin
  still has New/Manage campaigns. No console errors.
