# Site score (2026-10-23, feat/site-score)

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
