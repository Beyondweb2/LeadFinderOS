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

## 8. Still slow / open

- The Outreach leads are primary data: the table still waits for all ~5,300. Showing page 0 (the
  newest 1,000 — the whole first screen) first would cut first paint to ~1 s, but filters, counts and
  bulk actions would be partial until the rest arrive — its own piece of work.
- `useOutreach` is still not on React Query (CLAUDE.md), so every visit re-downloads the list.
- Pre-existing, found: `useOutreach.addLead` depends on `[user]` only, so its local "previously added"
  and in-list checks read whatever the lists held when the user object last changed (usually empty) —
  the database dedupe is what actually works. Deliberately NOT changed (it would revive a check).
- `lead_crawl_checks` returns 0 rows to the admin session (RLS) — not investigated.
