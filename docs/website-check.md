# One website check (2026-10-15, feat/send-error-capture)

## What was there before (the inspection)

Ten paths fetched or judged a website. Five of them showed "website findings", and each used its own rules over its own copy of the crawl:

| Path | Fetch | What it judged | Read by |
|---|---|---|---|
| `crawl-check` standard (audit finalise, report populate, sales pre-call check) | 4 crawler probes + robots + ≤4 sitemaps + ≤12 pages | signals, siteInfo, insights, contentTrust, evidence | `lead_crawl_checks` row AND a copy on `ai_audit_runs.results.crawl_check` |
| `crawl-check` full → `crawl-worker` (every Crawl-site press, intake) | ≤60 priority pages (prospect) / exhaustive (client) | the grouped `siteAudit` + all of the above | `lead_crawl_checks` (`full_evidence.audit`) |
| Inbox crawl icon + popup | (reads) | `buildFaultLines(signals)` — 6 signal kinds only | the lead row, no freshness gate |
| Call script / call card / Inbox "Website issues found" | (reads) | 3 pools merged: legacy siteFindings, sales insights, content & trust | the AUDIT RUN's copy first, then the lead row, 30-day gate |
| Client report | (reads) | `buildFaultLines` + evidence tiers A/B + content issues | the run's copy first, then the lead row |
| `run-seo-scan` (Apify, baseline only), `agency-check`, `_shared/site-research.ts` (warm reply / voice note), `prospect-preview`, `scan-site-details` | own fetches | own purposes | own tables |

**Why they disagreed:**
- The Inbox icon judged only 6 signals and never read robots.txt rules, evidence, insights or content & trust. A site whose robots.txt blocks an AI crawler read "No AI-visibility faults found" in the Inbox and "robots.txt asks OAI-SearchBot not to read the site" on the call.
- The call script read an audit run's older 12-page copy before the lead's newer crawl.
- A "clean" call script still said "it isn't really set up to be found by AI", which sounds like an issue.

## What it is now

- **ONE stored result per lead**: `lead_crawl_checks`. Both crawls write a summary beside the result, `result.websiteCheck` (`src/lib/websiteCheck.ts` `summariseWebsiteCheck`). It is built from the ONE grouped audit (`siteAudit.auditFromStoredCrawl`, content & trust merged), plus the deep-evidence findings and the sales insights, said once each.
- **ONE reader**: `websiteCheckFor(row, { website })` → state, serious issues (high / medium), minor points, ONE headline, and the coverage line ("Checked 15 Oct · 42 pages read (deep check)"). It is read by:
  - the Inbox icon and popup (`CrawlCheckButton`);
  - the call script, call card and Inbox hook card (`coldCallPlaybook.selectFindings`);
  - the report (`render-audit-report`, which replaces its three older picks);
  - the lead's audit (`prospectAuditView`).
  A row without a summary is summarised the same way on read; existing rows were backfilled.
- **Deep for every prospect**: an automated quick check of a prospect's site (audit finalise, sales check, report populate) queues the deep crawl behind itself (`requested_from = 'automatic'`, `PROSPECT_CRAWL_PAGE_CAP` pages, important pages first). It is not queued for a paying client, while one already runs, or above `AUTO_DEEP_MAX_RUNNING`. It is not kicked: the minute cron takes these jobs one after another.
- **New checks** (`siteAudit.ts`): page speed (our download time per page, judged on 3+ timed pages, "not a full browser test"); no contact route (no phone, email or enquiry form anywhere read → HIGH); enquiry form found (strength). A quick check's thin homepage is said as the homepage.
- **Coverage against the AI Visibility Master Standard**: HTTPS / redirects, robots.txt for OAI-SearchBot / Googlebot / Bingbot / PerplexityBot plus real crawler fetches, sitemap, canonicals, noindex (meta + header), broken links / 404, JS-only content, name / phone / town and conflicting facts, titles / meta descriptions / headings, near-duplicate pages, structured data vs visible content, image alt, mobile viewport, speed, contact route. **Never**: llms.txt, GPTBot.
- **Cost**: fetches only, no paid API. The Apify SEO scan stays baseline-only and the audit caps are unchanged. (The "$3/audit + $15/day" in the Outreach UI copy is wording: the code's limits are `CAP_USD = 1.0` per run and the `POOL_DAILY_CAP_USD` pools.)
- **Not changed**: the WhatsApp templates' own finding rules (`audit_followup_fault`'s `{{6}}`, `ai_site_findings_v2`). Those decide what is SENT and keep their narrower rule.

## The call script (Job 3)

`callScript.ts`: website issues are a LIST, one plain line each (`issueLine` → `plainIssueTitle`: no robots.txt / noindex / H1 words), with what it names (the services crammed onto one page). The strongest come first; `CALL_SCRIPT_ISSUE_LINES` (5) are shown and the rest, plus the minor points, are behind a tap. No serious issue gives ONE line, the check's headline. The client report uses the same plain lines.

## Tests

`scripts/website-check.test.ts` (plus the updated `call-script`, `cold-call-playbook`, `content-trust`, `inbox-website-issues` and `prospect-full-crawl-audit` suites).
