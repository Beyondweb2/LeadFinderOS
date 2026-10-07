# Site crawl → sales insights (2026-10-07, branch `improve/site-crawl-sales-insights`)

The prospect website crawl / sales-insight layer. **Not** the paid 20-question baseline, not the AI-audit
methodology, not WhatsApp. Everything here is deterministic: no model call, no extra paid request.

## Why the old crawl missed what a manual review finds (traced from code, 2026-10-07)

1. **The call script read eight technical finding kinds and nothing else.** `siteFindings.ts` →
   `selectFindings` (coldCallPlaybook) → `callScript`: a sitemap on the wrong domain, a page naming another
   domain, schema pointing elsewhere, a noindexed main page, blocked AI crawlers, a near-empty homepage,
   near-identical town pages, thin pages. A site with none of those got the fixed line "I couldn't see one huge
   technical problem…" — whatever its content looked like.
2. **The richer stored audit never reached the script.** `siteAudit.ts` (grouped findings, stored at
   `full_evidence.audit`) is read only by the detailed audit dialog. The call screen, the Inbox and the voice note
   read `result.signals` + `result.evidence` only.
3. **Nothing looked at services.** Nav labels, the headings on a Services page, "which of these has a page of its
   own" — all stored (`d.h2/h3`, `nav`, `l`) and never read. Same for the business name, the phone number, the home
   town on the service pages, and whether the homepage links to the service pages.
4. **The standard crawl (what "Check before calling" runs) held 12 sampled pages' HTML in memory and kept only
   counts from them.** The prospect background crawl read up to 500 pages in discovery order, so a blog could
   crowd out the pages that matter.
5. **The thin-page signal counted every short page** — a short contact page produced "your service pages are
   light on detail", which is false.

## What it collects now

* `src/lib/salesInsights.ts` — one pure module. Input: the pages a crawl read (the same `processPage` digests both
  crawls produce), the homepage menu, every address the crawl knows exists (read or not), the lead's name / town /
  trade / recorded services, and whether the crawl was capped. Output: `SalesInsights` —
  `state` (`issues` | `strong_site` | `unreadable`), ≤ 5 ranked findings, an `opportunity`, `strengths`, the
  per-service coverage, and the basis (pages read, capped).
* Each finding: `id`, `kind`, `theme`, `title`, `observed`, `why`, `improvement`, `spoken`, `confidence`
  (high | medium), fixed `priority`, and `evidence` = `{ urls, quotes, signal }` (the pages and the words read).
* Stored on `lead_crawl_checks.result.insights` (small, ~3 KB) by **both** crawls — `crawl-check` (standard, via
  `salesInsightsInline.ts`, no extra fetch) and `crawl-job` finalize (prospect / exhaustive; also at
  `full_evidence.audit.insights`).

### The checks

| Kind | Fires when | Priority |
|---|---|---|
| `no_service_pages` | ≥ 3 services named (menu / services page / homepage headings / the lead's list), none has a page of its own | 85 |
| `services_on_one_page` | ≥ 3 services described on one page, none dedicated | 82 |
| `service_page_gaps` | ≥ 3 named, ≥ 1 dedicated, ≥ 2 high-confidence ones without a page | 68 |
| `no_contact_details` | no phone number in ≥ 3 pages read | 66 |
| `internal_linking` | ≥ 2 service pages and the homepage + menu link to < 40 % of them (needs recorded links) | 54 |
| `name_unclear` | the brand part of the name is not in the title, headings, markup or opening text | 48 |
| `location_unclear` | the town is nowhere (64, high) / on the homepage but on no service page (44, medium) | 64 / 44 |
| `no_proof` | no review, credential, guarantee, years or past-work page in ≥ 4 pages | 40 |

**Speakable threshold `SPEAK_MIN_PRIORITY = 50`.** Below it a finding is kept for the evidence screens and is never
said on a call (name matching and "service pages don't say the town" were too fuzzy once run on real sites).

Technical findings are unchanged: they stay in `siteFindings.ts` / `siteAudit.ts` (robots, noindex, canonical, sitemap
domain, schema domain, duplicate pages, client-rendered homepage, blocked crawlers). `mergePoints` orders legacy and
insight points by one table (`LEGACY_POINT` + each finding's priority), one point per theme.

### Service detection — the part that took the most care

Candidates come from the lead's recorded services, the homepage menu, headings on pages that list ≥ 3 services, and
homepage headings. A candidate must (a) not be a slogan / call to action / person / utility block
(`NOT_SERVICE_TOKENS`, `NOT_A_SERVICE`) and (b) contain a word for something a business does or fixes
(`SERVICE_NOUN_PREFIXES`), except the lead's own list. Missing a service the list does not know is the safe direction.
A service has a dedicated page when a non-home, non-blog / faq / about / contact / area page's title, H1 or address
words match (all of a ≤ 2-word name, 60 % of a longer one), or a known-but-unread address names it (capped crawl).
A menu item pointing at an unread page on a capped crawl is `unknown`, never "no page".

Found on real sites while building it (and now guarded): "Get Fast, Reliable Plumbing Help Today", "Quick Links",
"PAYMENT OPTIONS", "Dr. Barbara Orion", "What My Clients are Saying", `FAQ&#x27;s` (hex entities were not decoded —
`fullCrawl.decode` fixed), "Safe Opening" (was blocked by the "Opening Hours" stop-word — removed).

## How pages are chosen, and the limits

* **Prospect crawl cap: 500 → 60 pages** (`PROSPECT_CRAWL_PAGE_CAP`). Sitemaps are still read in full so the crawl knows
  the site's size and still reports "capped". Paying-client / Paid Clients / Website Build crawls stay exhaustive.
* **A capped job reads the best 60, not the first 60** (`planCappedBatch`, `crawlPriority`): service pages (weight 0),
  then about / contact (1), then other / gallery / reviews / faq / pricing (2), then area-page clusters (3), the blog
  last (6); `+1.5` per click of depth. The job looks at a 400-row window of the queue each batch.
* **Low-value pages are never read and never count against the cap** — privacy / cookie / terms / legal, tag /
  category / author / date archives, `/page/N`, feeds, thank-you, returns / refunds. Recorded as skipped with reason
  `low_value` (new `SkipReason`).
* The standard inline crawl is unchanged: homepage + 12 sampled pages (`selectCrawlUrls`: one of each of service /
  location / about / contact first), 22 fetches, 35 s. Its insights are built from the HTML already fetched.

## What the script now does

* `MAX_SPOKEN_FINDINGS` 3 → **2** (Paul's brief: one or two hooks). The last spoken point ends with `FIX_TAIL`
  ("It's the sort of thing we'd fix as part of the work.") when it came from the site's own pages.
* The rep's screen has a collapsed **"How do we know?"** under the found lines: the signal, the headings read, the
  page addresses, and what Findable would do (`script.found.sources`, never said aloud).
* **A strong site is a result.** `state: strong_site` → script says the positive line; never an invented fault:
  * few service pages → `SERVICE_PAGES_OPPORTUNITY_LINE` (adapted with the prospect's own service names when ≥ 2 are known):
    "Your site's actually in decent shape. What we'd mainly do is build stronger dedicated pages around each of your
    services, so Google and AI systems have a much clearer understanding of everything you offer and where you offer it."
  * dedicated but light service pages (< `LIGHT_SERVICE_WORDS`) → "make those pages more detailed" (never "build them");
  * otherwise `STRONG_SITE_LINE`: "Your website's in good shape — I couldn't find anything wrong with it that I'd call
    out. So the work for you isn't really the site; it's the wider information about you that Google and AI systems
    read around the web, and keeping an eye on how you show up."
  * A crawl stored before insights existed keeps the old honest line (`NO_STRONG_ISSUE_LINE`).
  * ⛔ "Add more proof" was an opportunity once and was removed: a reviews widget is invisible to a crawl.
* The detailed audit dialog shows **"What to raise on the call"** (the same insights) and `callPoint` prefers a HIGH
  technical finding, then the strongest insight, then "Site is technically solid; main opportunity is …".
* Warm-lead research (`crawlFindings`) reads the same insights, so the voice note and WhatsApp reply say the same
  thing about a site as the call script.

## Behaviour changes worth knowing

* The legacy **thin-page signal now counts service, area and home pages only** (`crawl-check`, `crawl-job`): a short
  contact / about / legal / gallery page is normal and "your service pages are light on detail" said about one was
  false. This reduces `signals.thinPages` for new crawls everywhere it is read (report, WhatsApp `{{6}}`, script).
* `fullCrawl.decode` now decodes `&#x27;`-style hex entities.

## Tests

`scripts/sales-insights.test.ts` (61 checks: every kind, strong-site, capped, ranking, inline path, research, code
boundaries) and sections 21–25 of `scripts/prospect-full-crawl-audit.test.ts` (real crawl engine → stored insights →
playbook → script: limits and junk, a specific finding with its evidence reaching the script, strong site, fallback
line, technical + content merge, old row without insights). `call-script.test.ts` updated for 2 points.

## Not touched

The formal paid AI baseline (`audit-baseline.ts`, 20-question set, measurement tables), `whatsapp-status`, any
WhatsApp template body, `siteFindings.buildSiteFindings` (the Meta `{{6}}` text) beyond the narrower thin signal.

## Still limiting vs a strong manual review

Pages that build their text in the browser; a reviews / phone widget loaded by script; photos with text; whether the
services named are the ones the business really wants to sell (off-trade template leftovers — Ronnie's shoe-repair
site carries a dentist's service pages — are not detected as off-trade); depth beyond 60 pages on a big site; no
page-speed or rendering check; "is this page actually good" is judged only by presence, never by quality.
