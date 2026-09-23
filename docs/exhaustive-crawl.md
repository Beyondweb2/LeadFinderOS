# The exhaustive manual crawl — resumable background jobs (2026-09-23)

## Why

The first "full" manual crawl (same day, `docs/paid-client-evidence.md`) ran inside ONE edge request,
so it stopped at 60 pages / 90 requests / 95 s / 12 sitemaps and stored at most 1,000 discovered URLs.
BS4 Electrical: 1,476 URLs found, 61 read. Paul's rule: **every user-triggered crawl is exhaustive —
it runs until the eligible frontier is empty.**

## Limits audit (the old manual crawl)

| Limit | Value | Kind |
|---|---|---|
| pages fetched | 60 | arbitrary (one-request design) — removed |
| requests | 90 | arbitrary — removed |
| wall clock | 95 s in one request | platform (edge request ~150 s) — now per TICK, the job runs many ticks |
| sitemap documents | 12 | arbitrary — removed |
| sitemap URLs kept for evidence | 2,000 | arbitrary — now every URL is a row; 2,000 samples kept only for the domain-conflict analyser |
| stored discovered URLs | 1,000 (jsonb array) | arbitrary — now `crawl_urls` rows, unbounded |
| link-following waves | 4 | arbitrary — removed; the frontier is followed to the end |
| body size | 1 MB | safety (memory) — kept |
| concurrency | 6 | politeness — kept |
| redirects | fetch default (follow) | platform — kept |
| query strings | dropped entirely (`?page=2` never crawled) | arbitrary — replaced by real normalisation |
| robots.txt | read for Sitemap: only | now `User-agent: *` Allow/Disallow is respected |

## Architecture

- `crawl-check` (operator press, `mode: "full"`): probes the homepage as the four AI search crawlers
  (as before), then `createCrawlJob` — one `crawl_jobs` row, frontier seeded with the homepage (done),
  robots-declared + conventional sitemaps, the homepage's links and, on a re-crawl, the previous
  completed job's pages (`source='previous'`). Kicks `crawl-worker` and returns `{ job_id }` at once.
  A second press while one runs returns the running job. If no search crawler can read the homepage,
  the ordinary inline check records that (standard row) — there is no site to crawl.
- `crawl-worker` (internal, CRON_SECRET): `runCrawlTick` — claim a running job's LEASE, re-queue any
  row a dead worker left `processing` (failed after 3 attempts), then up to 3 batches of 24 URLs
  (sitemaps first, shallow before deep), 6 concurrent GETs, 10 s timeout, 1 MB cap, gzip sitemaps
  decompressed. Every result is written to its row; discovered URLs are inserted `ON CONFLICT DO
  NOTHING` (the table is the dedupe). Then it releases the lease and chains the next tick. A cron
  (`crawl-worker-run`, every minute, `invoke_crawl_worker()`, only fires when a job is running with an
  expired lease) is the backstop when a chain link is lost.
- When nothing (page or sitemap) is queued or processing, `finalizeCrawlJob` pages every row in,
  builds the same `result` the report/Inbox read (signals, verdict, siteInfo, evidence) plus the
  crawl-wide summary (`full_evidence`, version 2: totals, skipped-by-reason, failed-by-status,
  families, technical findings with counts, business evidence with page counts, robots, sitemaps),
  marks the job `complete` / `complete_with_failures` / `failed`, and upserts the lead's ONE
  `lead_crawl_checks` row with `job_id`. Older jobs stay as history; the lead row names only the newest.
- `RUNAWAY_URL_CEILING` (50,000 distinct URLs per job) is the only size guard — for an endless URL
  space the classifier did not recognise. Hitting it is counted (`safety_ceiling`) and the job ends
  `complete_with_failures`, never "complete".
- No model, audit or SEO call anywhere in the crawl.

## URL rules (`src/lib/crawlUrl.ts`)

Same site = served host with `www.` ignored, http/https folded; every same-site URL is rewritten
onto the served scheme+host. Fragments and credentials dropped, duplicate slashes collapsed,
`/index.html` → `/`. Tracking (utm_*, gclid, fbclid, …) and session params removed. Pagination
(`page`, `paged`, …) kept when numeric and ≤ 500; CMS page ids (`page_id`, `p`, `id`, …) kept when
numeric; any other parameter (filters, sort, search, calendar, lightbox, …) is `query_trap`. More
than two kept params, > 12 path segments, a segment repeated 3+ times, > 400 chars → trap. Skipped
with a reason: assets, admin/login/account/cart/checkout/feed/api paths, robots Disallow. Off-site and
mailto/tel/javascript are not the site and are not rows (off-site sitemap URLs are counted).

## Schema (`supabase/migrations/20260923020000_crawl_jobs.sql`, applied and read back)

`crawl_jobs`, `crawl_urls` (unique `(job_id, url)`, frontier index), both RLS on with no policies
(service role only; reads go through crawl-check `status` and paid-client-hub `crawl_inventory`);
`lead_crawl_checks.job_id`; `crawl_job_counts(uuid)` and `invoke_crawl_worker()` (security definer,
revoked from anon/authenticated). Cron: `select cron.schedule('crawl-worker-run', '* * * * *',
'select public.invoke_crawl_worker()')`.

## Screens

- Paid Clients / Website Build `LeadCrawlPanel`: Not crawled · Crawling (discovered · processed ·
  remaining · failed · skipped, polled every 5 s from the server, survives leaving the page) ·
  Complete · Complete with failures · Failed; old rows labelled honestly (Quick crawl / Capped crawl).
- Outreach / Inbox / lead popup / paste-a-URL `CrawlCheckButton`: starts the job, shows live progress,
  shows the result when the job finishes; closing it does not stop the crawl.
- Website Build Architecture: `CrawlInventory` — every URL of the lead's current crawl, 50 per page,
  filter by status/family, search, CSV of ALL rows (paged 1,000 at a time), and "add fetched pages to
  architecture" (the architecture itself holds `MAX_PAGES` planned pages; the overflow is named).

## BS4 result

See the final report of the session (2026-09-23) and the `crawl_jobs` row for lead
`ac4e420e-4059-4389-9aa7-23d991ddd457`.
