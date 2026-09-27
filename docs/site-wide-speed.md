# Site-wide speed pass (2026-09-27)

Paul's brief, after Supabase went unhealthy earlier the same day and was restarted (a previous
performance session had run an experimental production query that rewrote thousands of lead value
cells into positional arrays — that session was stopped; none of its changes shipped and none were
repeated here): make the whole app materially faster, **code and data-flow only, no database
changes without approval**, measured before and after with the real application's own requests.

## 1. Health first

HEALTHY at the start (auth 200, REST reads ~260 ms, edge preflights ~300 ms, 0 lock waits, 0 queries
active over 5 s). One reading mid-session — a lean 1,000-row read of `ai_audit_runs` taking 17 s — was
not retried; the database was idle and fast within seconds. It followed the session's own replay of
the Inbox and AI Audit loads, which open large JSON (see §3).

## 2. How time is actually spent (measured)

- **The instance is Micro** (`max_connections` 60) and PostgREST uses its **default pool (~10
  connections)**, shared by every user, cron and edge function (`db_pool_acquisition_timeout` 10 s).
  Request COUNT and how long a query HOLDS a connection matter for everyone, not just the page asking.
- **Postgres itself is fast here**: an Outreach `select('*')` page executes in 20–130 ms on average
  (`pg_stat_statements`). The rest of a 1–1.5 s page is the gateway, compression and the wire.
- **The browser is far from the database**: requests leave through Cloudflare's Bangkok edge to
  Supabase eu-west-1 — ~260 ms before any work. That floor is platform/network, not app code.
- Consequence: **firing more pages at once is not faster** (tried: every page together with page 0
  was 8.4–8.6 s vs 3.2–6.0 s — rejected). Fewer requests, fewer bytes, and fewer waits IN SEQUENCE are.

## 3. Baseline (live, as the admin, the app's own reads replayed from a script)

| Page | Before | Requests | JSON | Main cause |
|---|---|---|---|---|
| Dashboard (first card) | 7.8–8.8 s | 31 | 18.3 MB | every lead column paged one page at a time; 5 reads whose numbers were never shown |
| Outreach (table) | 3.2–11 s | 21 | 17.4 MB | `select('*')` of 111 columns; history read it never used |
| Outreach (audit buttons + queue) | 3.8–6.7 s | +9 | | secondary reads started only after every lead arrived |
| Every page (shell) | 1.2–3.7 s | 8 | 0.76 MB | LeadSearchContext read 4 tables twice per load, unpaginated (cut at 1,000) |
| AI Audit (book) | ~11 s | 12 | 1.6 MB | audits → runs → reports in sequence; runs open every results blob for an SEO grade |
| AI Audit (5 s poll while draining) | 16.4 s per tick | 10 | 1.5 MB | the WHOLE book re-read every 5 s |
| Inbox | ~3.4 s | 30 | 9.2 MB | messages/leads/audits ~3 s each (already fixed earlier today); Gemini paged in sequence |
| Coverage niche panel | up to 8 × Outreach | | up to 8 × 16 MB | every town row mounted its own useOutreach |
| Paid Clients | 1.4 s | 1 | small | fine |
| Templates | 0.7 s | 1 | small | fine |
| Team | 2.8 s | 1 | small | edge fn reads members one after another (not changed) |
| Sales home (admin view) | 2.6 s | 6 | 0.3 MB | sequential paging; sales_pool 1.4 s (DB function, not changed) |
| Page Generator / Page Plan | 3.5 s per call | | small | edge fn: ~10 sequential reads, 2× getUser (not changed) |

`fetchAllRowsParallel` wasted requests everywhere: a list under 1,000 rows cost 7 requests (6 empty);
a full page 0 always fired 6 more, so 1,554 rows cost 7 with 5 past the end — and an empty page is not
free (Postgres sorts the whole filtered set to reach its offset).

## 4. What changed (code only — no SQL, no edge functions)

1. **Pager** (`src/lib/fetchAllRows.ts`): a short page 0 sends one probe, not six; a full page 0's first
   wave is sized from the count that label returned last time (the pages still come AFTER page 0).
   Same rows in every case (`scripts/fetch-all-rows-parallel.test.ts`, 0…12,345 rows, caps 500/1000,
   growth and shrink).
2. **Lead list columns** (`src/lib/outreachLeadColumns.ts`): useOutreach selects 41 of 111 columns
   (Outreach, Find Leads, the Coverage niche rows, the Inbox's lead dialog). The field audit was
   three-way: a parser walk of every file the four callers reach (catches `as any`, helper-local
   types, destructuring — the type-checker audit missed `place_id`, `instantly_pushed_at`,
   `derived_town`, `town_fetch_note`, `whatsapp_message_id`, `previous_status`, `email_last_checked_at`),
   a manual read of every consumer and helper, and a runtime check (below). 16 columns the walk sees
   but are not list reads are pinned per column AND file, each hand-checked (carry-keys copied from
   search enrichment, `.eq('user_id')` strings, write targets…).
3. **Detail on demand**: `LeadDetailDialog` reads the complete row by id (`useFullLeadRow`) and renders
   nothing until it has it — its editors seed state once on mount and several are read-modify-write
   (delivery checklist/ref), so a list row must never reach them. The live list row is laid over the
   fetched one, so later edits still show.
4. **Dev guard**: in development every list row is a Proxy that logs a loud console error naming any
   field read that the list did not download. Production gets plain rows.
5. **Dashboard** (`useDashboardMetrics`): the five dead reads are gone; leads (32 named columns —
   `DASHBOARD_LEAD_COLUMNS`, walked by the same test), messages and audits page in parallel.
6. **LeadSearchContext**: the viewed/in-list lists are paged in full (fixes businesses you hold being
   HIDDEN from search), keyed on the user id (no double load), not read on page load at all — search
   fetches them alongside the Places call (was a full wait in front of it) and filters with what it
   fetched (it used to filter with the pre-await closure); the niche panel loads them when it opens.
7. **Outreach**: no outreach_history (only addLead/isInOutreach read it — Outreach never calls them);
   the audit map (`src/lib/outreachAuditMap.ts`) and queue status start when the page opens, not after
   the leads; Apify usage is read when the bulk-audit dialog opens (it says "Checking…" meanwhile, never
   "couldn't read"); bulk set product/trade no longer reload every lead and count only writes that
   landed (`bulkWriteLanded` — updateLead resolves `null` on a refused write, so the old count lied).
8. **Coverage niche panel**: one useOutreach for all town rows, not one each.
9. **AI Audit**: the landing poll re-reads only the in-flight audits (row, runs, report, queue counts —
   the same hydrate, scoped) and patches them in; the whole book at most once a minute while draining
   and once when the last run settles. A small hydrate (the poll, a search's matches) reads only its
   own audits' runs/reports. The book's three reads run side by side. Opening an already-finished
   audit no longer reloads the book.
   ⛔ Why the old poll was dangerous, not just slow: `invalidateQueries` every 5 s on a 6–16 s query
   starts a new fetch each time and the old one keeps running (the queryFn ignores the abort signal),
   so two or three whole-book chains — each opening every run's `results` — ran at once for as long
   as anything drained, and the list could restart before any reload finished.
10. **Inbox**: the Gemini signal pages in parallel; a crawl check no longer triggers a second full
    six-read refetch on top of its own invalidation (same on Outreach and in the lead dialog).

## 5. After (same replay method, interleaved with the old pattern)

| Page | Before | After | Requests | JSON |
|---|---|---|---|---|
| Dashboard | 7.8–8.8 s | **2.05–2.25 s** | 31 → 15 | 18.3 → 7.1 MB |
| Outreach table (leads) | 3.2–4.2 s (11 s outlier) | 2.2–2.7 s (hinted, overlapped); noisy, 2.6–5.3 s in another window | 21 → 8 | 17.4 → 7.0 MB (wire 1.63 → 0.96 MB) |
| Outreach fully ready (audit buttons, queue) | 3.8–6.7 s | **2.3–3.0 s** | | |
| Every page (shell) | 1.2–3.7 s, 8 requests | **0.4–0.5 s, 1 request** | 8 → 1 | 0.76 MB → ~0 |
| AI Audit poll tick | 16.4 s, whole book | **1.4 s**, the moving audits | 10 → 5 | 1.5 MB → ~0 |
| AI Audit book (first load) | 11.0 s | 8.9 s | same | same |

Per 1,000-lead page: 41 columns 1.0–1.2 s vs all 111 1.1–1.5 s (server time 53–303 vs 90–435 ms,
download ~0.45 vs ~0.6 s). Narrowing is worth ~20–30% per page and 60% of the JSON; the rest is distance.

## 6. Runtime check

A throwaway local harness (deleted before commit; no network, no keys) rendered the real Outreach
page and lead dialog with a mocked client serving 84 real lead rows projected to exactly the 41 list
columns: list, search, signal filters, three sorts, the Paid filter (Ronnie's, RG, MCLocksmiths; SC
Plumbing refunded, excluded), the RG detail dialog from its fetched full row (payment £19.99 / 11 Aug,
delivery 3/6, re-measure due, delivery host), a non-fixture lead's dialog, and mobile cards. The dev
guard logged nothing. One fault found and fixed: the new loading dialog lacked a screen-reader title.

## 7. Not changed — proposed database work (needs approval)

- **`ai_audit_runs.results_seo_grade`** — plain nullable column + BEFORE INSERT/UPDATE-OF trigger +
  batched backfill (the `results_summary` pattern from `docs/inbox-outreach-speed.md`, never a
  generated column). The AI Audit book's runs read opens every results blob for one grade (~6–8 s of
  the 8.9 s). Would take the book to ~2–3 s. Lock risk: a plain column add is a catalog change only.
- **`process-ai-audit-queue` `retryStuckCleanings`** — every 30 s cron tick filters every complete run
  of the last 7 days on `results->competitor_cleaning` (~350 ms mean; the top consumer in
  `pg_stat_statements` since June). Run it once per ~4 minutes (its own retry spacing), or read a
  plain column. Edge change to the audit engine — not done without a decision.
- `sales_pool` calls `lead_first_contact_at()` for every unassigned lead before its LIMIT (1.4 s).
- Team (`admin-users team_list`) reads each member one after another; page-generator does ~10
  sequential reads and two sign-in checks per call; coverage `pairs` is a fully sequential chain.

## 7b. Part 2 (same day, Paul approved items 1, 2, 4, 5)

**AI Audit SEO grade column** (migration `20260927130000_ai_audit_runs_seo_grade.sql`). Step 1 (plain
nullable `results_seo_grade` + one line in the existing `fill_ai_audit_run_parts` trigger, lock_timeout
3 s) read back: column present, function fills it, no execute grant to anon/authenticated. Step 2 the
backfill: a first batch that SEARCHED for rows with a grade took 8 s (it opened every row it passed)
and was stopped; redone as a primary-key walk, 100 rows a call, SKIP LOCKED — 21 calls, each ~2 s
(mostly API overhead), 609 grades written. The parts trigger is UPDATE OF results, so the backfill fired
nothing. Step 3: all 2,042 runs checked in id batches — 609 graded, **0 differences**. AiAudit.tsx then
switched to `seo_grade:results_seo_grade` (runs paged in parallel). **First load 7.8 s → 2.7 s.**

**Stuck-cleaning sweep every 2 minutes** (`_shared/cleaning-sweep.ts`). What it is: the audit-queue
tick's LAST housekeeping step — re-invokes extract-competitors for runs ALREADY released as `complete`
whose cleaning stamp is incomplete and that have no competitor names (1 of 158 runs matched). NOT gated:
starting/polling/finalising questions, the finaliser's own hold-and-retry (which is what decides a
run's release, so completion and customer-visible results are unaffected), SEO, baselines, remeasures.
Effect: such a retry can start up to 2 minutes later (each run is spaced 4 minutes between retries
anyway). Gate: one tick per 2 minutes, the one landing 15–45 s into the cycle (cron fires at ~:04.5/
~:34.5). Its statement (`pg_stat_statements` queryid -5565264217997628283): **before 2.0 runs/min,
1.15% of one core (6.0 min); after 0.49/min, 0.47% (12.2 min)** — each run is slower cold (575 vs 345 ms).
Deploying it also shipped two Paul-approved main commits (rivalHook, hookScore) that had not reached
this function; checked — neither changes anything this function does.

**Coverage** (`pairs`): one sign-in check (resolveActor; the handler's own getUser was a duplicate), the
four source reads side by side, the completed-run chunks together, the ~5,300-lead read in waves, and
an id tiebreaker on every paged read (they had none). Timing header `x-coverage-timing` found the real
cost: the lead read, six sequential pages, ~3 s. **pairs 4.6–4.8 s → 2.3–2.6 s**, output identical to
before (lead pairs compared as a multiset); towns identical except 35 positions among 67 towns TIED on
population (now in a fixed order). Remaining: sign-in 0.5–0.9 s inside the function, leads ~1.2–1.5 s.

**Page Generator**: one sign-in check (requireAdmin), the audit-actions preamble's two reads together,
measuredSetForLead's reads together, the plan's three inputs together, the clients list read only by
`clients`. Outputs identical. clients 1.6–1.7 → 1.1 s; qa_clients 1.3–1.8 → 0.8–1.5 s; plan 2.8 → 2.7–3.1 s
(unchanged — its remaining time is sign-in and the queue-question read).

**Team** (`admin-users team_list`): every member at once. Output identical. 1.3–1.8 s → 1.9 s — no
measurable change at 2 members; it stops growing per person.

**Signed-in production QA** (one-time magic link as the data account): Dashboard, Outreach (5,486 leads,
no `select=*`, no history, no Apify read), RG's lead dialog (one full-row read by id; baseline 11 Aug,
re-measure 6 Oct, £19.99), the paid filter (the three paying clients), Inbox, AI Audit (new column),
Coverage, Page Generator (RG's plan), Page Plan, Team — no console errors, no failed request, nothing
sent or changed. ⚠️ The app's **Sign out is GLOBAL** (`supabase.auth.signOut()` defaults to
scope global): signing the QA browser out ended EVERY session on the data account, Paul's included.

## 7c. Part 3 (2026-09-27/28)

**Edge functions ran in Singapore.** Supabase runs a function in the region nearest the CALLER; from
Paul's browser (Cloudflare BKK) every call ran in ap-southeast-1 (`x-sb-edge-region`) while the
database is eu-west-1, so every read inside every function crossed the world. The SPA now pins
`?forceFunctionRegion=eu-west-1` on /functions/v1/ URLs (`src/lib/edgeRegion.ts`, wired into the
Supabase client's fetch). ⛔ The query parameter, NOT supabase-js's `region` option: that also sends an
`x-region` header, which every function's CORS preflight would refuse. Default vs pinned, one call
each: coverage pairs 3.8 → 1.8 s, towns 1.1 → 0.6 s, page-generator clients 1.6 → 0.5 s, plan 1.8 → 1.5 s,
queue status 1.9 → 0.6 s, team 0.9–1.7 → 0.5–0.7 s, paid-client list 1.7 → 1.3 s.

**Coverage niche lookup** (`market-view` niche; `x-niche-timing` header). Before (Singapore, 2 calls
each): Plumbers 28.6–34.2 s, Electricians 16.1–21.1 s, Locksmiths 23.8–40.2 s. Profile (Plumbers): the
queue results 21.5 s (14 batches of 40 runs, 1,741 rows, 19 MB of results), sign-in 2.7 s (getUser, then
resolveActor's own getUser), audits 1.4 s, runs 0.9 s, fold 0.6 s; no external API. Fixes: one sign-in
check, audits+runs side by side, the region pin. After (pinned, identical output all three): Plumbers
8.9 s, Electricians 8.0 s, Locksmiths 10.2 s. The remaining 6.3–8.5 s is the database unpacking the
stored results: a sequential replay of the 14 batches summed 8.4 s of server time (slim field
projection 6.5 s — each path still opens the whole value); four batches at a time was no faster and
held four pool connections, so it stays one at a time. Going lower needs a slim stored copy per queue
row (answer text is ~65% of each result and the fold needs only whether it exists) — proposed, not built.

**Sign out is local now** (`useAuth`: `signOut({ scope: 'local' })`; `scripts/sign-out-scope.test.ts`).

**Duplicate sign-in checks.** Removed where the helper repeats the SAME network check (auth getUser +
role): coverage, page-generator (part 2), market-view (now). Left: enrich-business and enrich-lead
verify the JWT signature LOCALLY (getClaims, ES256 — no auth-server round trip) before resolveActor's
real check; removing it saves ~nothing and changes which refusal comes first.

**Apify (read-only, 2026-09-27 16:58 snapshot): $25.94 of $30, cycle 17 Sep–16 Oct.** By audit type
this cycle: outreach hook audits 316 × $0.042 = $13.35; paid-baseline Discovery 5 × $1.20 = $6.02; full
measurement 2 × $0.38; baseline 1 × $0.65. Ledger: AI search $17.35 + billing corrections $5.80 (the real
per-question cost is ~$0.0139, not the $0.0104 estimate); SEO scans $0.08 each; ~$2.8 of the Apify total
is not itemised in enrichment_usage (enrichment/directory/social scrapes). Burn: $7.72 on 17 Sep, $1–3.6
a day to 23 Sep, $0.03–0.31 a day since. Waste found: 2 repeat hook audits ($0.05); no spend on failed
runs. At 100% Apify refuses (402): every AI-search question fails (hook, baseline, discovery, full
measure, REMEASURE, free check) and runs are marked failed, never complete; SEO scans, enrich
(Maps/social/email), directory checks, website check and mockup photo pools fail. Unaffected: Find
Leads (Google Places), WhatsApp, OpenAI work, crawl checks. Our own caps: per-user rolling 24 h $12
(queue) and $2 (enrichment runner); the 75%/90% thresholds only log. RG's remeasure (6 Oct) and
Ronnie's (13 Oct) fall inside this cycle.

## 8. Still slow / open

- The Outreach leads are primary data: the table still waits for all ~5,300. Showing page 0 (the
  newest 1,000 — the whole first screen) first would cut first paint to ~1 s, but filters, counts and
  bulk actions would be partial until the rest arrive — its own piece of work.
- `useOutreach` is still not on React Query (CLAUDE.md), so every visit re-downloads the list.
- Pre-existing, found: `useOutreach.addLead` depends on `[user]` only, so its local "previously added"
  and in-list checks read whatever the lists held when the user object last changed (usually empty) —
  the database dedupe is what actually works. Deliberately NOT changed (it would revive a check).
- `lead_crawl_checks` returns 0 rows to the admin session (RLS) — not investigated.
