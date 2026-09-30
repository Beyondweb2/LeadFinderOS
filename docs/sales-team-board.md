# Sales Team Board, delegation from Needs your attention, one status pill (2026-10-01)

Paul: manage salespeople, assign leads, communicate priorities and track outstanding work without
messaging everyone separately on WhatsApp. Three deliverables, one system: the salesperson's **Team
board** (Sales dashboard), the admin's **Send to sales team** + oversight + **Assign** from Needs your
attention, and **one status pill** per Outreach / Inbox row. Branch `feat/sales-team-board`.

Also in this branch (Paul, mid-task): the DM Roofing `audit_followup_call` refusal ("could supply 2") —
the hook pick now prefers a miss that can fill the 3-competitor template (§4).

## 1. The model (migration `20261001200000_sales_team_board.sql`, applied and read back)

| Table | What it holds |
|---|---|
| `team_posts` | one message from the admin: kind, title, body, `details` (targeting / template fields), internal `link`, `lead_id`, `due_date`, `priority`, `status` draft/published/discarded, **`recipients` uuid[] — the frozen snapshot**, `client_key` (unique — idempotent publish), `follow_up_of` (a clarification), `edited_at`/`edit_count` |
| `team_post_recipients` | one row per person: `read_at`, `task_status` (todo / in_progress / completed / cancelled — tasks only), `completed_at`/`completed_by`, `cancelled_reason` (`reassigned`, `cancelled_by_admin`) |
| `team_post_events` | the audit trail: created, draft_saved, published (with the recipient list), edited (with the words BEFORE), status (from → to), cancelled, discarded, reassigned |

- Kinds: `announcement`, `targeting`, `template_update`, `task`, `lead_assignment`, `custom`. Tasks =
  `task` + `lead_assignment`. **Overdue is derived** (an open task's date before today, London) — never stored.
- ⛔ **No write grants.** RLS: admin reads all; a recipient reads their own recipient rows and published
  posts that name them. Every write is a SECURITY DEFINER function; none is callable by anon.
- Notifications: two new kinds `team_update`, `team_task` on the existing `notifications` table
  (`notify_person`, dedupe `team:<post>` — one per person per post; an edit is `team:<post>:edit:<n>`).
  Link `/sales-dashboard?item=<post>`. The bell's realtime arrival re-reads the board (`useNotifications`).

**Functions:** `team_save_post` (admin; draft or publish; "Everyone" computed server-side =
`team_everyone()` — active sales role, **test accounts from `metric_exclusions` left out**; a named
list must be active salespeople; a lead-linked task only to the lead's holder), `team_edit_published`
(labelled edit, old words kept), `team_discard_draft`, `team_cancel_task` (completed stays completed),
`team_board_mark_read` (own rows + the matching notices), `team_task_set_status` (own task; not a
cancelled one; ⛔ touches nothing on the lead), `team_board_mine`, `team_board_admin`,
`team_recipients_preview` (admin: who "Everyone" is, each marked test or not),
**`assign_lead_with_brief`**, trigger `trg_team_lead_reassigned`.

## 2. Lead assignment — one move, one task, one notice, one date

`assign_lead_with_brief(lead, to, note, due, reason, client_key)` = **`assign_lead`** (the canonical
move: admin-only, row lock, same-owner no-op, History `lead_assigned`, `trg_notify_lead_assigned`)
**+ one `lead_assignment` board task** for a salesperson. Used by: Admin → Needs your attention →
Assign, the composer's Lead assignment, and the Inbox / lead-popup owner picker (`useSalesActions().assign`).
**Bulk moves** (`BulkAssignSelect`, Team "move all") stay on plain `assign_lead` — no task per lead.

- Same owner → assign_lead's no-op: no task, no notice, no History (tested).
- To Paul / unassigned → the move only; the previous holder's task is cancelled by the trigger.
- ⛔ **One notice**: the assignment trigger's ("Paul assigned you X", → `/inbox?lead=`), now carrying
  "Instructions: …". The board task sends none of its own.
- ⛔ **One date**: the task shows the LEAD's own Next Action. A date typed in the dialog is written
  through `lead_set_follow_up` (type kept, or `follow_up`; note kept). Completing the task changes
  nothing on the lead — no stage, no Next Action, no message, no suppression, no commission.
- History: the `lead_assigned` row gains `note` and `team_post_id`.
- **Reassignment from any screen** (popup, bulk, Team, the brief) cancels the previous holder's open
  lead-linked tasks (`cancelled_reason = 'reassigned'`, event `reassigned`); nothing is deleted.

## 3. The screens

- **Sales dashboard → "Your team board"** (sales role only; their own items): To do · Updates ·
  Completed; unread marked; To do ordered overdue → soonest → undated. Start / Mark done / Reopen;
  Mark read; one button to the work (the conversation, the attached page, the template's channel,
  Find leads). A template update says **Approved** or **Draft — not approved yet, do not use**.
  `?item=` (the notice's link) opens the tab, scrolls, marks read. "Completed" shows only after the
  server said ok. A lead that moved on reads "no longer in your list".
- **Admin dashboard header → Send to sales team** (the one entry point): type chips; fields follow the
  type; recipients (Everyone = real salespeople only; test accounts pickable by name); a "What happens"
  preview (to whom, what they see, task or not, ownership change or not, notice); confirmation for a
  task, a multi-person send and any lead move; Save draft. WhatsApp templates come only from
  `WHATSAPP_TEMPLATES` — nothing is sent, approved or registered.
- **Admin dashboard → Team → "Sales team board"**: every post (60 days + drafts) with each person's
  state (Unread / Read / To do / In progress / Completed / Cancelled (lead moved)); filters salesperson /
  status / type / due; Edit and send (draft), Discard, Edit (labelled), Send clarification, cancel per
  person or for everyone.
- **Needs your attention → Assign** on `attentionAssignable` items only: quote gone quiet, signed up
  not paid, and non-urgent replies — never urgent, never money / client delivery / complaint / opt-out
  replies, never an aggregate. The composer opens seeded with the lead and the reason. ⛔ Once a
  salesperson holds the lead with an OPEN board task, the item leaves the list and is counted in one
  "N follow-ups are with the team" line (`adminMetrics.delegation`, fn `admin-overview`); it comes back
  when the task is done/cancelled or the lead moves, if still true. Urgent items never leave.

## 4. One status pill (Outreach rows, phone cards, Inbox header and list)

**As shipped after Paul's review (same day):** the one pill is **yesterday's solid pipeline badge** — its own
words and colours (Replied solid green, Queued, Contacted, Not Interested, Paid…). **Interested is only the
gold star**, never a pill. What was removed is the SECOND pill: the sales-state pill drawn beside the badge
(`stateShownByBadge`, 2026-09-30 — "New · Opener queued" + "Queued", "Replied" + "Replied"). The stage now
appears only in the pill's tooltip, the popup and Focus. The Inbox header's extra "Queued" chip shows only
as "Queue paused". Filters unchanged. The lead popup keeps both on purpose — it is the detail view.

⛔ **Tried and rejected (Paul, 2026-10-01):** a pill that SUBSTITUTED the stage ("Interested", "Replied" in the
pale sales-state colours) for the pipeline word — "put the pills back to how they worked yesterday", "I like
solid colour pills", "interested was supposed to just add a gold star". Do not bring it back.

**Hook pick (DM Roofing):** `pickHookResult` now ranks, within an engine, a miss naming ≥
`RIVALS_REQUIRED` rivals above one that cannot (then the score). The emergency search (2 names) had
out-scored roof repair (5 names) on the trade-word bonus. Google AI still first; names never borrowed
or padded; fewer than three in every Google AI miss still refuses. Same order as voiceNoteScript.

## 5. Tests

- `scripts/team-board.test.ts` (rules, delegation fold, shape); `lead-state.test.ts` §2 rewritten for
  the one pill (the whole matrix: New, Queued, Sent, Failed, Replied, Interested + queued, Meeting +
  queued, Not interested, Opted out, Client, Won, logged contact, Wrong number); `inbox-workflow`,
  `hook-score` (DM Roofing case), `client-copy-claims` (four new operator screens).
- **Live, rolled back:** `supabase/tests/sales-team-board.sql` — 41/41 on 2026-10-01 (scenarios A, C, D, E,
  G: independent read state, retries, draft → publish, lead-linked task refusal, assignment with
  instructions, one notice, Next Action untouched / set through the one writer, History, same-owner
  no-op, reassignment cancels A's task, back to Paul, inactive refused, labelled edit, a salesperson
  cannot publish / assign / read oversight / write directly / touch another's task). Read-back after:
  0 posts, 0 fake users. Run: send the file as one query; results are in the error message.

### Live on production (2026-10-01, main `eeb692cb`, leadfinderos-next)

- **Deployed:** migration `20261001200000` (+ follow-up `200100`, completing a task marks its notice
  read — found in this test), then 24 edge functions (every function reaching adminMetrics, teamBoard,
  hookScore, leadState, admin-overview-load), each proven by a new-code marker in its deployed bundle;
  send-whatsapp-message `x-swm-build: 2026-10-01a`. SPA chunks carry the new screens.
- ⚠️ **A parallel session (api-cost-ownership) deployed admin-overview + business-summary 90 s after
  this one, from a tree without this work.** Reconciled: its main `02398e48` merged in, both
  redeployed from the combined tree, both markers verified; the session was told.
- **Tested as the Test salesperson on the live site** (Paul's approved test account; "Paul SALES" test
  lead; nothing sent to any business): an announcement, a task (due tomorrow, high) and an assignment
  with instructions were published as Paul (all notified); the board showed them; Start → In progress,
  Mark done → Completed ("Paul can see it is done"); Mark read cleared the bell item; the assignment's
  notice named Paul and carried the instructions; Open conversation opened the lead in the Inbox with
  "Owner: Test"; every status on Inbox and Outreach was ONE pill (no stage pill outside it); the board
  at 390 / 820 / 1440 / 1920 px has no sideways scroll. From the rep's own session: publish, assign,
  oversight, cancel → 403 `admin_only`; a direct insert → 403; only their own posts visible; the audit
  trail invisible; anon refused. Reassigned back to Paul: owner Paul, status and Next Action unchanged,
  0 messages, History 7 → 9, the rep's task "Cancelled · Lead moved to someone else", no task for Paul.
  Signed out (`logout?scope=local`). The three TEST items stay on record (labelled TEST).
- **Not done:** the admin screens were not clicked (no admin session here); their functions are covered
  by the rolled-back SQL test and by the published-as-Paul calls above. Nobody has visually reviewed it.

## 6. Limits / open

- **The "Test" account's real work moved to Paul (2026-10-01, Paul: "it was meant to be done under admin
  (paul account) move them over").** All 82 leads it held (added under it since 27 Sep; 49 WhatsApp
  messages, 7 replied) were moved to Paul with `assign_lead` as admin, one at a time, all-or-nothing:
  0 left on Test, 82 `lead_assigned` History rows (from Test → Paul), no notices, no sends, statuses /
  Next Actions / messages untouched. NOT rewritten (historical rows, left for Paul to decide):
  `added_by_user_id` on those 82 (the dashboard still counts them as "added by test accounts") and the 99
  `lead_activity` rows the Test account logged (its calls/contacts stay out of performance numbers).

- The only active salespeople are the two test accounts, so **Everyone reaches nobody** until a real
  salesperson joins; pick a test account by name to try it.
- A salesperson who LOSES a lead sees the cancelled task ("Lead moved to someone else") on next read;
  there is no separate "removed" notice (unchanged from sales-workflow-nav).
- No per-person send confirmation beyond the notification; no replies/threads/reactions by design.
