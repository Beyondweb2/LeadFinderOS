# Lighter Outreach + Inbox (2026-10-22)

Fixes 1 and 2 of `C:\Users\paulj\Documents\Findable\perf-audit-2026-10-22.md`. Same screens, same behaviour, less downloaded.

## 1. The lists read a website-check SUMMARY

- New column `lead_crawl_checks.result_slim` (migration `20261121090000_lead_crawl_result_slim.sql`), kept by trigger
  `trg_lead_crawl_checks_slim` on every insert / update of `result`, from SQL fn `lead_crawl_result_slim(result)`.
  Additive: `result` is untouched; the old app kept working. A summary error never fails a crawl write (the row is
  copied whole).
- What it keeps: everything the icon (`websiteCheckFor`) and the Inbox template gates (`resolveSiteFault`,
  `hasSiteFindings`) read. What it drops: `contentTrust`, `insights`, `visibility`, `siteInfo`, `verdict`,
  `homeFetch`, `job_id`, `signals.checkedPages`, `websiteCheck.strengths / notChecked / owner` (emptied) and each
  issue's words (`title`, `saw`, `meaning`, `examples`). A row whose `websiteCheck` is not version 1 with an issues
  array is copied whole.
- Proved on the live data: all 1,339 rows give identical icon state, tooltip, coverage line, serious / minor issue
  ids and both template gates (with and without a website, with and without a visibility gap) from the summary as
  from the full result.
- Readers: `useLeadCrawls` (`LEAD_CRAWL_LIST_SELECT = 'lead_id, result:result_slim, created_at'`) — now the ONE list
  read for Outreach AND the Inbox (the Inbox's own `lead_crawl_checks` read is gone). ⛔ Anything that SHOWS the check
  reads the full row: the crawl popup opens through `useLeadCrawl(lead.id)` before seeding; the lead popup already did.
- A finished crawl invalidates `['lead-crawls']` only (no more whole-Inbox `['inbox']` refetch); the
  `lead_crawl_checks` realtime handler is a 3 s debounced `refreshLeadCrawlsSoon` (the table is not in the
  realtime publication today, so it is a safety net).

## 2. The Inbox refreshes only what changed

- Tab focus: `inboxFocusRefreshPlan` (`src/lib/inboxCache.ts`) — at most once a minute, a "changed since" read
  (messages created, leads updated, audits created / updated / given a new run, plus every cached audit with an
  unsettled run — `auditIdsToRefresh`, `runSettled`). A FULL reconcile still runs on a realtime reconnect and on
  focus when the last full read is over 30 minutes old (a delta cannot see a deletion or a lead taken away).
- The first-load catch-up uses the same delta (it used to re-read every audit).
- WhatsApp messages are read with `WA_MESSAGE_COLUMNS`, not `*` (drops `wa_message_id`, `findings_shown`). A new
  column the Inbox needs goes in that list; `scripts/lighter-outreach-inbox.test.ts` checks every `WaMessage` field.

## Measured (replaying each page's opening reads against the live API, service role = the admin's full book)

| | Before | After |
|---|---|---|
| Outreach open | 13 calls, 31.45 MB (3.83 MB gzip) | 13 calls, 15.45 MB (1.53 MB gzip) |
| — website checks | 18.86 MB (2.59 gzip) | 2.86 MB (0.29 gzip) |
| Inbox open | 23 calls, 36.61 MB (5.05 MB gzip) | 23 calls, 19.90 MB (2.52 MB gzip) |
| — messages | 5.52 MB | 4.81 MB |
| Inbox first-load catch-up (audits) | 2 calls, 3.69 MB | 2 id reads + only the changed audits (KB) |
| Inbox tab focus | 17 calls, ~17.1 MB, every focus | 5 small calls, a few KB, at most once a minute |

Opening both pages now shares one website-check read. The gzip column is what actually crosses the wire.

## Not done (next in the audit)
- Revisiting the Inbox page (remount) still runs a full reconcile when the realtime channel subscribes.
- Outreach's lead list (11.7 MB raw) and the Inbox's lead list are the biggest reads left.
