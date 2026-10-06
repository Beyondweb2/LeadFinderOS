# WhatsApp queue — admin / salesperson parity (2026-10-06)

Branch `fix/whatsapp-queue-role-parity`. Frontend only: **no migration, no edge function deployed.**
`whatsapp-status` **v114 before and after** (held for the Meta cutover, not touched). `process-whatsapp-queue` v202, not touched.

## The bug

There were two queue experiences:

| | Before |
|---|---|
| Admin | `WhatsAppQueuePanel` embedded on Outreach. Rows were built in the browser from the Outreach lead list (`leads={allLeads}`); team status from `process-whatsapp-queue` mode `status`. |
| Salesperson | `MyWhatsAppQueuePanel` — a different, simplified card ("Your leads queued 3" + names + ✕) on Outreach, reading `sales_leads` itself. |

Two components, two data paths, two layouts. That split was the bug.

## Now — one queue

- **`src/components/WhatsAppQueuePanel.tsx`** is the ONE queue component (the admin's panel, refactored so it reads its
  own rows instead of taking the Outreach list as a prop). It lives on a page, **`/whatsapp-queue`**
  (`src/pages/WhatsAppQueue.tsx`), opened by both roles. No role fork around it.
- **`src/hooks/useWhatsAppQueue.ts`** is the ONE read, for both roles: `sales_leads` view, `or` = any lane, paged
  (`fetchAllRows`, ordered by id). No owner filter and no role branch in the browser.
- **`src/lib/whatsappQueueView.ts`** (pure) folds rows into lanes (`deriveQueue`), owns the row-state map
  (`QUEUE_ROW_STATE`), the summary words, the queue-changed event and the last-batch note.
- **Outreach** shows only **`WhatsAppQueueSummary`** — "WhatsApp queue · 3 waiting · 1 no-reply follow-up
  [Open queue →]", plus the last batch this tab queued. No rows, no actions. Same card for both roles.
- **Deleted:** `src/components/MyWhatsAppQueuePanel.tsx`, `scripts/sales-queue-panel.test.ts` (tested the deleted panel).

### Admin-only differences (they act on or describe the whole team; the server refuses each to Sales)

- TEST MODE / LIVE chip · Pause / Resume · Run tick · Sent today / cap · Next send — all from mode `status`,
  which the panel never requests for Sales (`refreshTeam` returns early).
- Cancelling a **no-reply follow-up** (the `contact_followup` lane is the admin's; the Inbox gates it the same way).
  A salesperson SEES their follow-up rows, read-only.
- Scope chip reads "Whole team" (admin) vs "Your leads" (salesperson).

Everything else is identical: header, status line (paused / window — `queue_state`, both roles), the Queued tile
with hook / no-reply counts, UK time, the archived callout, the last-batch note, the send-order list, the row
chips, template labels, audit pills, remove ✕ on waiting openers, the empty state, one Refresh, one poll.

## Queue states (only real ones)

The processor has no "sending", "sent", "failed" or "skipped" queue ROW: a tick sends and moves the lead on in one
pass; a refused lead leaves the queue with its reason on the lead (`whatsapp_delivery_status`). The admin panel
never listed them and still does not. Real states on screen:

| State | Source | Chip |
|---|---|---|
| Waiting (opener lane) | `status = 'queued'`, not archived | blue "Waiting" |
| No-reply follow-up | `contact_followup_queued_at` set | blue "No-reply follow-up" |
| Hook follow-up | `hook_followup_queued_at` set | a count on the Queued tile (as before) |
| Archived but queued | `status='queued'`, archived | amber callout, never listed (not sent) |
| Audit status (audit-class templates) | `ai_audits` runs | the existing pills: ready / running / failed / no audit |
| Paused | `queue_state` | amber "PAUSED — no sends" |

**Skipped batches:** "Queued 0" leaves a **Last batch** note (this tab, an hour, sessionStorage) on the summary and
the queue page — e.g. "Queued 0 · 2 skipped – 1 already contacted – 1 not a UK or Indian mobile". It is a batch
result, never shown as queue rows, never sent to the server. Recorded by both bulk paths (Sales `sales_queue_opener`
result; the admin's queue path).

## Ownership rule (preserved, documented)

A queue item **is** its lead row — there is no queue table and no stored "queued by" column (the queuer is only in
`lead_activity` `bulk_queued`). Who may see / remove an item = who may work the lead **now**: `sales_leads`
(`assigned_to_user_id = auth.uid()`, never a client) and `can_work_lead` inside `lead_unqueue`. A lead reassigned
after queueing moves to the new rep's queue (the old rep no longer sees it or its phone). Kept: giving the queuer
continued visibility would show them a lead and phone number that is no longer theirs.

## Server-side security — live, rolled back (2026-10-06)

One `DO` block ending in `RAISE` (nothing persisted; read back afterwards: 0 fixture leads, 0 fixture users).
Fake Rep A, Rep B, a no-role (disabled) account; real admin. Rep A: 2 queued, 1 "sending" (= queued), 2 sent,
1 skipped, 1 failed, 1 to cancel. Rep B: 1 queued, 1 no-reply follow-up, + 1 queued by A then reassigned to B.

| Request | Result |
|---|---|
| Rep A reads queue rows | 4 — A's queued only (sent / skipped / failed are not queue rows) |
| A: `sales_leads where assigned_to_user_id = B` | 0 |
| A: fetch B's leads by id (view) | 0 |
| A: fetch B's leads from `outreach_leads` | 0 · all fixture rows from the base table: 0 |
| A: B's phone numbers | 0 |
| A: `lead_unqueue(B's lead)` | `not_yours` |
| A: `lead_unqueue(lead reassigned to B)` | `not_yours` |
| A: direct `update outreach_leads` on B's lead | 0 rows |
| A: `lead_unqueue(own)` | ok → `not_contacted`; A's waiting 4 → 3 |
| Rep B reads | B queued 1, B follow-up, X reassigned — no A rows |
| B: `lead_unqueue(A's lead)` | `not_yours` |
| Disabled (no role) | 0 rows; `lead_unqueue` raises `no_role` |
| Admin | A + B + reassigned (6) |
| After | A's and B's queued leads still queued (nobody could touch the other's) |

Scripts: `scratchpad/q4_security.sql` (session-local). No RLS / RPC change was needed: the scoping already lived in
the database — the bug was purely the UI.

## Tests

- `scripts/whatsapp-queue-role-parity.test.ts` (new, 62 checks): one component renders queue rows; the panel is
  mounted once (the page); no role fork; the old panel is gone and unreferenced; Outreach renders only the summary,
  for both roles; the read is `sales_leads` with no owner filter / role branch, paged; team controls admin-only;
  removal = `lead_unqueue` for both; one refresh, one poll; every queue path announces; fixtures Rep A / Rep B /
  admin / reassigned / client / disabled / empty; skipped-only batch; route open to an active salesperson regardless
  of the practical-onboarding checklist, refused to no role.
- Updated: `sales-parity.test.ts` (paused line now on the summary + queue), `outreach-owner-scope.test.ts`
  (the queue is not built from the scoped Outreach list), `outreach-list-columns.test.ts` (the queue reads its own rows).
- Gate: `npm run check` — see the commit record.

## Visual QA

The REAL `WhatsAppQueue` page, `WhatsAppQueuePanel` and `WhatsAppQueueSummary`, built with Vite against fixture
Supabase (the mock simulates the view's scoping: admin = A + B, sales = A), headless Edge. Screens in
`docs/pre-sales-certification/whatsapp-queue-role-parity/`: `admin-desktop`, `sales-desktop`, `admin-mobile`,
`sales-mobile` (390 px), `outreach-summary-sales`, `outreach-summary-mobile`, `outreach-summary-sales-skipped`,
`view-queue-transition-sales` (Open queue clicked), `sales-empty-queue`.

DOM probe: every row a salesperson sees is **byte-identical** to the admin's rendering of it (after normalising the
position number, which differs because the admin also sees Rep B's rows, and dropping the admin's cancel-follow-up
button). Sales issued no `status` call; no horizontal overflow at the narrowest width headless Edge allows (504 px)
and none visible in the 390 px frame.

## Not changed

Provider, Meta, templates, pacing, retries, eligibility, contact rules, sequencing, daily limits, campaigns, the
ready-to-sell rule. No SQL. No edge function.
