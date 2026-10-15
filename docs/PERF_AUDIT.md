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
4. ⏸ **Outreach revisit: show the last list at once, refresh behind it.** The biggest remaining Outreach win (every return to the page
   waits for the first 1,000 again, ~1–2 s, and bulk actions lock for ~3–5 s). Not done: it means showing a list that can be a few
   seconds old and adding a "refreshing" state to the bulk-action gate — a behaviour change. **Needs you** (see below).
5. ⏸ **Outreach rows: memoised row component.** Rows are inline JSX in a 3,857-line table; memoising means extracting them with many
   closures. Behaviour-risky; measured cost is already 70–100 ms per action on a normal machine. Not done.
6. Not worth doing now: Inbox crawl checks / page hits read with the sequential pager (1 page each today); narrowing the Inbox
   messages `select('*')` (many readers of message fields — needs a field audit; ~2 MB).

## Database / SQL

None needed for these fixes. Not applied, and not recommended: the Outreach order index (tried and removed 2026-10-13 — the planner
never uses it under the admin RESTRICTIVE policy; see `docs/site-wide-speed.md` §9).

## Needs you

- **Outreach "show last list instantly" (item 4):** OK to show the previous copy for the few seconds a refresh takes, with bulk
  actions staying locked until the fresh copy lands? It touches no auth, tenancy or sending.

## Verification

- `scripts/audit-report-resolver.test.ts` (parity), `scripts/outreach-list-columns.test.ts` (one-lead read uses the list columns
  and the dev guard; NichePanel downloads no list; the dialog remounts per lead), `npm run test:changed`, `npm run check:quick`.
- `src/lib/auditReportResolver.ts` is reached by no edge function (import graph) — SPA only, no function redeploy.
- No layout changed, so no desktop / phone screenshot comparison was needed.
