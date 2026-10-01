# Who runs their website? — the agency check (built 2026-10-01, branch `feat/agency-sales-overhaul`, NOT merged)

Paul's brief: stop salespeople wasting time on businesses whose website an agency probably controls, with
a cheap check right after Find Leads, before any audit spend. No AI. Prefer accuracy over coverage.

## 1. How it works

- **Where:** Find Leads results are not saved until Add, so the check is keyed by website **domain**, not
  by lead. `useAgencyChecks` (Find Leads) reads `website_agency_checks` for every result's domain once; a
  fresh row shows at once and is never crawled again; the rest go to fn `agency-check`, **8 at a time**,
  each row updating as it finishes.
- **The crawl** (`supabase/functions/_shared/agency-crawl.ts`, sitemap-guided "Option C"): homepage (the
  site's root, never the Places deep link) → `robots.txt` (for `Sitemap:`) → the declared or standard sitemap
  (+ one child of a sitemap index) → up to 6 sample pages: contact, about, a service page, then other
  shallow pages. **≤ 10 requests per domain**, 3 pages at a time, 6 s per request, 25 s per domain, 1 MB per
  body, public addresses only, one homepage retry on a timeout / server error. An ordinary browser's
  identity (3 of 50 sites refused a named bot but served a browser — Paul's call to keep or revert).
- **The verdict** (`src/lib/agencyDetect.ts`, pure): strong signs (a footer credit "Website by / Designed by /
  Built by / SEO by …", with or without a link; a developer note in the page source; designer / developer
  metadata) or two independent supporting signs that name the SAME supplier (a footer link to a web-supplier
  domain, a bespoke theme folder, assets from that domain, an agency-like page author). ⛔ Platform and
  hosting are context only; "Powered by WordPress", "Website by Wix", a self-credit and plugin notes are not
  credits; one weak sign is never enough.
- **Classes:** `agency_likely` / `no_evidence` (read, nothing meaningful — never "self-managed") /
  `unknown` (blocked, offline, 404, script-only, timed out, redirected to another domain).
- **Confidence** = in the classification: strong credit 80, +8 with the supplier's domain, +5 sitewide, +4
  corroborated (cap 96); supporting-only 62–80; no evidence 55–78 by pages read (−10 for a thin homepage).
- **Cache:** `website_agency_checks` (migration `20261003100100`, NOT applied): one row per domain, 30 days
  (`AGENCY_CACHE_DAYS`), a failed check 1 day, any older `AGENCY_CHECK_VERSION` re-checked; a different domain
  is a new row. Team members read it (RLS `my_role() is not null`); only the function writes.
- **Cost guard:** each crawl (not a cache hit) counts against the free `site_scrape` guard (300 / hour / person).

## 2. On screen

- Find Leads: a **Site management** column ("Agency likely · 92%" / "No agency evidence · 78%" / "Checking…" /
  "Unknown" / "—"; phone: "Agency · 92%"), a click opens the evidence in plain words; a site-management filter;
  high-confidence agency (≥ `AGENCY_DEPRIORITISE_CONFIDENCE` 75) sorts last **once the checks finish** (rows
  never jump mid-check) and is left out of Select all and Add all shown — never hidden, never deleted.
- The lead (Work panel, "Learned on the call"): **Detected: Agency likely · 92%** with **Confirm agency** /
  **Not agency** while `website_control` is unset — saved through `lead_set_website_control` (History). ⛔ The
  machine never sets it.

## 3. Measured (2026-10-01, from this machine in Thailand, the real crawl, 50 random distinct domains from
the lead book, 8 at a time)

| | |
|---|---|
| 50 sites, wall clock | 37.8 s |
| requests | 359 total · 7.2 average · 10 max |
| per site | median 3.0 s · p90 10.8 s · slowest 21.7 s |
| sitemap found | 36 of 50 |
| Agency likely | 8 (all ≥ 85%, every one a real footer credit with the agency's link) |
| No agency evidence | 32 |
| Unknown | 10 — 3 offline, 2 not found, 1 server error, 1 script-only, 1 timeout, 1 domain now elsewhere, 1 blocked |

Cost: no paid API. One edge-function invocation per crawled (uncached) domain — ~50 per fresh search, 0 for a
repeat within 30 days — and the fetched bytes (inbound). Supabase's published rate for invocations beyond the
plan's allowance is $2 per million; ⚠️ not verified against a bill (CLAUDE.md §4: a price-list rate is a guess
until a billed row agrees). The edge function will run in the EU, nearer UK sites, than this measurement did.

Known misses kept on purpose (false positives cost more): a footer logo-only link to an SEO firm; "Cookie
consent tool by OMD Websites". Both read "No agency evidence" with the weak sign listed.

## 4. Deploy order (when approved)

SQL `20261003100100` (read back table, RLS, grants) → deploy fn `agency-check` (new; `config.toml` has it) →
push main. The SPA before the SQL shows "Not checked" (the read fails safe); before the function, every cell
stays "Not checked".
