# Paid Client evidence pipeline — one full manual crawl, manual onboarding, baseline priority (2026-09-23)

## Why this was built

Paul crawled **BS4 Electrical Services Ltd** (lead `ac4e420e-4059-4389-9aa7-23d991ddd457`, marked
paid by hand, no Stripe row) from the Outreach row at 06:17 on 2026-09-23, then opened it in Paid
Clients and the crawl was not there. BS4 also has **no onboarding row at all** — the customer never
filled it in — so Prepare Baseline answered `404 paid_onboarding_not_found`.

What the live data showed (read-only, 2026-09-23):

1. **The crawl did run and was saved to the lead** — `lead_crawl_checks` row `4a363625…`,
   `user_id` = the operator, `created_at` 06:17:43. The crawl belonged to the lead all along.
2. **Paid Clients never read it.** `paid-client-hub` `get` selected no crawl at all, and the hub
   had no crawl UI. (Website Build's `rebuild_context` did read the row.)
3. **It had read ONE page.** bs4electricalservices.co.uk redirects to `www.` (every Wix site
   does). crawl-check compared every sitemap URL and link against the origin it was HANDED
   (apex), so every `www.` URL was discarded as "another site" and only the homepage was read.
   Its sitemap is a Wix index of ~20 generated location sitemaps plus `pages-sitemap.xml` last.

## Manual crawl entry points (before → after)

| Entry point | Before | After |
|---|---|---|
| Outreach row icon (`OutreachTable` → `CrawlCheckButton`) | crawl-check, standard, `lead_crawl_checks` | FULL, same row, `requested_from=outreach` |
| Inbox header icon (`Inbox` → `CrawlCheckButton`) | same | FULL, `inbox` |
| Lead popup (`LeadDetailDialog`) | same, but never shown the stored row (always re-ran) | FULL, `lead_detail`, seeded from the row (`useLeadCrawl`) |
| Outreach "Crawl check" paste-a-URL | standard, stores nothing | FULL, stores nothing (no lead) |
| Paid Clients | none | `LeadCrawlPanel`, FULL, `paid_client` |
| Website Build | none | `LeadCrawlPanel`, FULL, `website_build` |
| Automated: audit finalise (`process-ai-audit-queue`) | standard | **standard, unchanged** |
| Automated: report background populate (`render-audit-report`) | standard | **standard, unchanged** |

Not crawls of the site's evidence and not changed: the bulk "Find emails" crawl (`extract-email`)
and the SEO scan (`run-seo-scan`, Apify).

## The profiles (`src/lib/fullCrawl.ts`)

- `STANDARD_CRAWL` — 12 pages, 22 requests, 35 s, 4 sitemap documents, 6 s per request. The budget
  crawl-check always had.
- `FULL_CRAWL` — 60 pages, 90 requests, 95 s fetch phase (inside the 150 s edge limit), 12 sitemap
  documents, 6 concurrent, 8 s per request, 1 MB per response (unchanged cap). Breadth-first: the
  homepage navigation, then one page per template family (parent directory / slug pattern), then
  round-robin, with up to four waves following links from pages just read. A site's own pages
  sitemap is read before generated collections. Every discovered URL is recorded (up to 1,000),
  fetched or not — that list is the rebuild's old-URL list. Pages are held as lean HTML (scripts,
  styles and SVG removed, JSON-LD kept).
- `resolveCrawlMode(mode, isOperator)` — FULL only for an operator sending exactly `"full"`.
  Internal callers and absent/unknown values are STANDARD.
- The served-origin fix (`sameSiteUrl`, `toServedUrl`) applies to BOTH profiles.

The full evidence (`FullCrawlEvidence`): limits, stats (discovered / fetched / ok / requests / which
limit was hit), `completeness` (complete / partial / failed — never "complete" when a limit was hit
or a page failed), warnings, served vs requested URL, robots.txt (found, sitemaps, disallow-all,
excerpt), sitemaps read + URL counts + off-site count, every page's digest (status, family, title,
description, canonical, noindex, H1/H2, words, excerpt, internal links, schema types), page
families, navigation, footer excerpt, business evidence (names, phones, emails, addresses, people,
credentials/memberships, guarantees, experience, prices, reviews, third-party profiles, schema
business facts, logo, favicon, og:image, images) — every item with the URL it was read on — and
technical findings (noindex, missing title/description/H1, multiple H1, thin, duplicate titles,
off-site canonical, broken, redirected, off-site sitemap URLs, no sitemap, no robots, no homepage
schema). Detected, never approved.

## Storage — one row per lead

`lead_crawl_checks` (unique `lead_id`) is the canonical latest crawl. New columns (additive,
`supabase/migrations/20260923000000_paid_client_evidence.sql`, applied and read back):
`mode`, `full_evidence` (its own column so Outreach/Inbox, which read `result` for the whole book,
never download it), `requested_from`. `result` keeps its shape (signals, verdict, siteInfo, evidence).

⛔ `mayReplaceLeadCrawl`: an automated standard crawl never replaces a full crawl younger than
`CRAWL_FRESH_MS`; it still attaches its result to its own audit run. No crawl history is kept —
the table is one row per lead by design; history would be a new table (deferred).

## Manual onboarding (`src/lib/manualOnboarding.ts`, `ManualOnboardingDialog`)

The customer flow's questions verbatim (checked against findable-site by
`scripts/manual-onboarding.test.ts`), in the customer's order, with the customer's conditions:
you (name, email, mobile, website) → business name → what you do + town → website (existing
domain? agency? then access / self-site) → permission tickbox (and "I'd rather talk it through
first") → services (the same trade chips, a byte copy of `onboardingChips.ts`) and towns.

Saved by `paid-client-hub` `save_onboarding` into the SAME `onboarding_responses` columns the
customer path writes (contact_name, contact_email, confirmed_phone, business_website, business_name,
confirmed_location, domain_status, website_manager, website_manager_email, gbp_consent, services,
services_list, areas_list) plus `website_route` (derived from the website answer, the operator-path
column `findableSiteKind` reads) and provenance `operator_edited_at` / `operator_edited_by`. One row
per client: the paid row is updated; a customer row that never reached `paid` is adopted and marked
paid; otherwise a row is created with `client_source='manual'`, `status='paid'`,
`baseline_status='needs_questions'` (which the paid backstop does not start). Never written:
`plan_tier`, `website_addon` (money), any `baseline_*` field. The lead gets the customer submit's
updates (search_location, category from the trade, fill-empty email/contact/phone, website replaced
with a note). Nothing is sent and no baseline starts.

Status (`onboardingStatus`): Not started · Incomplete (names what is missing) · Complete — submitted
by the client · Completed manually — entered by operator · Complete — client answers, edited by
operator. Website Build labels those facts "(entered by operator)".

## Baseline input priority (`src/lib/clientContext.ts`)

onboarding (client or operator) → VERIFIED Client Build Facts (`verifiedBuildFacts`) → client record
→ Discovery facts → crawl. 🔴 The crawl used to be MERGED into the services and areas the baseline
is generated from; now its services/towns come back as `detected_services` / `detected_areas`,
shown in Prepare Baseline section A and the manual form as suggestions to tap, never measured until
approved. A full lead crawl is preferred over run crawls; www/apex are one site.

`baselineReadiness` shows the server's own gate (business, trade, onboarding, primary location,
services required; website and service areas as attention items) with a Fix button that opens the
manual form. Scoring, the 20 × 3 standard and the frozen-set replay are unchanged.

## Findings for Paul (not changed here)

- **Every customer submission stores `plan_tier: "keep"`** (findable-site `e48f787`, "Simplify
  Findable onboarding offer", 2026-09-18) and never writes `website_route`. So for a
  customer-submitted row `findableSiteKind` is `client_owned` whatever the website answer, and the
  8-week new-domain re-measure can never fire for a customer — only for an operator-entered route.
  The customer form also still tells a new-domain customer "the 4-week results guarantee does not
  apply", which disagrees with the 8-week rule in `findableOffer.ts`. Needs a decision.
- Pre-existing on `origin/main`, not touched: 3 new type errors vs the baseline (lucide `title`
  props in OutreachTable/Inbox), `page-generator/index.ts:898,903` undefined `user`.
