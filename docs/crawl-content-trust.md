# Crawl: content & trust checks (2026-10-11)

Branch `feat/crawl-content-trust-checks`. Code: `src/lib/contentTrust.ts` (pure). Tests: `scripts/content-trust.test.ts`,
`scripts/hook-report-concept4.test.ts` (I3).

## Why

Paul: the website crawl check found fewer issues than a person reading the site. It only had the technical checks
(blocked search crawler, client-rendered homepage, town-swap duplicates, thin pages, missing H1, no JSON-LD) plus the
Phase 1 domain-conflict evidence. A site whose problems are all content and trust read as **clean**.

**Before (stored crawl, 11 Oct 2026, standard mode):**

| Lead | Faults | Evidence | Report said |
|---|---|---|---|
| Elect Electrical Ltd (electelectrical.com) | 0 | 0 | "No technical faults found" (clean) |
| S P Electrical & General Maintenance | 1 (OAI-SearchBot + PerplexityBot blocked) | 0 | that one fault |

Sales insights on Elect said `strong_site`, so the call script said the site was in good shape.

## What the gap was, and why

The hand check of electelectrical.com (11 Oct) found 11 things. None was reachable by the old crawl because it never
looked at what the pages SAY — only whether they could be read:

| Found by hand | Why the old crawl missed it |
|---|---|
| Vague H1s ("The power behind your project", "Electrical Contractors") | Only checked that an H1 exists |
| "Accredited and compliant", "Approved Electrician" with no scheme | `fullCrawl.CREDENTIALS` only lists NAMED schemes; an unnamed claim matched nothing |
| No reviews/case studies; "Project 1/2/3" → `#` | No check for proof or placeholders on the quick crawl |
| Only Sheffield / South Yorkshire; no area pages | No area check |
| "More than 20 years" vs "25+ years" | Experience sentences were collected (full crawl only), never compared |
| Logo alt text wrong ("Ephicient logo" × 13, "The Paak logo" → Vauxhall) | Alt text was never read |
| "ChatGPT Image" file names | File names were never read |
| "Explore Electrical" → EV page, "Explore EV" → solar | Link labels were never compared with destinations |
| All 4 posts dated 9 Sept 2026 | Dates were never read |
| Residential page in a commercial-first site; generic copy | No check |
| Schema "could not be confirmed" | We CAN read it: it is in the raw HTML. It matches the page (phone, postcode); its `"url": "/"` is incomplete |

## What it does now

Two steps so both crawls share one rule:

- `pageObservations(html, url, homeUrl)` → a small per-page record. The quick crawl (`crawl-check`) builds it in memory
  for the home page + every sampled page. The full crawl's worker stores it on each `crawl_urls` row as `evidence.ct`
  (the raw page is gone by finalize).
- `buildContentTrust(...)` → ranked issues, stored at `lead_crawl_checks.result.contentTrust` (own key, own
  `CONTENT_TRUST_VERSION`; `signals` untouched, so `audit_followup_fault` and every old row are unchanged).

Checks: robots.txt blocking AI/search crawlers, HTTPS, mobile viewport, sitemap, broken pages, pages nothing links to
(full crawl only), placeholder blocks, links to nowhere, conflicting years / founding year, missing founding year &
company number, nobody named, no reviews/testimonials/case studies, accreditation claimed but unnamed, no named
accreditation, vague headings, area coverage, AI-generated image file names, logo captions naming another company,
missing alt text (photos only, each counted once site-wide), link label ≠ destination and phone-linked-as-email,
identical post dates, generic copy, mixed commercial/home audience, markup vs page (phone, postcode, name), markup with
an incomplete URL, markup that cannot be parsed ("We could not verify").

Each issue: plain title · why it may matter · severity (high/medium/low) · Master Standard evidence class (A
platform-confirmed, B supported best practice, C experimental — per kind in `CONTENT_TRUST_KINDS`) · verbatim evidence ·
what the business would need to supply · one spoken line.

Where it shows:
- **Report** (six-answer hook report, "Website issues we found"): ranked WITH the existing faults/evidence by severity;
  the faults keep their place at the top of each tier (so "AI can't reach your site" still leads); top 5; High / Medium /
  Low chip + one "We found:" evidence line. robots.txt's own block is not said twice beside a refused fetch. Run crawl
  first, then the fresh lead row — same rule as the evidence.
- **Inbox audit window** (`ProspectAuditDialog` → `auditFromStoredCrawl`): all of them, with evidence class and "What
  the business would need to supply". A full crawl stores them inside its audit at finalize.
- **Call script** (`coldCallPlaybook.selectFindings`): fills any room left after the existing points, high/medium only,
  one per theme. On a site the sales insights call `strong_site`, only OBSERVED issues may override that verdict — a
  "we couldn't find…" never does (keeps the 2026-10-07 "a strong site is a result" rule).

## Master Standard rules (pinned by `scripts/content-trust.test.ts`)

- Absence is "We couldn't find…", never "You don't have…".
- Never suggests inventing facts, awards, reviews, accreditations or office locations ("Never a scheme you are not in",
  "never written for you").
- Area advice: "only where it is genuinely true and useful", never town-swap pages; no area advice at all when the site
  already has area pages.
- No llms.txt, no ranking/citation/recommendation promise, never "change dates to look fresh", never a claim about how
  an AI decides.

## False positives found and fixed while building (all pinned)

A director's own career ("has worked in the trade for 24 years") is not the company's age · a dropdown parent `href="#"`
is UI, not a dead link · an `<a>` with no href is not a link · an unclosed menu `<a>` must not swallow its neighbours ·
an Elfsight WhatsApp chat widget is not a reviews widget · a `Service` JSON-LD node is not the business · "Electric
Vehicle Charging" is not a place · "Commercial Workplaces" → /commercial-ev-charging is fine (any shared word) · a brand
prefix used on 3+ labels ("Elect EV", "Elect PV") is never a topic · logos are excluded from the alt-text ratio (they
have their own check) and photos repeated in headers/footers count once.

## After (local run of the shipped analyser on the same pages, 11 Oct 2026)

| Lead | Issues | Top 5 on the report |
|---|---|---|
| Elect Electrical | 16 (1 high, 8 medium, 7 low) | placeholder blocks · conflicting years · no reviews/case studies · unnamed accreditation · vague headings |
| S P Electrical | 7 (+ the existing blocked-crawler fault) | AI can't reach your site · conflicting years (9 vs 14) · qualifications claimed, no scheme · vague H1 "Welcome To SP Electrical" · area pages |
| RPD NW (rpdnw.com, a well-built site with area pages, reviews, CHAS, Checkatrade) | 1 low (no founding year / company number) | — |

Live verification after deploy: see the session report (crawls re-run through the internal door, report opened with
`preview=1`).

## Also in this change

AI Overview wording: a shown overview with no extracted names says "Overview shown, names could not be read" and the
audit window opens Google's text, instead of "no businesses named" (`OVERVIEW_NO_NAMES_TEXT`, `aiOverview.ts`).
