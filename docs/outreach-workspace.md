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
