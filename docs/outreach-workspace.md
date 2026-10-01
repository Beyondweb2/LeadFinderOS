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
