# Room to improve the website — the site score

## v3 (2026-10-30, feat/site-score-column) — current: v2's weights + the severity cap

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
