# Lighter shell + Outreach list (2026-10-22)

Fixes 3–5 of `C:\Users\paulj\Documents\Findable\perf-audit-2026-10-22.md` (1–2 are `docs/lighter-outreach-inbox.md`). Same screens, same behaviour, less downloaded and less refreshed. No database change.

## 1. Outreach lead list

- **Columns:** audited, nothing removed. All 53 `OUTREACH_LIST_COLUMNS` are read by list code (`scripts/outreach-list-columns.test.ts` walks every reader). The three biggest candidates are live: `google_maps_url` (dedupe + link), `whatsapp_message_id` (`leadStatus`), `instantly_pushed_at` (the Coverage freshness signature). Dropping any would silently change a rule, for ≤ 2 % of the bytes.
- **Archived list off the critical path:** for a book bigger than the first batch, the table paints as soon as page 0 returns. The archived read still starts with page 0 but is awaited by the background half (`loadRemainingLeads`), which merges it with the other pages. A book that fits in the first batch (every salesperson) waits for it, as before, so nothing flashes. Today the archived list is only 259 rows, so the gain is small now and grows with the archive.
- **"Changed since" for a remembered list** (`src/lib/outreachDelta.ts`, `outreachListMemory.ts`, `useOutreach.refreshRememberedDelta`): coming back to Outreach in the same tab reads only the leads with `updated_at` ≥ (last proof − 10 min), lays them over the remembered list, and **accepts the result only if the database's own active and archived counts agree** (`deltaMatchesCounts`). Any error, > `DELTA_MAX_ROWS` changes, an unreadable count, a list older than `DELTA_MAX_AGE_MS`, or a count that differs (a deletion, or a lead taken away from a salesperson) → the existing full load, unchanged. Proved live: `updated_at` covers every lead with a recent send / queue / create.
  ⛔ Never accept a delta without the count check. The stamp (`markOutreachListSynced`) is the START of the load that proved the list current; a first visit has none and loads in full.

## 2. Loaded only when used

`FeedbackAndNews` (+ `whatsNew.ts`, 218 KB), `CommandPalette` and the admin `ReviewQueueTab` are `React.lazy`. Small hosts stay in the shell: `FeedbackAndNewsHost` / `FeedbackNewsButtons` (`FeedbackNewsButtons.tsx`) and `CommandPaletteHost` / `PaletteButton` (`CommandPaletteHost.tsx`). The hosts catch the same window events (and Ctrl/Cmd+K, `?`) until the real component exists, then open it on arrival; the "g then x" page shortcuts stay in the host. The sidebar's "new" dot reads the newest entry from the What's New chunk after the page has painted.

## 3. Shell polling

- **Notifications:** only the desktop bell (the owner) holds the live channel and a poll; the phone bell is passive and reads the same cached rows. While the channel is connected the safety poll is 10 min (`LIVE_SAFETY_POLL_MS`); if it is not, the old 120 s poll applies. Refetch on window focus is unchanged.
- **AI reply drafts (Needs you):** one poll for the shell (the desktop bell, `SHELL_DRAFTS_POLL_MS` = 60 s, the table is not realtime and the drafts cron runs once a minute); the phone bell is passive. The Inbox keeps its own 30 s while it is open.
- **Admin review tab:** step 2 (`ai_audits.baseline_completed_at`) is embedded in step 1 through the two real foreign keys (`baseline_audit_id`, `full_measure_audit_id` → `ai_audits.id`, read from the live API's schema) — no database change. Two reads now instead of three; step 2 (queue rows for clients already waiting) still depends on step 1.

## Measured (live API, service role = the admin's full book)

| | Before | After |
|---|---|---|
| Outreach lead list, cold open | 9 calls, 11.51 MB (1.03 MB gzip) | unchanged in volume (same pages); table no longer waits for the archived read |
| Outreach lead list, return visit in the same tab | 9 calls, 11.51 MB (1.03 MB gzip) | 3 calls, 0.04 MB (0.01 MB gzip), 27 changed rows after a simulated 30 min away |
| Main script (every page) | 1,774 KB (552 KB gzip) | 1,536 KB (474 KB gzip); `whatsNew` 218 KB, palette 9 KB, dialogs 6 KB, review tab 8 KB become on-demand chunks |
