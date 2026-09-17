# Crawl check — faults + site info (§ crawl-check)

The free crawlability check (`crawl-check` edge fn, fetches only, £0 — never the Apify SEO scanner)
run before messaging a prospect. One fetch pass, two separate outputs, one stored row.

## When it runs
- **Automatically at audit finalisation** (`process-ai-audit-queue`, 2026-09-17) — every audit that
  finalises crawls its lead's site (complete/capped/failed), so every audited lead is covered without
  the operator pressing anything. Deduped on the 30d/v2 freshness gate, so a 3-run baseline crawls
  once and an already-current lead is left alone; skips market/no-lead audits and no-website leads.
  Internal auth (CRON_SECRET + x-internal-job); fail-safe, never touches the audit.
- **The Crawl-site button** (Inbox header / Outreach row) — on demand, and "Run again" in the popup.
- **Lazily on report open** (`render-audit-report`) — re-populates a stale/missing crawl when a
  report is viewed.

## The two outputs, kept strictly apart
- **AI-visibility faults** — `CrawlSignals` → `buildFaultLines` (`src/lib/crawlCheck.ts`). THIS is what
  the report's "what's stopping AI reading your site" section renders and what gates
  `audit_followup_fault` (its {{6}} is `mainSiteFault`). The Crawl-site button's dot reflects ONLY
  this.
- **Site info** — `extractSiteInfo` (`src/lib/siteInfo.ts`), everything else useful in the SAME HTML,
  for the operator to read before a conversation: who built it (credit + platform + footer agency
  link, even with no words), directories (Yell first, + Checkatrade/TrustATrader/Which?/Trustpilot/
  MyBuilder/RatedPeople/Bark), email, phone, address, opening hours, company number, socials,
  services (nav + page titles), towns (the location-page cluster), staleness (copyright year, latest
  JSON-LD date).

⛔ **They never leak into each other.** Site info being present never changes the button or the
template; the faults never appear in the info section. ⛔ **Only what was actually found — no
inference.** A field with no clear signal is null and shows as missing (proven on real HTML: aspect.
co.uk found email/phone/WordPress/socials/services but correctly left address/company-number/
directories missing; a 403 block page yields nothing).

## Storage — `lead_crawl_checks`, one row per lead (upsert on lead_id)
`result = { version, siteInfoVersion, url, town, signals, verdict, siteInfo }`. **`siteInfo` is a
separate key from `signals`.** ⛔ **`CRAWL_CHECK_VERSION` is NOT bumped for site info** — bumping it
blanks the report's fault section and the `audit_followup_fault` gate for every lead until re-crawled
(Paul, 2026-09-17). Site info has its own `SITE_INFO_VERSION` so the popup can tell a pre-site-info
row ("run again to read it") from a clean one.

## The UI — one `CrawlCheckButton`, two placements
Inbox thread header + Outreach table row. Not run → runs it; already run → opens the popup on the
stored result (no re-run; "Run again" is inside); no website → disabled with a tooltip. The dot flags
an AI-visibility fault via `crawlResultFaults` (the shared fresh+v2 gate, so button, report and
template agree). Per-lead state from the same `lead_crawl_checks` rows: `useInbox.crawlByLeadId` and
`useLeadCrawls` (Outreach). `CrawlCheckUrlButton` (paste-a-URL, no storage) is unchanged.

Tests: `scripts/site-info.test.ts` (found/missing rules, the footer-link tell, clean-page invents
nothing). Deployed 2026-09-17: `crawl-check`. `crawlResultFaults` is additive and unused edge-side,
so `crawlCheck.ts`'s other reachers keep their bundle behaviourally unchanged.
