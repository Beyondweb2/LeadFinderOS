# Website score (0–100) on Outreach and Inbox rows — recon, rubric, mockups

Branch `design/site-score-concepts`. Concept only: nothing built, not merged, not deployed. For Paul and the team; never shown to prospects, never in a message, report or template.

## 1. What already exists (read-only recon, 2026-10-23)

- **No website score or rating exists.** The only grades near it are not site scores:
  - `ai_audit_runs.results_seo_grade` = a LETTER grade from the Apify SEO scan, baseline audits only (migration `20260927130000`). Not used for prospects' rows. Untouched.
  - The Hook score = AI-visibility (ChatGPT / Gemini / Google AI naming the business). Different thing. Untouched.
- **What the crawl records** (`lead_crawl_checks`, ONE row per lead; `result` jsonb, `result_slim` for lists):
  - `signals`, `siteInfo`, `verdict`, `homeFetch`, and the per-page digest (`PageDigest`, `fullCrawl.ts`): status, title, description, canonical, noindex, H1/H2/H3, word count, internal links, schema types, invalid JSON-LD, viewport, download ms, HTML bytes, enquiry form, postcodes.
  - `contentTrust` (`contentTrust.ts`): vague headings, no reviews / case studies, unnamed accreditation, owner named, areas not stated, placeholder text, unsourced ratings, markup vs page (phone, postcode, name).
  - `visibility` (`visibilityChecks.ts`): town-swapped pages, repeated FAQ pages, address checks, schema.
  - `result.websiteCheck` (`websiteCheck.ts`): ONE summary: depth (`deep`/`quick`/`failed`), pages read, issues with severity, strengths, `notChecked`, failure. State is already `no_website | profile | not_checked | unreadable | issues | clean` — the score reuses these states.
  - Not recorded: tap-to-call / WhatsApp link presence as its own fact (phone is checked as "phone linked as email" and name/phone vs markup; a `tel:` / `wa.me` count needs one new field), review count, a mobile speed test (only OUR download time per page).
- **List rows read `result_slim`** (via `useLeadCrawls`), which has dropped `contentTrust`, `insights`, `visibility`, `siteInfo` and the page list. A score cannot be computed in the browser from the list data: it has to be computed server-side and stored small.
- **Models used on websites today:** the crawl itself uses **no model** ("fetches only, no paid API", `docs/website-check.md`; crawl-worker header). Models appear only in `scan-site-details` (gpt-4o-mini, temperature 0, services/details extraction, ~$0.0008 a scan) and warm-lead research (`RESEARCH_MODEL = 'gpt-4o-mini'`). The audit questions are also gpt-4o-mini.
- **Cost per lead today:** crawl = £0 paid (edge compute inside the plan; quick check ≤12 pages, prospect deep ≤`PROSPECT_CRAWL_PAGE_CAP` = 60, one page at a time). Model-based site reading ≈ $0.0008.
- ~1,340 stored crawl rows on 2026-10-22; 861 more leads were queued by the audit-crawl backfill.

## 2. Rubric v1 (`SITE_SCORE_VERSION = 1`)

Plain wording only. The Master Standard is the source of the checks (class A/B/C per `CONTENT_TRUST_KINDS`) but its name and wording never appear in the score, the popover or the reasons.

**90 points from checkable facts (pure code over the stored crawl, no model):**

| Area | Pts | Facts read |
|---|---|---|
| Services | 15 | a page of its own per service the business lists; services crammed on one page; thin service pages |
| Local / town | 12 | town in title and H1 of the home page; area pages exist and are not town-swapped copies; areas stated; address or postcode on the page |
| Answers (FAQ) | 8 | question-style headings / FAQ section present, not repeated copy; FAQPage markup (small) |
| Contact | 12 | phone on page; tap-to-call link; WhatsApp link; enquiry form; any contact route |
| Trust / proof | 12 | reviews or testimonials; named accreditation; owner named; no unsourced rating / pass-rate claims |
| Titles and headings | 8 | unique titles and descriptions, one H1, not vague |
| Structured data | 6 | valid LocalBusiness-type markup that matches the page |
| Reachable | 10 | HTTPS, not blocked to search crawlers, sitemap, no accidental noindex, no broken pages |
| Mobile and speed | 7 | viewport tag; median download time (our fetch time, said as such, not a browser test) |

**10 points from a cheap model, three fixed questions on ≤3 pages** (home, one service page, contact/about):
clarity — can a stranger tell what the business does and where, in 10 seconds (0–5); services explained — does it say what each service is and who it is for (0–5). Each answer = an integer from an anchored scale (0 none / 1 weak / 2 ok / 3 clear, mapped to fixed points) plus a ≤15-word reason. The reason text is shown only in the popover.

**Bands:** 75–100 green (Strong), 50–74 amber (Fair), 0–49 red (Weak). Labels and cut-offs are display-only, in one file.

**Same site, same number — how:**
1. The fact part is a pure function of the stored crawl row: no clock, no randomness, fixed weights, integer maths. Same row → same points, tested by running it twice and over fixtures.
2. The model part runs at temperature 0, fixed prompt text (versioned), fixed truncated input, integer-only tool output, and is keyed by a hash of the exact input text (`contentHash` exists). Same text → read the stored answer, never ask again. It is only re-asked when the site text changes or the rubric version changes.
3. A new crawl of an unchanged site gives the same hash and so the same score. Differences come only from the site actually changing.
4. `rubric_version` is stored with every score. A new version never silently rewrites old numbers: the list shows the stored number with its version, and a re-score is a deliberate batch.

**States (never a zero for "couldn't read"):**
- `scored`
- `unreadable` — JS-only / client-rendered shell (`clientRendered`), site refuses our crawler (403 / 429 as `homeFetch`), fewer than a floor of readable words, fetch failed. Grey "Can't read site". Popover says why and "this is not a low score".
- `not_checked` — no crawl yet. `no_website`, `profile` (social page only) as `websiteCheck` already says.
- `partial` — fact items that could not be judged (absence checks on a 12-page quick check, old rows missing newer fields) are taken out of the total and the score is shown over what was judged; if under 70% of the weight could be judged, no number: shown as "Not enough read". Quick-check scores carry a small "quick" tag.
- Model failed: fact score only, rescaled 90→100, marked provisional until the model part lands (the number changes once, then stays).
- Stale: older than `WEBSITE_CHECK_FRESH_MS` (30 days) shown dimmed with its date; never auto-re-crawled for the score alone.

## 3. Mockups

`mockups.html` (open with `#A`, `#B` or `#C`) and `variant-A.png`, `variant-B.png`, `variant-C.png`. Each shows Outreach row + Inbox row, desktop and phone, all bands, can't-read and not-checked, and the hover list (open on K. Morgan).
- **A Number pill** — quietest, reads like the status pills, 82/100.
- **B Ring** — fastest to scan down a long list, still small on phone.
- **C Number + bar** — best for comparing rows; widest; on phone drop the bar and show the number only.

Recommendation: **A** in Inbox (space is tight, one more pill is calm) and **B or A** in Outreach; if only one, A. On a phone there is no hover: tap opens the same reasons as a small sheet.

## 4. Cost per lead

- Fact score: £0 (arithmetic on data already stored).
- Model part: gpt-4o-mini at $0.15 / $0.60 per M tokens, ≈ 4k tokens in (3 pages trimmed) + ≈ 300 out ≈ **$0.0008 (~0.06p) per lead**. About **$1** for all ~1,340 existing leads; ≈ $0.80 per 1,000 new leads. No Apify, no extra crawl.
- Hash cache means a re-crawl of an unchanged site costs nothing.
- Must go through the existing spend accounting (`logOpenAiUsage`, an audit-style pool, not a shared cap) and count as a system action, not a person's, so no per-person guard is needed; add it to the abuse/cost sweep list anyway.

## 5. What a build needs

**One migration (additive, nullable columns on `lead_crawl_checks`, plain columns, `lock_timeout`, no generated column):**
`site_score smallint`, `site_score_state text`, `site_score_version smallint`, `site_score_reasons jsonb` (top 3, tiny), `site_score_at timestamptz`, `site_score_judge jsonb` (model answers + reasons), `site_score_judge_hash text`. Batched backfill of the facts part from stored rows (no re-crawl), then the model part as a throttled batch.

**Code:**
- `src/lib/siteScore.ts` — pure rubric (relative imports with `.ts`: reachable from edge). Constants named (`SITE_SCORE_VERSION`, weights, bands), a test that weights sum to 100 and that the score exists only once.
- Compute at crawl finalise in `crawl-check` and the crawl-job finaliser (`_shared/crawl-job.ts`), so every crawl path writes it. Redeploy list = `check-import-graph --reached-by src/lib/siteScore.ts` (expected: `crawl-check`, `crawl-worker`, plus anything reaching `crawl-job.ts`); not `whatsapp-status`.
- Model judging: a small step after the crawl, or a new function (then a `config.toml` `verify_jwt` entry in the same commit, internal CRON_SECRET only).
- New page-digest fields for `tel:` and WhatsApp links and a review-count signal (crawl change; only affects crawls after deploy; older rows show those items as not judged).
- List read: add the small columns to the `useLeadCrawls` select (not `result`); `OUTREACH_LIST_COLUMNS` unchanged (the score is on the crawl row, not `outreach_leads`).
- UI: a `SiteScoreBadge` used by `OutreachTable` and `Inbox` beside `CrawlCheckButton`; the popover reads the stored reasons.
- Access: check the crawl read policy for Sales (the team should see it; Sales never reads `outreach_leads`). Verify before build.
- Safety tests: no sender, template, report or client-facing renderer imports `siteScore` (an import-walk test, like the Master Standard wording fence); `client-copy-claims` unaffected; new operator surface listed in `OPERATOR_SCREENS`.
- Tier: **full gate** only because of the migration; no sending/auth/tenancy code touched.

## 6. Open points for Paul

1. Pick a variant (A / B / C), or mix by screen.
2. Should the model part be 10 points or left out of v1 (then facts-only, 100% deterministic, and cost is £0)?
3. Include a real mobile speed test (Google PageSpeed API, free tier) later, or keep "our download time" only?

## 7. Decision (Paul, 2026-10-23)

Outreach = variant B (ring). Inbox = variant A (number pill). Model part (10 points) in or out for v1: not yet answered. Build not yet started.
