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

## Only real issues (found by the 5-site proof, same day)

- **A broken page is a 404 / 410 / 5xx** (`contentTrust.isBrokenPageStatus`). On the proof run, two sites answered 13 pages with 429 (rate-limited) or 403 to our crawl. Those are the site refusing OUR crawler, not a broken page for a customer: they are said as "not judged", never as broken. Older stored audits are corrected when summarised (`trueBrokenOnly`).
- **Said once:** a content & trust check that repeats an audit finding (no HTTPS, broken pages, viewport, sitemap, robots) keeps only the stronger (`SAME_ISSUE`). "Some services have no page of their own" replaces the vaguer "No dedicated service pages found".

## The call script (Job 3)

`callScript.ts`: website issues are a LIST, one plain line each (`issueLine` → `plainIssueTitle`: no robots.txt / noindex / H1 words), with what it names (the services crammed onto one page). The strongest come first; `CALL_SCRIPT_ISSUE_LINES` (5) are shown and the rest, plus the minor points, are behind a tap. No serious issue gives ONE line, the check's headline. The client report uses the same plain lines.

## Tests

`scripts/website-check.test.ts` (plus the updated `call-script`, `cold-call-playbook`, `content-trust`, `inbox-website-issues` and `prospect-full-crawl-audit` suites).

## 2026-10-19 — the crawl in the call screen, the page checks, the voice note, Google AI scored (feat/crawl-in-audit-callscreen)

**Why Lambert Design & Build showed "Website not checked yet":** the audit's own crawl DID run (process-ai-audit-queue, at
finalisation). Its AI result landed 02:56:19 UTC and the crawl was stored 02:57:24; the call screen opened in that minute,
said "not checked" instead of "checking", and stopped re-reading once the AI result was in, so the crawl never appeared.

- **Checking state:** a finished audit run with no crawl result yet, under `AUDIT_CRAWL_PENDING_MS`, is "Checking the
  website…" (`useColdCallPlaybook.auditCrawlPending`); the playbook re-reads every `WEBSITE_CHECK_RECHECK_MS` while it is.
- **Call screen start (`src/lib/callScreenCrawl.ts`, fn crawl-check `requested_from: 'call_screen'`):** only when the check is
  MISSING (website + completed audit + no `lead_crawl_checks` row), nothing running, no call-screen start for that lead in
  the cooldown (recorded as a `lead_activity` `crawl_run` row, source `call_screen`), and under the per-person limit. Quick
  check; the deep check queues behind it as for an audit. Fetches only — no paid service. No backfill.
- **Website crawl section** (`WebsiteCrawlSection.tsx`) under the AI result: serious issues as plain titles (max 5), evidence
  on a tap, "Checked <day>", "Press Run again before the call" over 14 days, "Checking the website..." while running, a
  failed check says so. Run again = the same full crawl as every Crawl-site button.
- **Script:** ≥2 serious issues → `ISSUES_FOUND_MANY_LINE`, 1 → `ISSUES_FOUND_ONE_LINE`; none → no "why" line, nothing about
  the site, no checklist; not checked → `NOT_CHECKED_NOTE` (the old "No usable website check" line is gone).
- **Start at the homepage (`crawlUrl.crawlStartUrl`):** a lead's saved website is often a deep page (605 leads); the crawl read
  it AS the homepage — Learning Curve's "homepage heading" was the Canterbury page's. Path-hosted sites keep their path.
  Also fixed: `vague_headings` called "Driving Lessons in Canterbury" vague because the business name held the same words.
- **The page checks (`src/lib/visibilityChecks.ts`)** run in BOTH crawls (quick: the pages it fetched; deep: up to
  `VISIBILITY_MAX_PAGES`, merged into the stored audit). Each finding quotes the page and what was read. Schema checks
  are LOW (CLAUDE.md §5). The address check reads `d.postcodes` (the whole page, new digest field); older pages are judged
  only when their kept text was not cut. A town-swap / FAQ repeat compares text with the shared header/footer removed and
  the differing address words stripped.
- **Voice note (`src/lib/voiceNoteFromCall.ts`):** built from the call script's playbook, shown at once, no model call. Keeps
  the voice note's rules: says who is speaking, no report / audit offer, an earlier message only as a note to the recorder.
  fn `voice-note-script` stays deployed, no longer called by the panel.
- **Google AI (`aiOverview.ts`):** renamed (display only; Meta templates and agreement wording untouched). Scoring is
  VERSIONED and DERIVED (`scoringMethodFor(audit.created_at)` vs `GOOGLE_AI_SCORED_SINCE`, no stored row rewritten): method 2
  adds Google AI where Google showed an answer (none shown = left out, grey "No AI answer shown"). It is `HookScore.scored` —
  display only; send gates, the hook pick and 6/6 read method 1. Full baseline / measurement reports and the guarantee
  comparison are UNCHANGED (method 1); compare screens show the with-Google-AI figure as extra information
  (`googleAiExtraFigure`). Whether a future client's guarantee counts Google AI is Paul's decision.

Learning Curve acceptance (live fetch, 19 Oct): found — generic Organization schema with no phone/address (minor), no FAQPage
(minor), name written two ways (site name/titles vs markup), 7 town-swapped area pages, 6 repeated FAQ pages, the indexable
/learning-curve-homepage-design/, the prices page with no H1 or description, link code ("a href=…/driving-lessons-in-birchington/")
visible on 7 area pages. Already fixed on the live site: the address is on the homepage and most area pages (only the
Canterbury page lacks it); "PassFirstTimeInKent" survives only inside a Facebook link, not as a written name.
Tests: `scripts/crawl-in-audit-callscreen.test.ts`.
