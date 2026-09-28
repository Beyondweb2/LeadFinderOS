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

## 4. Deploy and live QA (2026-09-28)

- **Order:** migration `20260928200000` (6 statements, one at a time, read back: both functions SECURITY
  DEFINER, anon EXECUTE false, authenticated true) → edge `coverage` v32 from the merge tree (bundle read
  back: `workedBy` and the admin-only count; `verify_jwt` unchanged true; the live v31 matched main
  before it was replaced) → main `b3d3c85b` pushed (origin was unmoved at `d7bf5e04`) → leadfinderos-next
  entry `index-Bdf8Ayh1.js` → `index-C8s0c_Xa.js` within ~70 s, every new marker present, the banner and
  "Show suppressed" gone.
- **Sales Test (one-time link, ended with logout?scope=local, 204):** coverage `pairs` 200 in 3.6 s, 645
  worked pairs named, no count sent to Sales. Find leads for Mobile mechanics / Cleethorpes: 10 found
  (cached, free), 0 with a phone in the search result; ownership 9 new + 1 "Already added · Paul". Added
  "MB & Son Recovery and Repairs" the way the browser does: Place Details 2.3 s (Google had a phone),
  `sales_add_lead` 0.4 s → stored phone +44 7593 833577, address, trade "Mobile mechanics", town
  Cleethorpes (derived Cleethorpes), rating 5 / 21 reviews, place id, Maps link, owner Test. Campaign
  set 0.26 s, stored; another lead refused (403 `not_your_lead`). `sales-performance` 2.4 s: the campaign's
  row shows leads 1, contacted 0. `sales_pool` 200. No message sent or queued.
- **Admin (same method, 204 at the end):** coverage `pairs` with counts on every worked entry (645 pairs,
  1 person — Paul); `lead_set_campaign` on the rep's lead 0.28 s, stored, owner still Test; team directory
  Paul / Test / test1.
- **Restored:** the QA lead and its 3 activity rows deleted by id; 0 left (the business is "new" again).
- **Not seen by a person:** production screens were proven by bundle markers and server responses, the
  layout by the local render. Paul should glance at Coverage, Find Leads and a lead's Campaign card once.

## 5. Follow-up: campaigns admin-only, the claim rule, one contact-method set (2026-09-28, later)

Migration `20260928210000_campaign_claim_contact.sql`; branch `fix/campaign-claim-contact`.

- **Campaigns — the gap:** `campaigns` had permissive policies only: INSERT `with check (auth.uid() =
  created_by)` (any signed-in user could create one), UPDATE/DELETE `auth.uid() = created_by` (a creator
  could edit or delete their own). The Test salesperson had created one ("test"). **Fix:** RESTRICTIVE
  insert/update/delete policies requiring `my_role() = 'admin'` (ANDed with every permissive policy),
  plus permissive admin update/delete on ANY campaign (so the admin can manage the rep-created one).
  SELECT unchanged. Sales still sets a campaign on its own lead through `lead_set_campaign` (writes
  `outreach_leads`, not `campaigns`).
- **The claim rule — before:** `claim_lead`, `sales_pool` and `lead_identity_lookup` used
  `lead_first_contact_at`: an outbound WhatsApp sent/delivered/read or any inbound (by lead or phone), a
  successful `whatsapp_sends` row, a questionnaire, or the legacy send stamps. It never read
  `lead_activity`, so a logged call / email / LinkedIn / in-person contact did NOT protect a lead —
  proven live (rolled back): a phoned lead, unassigned, went back into the pool and could be claimed.
  **After:** `lead_contact_attempt_at` = `lead_first_contact_at` (unchanged) + `lead_logged_contact_at`
  (every `call_outcome` / `contact_logged` activity — all methods and outcomes, "No answer" included —
  and a sign-up or report link recorded as SENT on any channel). Not counted: added, viewed, Hook Audit,
  crawl, report/link generated or copied, internal note, a message that never sent. The WhatsApp opener
  queue (`sales_queue_opener`) keeps `lead_first_contact_at` on purpose — a phone call must not block the
  cold opener. Claimable leads: 2,485 before and after (no logged contacts existed yet).
  ⚡ The first version (one SECURITY DEFINER SQL function calling another) took the pool from 0.65 s to
  3.2–4 s; split into a definer function for the new reads and a plain inlinable one for the rule:
  0.92 s.
- **One contact-method set:** `src/lib/contactMethods.ts`. Before, four lists: the workspace pills /
  `lead_log_contact` (call, linkedin, email, in_person, other), sign-up link "sent another way" and report
  link "sent another way" (email, linkedin, sms, in_person, other each), the dashboard (whatsapp, call,
  linkedin, email, in_person, other). After: one set — Phone call, WhatsApp, Email, LinkedIn message, In
  person / networking (pills), LinkedIn voice note, Facebook / social message, Text message, Referral,
  Video outreach, Other (under More). WhatsApp is recorded by the send itself (selecting it says so;
  `lead_log_contact` still refuses it, so a send cannot count twice). Voicemail is the call's "Left
  voicemail" outcome. New outcome `message_sent` "Sent, no reply yet" (not a reply on the dashboard);
  outcomes shown per method (`outcomesFor`). The link pickers are the set's `LINK_SEND_METHODS` subset
  (the link events' CHECK is unchanged). History labels come from the set; stored values untouched.
  Left alone as different concepts: the lead's admin-only `contact_method` tag and a campaign's planned
  channel.
- **Region:** every app call to an edge function already carries `forceFunctionRegion=eu-west-1`
  (`src/lib/edgeRegion.ts`, in the Supabase client), Coverage included. Measured: without the pin a call
  from here runs in ap-southeast-1, with it eu-west-1. No change made.
- **Tests:** `scripts/contact-claim.test.ts`; `supabase/tests/campaign-claim-contact.sql` 66/66 live
  (rolled back) — campaigns create/edit/delete refused for Sales (even its own campaign), allowed for the
  admin, Sales assigns an existing campaign to its own lead and not to another rep's; per method: call /
  no answer, voicemail, email, LinkedIn, LinkedIn voice note, social, in person, referral, video, text,
  other, a successful WhatsApp send, a link sent by email → out of the pool, claim refused, Find Leads
  "protected"; audit only, crawl only, note only, report generated, failed WhatsApp → still claimable
  (and the audit-only one is claimed, same record); one activity row per log, with its method; WhatsApp
  and unknown methods refused by hand. All older suites re-run green.
- ⚠️ Found, not ours, left alone: a lead "QA Domain Test Plumbing" (fictional 447700900741, added
  07:24 today by another session) is still in production; the sales-flow-reliability suite's test phone
  moved to 07700 900851 because of it.
- **Deploy (2026-09-28):** migration applied one statement at a time, read back (restrictive policies;
  claim_lead / sales_pool / lead_identity_lookup read `lead_contact_attempt_at`; `sales_queue_opener`
  untouched); edge `sales-performance` v6 → v7 (the live v6 matched main; v7 keeps `lastActivityAt` and
  `sold_by_user_id`) → main `e003d480`; leadfinderos-next served it at 08:17, ~15 min after the push
  (`index-rpW5iz4i.js`, every new method label, "Sent, no reply yet", the WhatsApp line).
- **Live QA (Sales Test + admin, one-time links, both ended 204):** Sales directly against the API:
  create campaign 403 (42501), edit an admin campaign 0 rows, delete 0 rows, edit its OWN earlier
  campaign 0 rows, still reads 19. Admin: create 201, edit 1 row, delete 1 row. Sales set a campaign on
  its own QA lead (ok) and was refused on Paul's (403 `not_your_lead`). Four fictional QA leads (07700 900
  901–904): call / no answer, email, LinkedIn, social each logged → exactly one History row with its
  method and note → unassigned by the admin → not in Available to claim, claim `already_contacted`. A
  fifth: Hook Audit run as Sales (3 proposed questions, run complete) → unassigned → back in Available to
  claim, and claimed. Coverage pairs (pinned) 1.19 s. No message sent. All five leads, 22 activity rows,
  the audit, its run and 3 queue rows deleted by id; 0 left.
