# Room to improve the website — the site score

## v5 — V2 parity again (2026-11-26, fix/website-score-weights-v2-parity) — current

V2 main 98984e6 ("re-weighted by real impact", with Paul's approved changes) read and its BEHAVIOUR ported onto V1's own
findings (`siteScoreTierOf`, `siteScoreTitleOf`, `siteScoreMainNote`; no V2 code copied, crawl unchanged):

- Four levels. critical → 49; serious (`major`) → 63, two serious → 49; moderate → 68; minor holds nothing. Each further
  held problem takes 2 more off, never under 50 unless red. Only a site with MINOR problems left reaches Little to gain; its
  popover's first line reads "Small fix: …".
- `no_business_schema`: serious ("Does not say who the business is") only when no_contact_route / no_phone /
  no_contact_details is also verified; otherwise moderate, worded "Business details missing from the page code" (site score
  words only; the website check's own title is unchanged).
- `one_page_site` critical; `no_service_pages` / `services_on_one_page` critical on 1–2 pages read, else moderate. V1 has no
  "under five pages" finding and the score adds no finding of its own (one judge), so 3–4 page sites are held only when the
  check found a service-page problem.
- `noindex_pages` / `noindex_important_page`: serious when a named page's address is a service or contact page
  (`contact|get-in-touch|enquir|service`), else moderate. `noindex_home` critical.
- Moderate: name/address/phone mismatch (`schema_phone_mismatch`, `vs_name_inconsistent`; `ct_conflicting_facts` is trading
  years, not NAP, so minor), missing or repeated titles, homepage with no description or H1 (`missing_description`,
  `vs_key_page_basics` only when a homepage address is among its pages), broken links, inner pages not set up for phones,
  no sitemap on 10+ pages, thin pages. Serious: http not moved to https (medium), homepage not set up for phones, no contact
  details / very slow (graded high). Slow, long titles, broken markup: minor.
- Read-only before/after over the latest stored crawl per live lead (`scripts/_score-compare.ts`, not committed), 12,461
  live leads: Little to gain 551 → 217, Some gains 431 → 819, Big gains 304 → 250. Moves: 334 Little → Some, 56 Big → Some,
  2 Some → Big. What holds the Little → Some moves: business details missing from the page code 194 (86 on its own),
  repeated titles 108, homepage heading/description 118, thin key pages 44, hidden pages 32.
- **Shipped 2026-11-26** (Paul: "ship as is", shared titles moderate as V2). Merge `03a3c38d`; edge by hand, one at a time:
  `crawl-check` v71, `crawl-worker` v54 (`whatsapp-status` untouched, v138 from 30 Sep). Live SPA chunks hold
  `site-score-main-note` and the What's New entry. Backup first: every row's site_score* columns (1,894, all v4) in
  `C:/Users/paulj/LeadFinderOS-backups/site-score-v4-before-v5-2026-11-26.json` (outside the repo). Then
  `scripts/site-score-backfill.ts --cli --write` from stored crawls only: 1,894 of 1,894 written at v5 (read back: all v5).
  Live leads: 217 Little to gain, 819 Some gains, 250 Big gains (1,066 held by a cap), median 66 — the same as the dry run.
  Live check (read-only, the stored row through the pill's own code): BS4 Electrical 99 Little to gain, "Small fix: thin
  pages". It showed "Small fix: fAQs…" for Larkes Roofs; fixed the same day (an all-caps first word keeps its capitals).
  Nobody has SEEN the pill signed in: the browser pane was not signed in, and Claude does not sign in.

## v3 (2026-10-30, feat/site-score-column) — superseded: v2's weights + the severity cap

- **Severity cap** (`SITE_SCORE_SEVERE = 'high'`, `siteScore.ts`): a finding the website check GRADED high, that took points
  here (so the crawl verified it), caps the score at 59 — Big gains whatever the number. Keyed to the check's grade, not to
  a list of ids: the same id graded medium does not cap; a new HIGH id caps without touching the file. The structural cap
  (one page / no service pages) wins when both apply. `evidence.cap.kind` = `structure` | `severity`.
- HIGH findings on the live rows (2026-10-30, 1,054 scored live leads, 183 with one): `ct_placeholder_content` 83,
  `no_https` 52, `no_contact_route` 18, `canonical_off_site` 17, `schema_wrong_domain` 14, `noindex_home` 14,
  `ct_robots_blocks_ai` 7, `noindex_important_page` 6, `robots_blocks_oai-searchbot` 2. Placeholder quotes sampled: real
  ("Lorem ipsum", "Sample Page", "Double click to edit"). Weakest: `schema_wrong_domain` is sometimes the business's own
  second domain.
- **Line kept at 60 (Paul: "don't move it yet").** Counts over 1,054 scored live leads:

  | Big-gains line | v2 (no severity cap) big / some / little | v3 (severity cap) big / some / little |
  |---|---|---|
  | under 60 | 506 / 350 / 198 | **587 / 282 / 185** (live) |
  | under 65 | 527 / 329 / 198 | 598 / 271 / 185 |
  | under 70 | 579 / 277 / 198 | 632 / 237 / 185 |

- Calibration (v3, line 60): NS Elec 59 big (structure cap, 71), Tribeca 40 big, WSH 59 big (severity cap: placeholder
  text, 66), Great Ouse 99 little, Locksmith Rotherham 85 little, L J Rainford 80 little — all as Paul asked.

## v2 (2026-10-30, feat/site-score-v2) — superseded by v3 (same weights)

**Placement (2026-10-30, Paul chose B + Inbox 1):** Outreach has its own **Website** column before Actions (`SiteScoreBar`: number, band word, a bar the length of the number); the Inbox pill sits at the right of the status line (`ml-auto shrink-0`, never shrinks), the AI line holds the AI scores only. Supersedes the placement below.

Label: **"Room to improve the website"**, never a prediction of AI visibility. Team only. One pill (`SiteScorePill`) on the
Inbox's AI line right after Google AI, on the Outreach row, and in the lead detail (`LeadSiteScore`); hover = top reasons,
"Full breakdown" = every point lost with its page URL and quote (`SiteScoreBreakdown`, reads `site_score_evidence` for one lead).

- **Rubric** (`src/lib/siteScore.ts`, `SITE_SCORE_VERSION = 2`): 100 points — Reachable 20, Identity 15, Services 20, Content
  15, Structured data 10, Consistency 10, Basics 10 — split into 27 checks (`SITE_SCORE_CHECKS`), each mapping the one website
  check's issue ids. Each verified issue takes a share of its check (`SITE_SCORE_SEVERITY_SHARE`: high 1, medium 1, low 0.4);
  a check stops at zero. `one_page_site` / `no_service_pages` take the whole Services category.
- **Cap:** a one-page site, no service pages, or services crammed on one page (`SITE_SCORE_CAP_ISSUES`) is capped at 59 (big
  gains); the uncapped number is kept in the evidence.
- **Only verified:** a site-wide "not found" on a crawl that stopped at its page cap takes nothing (listed as not judged); a
  "not found" on a named page, or a missing sitemap / robots.txt, counts. Real OAI-SearchBot / Googlebot / PerplexityBot
  visits are not recorded (the crawl reads as one honest crawler) — only their robots.txt rules are judged.
- **Bands** (`SITE_SCORE_BAND_MIN`): under 60 Big gains, 60–79 Some gains, 80+ Little to gain.
- **States, never a number:** `profile_only` (social / directory URL), `js_only`, `robots_blocked` (robots_blocks_all),
  `unreachable`, `partial` (quick check only). From the lead, no row needed: No website, and a faint Not checked.
  `siteScoreViewFor(website, stored)` decides; the pill, the Outreach filter and the sort all read it (`siteScoreGroupOf`,
  `siteScoreSortKey`). v1's `unreadable` reads as Couldn't reach until re-scored.
- **Outreach:** Filters → "Room to improve the website" (one band or state); Sort → "Website: most room to improve". View only:
  nothing is skipped, sending is unchanged.
- **Storage** (migration `20261130150000_site_score_v2.sql`): `site_score_evidence` (losses with url + quote, cap, not judged —
  never in the list select), `site_score_v1` (the v1 score kept as it was), the state check widened.
- ⛔ **Found 2026-10-30: the admin could not read `lead_crawl_checks` at all** (RLS on, only `sales_select_crawl_checks`; tested
  as the admin: 0 of 1,615 rows) — so no score, ring or crawl icon from that table ever reached the admin. Added
  `admin_select_crawl_checks` (select, `my_role() = 'admin'`). Also the table was not in `supabase_realtime`, so the Inbox's
  crawl listener never fired; now published. L J Rainford (stored 69, no pill) was both.
- **NS Elec:** `nselec.co.uk` answers 302 → `home.nselec.co.uk`; the crawl follows it and reads that page, which is a genuine
  one-page site (every menu link is a `#` anchor). The crawl already treats the redirect target as the site; correct.
- **Calibration** (stored crawls, 2026-10-30): NS Elec 59 big (capped from 71), Tribeca 40 big, WSH 66 **some** (no weighting
  tried put it under 60 without pushing most sites there), Great Ouse 99 little, Locksmith Rotherham 85 little, L J Rainford 80.

## v1 (2026-10-23, feat/site-score) — superseded, numbers kept in `site_score_v1`

A number out of 100 for each lead's website on the Outreach row (ring) and the Inbox row (number pill), so the team does not
have to open each site. Paul chose the look on `design/site-score-concepts` (B ring on Outreach, A pill on Inbox) and
"model out" for v1. **Team only: never shown to a prospect or client, never sent.**

## Rules

- **One judge.** The score weighs the ONE website check (`result.websiteCheck`, `websiteCheck.ts`). It adds no rule of its
  own about the site; it maps each issue id the check makes to an area (`SITE_SCORE_ISSUE_AREA`).
- **Rubric v1** (`src/lib/siteScore.ts`, `SITE_SCORE_VERSION = 1`): 90 points over nine areas (services 15, town and
  areas 12, answers 8, contact 12, proof and trust 12, titles and headings 8, page-code business details 6, can be found
  and read 10, phones and speed 7). Each issue takes a share of its area by severity (high 60%, medium 35%, low 12%; "no way
  to contact" and "one-page site" take the whole area); an area never goes below zero. Shown rescaled to 100. Bands: 75+
  Strong (green), 50–74 Fair (amber), under 50 Weak (red).
- **Same site, same number:** pure arithmetic on the stored check, issues taken in id order, no clock, no model.
- **States, never a zero:** `scored`; `unreadable` (the site did not answer, the homepage builds its text in the browser
  = `client_rendered`, or no page was read); `partial` (only a quick check). No website → nothing drawn. No row → Outreach
  shows a faint "–", Inbox nothing.
- **Only a deep check gets a number.** On the live rows the quick check scored a median 99 (it judges few things; before
  2026-10-11 only technical signals) against 69 for deep checks. A prospect's quick check queues the deep one, which then
  writes the number.
- **Reasons:** the three biggest losses (with points out of 100) and one strength from an area that lost nothing.
- Not judged in v1 (not recorded by the crawl): tap-to-call / WhatsApp links, review counts, a real mobile speed test.

## Storage

Migration `20261125090000_site_score.sql` (additive): `lead_crawl_checks.site_score` (0–100, NULL unless scored),
`site_score_state`, `site_score_version`, `site_score_reasons`, `site_score_detail` (basis, pages read, checked at, points per
area, raw), `site_score_at`. Two checks: state is one of the three; a number only with `scored`.

Writers: `crawl-check` (quick) and `_shared/crawl-job.ts` (deep) spread `siteScoreColumns(...)` into the same upsert as the
result they scored. The failed-attempt note never touches the score (the last good check keeps it). Readers: the lists'
`LEAD_CRAWL_LIST_SELECT` (the small columns, never `result`) → `CrawlRow.siteScore` → `SiteScoreRing` (Outreach) and
`SiteScorePill` (Inbox). Sales read the same rows through `sales_select_crawl_checks`.

Backfill: `scripts/site-score-backfill.ts --token-file <path> [--write]` scores rows with no score from the stored
summary only (no crawl, no fetch); writes only where `site_score_version is null`, so a newer crawl is never overwritten.
`--rescore-unverified` (2026-10-28, fix/crawl-one-standard) re-scores rows that already HAVE a score but whose stored check
came from the old impostor crawl (readableAs null, a "blocked" list without `blockEvidence: 'robots'`, or the old
`search_crawler_refused` issue), read the way the app reads them now; writes only where `site_score_at` is unchanged since
the read. Dry run 2026-10-28: 234 rows matched, 38 would change (32 scored → re-scored, 6 partial → unreadable). Not run
with `--write` until Paul says.

## Tests

`scripts/site-score.test.ts` (rubric, states, repeatability, every live issue id mapped, both writers, the team-only
import fence, migration additive); `scripts/lighter-outreach-inbox.test.ts` (the list select).

## Deployed 2026-10-23

- Pre-check: no other session mid-deploy (the report-v3 session's last function deploy 10:41 UTC, its record committed); no
  worktree with an uncommitted migration.
- Migration applied 10:48 UTC by the Management API; read back: six nullable columns, two checks, 1,420 rows untouched.
- Merge `b3b50d34` into main (one What's New conflict, both entries kept). Typecheck = baseline 9, build passed; the full
  gate before it: 454/455, the one red suite (`coverage-found-added`, Find Leads "Found") fails on main without this change.
- Edge, by hand from main: `crawl-check` v52, `crawl-worker` v36 (the whole closure of `siteScore.ts` and `crawl-job.ts`);
  both bodies hold `siteScoreColumns`. `whatsapp-status` untouched.
- Backfill from stored checks only (no crawl, no fetch): 1,420 written — 903 scored (median 69, p10 55, p90 81; 257 strong,
  605 fair, 41 weak), 311 partial (quick check only), 206 unreadable (73 no page read, 40 browser-built homepage, the rest
  did not answer / bad domain / certificate). 0 rows with a number outside 'scored'.
- Live: app.leadfinderos.com's shared chunk holds the list select and both grey states; the What's New entry is live. The
  app's exact list query over REST (HTTP 200) returns St.Annes Key Centre `unreadable` (no number, "did not respond in time")
  and Patience Plus Driving School `scored` 65 with its reasons. Nobody has SEEN the rows signed in: the browser pane was
  not signed in, and Claude does not sign in.
- 311 quick-only leads get a number only when their deep check runs (Crawl site); none was started.

## v4 — V2 parity (2026-11-24, fix/audit-category-and-scoring)

V2 main's website rating (`packages/core/src/websiteScan/checks.ts`, `apps/web/src/components/first60/model.ts`) was read
and its BEHAVIOUR ported onto V1's own crawl findings (no V2 code copied; V1's crawl and checks are unchanged):

- Bands 70+ Little to gain (green), 50-69 Some gains (amber), under 50 Big gains (red). Applied at display to every number.
- Severity share high 1 / medium 0.6 / low 0.3 (was 1 / 1 / 0.4).
- Tier caps (`siteScoreTierOf`): a critical finding, or two major ones, hold the score at 49; one major at 69.
  Critical = no HTTPS, AI search blocked, homepage noindex, one-page site / no real service pages, any other HIGH finding.
  Major = broken links, not set up for phones, no sitemap on 10+ pages read, and (HIGH only) no contact details, very slow,
  no homepage title / main heading. Replaces the v2/v3 59 caps.
- A site our scanner could not read is grey "We couldn't scan this one" with a fixed line that says nothing about the site
  (a block, a timeout and a server error look the same from our side). Only a DNS failure says "Website address doesn't
  exist" (view-only state `no_address`; stored as `unreachable`, so no migration).
- Opportunity score: "already strong site" now starts at 70 (the Little to gain line).
- Every stored check re-scored from its stored crawl with `scripts/site-score-backfill.ts` (no crawls, no spend).
- Backfill run 2026-11-24 (`--cli`, the logged-in Supabase CLI, no token): 1,874 of 1,874 rows written at v4. Live leads:
  545 Little to gain, 425 Some gains, 298 Big gains (723 held by a cap), 172 "We couldn't scan this one", 37 "Website
  address doesn't exist", 57 JavaScript-only, 4 robots-blocked, 297 quick check only; median 69.
