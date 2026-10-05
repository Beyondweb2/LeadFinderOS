# Outreach lead ownership safety (2026-10-05)

- **Branch and worktree:** `fix/outreach-lead-ownership`, worktree `C:/Users/paulj/LeadFinderOS-wt/outreach-lead-ownership`,
  off `origin/main` `52b15962`. Two commits: the ownership safety work, then Paul's correction ("My leads means
  MY leads").
- **Status:** pushed, NOT merged, NOT deployed (parallel-session rule).
- **Where the rule lives:** `src/lib/outreachOwnerScope.ts` (screen) and migration `20261009160000` (owner at creation).

## The rule (final, Paul 2026-10-05)

| Who adds the lead | Owner (`assigned_to_user_id`) |
|---|---|
| Paul / an admin (Find Leads, Coverage add, Add a lead) | Paul (the adding admin) — set by the DATABASE at creation |
| A salesperson (Find Leads, Add a lead) | That salesperson — `sales_add_lead`; they cannot nominate anyone else |
| System-created (free check, onboarding, paid-client setup, crons — no signed-in user) | Unassigned |
| Legacy (everything already unassigned on 2026-10-05) | Unassigned — untouched |

| Admin Outreach view | Holds exactly |
|---|---|
| **My leads** (default, every visit) | Leads Paul owns. **Never** the unassigned ones. |
| **Unassigned** | Leads nobody owns. Paul opens it on purpose; **Claim for me** makes the ticked ones his. |
| **[salesperson]** | Leads that person owns. |
| **All team (owned)** | Every lead someone owns: Paul plus every salesperson. **Unassigned is NOT included** — the label says "(owned)" and the line under the count says so. |

A salesperson sees only their own leads (server-enforced). They have no owner control and never see Unassigned
in Outreach.

## 1. Old behaviour, and why

- **Wrong default.** Outreach's owner filter defaulted to **"Any owner"** and was remembered. It only filtered the
  rows shown, so Paul's working list held every salesperson's leads. Select all → Queue WhatsApp could message them.
  Ticks also outlived the filter.
- **Paul's adds had no owner.** Find Leads "Add" and the Coverage add-all (`useOutreach.addLead`) insert straight
  from the browser and never set `assigned_to_user_id`. So every lead Paul added landed **unassigned**: 148 in the
  ten days to 2026-10-05. Only `sales_add_lead` ("Add a lead") stamped an owner.
- **"Unassigned" was treated as Paul's.** The first version of this branch made "My leads" = Paul + unassigned to
  compensate. Paul rejected that: unassigned is its own state, never a synonym for his.

**Live counts (2026-10-05):**

| Owner | Active leads |
|---|---|
| Paul (book owner, admin) | 2,683 |
| Unassigned | 2,646 (2,694 including archived) |
| test1 (sales) | 3 |
| Test (sales) | 0 (32 archived) |

All 5,550 leads have `list_type = 'no_website'`.

## 2. Find Leads ownership — server-side, at creation

- **The trigger.** Migration `20261009160000_lead_owner_on_add.sql` adds trigger `trg_outreach_leads_added_by_owner`
  (`lead_owner_on_add`), BEFORE INSERT:
  - A signed-in admin or sales caller inserting a lead with no owner → owner = the caller
    (`assigned_to_user_id`, `assigned_at`, and `added_by_user_id` if blank).
  - A salesperson inserting a lead owned by someone else → refused (`owner_not_yours`). They cannot insert
    directly anyway (RESTRICTIVE policy); this is the backstop.
  - No signed-in user (service role) → untouched. Those are the genuinely unowned new leads.
  - An admin choosing an owner explicitly is kept.
- **Prospective only:** no existing row is updated.
- **No side effects:** the assignment notification and reassignment triggers fire on UPDATE only, so adding a lead
  notifies nobody.
- **Browser belt-and-braces:** `useOutreach.addLead` also sends `assigned_to_user_id` / `added_by_user_id` =
  the adding user, so the owner shows at once and is right even if the app ships before the SQL. The trigger is
  the rule.
- **Salespeople:** they add through `sales_add_lead`, which sets owner = the caller and reads no owner from the
  request (tested: a nominated owner is ignored).
- **Campaign at add time:** the owner is set in the same insert, so a lead added into a campaign from Find Leads is
  owned by the adder from the first moment. A salesperson can only add into their own campaign (`campaign_usable`).
- **Not an import marker:** `outreach_leads_list_type_check` allows only `no_website` / `broken_website` /
  `manual`. The Outreach CSV import writes `list_type: 'imported'`, which the database refuses. That is a
  **pre-existing fault**: the import cannot create rows today. It is flagged as a separate task and not fixed here.
  So `list_type` cannot mark imports, and the trigger does not try.

## 3. The Outreach scopes

- **Applied before the table sees a lead.** `src/pages/Outreach.tsx` → `scopeLeads(...)` →
  `OutreachTable leads={scopedLeads}`. The count, Select all, every bulk action, CSV and Previous / Next only see
  the scope.
- **Not remembered.** Every visit opens on My leads. Unknown or stale values (the old saved `'all'`, a member who
  left) become My leads.
- **Ticks stay inside the scope.** `selectedIds` = ticks ∩ scoped leads, and switching scope clears the ticks.
- **What the screen says:**
  - One line under the count, every view:
    - My leads: "Leads you own."
    - Unassigned: "Leads nobody owns yet (older, imported or system-added). Claim the ones you want to work."
    - A salesperson: "Leads owned by test1."
    - All team: "Every lead someone owns — you and every salesperson. Unassigned leads are not included."
  - Anything other than My leads shows an amber tag beside the count.
- **Leads opened by link.** A lead outside the scope (Inbox, a notification, `?lead=`) switches the view to its
  owner, or to Unassigned.
- **Claim for me** (Unassigned view only):
  - Ticked, still-unowned leads become Paul's through `assign_lead`, the same function the lead popup uses.
  - History records it, and assigning to yourself notifies nobody.
  - At most `CLAIM_BATCH_MAX` (200) per press, after a confirmation naming the count. Nobody is messaged.
  - Nothing is ever bulk-claimed automatically.
  - `claim_lead` is the salesperson's pool rule (it refuses contacted leads) and is deliberately not used.

## 4. Bulk-send safety

- **Queue WhatsApp:** `handleQueueForWhatsApp` calls `contactScopeCheck` BEFORE any queue write.
  - Owner groups: You, each salesperson, and Unassigned as its own group.
  - More than one group → the dialog says *"You're about to queue WhatsApp for 32 leads across 3 owners."* and
    lists the counts per owner (*"You 12 · test1 12 · Test 8"*). The button reads *Queue N across team…*.
  - A second confirmation follows, with Cancel focused and **Queue across team**. That second button is the only
    caller passing `crossOwnerConfirmed`.
  - A salesperson's batch holding anything not theirs is refused outright; the server refuses it again
    (`not_yours`).
- **Campaign launch** (migration `20261009150000`): queues **only** leads owned by the campaign's owner
  (`created_by`). Everything else is counted, never silently dropped:
  - `skipped.other_owner` — owned by someone else.
  - `skipped.unassigned` — owned by nobody, shown as "owned by nobody yet — claim them first".

  Campaign membership never substitutes for ownership.
  - ⚠️ **Live 2026-10-05:** 52 never-contacted UNASSIGNED leads sit in Paul's live campaigns (Locksmiths 24,
    Morgage 21, Plumber 2 5, Accountants 1, plumber 1). They are almost certainly Find Leads adds from before the
    trigger. After this ships, a launch skips them until Paul claims them: Outreach → Unassigned + that campaign
    → Select all → Claim for me.
  - "roofers 2" (created by Test) holds 82 active leads now owned by Paul. An admin launch of it skips them as
    `other_owner`.
- **The opener contact guard** (`opener_contact_block`) is untouched. Launches still go through
  `sales_queue_opener`.

## 5. Salesperson isolation and the leaks fixed in this branch

- **Server-enforced, re-verified:**

  | Path | Enforcement |
  |---|---|
  | List | `sales_leads` view |
  | Queue, unqueue | `sales_queue_opener` / `lead_unqueue` → `not_yours` |
  | Check before calling | `sales-prospect-check` `leadEligibility` |
  | Crawl | `crawl-check` `canWorkLead` + `salesCrawlIdsRefusal` |
  | Status, Next Action, star, archive | `lead_set_*` → `_require_work` |
  | Campaigns | `campaign_usable`, own lead → own campaign |
  | Export | no CSV for Sales; Copy Numbers via `log_data_access` |
  | Messages, voice, media, scripts, Quick Close, socials | `leadAccess` |

- **Leaks fixed here:**
  1. **Campaign launch** messaged other owners' leads by membership (§4).
  2. **`enrich-lead`** returned another rep's or Paul's cached email / Facebook / Instagram by `place_id`. It now
     calls `mayLookUpBusiness` before the cache read.
  3. **`process-whatsapp-queue` `contact_check`** answered "messaged / suppressed" for any phone a salesperson
     sent. A salesperson's phones are now cut to their own leads' numbers (last nine digits) before any read.
- **Noted, not changed:**
  - `quick-close` answers 404 vs 403, which reveals only whether a lead id exists.
  - `agency-check` and `companies-house-check` refresh shared caches of public data.
  - The CSV import fault (§2).

## 6. Tests

- **`scripts/outreach-owner-scope.test.ts`** (in `npm test`):
  - **The rule:**
    - My leads = owned only, with no unassigned and no rep's lead.
    - Unassigned = the pool only.
    - A named rep. All team = owned only, and it says so on screen.
    - Paul + unassigned together are two owners.
    - Sales sees own only and can't widen; a foreign batch, including an unassigned lead, is refused.
    - Stale or `'all'` values become My leads. A lead opened by link moves the view to its owner or to Unassigned.
  - **The wiring:**
    - The page passes the scoped leads, and the scope is not persisted.
    - Selection is intersected and cleared on scope switch.
    - The owner check comes before every queue write. Only "Queue across team" confirms, and Cancel is focused.
    - Claim is Unassigned-only, via `assign_lead`, still-unowned leads only, capped.
  - **The server source:**
    - The ownership trigger: caller owns, no user stays unassigned, a salesperson can't nominate, no existing row
      updated.
    - `addLead` sends the owner.
    - Launch: owner only, with `other_owner` / `unassigned` reported.
    - enrich-lead and contact_check checks come first.
- **`supabase/tests/outreach-ownership.sql`** (live, always rolled back, **32 checks**):
  - **Salesperson A** — own-only view, no direct reads of B's or Paul's leads or crawl checks, cross-owner queue
    refused (3 `not_yours`), stage / Next Action / star / archive / unqueue refused, direct UPDATE = 0 rows.
  - **Campaigns** — A cannot pull others' leads into their campaign or use B's campaign, and candidates are A's own
    leads only.
  - **Adding a lead** — A's add is owned by A; `sales_add_lead` ignores a nominated owner; a direct insert owned by
    B is refused.
  - **Paul's Find Leads insert with NO owner field** → owned by Paul (server-side). An explicit admin-chosen owner
    is kept.
  - **Admin launch** — A's and B's leads skipped as `other_owner`; the unassigned member skipped as `unassigned`
    and not queued; only Paul's own lead considered and queued.
  - **Claim** — claiming an unassigned lead makes it Paul's.
  - **System insert** — an insert with no signed-in user stays unassigned.
  - **Result 2026-10-05:** 32/32 with both new migrations loaded inside the rolled-back transaction. Read back
    afterwards: 0 fixtures left, the trigger NOT live, and unassigned still 2,694 (nothing changed).
- **Updated pins:**
  - `outreach-filters.test.ts` — the owner control is the page scope and not remembered.
  - `initial-opener-select.test.ts` — the queue button also stays disabled on a refused batch.
  - `pre-sales-final.test.ts` — both new migrations are listed as later releases.
- **Gate:** `npm run check` — typecheck 9 = baseline, edge checks clean, build ok, **316/316 suites**.

## 7. Visual QA

- **How it was done:**
  - A throwaway harness rendered the REAL Outreach page, behind `RequireAccess`, over 40 fake ZZ leads with no
    network: Paul 12, unassigned 8, test1 12, Test 8.
  - It was driven by headless Edge at 1440×1000 and 390×844. The harness was deleted before commit.
  - Nobody has seen it on the live app; it is not deployed.

| View | Desktop | Phone |
|---|---|---|
| My leads | `Outreach (12)` "Leads you own." | same, 10 of 12 per page |
| Unassigned | `(8)`, tag "Unassigned", the claim line; 8 ticked → **Claim for me (8)** | 4 ticked → **Claim for me (4)** |
| Switch Unassigned → test1 | the bulk toolbar is gone (nothing selected) | same |
| test1 | `(12)` "Leads owned by test1." | same |
| All team (owned) | `(32)`, "Unassigned leads are not included." | same |
| Select all in All team → Queue | 32 ticked; "32 leads across 3 owners — You 12 · test1 12 · Test 8"; "Queue 32 across team…"; confirmation with Cancel focused | 10 ticked across 3 owners, same confirmation |
| Salesperson | `Outreach (12)` = exactly test1's leads; no owner control | same |

Horizontal overflow: 0 px in every state.

## 8. Deploy (an integration session or Paul — not this branch)

1. **SQL first, one at a time, each read back:**
   1. `20261009150000_campaign_launch_owner_scope.sql` — read back `prosrc ~ 'other_owner'`.
   2. `20261009160000_lead_owner_on_add.sql` — read back the trigger name, and check the unassigned count is
      unchanged.

   Then re-run `supabase/tests/outreach-ownership.sql`: expect 32/32.
2. **Edge functions:** deploy `enrich-lead` and `process-whatsapp-queue`. Both are self-contained; no shared module
   changed. ⛔ Never bundle `whatsapp-status`.
3. **The SPA** ships with `main`. What's New entry: `2026-10-05-outreach-my-leads`.
4. **After it ships, tell Paul** about the 52 unassigned leads in his campaigns (§4): claim them before relaunching.
