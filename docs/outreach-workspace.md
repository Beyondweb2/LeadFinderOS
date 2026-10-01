# Outreach as the sales workspace, grouped replies, trade auto-fix (2026-10-01)

Paul: a salesperson should work a lead from Outreach start to finish — understand the business, see a
truthful status, run/review the audit, call, log the outcome, set the Next Action; Inbox only for real
WhatsApp conversations. Repetitive admin work collapses into grouped notifications and one-click free
fixes. Branch `feat/outreach-workspace`.

## A. Truth model

### Why failed WhatsApp leads read "Contacted" (found 2026-10-01)

The queue stamps `whatsapp_sent_at` the moment Meta ACCEPTS a message (`process-whatsapp-queue`). About a
second later Meta's webhook may report 131026 (not a WhatsApp user); `leadFailurePatch` sets status
`no_whatsapp` but never clears the stamp. `salesStateOf` counted the stamp as contact. **209 of 217
`no_whatsapp` leads carried it with zero real sends.** The admin funnel's `contactedEver` did the same.
Second bug: the queue's already-sent guard matched ANY non-test `whatsapp_sends` row, failed ones
included, and restored a re-queued failed lead to `initial_contact` (2 leads).

### The rule now

- `leadState.openerReallySent`: the send stamp counts only while the status is not a failed-send status
  (`no_whatsapp`, `whatsapp_failed`, `no_whatsapp_needs_sms`), or when Meta has confirmed a delivery
  (`whatsapp_ever_delivered`). Used by `salesStateOf`, the admin funnel (`adminMetrics`) and the popup's
  last-contact fallback (`useLeadSalesState`). Queued is New; a failed send is not Contacted; a logged
  contact (any outcome, the existing rule) is Contacted and its detail stays in History.
- **An attempt is not a contact** (found in the live test: a logged no-answer read "New → Contacted"):
  `leadState.REACHED_OUTCOMES` = the conversation outcomes (THE list, was copied in salesPerformance and
  adminMetrics) + `message_sent`. No answer, voicemail, a connection request and wrong number are attempts.
  `LastContactView.everReached` keeps an earlier real conversation counting after a later no-answer. The sales
  funnel and the admin funnel count only reached contacts; the call stats still count every call.
- The queue's already-sent guard ignores `failed / failed_temporary / simulated` sends; a NULL delivery
  status still blocks (sending path: absent means do not). That matches the guard's own comment.
- **Not changed (decision for Paul):** SQL `lead_first_contact_at` still counts the stamp as a "legacy"
  contact. It keeps those 209 leads out of `claim_lead` / `sales_pool`. Changing it would make 209
  dead-WhatsApp mobiles claimable.
- **Historical data:** no row rewritten for the 209 — the display is derived, so the fix applies to every
  row at once. The 2 leads falsely restored by the guard were corrected with evidence (only failed sends,
  no delivered message): Luna Locksmiths → `not_contacted` (its send was refused before going out), Top
  Admin Services & Bookkeeping → `email_sent` (its previous status); `whatsapp_delivery_status` set to the
  real latest result.

- **The row pill** stays the solid pipeline badge (Paul's choice); `leadState.pillStatusOf` shows the solid
  "Contacted" badge when a logged contact reached the business but the WhatsApp pipeline still says New / No
  WhatsApp / failed. Display only; the menu still sets the stored pipeline status.

### WhatsApp vs mobile (`src/lib/whatsAppCapability.ts`)

The row icon said "Mobile — WhatsApp-capable (line-type check)" from `line_type` (an OFFLINE number-format
guess, libphonenumber — not a network lookup) while the status said "No WhatsApp" from Meta's rejection:
201 leads showed both. One resolver now: Meta rejection → **No WhatsApp**; a delivery (ever_delivered, or
delivery status delivered/read) → **WhatsApp verified**; landline/VoIP → **Not a mobile**; mobile with no
message yet → **Mobile number** ("WhatsApp not checked yet"); nothing → **WhatsApp not checked**. Used by
the row phone icon (`LeadEnrichButtons`), the "WhatsApp-capable" filter (rejected numbers excluded) and
the Prospect tab's phone line. `whatsapp_status` is 'unknown' on every lead and stays unused.

### Next Action in its column

The grey line under the Status pill was the last LOGGED contact (history), not a Next Action; logging
"call back" never saves one (Next Actions stay human-set, 2026-09-28). It is gone from the Status cell
(now the cell's tooltip: "Last contact: …"). The Next Action column shows the stored action (unchanged —
`nextActionViewOf` renders every stored value) and, only when none is stored, one line from
`nextUpHint`: a current meeting, or "Call back · no day set". Live 2026-10-01: 1 lead holds a Next Action;
3 leads logged a call-back without saving a day.

## B. The workspace (same audit engine)

- Work tab: `LeadHookPanel` (the Inbox's own `HookVisibilityCard`: score, rivals, report, progress) +
  **Run a new check** after a finished one + **Previous checks** (outreach audits, report links) + the
  trade/town prompt when missing (saved via `lead_set_details` for sales / the row for admin, then the
  three questions proposed). Same `create-ai-audit` hook path (preview → review → run, 3 × 2), same
  server guards (`salesAuditRefusal`, already_running). No cost shown: the platform does not show one.
- Call icon: opens the dialler AND the workspace on Work; **no longer runs `executeContact`** (it wrote an
  attempt with no outcome and status `initial_contact`). Phone number links never logged anything.
- Workspace header: the star toggle (`lead_mark_interested`, both roles). Prospect tab: Google Maps link,
  WhatsApp capability beside the phone.

## C. Grouped replies

- SQL `my_whatsapp_unread_counts()` (migration `20261001220000`, read-only) = `my_whatsapp_unread()` +
  unread inbound messages per conversation — the Inbox's own unread truth, reused, not re-written.
- `src/lib/notificationGrouping.ts`: one card "N new WhatsApp replies" / "N new replies from M
  businesses" → `/inbox?filter=unread`; `whatsapp_reply` rows are kept (desktop alerts, history) but
  never drawn or counted. **Bell badge = unread conversations + other unread notifications.**
- Found: Paul's bell read 0 with 5 unread conversations (reply notices go to the holder); Test had 9
  unread notices for leads reassigned away. Both are fixed by counting from unread state.
- Other repetitive kinds (candidates, not grouped): `audit_finished` (7 of Test's 20), `follow_up_due`
  (none written yet). Kept separate: payments, commission, failed sends, sign-up opens, assignments,
  Team Board, transfer requests, quick close.

## D. Missing-trade auto-fix

`src/lib/tradeInference.ts` (explicit phrase list, no fuzzy match): evidence = the lead's audit
business_type, campaign trade_slug, campaign name, a trade word in the business name. High (a stored
trade, or two sources agreeing) is saved; medium (name or campaign name alone) is listed for review; low
is left. SQL `admin_set_lead_trade` (migration `20261001220100`, admin-only) writes `search_keyword` only
while blank and logs `details_set` with source, confidence and evidence. Free: no AI, Google or crawl.
Dry run on the live 42: **36 high (33 barbers, 3 plumbers), 5 review, 1 unresolved**.

## Live on production (2026-10-01, main 1c3d72a1, leadfinderos-next)

- SQL: `20261001220000` (my_whatsapp_unread_counts) and `20261001220100` (admin_set_lead_trade), applied and
  read back (anon cannot execute; admin-only check present). Functions redeployed after a fresh main check
  each time, every bundle checked for a new-code marker: admin-overview, business-summary,
  conversation-triage, sales-performance, process-whatsapp-queue (the already-sent filter).
- Data: the 2 falsely restored leads corrected (evidence above); **36 trades saved** through
  admin_set_lead_trade as Paul (33 barbers, 3 plumbers; 36 History rows with evidence). No-trade count 42 → 6
  (5 for review: SOUL PLUMBING, Buddies Dog grooming, Fresh Kuts, Infinite Golden Scissors, A Cut in Time;
  1 unresolved: Dogs of Southsea). No messages sent.
- **Tested as the Test salesperson** (the "Paul SALES" QA lead, assigned to Test, then returned to Paul with
  its Next Action cleared; signed out after): the lead opened on Work with the audit block first, Log a
  contact, Next Action; star in the header; "Propose questions" proposed three via create-ai-audit; Run was
  REFUSED by the server's town gate ("Google could not confirm the town") — the same guard as the Inbox, so no
  audit ran (cost: the question proposal only). Logging "Call back" → the row's Next Action column read
  "Call back · no day set", nothing under the Status pill, its tooltip "Last contact: Call · Call back"; the
  pill read the solid "Contacted" (pipeline still New). Setting Call · Tomorrow in the workspace → the column
  read "Call · Tomorrow" and the Inbox header showed the same "Call · Tomorrow". The Inbox list row read
  "New" — fixed the same day (the list now reads logged contacts). Outreach at 390 / 820 / 1440 px: no
  horizontal overflow. The bell no longer counts Test's 9 stale reply notices.
- Not done: the admin screens were not clicked (no admin session); "Fix automatically" was run through the
  same function from here. Nobody has visually reviewed the screens.

## E. Claimable ≠ WhatsApp-reachable, legacy barbers, the last trades, the sweep (2026-10-01, Paul's decisions)

**Claim rule** (migration `20261001230000` + `230100`): `lead_claim_block(lead, caller)` is THE rule —
`claim_lead`, `sales_pool` and Find Leads' identity state ('protected' / 'claimable') read it. It blocks:
owned by someone else, archived, client, opted out, not interested / closed, a wrong number, any
`contact_suppressions` row, or a genuine contact attempt on record (`lead_contact_attempt_at`). It never
reads a channel fact (No WhatsApp, line type, a bounced email). `lead_first_contact_at` reads the WhatsApp
stamp through `lead_opener_really_sent` (the SQL twin of `openerReallySent` — failed-send statuses plus a
lead put back to New / Queued; ever-delivered still counts). `assign_lead_on_contact`: an automatic queue
send assigns the lead only once Meta DELIVERS it (a person's own send at once), so a send that then fails
no longer hands the lead to the book owner.

**The 209 No WhatsApp leads** (all held by Paul — the 2026-09-27 backfill assigned every "contacted" lead to
the book owner, and its contact date WAS the failed stamp): 171 released to the unowned pool through
`assign_lead(null)` as admin (History `lead_unassigned`), each with no genuine contact, no human activity, no
star and no Next Action. **171 claimable now.** Still not claimable: 5 held by Paul (2 had a real delivered
send, 3 human activity) and 33 archived. They keep status `no_whatsapp` (the fact reps need), not Contacted.

**Legacy barbers:** 45 live leads in the retired barber campaigns (Paul's 33 + 12 more from the same
campaigns; none had a Findable audit, a reply, a send after 2026-09-16, onboarding, a Next Action or any
human activity; the 4 "interested" ones were marked in the barber era) were archived via
`lead_set_archived` with a History note. Nothing deleted; statuses, history and ownership kept; searchable
under Archived.

**The five reviews:** none had a website, audit, crawl or category except Dogs of Southsea (the unresolved
one), whose stored page (a Fresha listing, robots.txt allows it) lists its services "Dog Grooming" → saved
'dog groomers' (source `website_services`, high). `tradeInference` now treats the business's own website
services (the free crawl cache `lead_crawl_checks.result.siteInfo.services`) as a stored trade. The 3
barber-campaign ones were archived as legacy. **Left for Paul: SOUL PLUMBING UK LTD, Buddies Dog grooming**
(their names say it, but no free evidence exists — a Google category would be a paid lookup).

**The sweep** (attempt / contact / WhatsApp still interchangeable): fixed — History downgrade from a later
no-answer (`stateAfterPlan` keeps `reached`); the stamp on a re-queued lead; the rep cohort's first contact
(reached only, like the funnel); the cold-opener guards counting `failed_temporary` / `simulated` as prior
contact (5 unassigned mobiles could never get an opener); follow-up eligibility needing a REAL opener /
report; the queue's already-sent read (delivered / read too); the WhatsApp panel's "Sent" line; Focus /
Inbox / useInbox "not failed" → `isRealSend`; `whatsapp_ever_delivered` loaded by admin-overview and
conversation-triage; stale "mobile = WhatsApp-capable" comments. Left as is (intentional): coverage "worked"
= attempted; the anti-duplicate opener guards counting attempts; `sales_queue_opener`.
Still inconsistent (small): the Outreach "status" FILTER reads the stored pipeline status while the pill can
read Contacted for a lead reached by phone (2 leads) — the filter runs over all leads, the logged contacts
are read per page; `salesStateOf` in the admin attention labels and the triage AI hint get no logged
contact, so a lead reached by phone reads New there (labels only, counts unaffected); the wa.me "Open
App" path from Manage (`handleDialogSent` → `executeContact`) still records an attempt with status
`initial_contact` (14 legacy, archived leads have only that).
Tests: `scripts/attempt-contact.test.ts`; live rolled back `supabase/tests/claim-rule.sql` 16/16.

## F. Final contact-state consistency (2026-10-01)

- **Outreach status filter = the row pill.** The filter matched the STORED pipeline status while the pill read
  `pillStatusOf(status, rowSalesState(lead))`, and the logged contacts behind it were read for the visible page
  only. Now one `rowSalesState` (above the filter) over `useAllLoggedContacts()` (every logged contact the caller
  may see — a small table) feeds both; the filter keeps a lead when the status its pill SHOWS is in the option.
  The page-only Wrong-number read was dropped from this reading (it never changed the pill and the filter cannot
  see it off-page).
- **Labels:** Needs your attention lines (`adminMetrics.stateOf`, and the reply-triage items' `state`) were built
  without logged contacts, so a lead reached by phone read "New"; they now use `stateLabelOf` (the lead's logged
  contacts from its facts). `conversation-triage` reads the leads' logged contacts once per run and tells the AI the
  same state. Labels only: urgency, "settled", follow-up counts, ordering keep their inputs.
- **The old "Open in WhatsApp app" path** (`handleDialogSent` → `executeContact` → `logAttempt`) set a New lead to
  `initial_contact`. Both hooks now record the attempt (outreach_attempts / last_outreach_attempt_at / an
  outreach_events "attempt") and never change the status. The 14 archived legacy leads that path once set to
  initial_contact were left: nothing records their status before, so there is no deterministic correction.
- **Sweep:** no remaining place sets Contacted from a click or a queue, reads a failed send as contact, or treats a
  mobile as WhatsApp. Intentional and kept: the queue's own `initial_contact` on a Meta-accepted send (a failure
  webhook moves it to No WhatsApp), coverage "worked", "never tried" checks (`isFreshLead`, the phone-change
  confirm), the follow-up batch (initial_contact only), and the "Most recent contact" sort (it sorts by the latest
  attempt or send).
- Tests: `scripts/contact-state-final.test.ts` (the brief's whole matrix: pill ↔ filter, attempts, labels, AI context).

### F2. Live verification found: the star hid the contact (2026-10-01)

- Driving the Test salesperson on a QA lead: Spoke to owner → Contacted ✓, then ⭐ → the pill and the filter went
  back to **New**. `pillStatusOf` keyed on `state === 'contacted'`, and the star (and a current meeting) outrank
  contacted in `salesStateOf`. So logging "Interested" or "Meeting booked" on a call, which both set the star, showed
  New too.
- Fix: `SalesStateView.reached` (a real send, a logged conversation, or a pipeline already past New), computed once
  in `salesStateOf` whatever state wins; `pillStatusOf` reads it. Starred and never reached stays "New ⭐".
- A salesperson's "Open in WhatsApp app" stores only the `outreach_events` attempt: `outreach_attempts` /
  `last_outreach_attempt_at` are `NOT_STORED_FOR_SALES` (`salesPatchPlan.ts`). A salesperson has no direct write on
  `outreach_leads` (RLS: owner `user_id` or admin), so `logAttempt`'s row update silently matches 0 rows on an
  assigned lead. That is by design, and it predates this work. The admin's attempt stores both.

## G. Interested is the star, in every filter (2026-10-01, Paul's brief)

- **The one field:** `outreach_leads.is_potential_work` (the gold star). `leadState.isStarred` is the one reading;
  every Interested filter uses it: the Outreach status filter's "Interested ⭐ (star only)", the ⭐ Interested
  toggle (kept, because it combines with a status, e.g. Contacted + ⭐) and the Inbox's Interested filter. Before,
  the status-filter option compared the row pill with the stored status `interested`, which nothing had written
  since 19 Sep, so it found no starred lead. The Inbox's version also let in Price given without a star.
- **The one write:** every "Interested" in a status menu (Outreach row, phone card, workspace, bulk "Set
  Status", Inbox pill, `setLeadPipelineStatus`) and every star button calls `lead_mark_interested` (History
  "Starred" / "Unstarred"). The admin's menus used to write the column directly with no History, and the row,
  phone card and bulk paths each wrote it twice.
- **The pill:** the star never moves it (`scripts/interested-star.test.ts` sweeps it with and without the
  star). The stored status `interested` is never drawn as a pill: `pillStatusOf` shows Contacted (reached) or
  New. One path still writes it, together with the star: a no turned yes (`leadOutcome`), because the trigger
  that lifts the Not interested block keys on it. Such a lead stays "interested" in the pipeline, so a later
  reply cannot flip it to Replied (it is protected); its pill reads Contacted.
- **Legacy rows:** 24 live leads had status `interested` and no star, all with WhatsApp replies and with no
  record of when they were marked. Normalised (deterministic): the star on, the status from the last WhatsApp
  message (theirs → `replied`, 7; ours → `awaiting_reply`, 17), a History note plus the star and stage rows on
  each. The before-state is in `_legacy_interested_backup_20261001` (RLS on, no policies, no anon grant). One
  archived barber lead keeps `interested` + the star.
- **SMS:** the post-contact tips popup's "No WhatsApp? Try SMS" tip is removed. The not-on-WhatsApp warning,
  the Outreach intro and three unused locale strings no longer suggest SMS.

## H. Revived leads and the Inbox status filter (2026-10-02, Paul's brief)

- **Revive.** Root cause: logging Interested or Meeting booked on a Not interested or Closed lead wrote
  `lead_set_stage('interested')`, the pre-star status. `whatsapp-inbound` protects that status from a downgrade
  (`INBOUND_NO_DOWNGRADE`), so a later reply never set Replied, and `send-whatsapp-message` moves only
  `replied` → `awaiting_reply`. Now `outcomePlan` returns `revive: true` (its `status` is only ever
  `not_interested`), and `applyOutcome` calls **`lead_revive`** (migration `20261002120000`). It writes the
  status the lead's own WhatsApp history proves: their message last → `replied`, ours last →
  `awaiting_reply`, an opener really sent → `initial_contact`, otherwise `not_contacted` (the pill still reads
  Contacted from the logged call). It never writes `interested` and never touches the star.
  **The block lift has one rule:** `_lift_not_interested_block`, called by the unchanged trigger (not_interested
  → interested / won) and by `lead_revive` (leaving not_interested only; Closed keeps its old no-lift
  behaviour). It removes only reason `not_interested` rows without a wrong-number mark, and records History.
  Live rolled-back test: `supabase/tests/lead-revive.sql` (18 checks). `lead_set_stage` still allows
  `interested` (the allowlist is pinned to `SALES_SETTABLE_STATUSES` by three suites), but no client sends it
  (swept).
- **Inbox filter.** Root cause: the Inbox matched `c.leadStatus === statusFilter`, the STORED status, while its
  pill showed `pillStatusOf`. Its logged contacts were read only for the rows already shown, so a filter could
  never use them. Now **`src/lib/statusFilter.ts` `shownStatusMatches`** is the one match. It is Outreach's rule
  (the pill's status in `statusesForFilter`'s group; Interested = `isStarred`), used by both pages. The Inbox
  reads `useAllLoggedContacts` before filtering, and its list pill and filter read the same `listStageOf`.
  Unchanged: the Inbox keeps unassigned and paying conversations always visible, and the hidden
  not-interested and closed rows.

## I. No new 'interested' status; the open Inbox conversation stays pinned (2026-10-02)

- **Routes that could still store 'interested'** (traced in the live database, the edge functions and `src`):
  `lead_set_stage('interested')` for both roles; any direct row write (the admin's RLS, the service role,
  SQL); and a queue-cancel restore from `previous_status` (one archived barber row has `interested` there).
  The other database functions that name it (`lead_log_contact`, `lead_record_call`,
  `lead_log_state_change`) use it as an outcome or state name, not a status. No edge function or client
  source writes it (swept by `scripts/no-legacy-interested.test.ts`; `demoLeads.ts` is local demo data).
- **Normalised, not rejected** (migration `20261002140000`). `lead_set_stage('interested')` →
  `lead_mark_interested` (the star, History "Starred"). The BEFORE trigger
  `trg_outreach_leads_no_legacy_interested` turns any new write of it (an insert, or an update from
  another status) into the star, keeping the real status (an insert gets `not_contacted`). It sorts before
  the other status triggers. Rows already holding `interested` (2 archived) are history: untouched,
  rendered through `pillStatusOf` / `salesStateOf`. A raw not_interested → interested write now stays Not
  interested (+ the star) and lifts no block; only `lead_revive` revives. Live rolled-back test:
  `supabase/tests/no-legacy-interested.sql` (13 checks).
- **Inbox, the open conversation.** Not a permission rule: the list drew the empty state when
  `filteredList` was empty, which replaced the pinned open conversation. The admin always has matches; a
  salesperson with one conversation had none. The empty state now waits for `shownList`. The marker and
  select-all (which reads `filteredList`) are unchanged.

## J. One Next Action: one form, one write, one list (2026-10-02, Paul's brief)

- **The model (unchanged):** `outreach_leads.next_action` (enum `next_action_type`), `next_action_date` (a London
  DAY), `next_action_note` (≤500). The only time is a Meeting's `call_booked_at`. Reminders
  (`notify_due_follow_ups`) and the team brief (`assign_lead_with_brief`, which calls `lead_set_follow_up`
  server-side) read and write the same columns.
- **The types (unchanged, one list):** `NEXT_ACTION_OPTIONS` in `salesCrm.ts`: Call, WhatsApp follow-up,
  Email, Follow up (other), Send information, Meeting, plus Nothing planned. The enum's other values
  (send_voice_note, send_initial_text, 2nd_follow_up, send_draft, check_3_day_removal, remove_if_no_reply) are
  older ones that are only ever read (`NEXT_ACTION_LABEL`). None were added: next actions are barely used (one
  live lead had one on 2026-10-02), and the suggested extras overlap these (Call back = Call + the Call back
  outcome's day; Send quote / proposal / report = Send information + the note; Book meeting = Meeting with a
  time).
- **What was duplicated:** the Outreach cell (`NextActionEditor`, row and phone card) was its own popup. It had
  no note, no time and no Clear, and it auto-saved the moment a type and a day were both picked. The admin's
  save (`useOutreach.updateNextAction`) wrote the row directly, logged only the old `outreach_activities`, and
  left no History line. A salesperson's went through `lead_set_follow_up`. The admin list did not even load
  the note.
- **Now:** one form, `src/components/NextActionForm.tsx` (extracted from the workspace's `FollowUp`, plus the
  Meeting time), drawn by the lead workspace and the Outreach cell. One write, `src/lib/nextActionWrite.ts`:
  `saveNextAction` → `lead_set_follow_up`, and `bookMeeting` → `lead_set_call_booked` + the Meeting on that
  day + History "Meeting booked". Used by the cell, the workspace (its meeting form too), and
  `useOutreach.updateNextAction` (bulk menu, Inbox popup; a value not given keeps the lead's own). The display
  is `nextActionView` / `nextActionText` everywhere, now with the Meeting's time. Paid Clients and the team
  composer use the same words.
- Tests: `scripts/next-action-one-flow.test.ts`; live rolled-back `supabase/tests/next-action-one-flow.sql`
  (14 checks).
- **Found live: meeting times are UK time.** The form, and the workspace's two meeting boxes ("When is the call /
  meeting?" and "Call booked for"), read the typed time in the computer's own clock. Paul's is UTC+7, so 14:30
  booked 08:30 UK, while every screen shows UK time. All three now use `londonInstant` / `londonLocalInput`
  (`nextActionView.ts`; BST and GMT tested) and are labelled "(UK time)". This overturns the 2026-09-30 test
  rule "the meeting box does not claim UK time": it reads UK time now, so the label is true.

## K. An optional UK time for every Next Action; Send proposal and Chase payment (2026-10-02)

- **The field:** `outreach_leads.next_action_time` (`time`, nullable). It is a UK wall-clock time on
  `next_action_date` (a UK day); a check means a time needs a day. Read together as Europe/London:
  `public.next_action_due_at(date, time)` in SQL, `londonInstant(day, hhmm)` in TypeScript (`salesCrm.ts`), both
  DST-correct and tested either side of 29 Mar and 25 Oct 2026. Null means no time: every old row reads exactly
  as before. Migration: 0 rows (no lead had a Meeting next action; the only two booked meetings were on archived
  QA leads).
- **Meetings, one time:** `call_booked_at` stays the "Meeting booked" fact (`salesStateOf`). It is not the
  general time, because a call at 14:30 must not make a lead "Meeting booked". A Meeting saved with a time
  books `call_booked_at` from that time inside `lead_set_follow_up`. `lead_set_call_booked` moves an existing
  Meeting's day and time with the booking. Displays read only `next_action_time`. The note no longer gains
  "Meeting at HH:MM" (old notes keep it).
- **The write:** `lead_set_follow_up(_lead_id, _next_action, _date, _note, _time default null, _done default
  false)` replaced the four-argument version, which was dropped. Old four-argument calls still resolve. History
  `follow_up_set` now carries `change` (set / rescheduled / changed / updated / completed / cleared), `time`
  and `from`, and an identical save writes nothing. `activityDetail` says it in words. The team brief keeps a
  time while it keeps the day, and the bulk menu and a salesperson's patch keep it too.
- **Due:** `followUpBucket(date, today, time?, nowMs)`. Untimed actions keep the day rule (today all day,
  overdue from the next UK day). Timed actions are overdue once the UK time has passed. The filters, sort,
  admin counts and sales workspace all read it; "Next 7 days" leaves out overdue ones. The reminder
  (`notify_due_follow_ups`, daily 06:00 UTC) stays day-based and now prints `next_action_label` (the SQL twin
  of `NEXT_ACTION_LABEL`, held equal by the suite) and the time.
- **Types:** `send_proposal`, `chase_payment` (enum migration `20261002160000`, its own step). They are offered
  in the form and the bulk menu, and each has its own Type filter. No agreement / signature type: that will
  come from the contract workflow.
- **onboarding-audit-fields (the last red suite): B, environment.** It read the working tree of whichever
  findable-site copy was on disk (a stale worktree or the stale primary checkout). It now reads
  `origin/master` (what findable-site deploys) through git and prints the revision; it passes from every
  copy. The full suite is 273/273 with `FINDABLE_SITE_DIR` on a clean origin/master worktree.
- Tests: `scripts/next-action-one-flow.test.ts` (rewritten); live rolled-back
  `supabase/tests/next-action-one-flow.sql` (29 checks). `next-action-human-only.sql` (19) and
  `sales-shared-workflow.sql` (37) were updated to the new signature and the Meeting sync. `sales-team-board.sql`
  passes 41/41.
