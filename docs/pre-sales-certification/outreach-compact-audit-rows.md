# Outreach: compact AI check on the rows (2026-10-05)

Branch `improve/outreach-compact-audit-rows`, off `origin/main` 9fd5a144. **Not merged, not deployed.**
Front-end only: no SQL, no edge function changed, nothing to redeploy.

## What changed

**Removed:** the "Check before calling" results panel at the top of Outreach (`SalesCheckPanel.tsx`,
deleted). It listed every lead of the batch again, with the call card's headline (rival names) and a
website line — a second list that could not scale past one batch.

**The row is the working list.** Each row (desktop: under the business name; phone card: under the
phone number) shows one compact line:

| State | Row shows |
|---|---|
| not checked | `Not checked` |
| waiting (queued / starting in the rep's batch) | `Waiting` |
| checking (batch item running, or audit run in flight) | `Checking…` |
| ready | `ChatGPT 1/3` `Gemini 0/3` `Call screen` |
| cached (reused result) | the scores + `reused` |
| failed (batch item failed, or latest run failed/cancelled) | `Check failed · Retry` (server's reason as tooltip) |
| skipped | `Skipped` (server's reason as tooltip) |

- Scores are named-of-answered per engine from `buildReportData`'s `perEngine` — the same audit
  (`resolveLeadReportAudit`) and the same ruler (`cellNamed()`) as the call screen and the report. The
  denominator is the stored answered count, never a written 3: a lost answer reads `1/2`, a three-run
  method reads `x/9`, an engine with no answers reads `Gemini –`.
- **Nothing else on the row**: no rival names, answers, website findings, best missed query, headline
  or explanation. `RowScore` holds only labels and two numbers; tests assert it.
- Scores are read **for the current page's ready rows only** (`useOutreachRowScores`), through the
  person's own session (RLS), keyed by each lead's newest run so a finished check re-reads that page.
- **Retry**: a rep → the same confirm dialog as the toolbar (allowance, reuse); the admin → the single
  AI check popup.

**Call screen** — the outline `Call screen` button on every ready row opens the lead's workspace on the
Call tab (`openCallScreen`, the same door the old panel used).

**One-line check bar** (`OutreachCheckBar`, top of the table card, under the title): the rep's batch in
counts (`Checking 15: 6 ready · 3 checking · 3 waiting · 2 failed · 1 skipped`), `Stop` while leads
wait, `Checks left today: 22/30`, and **Open next ready (N)**.

**Bulk checking kept**: select leads → `Check before calling (n)` → `SalesCheckDialog` (moved to its own
file, otherwise unchanged) → `sales-prospect-check`. Server rules untouched: 30 fresh checks/day/rep
(`SALES_CHECK_DEFAULT_PER_REP_PER_DAY`), max `SALES_CHECK_BATCH_MAX` (20) per batch, refused above,
14-day reuse, ownership checked per lead at processing time, and no lead status is ever written by a check.

**Open next ready** walks `filteredAndSortedLeads` — the page's owner scope, every filter and the sort
already applied — and opens the first lead whose check is ready, skipping archived, paid / client,
not interested, opted out and won leads (`NEXT_READY_EXCLUDED_STATUSES`, held equal to the sales
check's refusals by test) and leads already opened from the bar this session (sessionStorage, per
person; `Start over` clears it). It now works for the admin too (in whatever scope Paul is viewing).

## Ownership

Unchanged. The table still receives only `scopedLeads` (Paul: My leads / Unassigned / a named rep /
All team owned; a rep: own leads only). Batch items are matched to rows by lead id, so an item for a
lead not in the list draws nothing; score reads go through RLS, so a rep cannot read another rep's audit.

## Tests

`scripts/outreach-compact-audit-rows.test.ts` (new, 60 checks): score line from the real report fold,
stored denominators, no rival/answer/finding text in the score or the markup, every state, 32
mixed-state rows each ≤ 60 characters, Call screen only when ready, reads only + page-scoped,
panel gone, bulk button + dialog + max 20 + 30/day + reuse intact, allowance on the bar, Open next ready
order/skips/scope, ownership wiring, Select all and pagination untouched.
`scripts/sales-prospect-check.test.ts` section 10 updated to the new screens.

**Gate:** `npm run check` — typecheck 9 = baseline, edge checks, build, **329/329 suites passed**.
(The Stop icon was filled after the gate ran — a one-class change.)

## Visual QA

The REAL `OutreachTable` was rendered in a throwaway harness (scratchpad only, never committed) with
34 ZZ fixture leads in every state, as a salesperson, through headless Chrome:
- **1440 px**: bar on one line; ready rows add one short line under the name (~80 px rows, same as
  rows with a Next Action); no rival names or answer text anywhere on the page (checked in the DOM).
- **390 px**: each card = name, phone, score pills, Call screen, status, Next Action; no audit cards;
  the page fit the width in the screenshot.
- **Not done:** the admin-role screenshots and the numeric 390 px overflow measurement — the machine's
  C: drive ran out of space (0 bytes free) mid-run. Paginated as live: 15 rows/page desktop, 10 phone.
  Nobody has seen it in the live app; Paul should look once it is deployed.

## Overlap with the full-crawl branch (`improve/prospect-full-crawl-audit-results`)

- That branch improves the website crawl and the detailed audit / call screen. This branch shows no
  website findings on rows and does not touch the crawler, `coldCallPlaybook.ts`, the call screen or
  `sales-check.ts`.
- Likely conflicts: `src/pages/Outreach.tsx` and `src/components/OutreachTable.tsx` if it also edits
  them; **`SalesCheckPanel.tsx` is deleted here** — if that branch edits it (e.g. website lines in the
  panel), the merge must drop those edits: website findings belong on the call screen, not in Outreach.
- `useCallCardSummaries` / `loadCallCardSummaries` (`useColdCallPlaybook.ts`) now have no caller here;
  left in place in case that branch uses them.
