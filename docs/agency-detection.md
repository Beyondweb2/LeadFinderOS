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
  body, public addresses only, one homepage retry on a timeout / server error. ⛔ An honest crawler
  name, `LeadFinderOS-SiteCheck/1.0` (Paul, 2026-10-01): never disguised as a person's browser. A site that
  refuses it reads "Unknown — the site blocked the check" (~3 in 50); accepted.
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


## 5. v2 — accuracy over a few seconds (Paul, 2026-10-02, branch `feat/commission-six-trailing`; `AGENCY_CHECK_VERSION` 2)

What changed, each kept only because the measurement below showed it found real evidence and no false one:
- **Every `<footer>` element, plus the page tail measured WITHOUT scripts / styles** (`creditRegions`).
  `footerHtml()` took the FIRST `<footer>` (a testimonial's or a card's) despite its comment, and on a site
  with no `<footer>` element the raw-character tail missed footers sitting before big script blocks. Footer
  LINKS (a weak sign) are still read from footer elements only. Regions are joined with a hard stop.
- **Every credit match is tried**, not just the first ("Theme by Astra · Website by X" stopped at Astra).
- **A link that IS the credit** (`<a href=agency>Website by X</a>`, or its title / aria-label / alt says so)
  carries the agency's domain. A logo-only link with no credit words is still never enough.
- **"This/Our website was designed/built/… by X"** in a page's own words (about / legal pages). Narrow: it
  must say THIS/OUR website; "designed by our team" never counts.
- **One legal-type page** (a credits page first, else privacy / terms / legal / accessibility; never cookies),
  never as a filler page.
- Credit names stop at "/", a digit, and footer noise words (click, back, follow, menu, home, top).
- **Crawler name** `LeadFinderOS-SiteCheck/1.0 (+https://findable.live)` — the "Mozilla/5.0 (compatible; …)"
  wrapper is gone. 9 UK hosts 403'd the wrapper (a bad-bot rule) and accepted the bare honest name; 5 of
  those answer it with SiteGround's challenge (`/.well-known/sgcaptcha/`), now labelled "blocked" — ⛔ never
  worked around. Still a named crawler, never a browser identity.
- **Budget:** ≤ 13 requests (was 10), ≤ 7 sample pages (was 6), 4 at a time (was 3), 8 s per request (was 6),
  10 s for the homepage, 35 s per site (was 25); the www / bare-domain twin tried once only when the homepage
  gives no answer at all (a 4xx is an answer).
- v1 cached rows are re-checked (version bump) — one crawl per domain, inside the free `site_scrape` guard.

**Measured 2026-10-02** (this machine, Thailand; the same deterministic 100 distinct lead-book domains, old
and new crawl each run on every site, 8 sites at a time, order alternated per site):

| | old (v1) | new (v2) |
|---|---|---|
| Agency likely | 12 | **16** |
| No agency evidence | 58 | 56 |
| Unknown | 30 | 28 |
| median / p90 / slowest per site | 1.6 s / 6.6 s / 21.8 s | 1.8 s / 6.9 s / 27.2 s |
| requests, average / max | 6.3 / 10 | 7.1 / 11 |
| pages read, average | 4.0 | 4.5 |

The 5 changes (Zest & Punch and Lab Creative checked in the page source by hand; the others from their
evidence lines, each a linked credit): Thisworks (linked "Website design and SEO by", was blocked), Zest &
Punch (linked "Website hosted and managed by", no `<footer>`), adaptable (linked "Site by"), Lab Creative
("Website built by Lab Creative / Digi Guru"), and one blocked site now read as No agency evidence (7 pages).
Every v1 agency result is unchanged; no new false positive. A raw-HTML scan of the remaining No-evidence
homepages found no further credit. Unknown 28 (old 30): 10 blocked (old 4 — bot challenges the old rules
mislabelled "built by script" are now called blocked), 10 offline (dead domains; twin tried), 6 script-built
(old 14), 1 not found, 1 moved to another domain. None can honestly be read without posing as a browser.

Deploy: `agency-check` (closure: `_shared/agency-crawl.ts`, `src/lib/agencyDetect.ts`) and the SPA.
