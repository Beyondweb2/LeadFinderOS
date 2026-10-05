# Outreach lead ownership safety (2026-10-05)

Branch `fix/outreach-lead-ownership` (worktree `C:/Users/paulj/LeadFinderOS-wt/outreach-lead-ownership`), off
`origin/main` `52b15962`. **Pushed, NOT merged, NOT deployed** (parallel-session rule). The rule lives in
`src/lib/outreachOwnerScope.ts`.

## 1. Old behaviour, and why Paul saw other people's leads

- Who works a lead is `outreach_leads.assigned_to_user_id` (docs/multi-user.md §1). Every row's `user_id` is the
  book owner (Paul), so the admin's Outreach reads the whole book from `outreach_leads`. That is correct for an
  admin. The problem was the screen.
- Outreach had an owner filter, `OwnerFilterSelect`, whose **default was "Any owner"** (`useState('all')`). It
  was **remembered** with the rest of the table state, and it only filtered the rows *shown*.
- So Paul's normal working list held every salesperson's leads. Select all ticked all of them, and Queue WhatsApp
  wrote `status = 'queued'` onto all of them. The queue then messaged another rep's prospects as if Paul had
  meant to.
- Ticks also **outlived the filter**. After ticking in one view and switching to another, `selectedIds` still
  held the hidden leads, and most bulk handlers read `selectedIds` directly.
- **Live data (read 2026-10-05):**

  | Owner | Active leads |
  |---|---|
  | Paul (book owner, admin) | 2,683 |
  | Unassigned | 2,646 |
  | test1 (sales) | 3 |
  | Test (sales) | 0 (32 archived) |

  The admin's recent Find Leads adds land **unassigned**: 148 in the last 10 days.

## 2. New admin behaviour

- **The scope is applied by the page, before the table sees a lead.** `src/pages/Outreach.tsx` →
  `scopeLeads(allLeads, ownerScope, role, user.id)` → `OutreachTable leads={scopedLeads}`. Everything in the table
  is computed from that list: the `Outreach (N)` count, Select all, every bulk action, CSV, Previous / Next and
  the overdue count. None of them can reach a lead outside the scope, because it is not there.
- **Choices:** My leads (default) · Unassigned · each salesperson by name · All team.
  - Anything wider than My leads gives the control an amber border and puts an amber tag beside the count
    ("test1", "All team").
- **My leads = assigned to Paul OR unassigned.** An unassigned lead belongs to nobody else. It is the book's
  unworked pool, and the admin's own adds land there. The first real message assigns it to the sender or the
  book owner (`trg_whatsapp_messages_assign`). Hiding it would have hidden Paul's own new leads.
- **Not remembered.** Every visit opens on My leads. The owner value is gone from the saved table state, and
  `normaliseOwnerScope` turns anything unknown into My leads: the old saved `'all'`, a member who left, or an
  absent value.
- **Ticks cannot outlive the scope.** `selectedIds` = the ticks INTERSECTED with the scoped lead ids. Changing the
  scope also clears the ticks.
- **A lead opened by link outside the scope** (Inbox, a notification, `?lead=`) switches the view to that lead's
  owner (`scopeShowingLead`). Opening it is a deliberate act; this way it does not silently fail to open.
- Clear all (the "Filtered" pill) also puts the scope back to My leads.
- The admin's **queue panel** still lists the whole WhatsApp queue. That is the one queue, and it sends for the
  whole team.

## 3. Salesperson isolation (server-enforced, unchanged and re-verified)

A salesperson reads only the `sales_leads` view. The view holds rows assigned to them that are not a client. A
direct read or update of `outreach_leads` returns 0 rows (RESTRICTIVE policies). Every write goes through a
function that runs `_require_work` → `can_work_lead`. The client adds a second cut: their scope is always their
own id. They never see the owner control. Their queue batch is refused outright (never warned) if it holds
anything that is not theirs, and the server refuses it again (`sales_queue_opener` → `not_yours`).

| Path | Server enforcement |
|---|---|
| Outreach list | `sales_leads` view (assigned to them, not a client) |
| Bulk / per-lead WhatsApp | `sales_queue_opener` → `can_work_lead` per lead → `not_yours` |
| Unqueue | `lead_unqueue` → `not_yours` |
| Check before calling | fn `sales-prospect-check`: `leadEligibility` per lead, before any spend |
| Crawl | fn `crawl-check`: `canWorkLead`; `job_id` / `run_id` tied to the lead (`salesCrawlIdsRefusal`) |
| Status / Next Action / star / archive / details | `lead_set_*` / `lead_mark_interested` → `_require_work` |
| Campaigns | `campaign_usable` (own campaigns only), `lead_set_campaign` (own lead → own campaign), counts and candidates scoped to their leads |
| Export | Sales has no CSV. Copy Numbers goes through `log_data_access`, which checks their own leads |
| Messages, voice, media, scripts, previews, Quick Close, social profiles | `leadAccess` in each function |

## 4. Bulk-send safety

- **Queue WhatsApp:** `handleQueueForWhatsApp` calls `contactScopeCheck(selected leads)` **before any queue
  write**. That covers the opener path, the follow-up lane and the sales path.
  - Paul's own leads and the unassigned ones count as one group ("You").
  - When the selection spans more than one owner group, the dialog shows *"You're about to queue WhatsApp for 37
    leads across 3 owners."* plus the counts per owner ("You (incl. unassigned) 20 · test1 12 · Test 8"). Its
    button reads *Queue N across team…*.
  - That button opens a second confirmation with Cancel (focused by default) and **Queue across team**. Only that
    second button passes `crossOwnerConfirmed`; the handler refuses without it.
- **Campaign launch (server, migration `20261009150000_campaign_launch_owner_scope.sql`):**
  - Old behaviour: `campaign_launch` queued every not_contacted member when the ADMIN launched it. Membership
    decided who got messaged.
  - Live example: "roofers 2", created by Test, holds 82 active leads now assigned to Paul.
  - Now a launch queues only the **campaign owner's** leads. That means assigned to `created_by`, or unassigned
    when the owner is an admin. Anyone else's member is counted as `skipped.other_owner` and shown as "owned by
    someone else".
- The shared opener contact guard (`opener_contact_block`) is untouched. A launch still goes through
  `sales_queue_opener`.

## 5. Leaks found beyond the screen, fixed in this branch

1. **`campaign_launch`** — see §4. It could message another rep's (or Paul's) leads through campaign membership.
2. **`enrich-lead` (data read).**
   - The cache key came from the caller's `place_id`. `mayWriteLeadId` allows a made-up `lead_id` on purpose (for
     Find Leads).
   - So a salesperson could send another rep's or Paul's place id and get back the cached email / Facebook /
     Instagram for that business. With one of their own lead ids, the value was also copied onto their lead.
   - Now `mayLookUpBusiness` (the same check place-details uses) runs before the cache read.
3. **`process-whatsapp-queue` `contact_check` (read).**
   - The phone half answered "already messaged / suppressed" for ANY number a salesperson sent.
   - Now a salesperson's phones are cut to their own leads' numbers (last nine digits) before any history or
     suppression read. The lead half was already scoped.

Noted, not changed:
- `quick-close` answers 404 for an unknown id but 403 for someone else's lead. That reveals only whether an id
  exists.
- `agency-check` and `companies-house-check` let any team member refresh a shared per-domain / per-place cache of
  public data. That is not lead data.

## 6. Tests

- **`scripts/outreach-owner-scope.test.ts`** (in `npm test`).
  - The rule: sales sees own only, can't widen, and a foreign batch is refused. The admin's default is My leads
    (own + unassigned), and they can choose a rep or All team. An old `'all'` or unknown value becomes My leads.
    Select all and counts in the default view hold no rep's lead. Multi-owner needs confirmation; single-owner
    doesn't. The headline and owner line are pinned.
  - The wiring: the page passes the scoped leads; the scope is not persisted; there is no owner filter or "Any
    owner" in the table; selection is intersected and cleared on scope change. The owner check comes before
    every queue write. Only "Queue across team" confirms, and Cancel is focused.
  - The server source: the launch owner filter and `other_owner`; enrich-lead checks before the cache read;
    contact_check cuts first.
- **`supabase/tests/outreach-ownership.sql`** (live, always rolled back; 25 checks). Two fake salespeople (A, B).
  - **Salesperson A:**
    - sees only their own lead in `sales_leads`;
    - reads 0 rows of B's / Paul's leads and crawl checks;
    - queueing B / unassigned / Paul gives 0 queued, 3 `not_yours`;
    - stage, Next Action (B's and Paul's), star and archive are refused with `not_your_lead`; a direct UPDATE
      writes 0 rows; unqueue is refused;
    - cannot pull B's or Paul's leads into their own campaign, cannot put their own lead into B's campaign, and
      gets `not_found` for B's campaign leads and launch; campaign candidates are their own leads only;
    - a lead they add is owned by them, in their own campaign.
  - **Admin:** launching an admin campaign that holds A's and B's leads skips both as `other_owner`, queues
    neither, and considers only the unassigned lead.
  - **Result 2026-10-05:** 25/25 with the new `campaign_launch` loaded inside the rolled-back transaction.
    Against today's LIVE function: 22/25. Checks 22–24 fail: it queued all 3, including both salespeople's leads.
    That is the bug, reproduced. Afterwards: 0 fixture campaigns, users or leads left, and the live function
    unchanged.
- **Updated pins:**
  - `outreach-filters.test.ts`: the owner control is the page scope and is not remembered.
  - `initial-opener-select.test.ts`: the queue button also stays disabled on a refused batch.
  - `pre-sales-final.test.ts`: the new migration is listed as a later release.
- **Gate:** `npm run check` — typecheck 9 = baseline, edge syntax / undefined / import graph clean, build ok,
  **316/316 suites**.

## 7. Visual QA

- **How it was done:**
  - A throwaway harness rendered the REAL Outreach page, behind `RequireAccess`, over fake ZZ leads with no
    network.
  - The 40 leads were split: Paul 12, unassigned 8, test1 12, Test 8.
  - It was driven by headless Edge at 1440×1000 and 390×844. The harness was deleted before commit.
  - Nobody has looked at it on the live app. It is not deployed.
- **Admin, desktop:**
  - The default is My leads, `Outreach (20)` = Paul + unassigned.
  - test1 shows `(12)` with a "test1" tag.
  - All team shows `(40)` with an "All team" tag.
  - Select all ticks 40 (only in All team). The queue dialog shows the amber warning "40 leads across 3 owners"
    and the button "Queue 40 across team…". The confirmation names the owners, and Cancel has focus.
- **Admin, phone:**
  - The same states. Ticking the 10 visible cards gives "10 leads across 3 owners" (5 / 3 / 2) and the same
    confirmation.
  - Phones have no Select-all control. That was already the case.
- **Sales, both sizes:** no owner control, `Outreach (12)` = exactly test1's 12 leads.
- **Horizontal overflow:** 0 px in every state, including with the confirmation open.

## 8. Deploy (when an integration session or Paul does it — not this branch)

1. **SQL first:** apply `20261009150000_campaign_launch_owner_scope.sql`. Read back with
   `prosrc ~ 'other_owner'`. Then re-run `supabase/tests/outreach-ownership.sql`: expect 25/25.
2. **Edge functions:**
   - Deploy `enrich-lead` and `process-whatsapp-queue`. Both are self-contained edits; no shared module changed.
   - ⛔ Do not bundle `whatsapp-status`.
3. **The SPA** ships with `main`. The What's New entry is `2026-10-05-outreach-my-leads`.
