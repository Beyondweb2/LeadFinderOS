# Website check accuracy (2026-11-15, branch v1-website-check-accuracy)

**Goal (Paul):** at least 90% of findings true on every check type that appears in reports. Prove it, fix it, keep it measured.
**Result:** 82% true before, **99% true after** (274 of 278), on 27 real lead websites. Two check types still under 90% are hidden from
everything a business sees. **Port to V2:** copy the method and the answer key, not the code (see the end).

## Method

1. **Test set** (`scripts/website-check-bench/sites.json`): 30 real leads from `lead_crawl_checks` (deep checks from the last 20 days),
   picked for a mix — electricians, roofers, plumbers, builders, driving schools, web designers; WordPress, Wix (incl. a free
   `wixsite.com/my-site-2` site), GoDaddy, Squarespace, hand-built, five JavaScript-built (React/Vite) sites, one-page sites, 60-page sites,
   a homepage that is pictures of words, a Facebook page given as the website, and three that fail (403, a dead Wix domain, a timeout
   in production). Eon Graphics was dropped from scoring: its 2–9 s pages made the independent browser read time out.
2. **The app's findings, exactly as production makes them.** `scripts/website-check-bench/run.ts` runs the real deep crawl
   (`supabase/functions/_shared/crawl-job.ts` — `createCrawlJob`, `runCrawlTick`, `finalizeCrawlJob`, unchanged) on a laptop against an
   in-memory database (`fake-supabase.ts`) and prints what the client report would say (`websiteCheckFor`, the same call
   `render-audit-report` makes). Every fetch is recorded once under our honest crawler name and then replayed byte for byte
   (`net.ts`, saved in `cache/`); a JavaScript page "read in a browser" is answered by local headless Edge instead of Cloudflare.
   **Fidelity check:** the bench reproduced the stored production findings for SVG Electrical exactly (11 of 11).
3. **Ground truth, by a different reader.** `evidence.ts` read every site again in a real browser (headless Edge, scripts run, the
   browser's own DOM): homepage, the pages its menu and links point at (contact/about/reviews/services/areas/FAQ first, up to 25), every
   page a finding names, robots.txt and the sitemap. `verify.ts` proposed a verdict per finding; **every verdict in `truth.json` was then
   made by hand** with `ev.ts` (page text, links, structured data) and, for claims about raw markup, the crawl's own saved HTML. A
   finding is true only if what the business would read is true; a line with a false example counts as false. Two of my own first
   verdicts were wrong on a re-read and were corrected (noted in `truth.json`).
4. **Scoring** (`score.ts`): true ÷ labelled, per finding kind and per family. A verdict holds only for the words it was given for:
   a finding that now reads differently is reported as changed and re-checked by hand, never scored on an old verdict.
5. **The repeatable test:** `scripts/website-check-accuracy-bench.test.ts` (in `npm test`, ~40 s, no site contacted, no model called).
   It fails if overall accuracy drops under 95%, if any client-visible kind with 3+ labelled findings drops under 90%, if a hidden kind
   reaches a client, if more than 10% of findings are new or reworded (label them first), or if the crawl asks for an address that was
   never recorded (`run.ts --record`).

## Results

| Family | Before | After |
|---|---|---|
| Links (dead links, "wrong link") | 39% (9/23) | 91% (10/11) |
| Areas covered / town | 44% (7/16) | 100% (16/16) |
| Reviews and proof | 64% (14/22) | 100% (14/14) |
| Services pages | 75% (9/12) | 100% (10/10) |
| Business name | 80% (4/5) | 100% (4/4) |
| Content (thin, copied, placeholders, JavaScript) | 82% (27/33) | 100% (30/30) |
| Indexing rules (noindex, canonical) | 83% (10/12) | 100% (10/10) |
| Trust facts (people, accreditations, start year) | 89% (49/55) | 94% (49/52) |
| Structured data | 89% (34/38) | 100% (35/35) |
| Sitemap | 93% (14/15) | 100% (15/15) |
| Contact details (phone, address, contact page) | 94% (16/17) | 100% (15/15) |
| Headings, titles, descriptions | 98% (44/45) | 100% (47/47) |
| Images (alt text) | 100% (9/9) | 100% (9/9) |
| Redirects | 100% (5/5) | 100% (5/5) |
| AI crawlers and robots.txt | 100% (4/4) | 100% (4/4) |
| Speed and mobile | 100% (1/1) | 100% (1/1) |
| **All** | **82% (256/312)** | **99% (274/278)** |

"Before" is the first labelled run (with the two corrected verdicts). Small numbers are small: a kind seen once is not proven.
No site in the set blocks an AI crawler in robots.txt; that rule is covered by the existing unit tests, not by this bench.

**Per kind, the ones that moved:** link mismatch 14% → 100% (only phone ↔ email now) · noindex pages 33% → 100% · dead links 44% → 86% ·
reviews/proof 56–67% → 100% · no service pages 57% → 100% · FAQ markup 75% → 100% · thin pages 75–80% → 100% · areas not stated
80% → 100% · accreditations 80% → 89% · named people 83% → 91% · founding year 90% → 95% · places named 2 of 10 had no junk → 11 of 11.

### The worst false claims (before)

- **"No reviews or testimonials"** on four sites with testimonials on the homepage (BKW: "I wouldn't hesitate to recommend Ali…"; S Warburton:
  "What people say about us"; DG Prince; Tina Miller has a Reviews page and a 2,570-word Success Stories page).
- **Places that are not places:** "I'm", "VW Scirocco GT", "Organization", "Family Tina", "Multiple Occupation HMO", "Rushden Festo".
- **Dead links that are buttons:** a cookie banner's Decline / Configure / Save Settings, "Forgot Password?", and "Read More" links that
  sit inside an HTML comment no visitor sees.
- **"This link goes to the wrong page":** "Request to Book" → the booking page; "Complaints Procedure" → the complaints page (1 of 7 right).
- **"No separate service pages"** on a fencing contractor with /fencing-grantham, a PAT-testing firm whose every page is PAT testing, and a
  driving school with a page per course.
- **"Your pages have very little text"** on a 316-word page: an unclosed structured-data script made our text reader drop everything after it.
- **"No sitemap"** on a Wix site whose sitemap lives in its folder (/my-site-2/sitemap.xml).
- **"Built by JavaScript"** on a homepage whose words are pictures (empty in a browser too).
- **"Booking calendars are copied pages" / "important pages are noindex"** — Wix booking widgets and a shop cart, rightly noindex.

## What was fixed (code, not guesses)

| Cause | Fix (file) |
|---|---|
| One reading rule copied in two readers, each wrong differently | `src/lib/siteSignals.ts`: one copy of proof words, reviews-page titles, street lines, UI button labels, cookie boxes, menu links, sole-trader start years, self-introductions, utility pages, service words in an address, question vs form label, FAQ sections, headings closed or not. Used by `fullCrawl.ts`, `contentTrust.ts`, `siteAudit.ts`, `visibilityChecks.ts`, `siteEvidence.ts`, `crawlCheck.ts` |
| HTML comments read as page content | `withoutComments` before reading a page or its links |
| `<h1>FAQs<h1>` (unclosed) read as no H1 | `headingHtml` |
| An early unclosed script dropped the rest of the page | `unclosedTail` (`crawlCheck.ts`): only a script that starts in the last half of a page is treated as a cut page |
| Place list junk | `cleanPlaces` (`contentTrust.ts`) |
| Link label ≠ destination guess | removed (`contentTrust.ts`); phone ↔ email mix-ups stay |
| A trading name in the homepage title called a markup mismatch | `contentTrust.ts` schema check |
| A keyword-stuffed Google listing name "not on the homepage" | brand part before the first trade word (`siteAudit.ts`) |
| A logo captioned with the business's own name called "the wrong company" | `contentTrust.ts` |
| **Crawl gaps** — a site in a folder; a homepage empty even in a browser; a slow homepage | sitemap in the site's folder (`crawl-job.ts`); `home_no_text` instead of "built by JavaScript" (`crawl-job.ts`, `siteAudit.ts`); the homepage's second try waits `SITE_HOME_RETRY_TIMEOUT_MS` (25 s) after a timeout (`crawl-check`) |
| Older stored checks | `WEBSITE_CHECKS_VERSION` 3. A version-2 row (made 2026-11-03 → today) no longer shows the kinds measured under 90% on version 2 (`UNRELIABLE_ON_V2`, `siteAudit.ts`) until that lead is crawled again. Nothing stored is rewritten. |

"Stuck on Scanning / Not checked" (production, 2026-11-15): no crawl job stuck (0 running over 30 min); 8 checks in 14 days could not
read the homepage — a timeout (now retried longer), a dead domain, a 404, two 403s that refuse every automated read, and three DNS / TLS
faults. Four audited leads had no check at all: their "website" is a Facebook page or a directory profile, which the report already treats
as "no website of their own".

## The model (the one judgement call)

The check uses a model for one thing: which of a site's headings are services a customer could buy (`_shared/service-review.ts`); the
code still decides every claim. Six models on our OpenAI key were asked the same 13 questions (every site in the set with 3+ candidate
names), through the internal edge function `website-check-bench` (CRON_SECRET only; it sends only this one prompt). Hand labels:
`service-labels.json`. Score: `score-models.ts`.

| Model | Accuracy | Called a non-service a service | Missed a real service | Avg time | Cost per question (list price) |
|---|---|---|---|---|---|
| gpt-4o-mini (before) | 83% | 23 | 17 | 5.3 s | ≈ $0.0005 |
| gpt-4.1-mini | 88% | 9 | 19 | 3.0 s | ≈ $0.001 |
| gpt-5-mini | 88% | 23 | 6 | 9.7 s | ≈ $0.002 |
| gpt-5.4-mini | 83% | 21 | 19 | 3.2 s | ≈ $0.004 |
| gpt-5.4-nano | 77% | 27 | 27 | 4.2 s | ≈ $0.001 |
| **gpt-5.5 (chosen)** | **91%** | 18 (16 of them town pages that do have their own page: harmless) | **4** | 6.6 s | **≈ $0.023** |

**Why gpt-5.5:** a heading wrongly called a service only becomes a false claim if it has no page; gpt-5.5 made 2 such mistakes, gpt-4.1-mini 9.
**Per-site cost:** ≈ $0.023 for a site the question is asked of (about half of deep crawls), so **≈ $0.011 (about 1p) per deep crawl** on
average; at ~1,100 deep crawls a month that is about $12. gpt-5.5's rate ($5 / $30 per million tokens) is the published price read on
2026-11-15 and is now in `openai-usage.ts`; confirm it against the first billed month.

**Spend for this work:** 84 bench model calls, **$0.68 as logged** (`api_usage_log` `openai_bench`; the log over-states the mini models,
which fall back to gpt-4o's rate) — about $0.41 at list prices. Site reads were done from this machine: no crawl or browser spend.

## What is hidden from clients, and why

`src/lib/websiteCheckAccuracy.ts` `CLIENT_HIDDEN_KINDS` — left out of the client report (Findable and LeadFinderOS styles), the welcome
pack, drafted replies and voice-note scripts (`websiteCheckFor(…, { audience: 'client' })`, `reportContentIssues`); still on every team
screen (call script, lead workspace, Inbox):

| Kind | After | Why still short |
|---|---|---|
| `ct_dead_links` | 86% (6/7) | a menu heading that opens a submenu built by JavaScript still reads as a link to "#" |
| `ct_no_accreditations` | 89% (8/9) | a scheme shown only as a logo, or cut short by the builder ("Check A T…"), is not seen |
| `ct_logo_alt_mismatch` | 0 of 2 before; none produced since | not shown until it is measured right |

The test prints a note when a hidden kind measures 90%+ on 5+ findings; un-hide it then, in that list, with the new score in this file.

## Running it

```
node --import tsx scripts/website-check-bench/run.ts                 # replay the saved sites (what the test does)
node --import tsx scripts/website-check-bench/score.ts <results> --by id --false
node --import tsx scripts/website-check-bench/run.ts --record        # fetch addresses the crawl now asks for that were never saved
node --import tsx scripts/website-check-bench/model-calls.ts send --models gpt-5.5   # then: collect
node --import tsx scripts/website-check-bench/score-models.ts gpt-4o-mini gpt-5.5
```
The saved sites are slimmed (`slim-cache.ts`: script and style bodies blanked to spaces of the same length — proved to give identical
findings) to 17 MB. Sites change: re-recording a site means re-labelling its findings.

## For V2

Port the method: a fixed set of real sites saved once, the real check run over the saved copies, an answer key made by hand from an
independent browser read, a per-kind bar that hides what fails it, and the test that keeps it. The answer key (`truth.json`,
`service-labels.json`) and the evidence reads (`evidence/`) are reusable as they are; the V1 crawl code is not.
