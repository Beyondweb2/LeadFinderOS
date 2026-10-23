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
  display only; send gates, the hook pick and 6/6 read method 1. **Guarantee (Paul, same day): a client whose BASELINE was created
  from `GOOGLE_AI_SCORED_SINCE` is judged with Google AI on BOTH sides** (`compareMeasurements` `scoringMethod`, read from the
  baseline audit's created_at by remeasure-results and both compare screens); the report / welcome pack baseline figure uses
  the same rule, so it IS the before side; the results email names Google AI only for those clients (method-1 wording is
  byte-identical). Older baselines: unchanged, with the with-Google-AI figure shown as extra information on the compare screens
  (`googleAiExtraFigure`, null for method 2). Tests: `scripts/guarantee-google-ai.test.ts`.

Learning Curve acceptance (live fetch, 19 Oct): found — generic Organization schema with no phone/address (minor), no FAQPage
(minor), name written two ways (site name/titles vs markup), 7 town-swapped area pages, 6 repeated FAQ pages, the indexable
/learning-curve-homepage-design/, the prices page with no H1 or description, link code ("a href=…/driving-lessons-in-birchington/")
visible on 7 area pages. Already fixed on the live site: the address is on the homepage and most area pages (only the
Canterbury page lacks it); "PassFirstTimeInKent" survives only inside a Facebook link, not as a written name.
Tests: `scripts/crawl-in-audit-callscreen.test.ts`.

## 2026-10-20 — the crawl always follows the audit (feat/crawl-always-callscreen)

- **The call screen's Website crawl section is never empty** (`src/lib/websiteCrawlShown.ts`): Checking / Done / Couldn't check the
  site / No website. A lead with an AI result and no check is shown as Checking (the screen starts it; if someone else started it the
  section re-reads every 15 s for up to 5 minutes, then says Couldn't check).
- **A failed check is retried once, ever** (`callScreenCrawl.ts`: `crawlRowFailed` + `retriedBefore`; crawl-check records
  `lead_activity.data.retry = true`). After that only a person's Run again / Try again starts one.
- **Backfill** (migration `20261110090000_audit_crawl_backfill.sql`): `audit_crawl_backfill_tick()` on cron `audit-crawl-backfill`, 3 leads a
  minute, open CRM leads with a completed non-market audit whose `ai_audits.website` is set and no `lead_crawl_checks` row; paused while 20
  deep jobs run; each lead once (`audit_crawl_backfill`); unschedules itself when nothing is left. Same internal call the audit makes. 861
  leads on 2026-10-20.
- **Politeness:** the quick check reads one page at a time (`QUICK_CHECK_CONCURRENCY`) and drops sample pages robots.txt's `User-agent: *`
  disallows; a prospect's deep job (page-capped) reads one page at a time (`PROSPECT_CRAWL_CONCURRENCY`); a client's exhaustive crawl keeps
  `FULL_CRAWL.concurrency`. No paid service anywhere in the closure.
- **New page readings** (`contentTrust.ts`): `coverage` (an areas list / areaServed / "we cover · serving · covering · work across <Place>"
  — a place named in a bio is not coverage) → `areas_not_stated` (medium; low when the town is already in a title / H1); `owner`
  ("owned / run / founded by X", "I'm X, the owner", "My name is X and I'm the founder") → `ContentTrust.owner` → `WebsiteCheckSummary.owner`,
  shown with its page. Older checks carry no owner field: nothing is shown.
- **The same pages counted once** (`websiteCheck.ts`): pages in `ct_placeholder_content` are taken out of thin / unlinked / near-duplicate /
  heading findings at summary time, and `placeholderPagesOnce` does the same for summaries stored before (they keep only 3 pages per issue).
- **Words:** `NO_WEBSITE_LINE` / `NO_WEBSITE_SPOKEN` (Paul's no-website line; never "harming"); a missing check is said as running.
- **Audit town** (`create-ai-audit`): `outreach_leads.search_location` (the Coverage area the lead was found under) replaces Google's
  postal town when the business is within the wrong-town guard (≤ 25 km, real coordinates both sides); a confirmed town still wins. Further
  than that Google's town stands — the searched town at any distance is the 2026-08 Wisbech fault. Existing audits untouched.
- **"Outside town"** (Find Leads) is not the same logic: it means "not returned by the town-rectangle search" (`search-leads`), never a
  distance check, and is not stored. No shared cause to fix.

## 2026-10-23 — three more rules (chore/loose-ends-and-site-checks)

All three are content & trust kinds (`contentTrust.ts`), so BOTH crawls make them and every reader (Inbox popup, call
script, report, pitch) gets them through the one summary. They apply to checks run from now on: a stored check has no
`claims` reading and no listing verdict, so it is never judged by them, and nothing was re-crawled.

- **Broken placeholder text** (`BROKEN_FILL_RE`): "Welcome, !", "Welcome back, !", `{{first_name}}`, "[Your Name]", "[Town]",
  "%FIRSTNAME%". Joins `placeholder_content` (HIGH), said first and quoted exactly. Not broken: a filled greeting, "Hi, I'm
  Dave.", an ellipsis, a page-template value that is not a name or place (`{{ item.price }}`).
- **The Google listing does not link to the site** (`listing_no_link`, MEDIUM; `src/lib/listingLink.ts`,
  `_shared/listing-website.ts`): Google's record is the `phone_cache` row for the lead's place id (no paid call). Judged only
  for a `details_version >= 2` row under `LISTING_RECORD_FRESH_DAYS` — every v1 row has website NULL (865 of 865 on
  2026-10-23) because it was never asked for. No website / a social or directory page → "doesn't link"; a different domain is
  followed once (plain fetch, 8 s) so an old domain forwarding here is fine; a link that cannot be followed is not judged.
  Live on 2026-10-23: of 1,288 checked leads with a v2 record, 0 had a listing with no site and 1 a different host — the rule
  mostly fires when a prospect sends a site their listing never had.
- **A rating or pass rate with no source** (`unsourced_claims`, MEDIUM): "rated 4.9/5", "4.8 out of 5", "4.9 stars",
  "5-star rated", "98% pass rate", "pass rate of 92%". Sourced = the same page names a review site / has a reviews widget
  (rating) or names the DVSA / gov.uk (pass rate). "5 star service" is a boast, not a claim.
- **Pitch words** (`pitchIssueWords.ts`): `GOOGLE_LISTING_NO_LINK` now lives there (replyMove re-exports it); the site-shared
  reply drops its own guessed listing line when the check read Google's record.
- Tests: `scripts/website-check-rules.test.ts`.
