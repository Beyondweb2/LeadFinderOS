# Performance audit — Inbox, Find Leads / Coverage, Outreach (2026-10-15)

Speed only; nothing about what the pages do was changed. Earlier passes are in `docs/site-wide-speed.md` and
`docs/inbox-outreach-speed.md` — read them before repeating any of this.

## How it was measured

- **Live row counts** (one read-only SQL query, 2026-10-15): 6,235 WhatsApp messages, 8 SMS, 5,818 active leads (5,805 with a
  phone), 1,698 audits, 1,680 Gemini-signal rows, 392 crawl checks, 79 page hits. Realtime publication: `outreach_leads`,
  `whatsapp_messages`, `sms_messages`, `notifications`, `call_logs` (so `lead_crawl_checks` / `ai_audit*` subscriptions never fire).
- A second read-only query (payload sizes) was refused by this session's permission check, so payload sizes below come from the
  earlier passes' measurements plus the code's query shapes. No sign-in to the live app was used; nothing was sent.
- CPU cost measured with a Node benchmark at live scale (5,805 leads × 1,698 audits).

## What each page loads on open

| Page | On open | Paging | Polling / realtime | Hot spots |
|---|---|---|---|---|
| **Inbox** | 6 reads at once: all messages (`select *`, ~7 pages), active leads with a phone (6 pages, narrow columns), audits + run summaries (2 pages), page hits, Gemini signal (2 pages), crawl checks (1 page). React Query cache, 5 min. | 1,000-row pages, 6 in parallel | Realtime on messages + leads patches the cache; first connect does a small catch-up | **Two site-fault sets re-scanned every audit for every lead** (~250 ms per pass at live scale, re-run on every lead or audit change). **Opening a lead downloaded the whole book.** Conversation list already capped (`listLimit`). |
| **Find Leads** (`/find-leads`) | Nothing heavy since 2026-10-13: `useOutreach({ preload: false })`, CRM markers asked for the results on screen only (25 per request). | n/a | none | none found |
| **Coverage** | One cached `coverage` call. Opening a stored niche mounted `NichePanel`, which **downloaded the whole book** (active + archive + history, ~13 requests) only to reach `addLead`. | — | none | — |
| **Outreach** | Progressive: newest 1,000 + exact count + archive, then the rest (6 pages in parallel), 41 list columns. Audit map (cached, polls 20 s only while an audit runs). | 15 rows per page | audit map poll only while running | Measured 2026-10-13: actions 70–100 ms at normal CPU; the cost is the 15 heavy rows, not the lead count. **Every visit re-downloads the list** (`useOutreach` is not cached). |

## Ranked list (biggest win first)

1. ✅ **Inbox site-fault sets: one pass instead of per-lead re-scans.** `newestUsableAudit(audits, leadId)` filtered and sorted all
   1,698 audits for each of 5,805 leads, twice per pass. New `newestUsableAuditByLead` (same rule, one pass;
   `src/lib/auditReportResolver.ts`). **Measured: 251 ms → 3.4 ms per pass.** Parity test on randomised input:
   `scripts/audit-report-resolver.test.ts`.
2. ✅ **Inbox lead popup loads one lead, not the book.** `useOutreach({ onlyLeadId })` reads that one active row with the same source
   and list columns (`is_archived = false`, so an archived lead still says "not found"). Before: ~8 requests and every active +
   archived lead (6.8 MB of list JSON measured 2026-09-27) on each open. After: 1 request, 1 row. Writers unchanged.
3. ✅ **Coverage niche panel: no whole-book download.** `useOutreach({ preload: false })`, the mode Find Leads already uses; `addLead`'s
   database dedupe unchanged, its history check asked of the database. Before: ~13 requests / ~10 MB (measured on Find Leads
   2026-10-13, same load). After: none on open.
4. ✅ **Outreach revisit: the last list at once, refreshed behind it** (Paul approved, 2026-10-15). `src/lib/outreachListMemory.ts`
   remembers the COMPLETE list per person + role, in memory for this tab only (never browser storage; sign-out forgets it). A return
   shows it as `LEAD_LOAD_FROM_LAST_VISIT` — phase `partial`, so `datasetComplete` is false and every whole-list action stays locked —
   then the full fresh load replaces it through `mergeAfterBackgroundLoad` (edits made meanwhile kept). A failed refresh says so with
   Retry. **Measured headless (fake offline backend, 5,800 leads, 700 ms per request): first visit 1,700 ms to the first 1,000 rows;
   return 37 ms to all 5,800, fresh copy complete ~1.4 s later.** Tests: `scripts/outreach-progressive.test.ts`.
5. ⏸ **Outreach rows: memoised row component.** Rows are inline JSX in a 3,857-line table; memoising means extracting them with many
   closures. Behaviour-risky; measured cost is already 70–100 ms per action on a normal machine. Not done.
6. Not worth doing now: Inbox crawl checks / page hits read with the sequential pager (1 page each today); narrowing the Inbox
   messages `select('*')` (many readers of message fields — needs a field audit; ~2 MB).

## Database / SQL

None needed for these fixes. Not applied, and not recommended: the Outreach order index (tried and removed 2026-10-13 — the planner
never uses it under the admin RESTRICTIVE policy; see `docs/site-wide-speed.md` §9).

## Needs you

- Nothing outstanding — item 4 was approved and built the same day.

## Verification

- `scripts/audit-report-resolver.test.ts` (parity), `scripts/outreach-list-columns.test.ts` (one-lead read uses the list columns
  and the dev guard; NichePanel downloads no list; the dialog remounts per lead), `npm run test:changed`, `npm run check:quick`.
- `src/lib/auditReportResolver.ts` is reached by no edge function (import graph) — SPA only, no function redeploy.
- No layout changed, so no desktop / phone screenshot comparison was needed.

---

# Inbox messages load (2026-10-16)

Paul: "the Inbox is slow to load messages (opening a conversation and/or the conversation list)". Live book that day: 7,125 leads
(6,866 active with a phone), 6,245 WhatsApp messages in 2,741 threads, 1,698 audits, 2,189 runs, 8,768 queue rows, 392 crawl checks.

## How it was measured

- **Database** (read-only, as the admin user so RLS applies): `EXPLAIN ANALYZE` of every Inbox read, three times each.
- **Network**: a Node replay of the Inbox's opening reads against live PostgREST (service-role key, read-only — RLS bypassed, so
  slightly optimistic), and the click reads for three real conversations.
- **Browser**: a production build pointed at a fake offline backend serving the live rows (captured read-only, deleted after),
  driven by headless Edge over CDP, zero network delay so only browser work is timed; a CPU profile of five clicks.

## What it found (the three biggest costs)

1. **Clicking a conversation redrew every list row: 0.5–1.8 s of browser work per click, before any network.** The rows were inline
   JSX, so any Inbox render (the click, mark-as-read, each query that lands after it) redrew all 150 rows with their status
   dropdowns. Profile: 15 s of React rendering across five clicks; `londonToday()` (a new `Intl.DateTimeFormat` per Next Action pill
   per render) alone was 1.8 s of it.
2. **The Gemini signal read** (`audit_gemini_signal`, 1,680 rows, paged): each page re-ran the whole aggregate to keep 1,000 rows.
   Warm it is 20–90 ms, but live it spiked to 1.5–6.4 s and was the long pole of the opening reads in two of three runs.
3. **Opening reads in general**: ~7 s wall clock in the replay, 25–34 requests (fewer once the row-count hints are warm), ~15 MB
   of JSON (~3 MB gzipped): leads 6.2 MB (36 columns × 6,866), messages 4.7 MB (`select *`), audits 2.3 MB (each run's
   crawl result). The database answers each page in 6–30 ms warm; the time is round trips and the ~10-connection pool.

## What changed

1. ✅ **`ConversationRow`** (`src/pages/Inbox.tsx`): the same row markup as one `memo` component; it redraws only when its own
   conversation, state, AI draft, selection, saving flag, the lead/stage maps or the minute clock change. `st` is compared by content
   (`src/lib/inboxRowMemo.ts`); the open / status handlers reach it stable through a ref and always call the newest handler.
   **Measured headless (live-shaped data, zero network): a click 0.5–1.8 s → 0.07–0.40 s.** (`londonToday` was left alone: it is
   reached by four edge functions, and with the rows memoised it is no longer a measurable cost.)
2. ✅ **`inbox_gemini_signals()`** (migration `20261102090000`, applied 2026-10-16, read back): the same view's rows as one JSON
   array — one request, one aggregate, security invoker (the caller's RLS, checked equal to the view for an admin and a
   salesperson). Live: one ~0.8 s call instead of two back-to-back pages (~1.4 s). The paged view read stays as the fallback.

## Not done (and why)

- **Paging the conversation list / loading only the last 30–50 messages per thread.** Every message is in memory because the
  unread marks, waiting timers, follow-up-due filters, report-opened pills and search are all derived from the full log in the
  browser. Moving that to the server is a redesign, not a speed fix, and would risk "same conversations, same unread counts".
- **Narrowing `select('*')` on messages** (drop `wa_message_id`, the only unused column, ~13 %) and the leads columns: small win,
  needs a reader-by-reader field audit. **The audits read's crawl blobs**: they feed the fault-template gate.
- **The AI visibility card on click** (1.2–1.7 s live, two reads in sequence that read the runs' full `results` and the queue rows'
  `result`): it fills in after the thread is already on screen; narrowing it needs a field audit of the hook scorer.
- **Found, not changed (behaviour, not speed):** `lead_crawl_checks` has no SELECT policy for the admin (only for sales), so the
  admin's Inbox reads 0 stored crawl checks and the Crawl-site icon relies on the audit-run fallback. Worth a separate look.

## Verification

- `scripts/inbox-messages-load.test.ts` (row memo rules, the row reads no page state, the RPC + fallback, the function is invoker
  and signed-in only), `scripts/inbox-channel-parity.test.ts` (every Inbox element still present), the full gate (migration).
- No layout changed (the row markup is moved, not edited).
