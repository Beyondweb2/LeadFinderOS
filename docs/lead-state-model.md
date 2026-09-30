# Lead state model — statuses, contact outcomes, Next Action (audit + build, 2026-09-30)

Paul's brief: "I press *Left voicemail*, I get a toast, and the lead does not visibly change." Goal:
CONTACT → OUTCOME → VISIBLE STATE → NEXT ACTION → FOLLOW-UP, no decorative buttons, no invisible
state, no toast-only actions, no duplicate status systems.

**Code:** `src/lib/leadState.ts` (the engine: state, outcome rules, suggestions, last contact),
`src/lib/leadOutcome.ts` (carries out an outcome, both roles), `src/lib/strongStatuses.ts` (the one
"never overwrite" list), `src/components/SalesStatePill.tsx` (draws it), `src/hooks/useLeadSalesState.ts`
+ `useLastLoggedContacts.ts` (gather its facts). **Tests:** `scripts/lead-state.test.ts` (171 checks).
**SQL (live, read back):** `20260930150000_next_action_types.sql` (enum + email / send_info / meeting),
`20260930150100_lead_state_changed.sql` (`lead_log_state_change`).

## 1. The decision: the sales state is DERIVED, the pipeline status is kept

`outreach_leads.status` is not a sales state. It is the **WhatsApp pipeline**: the queue writes
`queued` / `initial_contact` / `no_whatsapp*` / `whatsapp_failed`, the inbound handler writes `replied`,
the senders write `report_sent` / `awaiting_reply`, Stripe writes `payment_received` / `refunded`.
Dozens of eligibility checks read those exact values (the agent map below). Rewriting 5,490 rows into a
new vocabulary would break the queue and fabricate history.

So the **sales state is a reading** (`salesStateOf`), never stored — the same principle as `serveGate`
and `townVerdict`. It reads the pipeline status plus the facts beside it: the Interested star
(`is_potential_work`), the booked meeting (`call_booked_at`), the paid amount, the newest logged contact
and the Wrong number mark. Consequence: **a weak contact event cannot downgrade a strong state** — a
voicemail writes only activity, and the reading still says Interested. Nothing to migrate; old leads
read correctly on day one; an unknown value reads **Other** and shows itself (never "New").

## 2. Every status found (live counts 2026-09-30, 5,490 leads) → the canonical state

| Stored value | Leads | Written by | Sales state | Verdict |
|---|---|---|---|---|
| `not_contacted` | 190 | inserts; queue dequeue | New | KEEP |
| `no_whatsapp_needs_sms` | 2,690 | queue line-type gate | New | KEEP (landline marker, Paul's decision) |
| `no_whatsapp` | 215 | permanent WA failure | New | KEEP |
| `whatsapp_failed` | 0 | WA retries exhausted | New | KEEP |
| `queued` | 0 | queue buttons, `sales_queue_opener` | New · Opener queued | KEEP (machinery) |
| `initial_contact` | 1,200 | queue send, contact buttons | Contacted | KEEP |
| `second_attempt` | 65 | contact follow-up queue | Contacted | KEEP |
| `report_sent` | 563 | auto-pitch, report template | Contacted | KEEP |
| `awaiting_reply` | 138 | a send to a replied lead | Contacted | KEEP |
| `email_sent` | 23 | **nothing** (Instantly is dead) | Contacted | KEEP for old rows; no writer |
| `bounced` | 0 | **nothing** | Contacted | obsolete; kept readable |
| `site_sent` / `already_visible` | 0 | manual bulk only | Contacted | legacy; kept readable |
| `replied` | 107 | inbound reply | Replied | KEEP |
| `interested` | 25 | legacy (the star replaced it) | Interested | MERGED into the star; revive target only |
| `price_given` | 5 | manual, `lead_set_stage` | Interested · Price given | MERGED (a detail, not a state) |
| `won_pending_onboarding` | 0 | `lead_set_stage` (rep closes) | Won · awaiting onboarding | KEEP |
| `payment_received` / `in_delivery` / `completed` | 4 / 0 / 0 | Stripe, hub, manual | Client | KEEP |
| `refunded` | 1 | Stripe refund, review queue | Client · Refunded | KEEP |
| `not_interested` | 259 | manual, outcome, hook automation | Not interested | KEEP |
| `opted_out` | 2 | queue suppression hit | Not interested · Opted out | KEEP |
| `closed` | 3 | Inbox "Remove", Dashboard dismiss | Not interested | KEEP (the dashboard now agrees) |
| legacy `waiting` / `delivered` / `contacted` | 0 | nothing | — | badge fallbacks only |

Attributes that are **not** statuses: the ⭐ star (Interested marker), `call_booked_at` (meeting),
`website_control` (agency), the Wrong number suppression (`contact_suppressions`), `contact_method`.

## 3. The canonical sales states (ten, strongest first)

**Client › Won › Not interested › Meeting booked › Interested › Replied › Wrong number › Contacted › New** (+ Other).
Five tones: quiet (New, Contacted, Other), info (Replied), good (Interested, Won, Client), strong
(Meeting booked — blue), stopped (Not interested, Wrong number).
- **Contacted** = the pipeline says so, OR a person logged any contact, OR an opener went out.
- **Meeting booked · Thu 2 Oct 14:30** while `call_booked_at` is upcoming or started < 12 h ago
  (`MEETING_KEEP_AFTER_MS`); after that the lead reads Interested again.
- **Wrong number** sits below the engaged states: an Interested lead with a dead number stays Interested
  (the red Wrong number pill with the admin's Clear says the rest).
- **"Follow-up" is NOT a state.** A lead waiting for a call-back is Contacted/Interested with the Next
  Action "Call · Tomorrow". Status = where the lead is; Next Action = what to do.

## 4. Contact methods and outcomes

Methods: the one set, `src/lib/contactMethods.ts` (unchanged here — Social Enrichment adds Facebook /
Instagram / a Social pill). One event model: `lead_activity` rows `call_outcome` / `contact_logged` with
`{channel, outcome}`, actor, time, note. WhatsApp is recorded by its own messages.

| Button | Method | Effect (`outcomeRule` / `outcomePlan`) | Suggested Next Action (pre-filled, human saves) |
|---|---|---|---|
| No answer | call | record → Contacted if New | Call · tomorrow |
| Left voicemail | call | record → Contacted if New | Call · in 3 days |
| Sent, no reply yet | message | record → Contacted if New | Email / Follow up · in 3 days |
| Connection request sent | LinkedIn | record (Social branch's outcome) | Follow up · in 3 days |
| Spoke to owner | any | record → Contacted if New | Follow up · person picks the day |
| Interested | any | ⭐ star (Not interested/Closed → back to Interested) | Send information · today |
| Call back | any | record + asks the day | Call · **day required** before Save |
| Meeting / call booked | any | ⭐ star + asks date/time | one Save writes the time AND Next Action Meeting |
| Not interested | any | status not_interested, star off, queue stopped (suppress_lead), Next Action cleared, a current meeting cancelled | — |
| Wrong number | call | number suppressed (templates, queue, automated WA) | — |
| ~~Agency controls site~~ | — | **removed as a button**: an attribute → the "Agency runs their site" chip (`website_control`) | — |

Never downgraded: a client or won lead is only recorded; the star is never set twice; an opted-out
number keeps its status. WhatsApp mode offers "What came of the conversation?" (Interested, Meeting,
Call back, Not interested) — the plan without a second record of the messages.

Every tap shows a **result line** under the buttons: `✓ Call · Left voicemail → [Contacted] Status: New →
Contacted`, what else happened, and the Next Action waiting to be saved. History records
`state_changed` (only a real change) and shows it on the contact that caused it.

## 4b. Verified by clicking through (2026-09-30)

A throwaway harness rendered the REAL Work panel + state pill with an in-memory database (no network,
deleted after). Every flow above behaved; it also found four things the unit tests could not, all
fixed and now tested: Not interested kept the booked meeting (a later yes jumped to "Meeting booked"); a
WhatsApp result's status change was pinned in History to an older call (now: the nearest contact with
the same outcome only); one tap wrote 4–5 History lines (the star / pipeline rows now fold into the one
"Status: X → Y" line); the meeting box claimed "UK time" but reads the browser's clock.

## 5. Last contact

`lastContactOf` = the newer of the newest logged contact and the newest WhatsApp message:
"Call · Left voicemail · 2h ago", "LinkedIn · Sent, no reply yet · Yesterday", "WhatsApp · Replied · 20m
ago". A failed send is not a contact. Shown in Focus (with the thread's newest message), the popup strip
(logged + opener send), Outreach rows (one small line: a current meeting, else the last logged contact,
this page's rows only).

## 6. Next Action

Options now: **Call, WhatsApp follow-up, Email, Follow up (other), Send information, Meeting, Nothing
planned** (added email / send_info / meeting; removed Voice note as a choice — 0 rows ever; the dead
`NEXT_ACTION_OPTIONS` in `types/outreach.ts` deleted). Older values still read. Still **human-set only**:
suggestions pre-fill; the only automatic write is Not interested clearing it to 'none'. Live: every lead
was 'none' on 2026-09-30.

## 7. Queues

- **Next best actions** (`salesWorkspace`, fn `sales-performance`): a meeting in the next 36 h (or started
  < 12 h ago) is the top action (rank −1); a Meetings list; Focus gains a "Meetings booked" view. A
  not-interested / won lead's meeting is not surfaced.
- **Dashboard Not interested** = the engine's set (`closed` added: +3 leads on 2026-09-30).
- **Inbox Interested filter** reads the star (it matched a status nothing writes).
- **Automatic downgrade guards** share `STRONG_STATUSES` (inbound `replied`, both `report_sent` writers):
  now include `won_pending_onboarding` (a reply moved a won lead to Replied) and `refunded` (a reply moved
  a refunded client to Replied, which isPaidLead then counted as PAYING again).
- Not interested stops the queue for **both** roles (the admin's Inbox/Focus path wrote no suppression).

## 8. Permissions

Unchanged boundaries: every write is a role + ownership checked lead function (`_require_work`); a
salesperson cannot touch a client or another rep's lead; `lead_set_stage` still allows only interested /
price_given / not_interested / won_pending_onboarding; Wrong number is cleared only by the admin
(`lead_clear_wrong_number`). The admin's outcome writes now go through the same functions (so both roles
leave the same History).

## 9. Removed

Focus's separate Interested / Not interested buttons; the popup's separate star chip; the strip's
duplicate "Call booked" chip; Focus's raw status chip; `outcomeStatusEffect`, `lastLoggedContact`,
`OUTCOME_TONE` (salesCrm → leadState); the My Leads helpers (`needsAttention`, `matchesFilter`,
`SalesLeadRow`, labels); `SALES_STAGE_LABEL` / `SALES_SETTABLE_LABEL` (never rendered); six unused
`useSalesActions` mutations (incl. the legacy `lead_record_call` path); the dead Next Action list.
`PipelineStatusBadge` gained Won and shows an unknown value as itself (it showed "New").

## 10. Left alone, deliberately

`OutreachStatusBadge` (never rendered, but holds a baseline type error — removing it means re-recording
the baseline); i18n `pipelineStatuses` (the tour/i18n deep-clean step); `email_sent`/`bounced` values
(23 old rows); the `lead_record_call` SQL function (deep-clean orphan list).

## 11. The status map the audit agent produced

Writers/readers per status, the 7 label maps and where they disagree (won had four labels), every
control that changes status: summarised above; the raw map is in this session's transcript. Key readers:
`process-whatsapp-queue` eligibility, `sales_queue_opener` (not_contacted only), `sales_pool`,
`hook-not-interested` PROTECTED, `dashboardTasks` DEAD/NOT_ACTIONABLE, `REPLIED_OR_BEYOND`.

## 12. Paul's decisions (2026-09-30, follow-up — built and live)

1. **A human revive lifts ONLY the Not interested block.** Trigger `trg_outreach_leads_revive_clears_not_interested`
   (migration 20260930170000): status `not_interested` → `interested` (Interested / Meeting booked) or
   `won_pending_onboarding` deletes the `contact_suppressions` row with `reason = 'not_interested'` and no
   Wrong number mark, and writes a History line. Never touched: Wrong number, `replied_no` (their own
   "no" reply), `closed`, `archived`, opt-outs. No automatic writer targets those two statuses, so a
   reply or a weak contact (no answer, voicemail) cannot lift it. Tested live, rolled back: sales
   revive → lifted; admin → Won → lifted; with a Wrong number mark / replied_no / → Replied / voicemail → kept.
2. **Outreach rows carry the sales-state pill** (desktop and phone), compact, above the pipeline badge,
   drawn only when the badge does not already say the same state (`stateShownByBadge`: same words, or
   a Paid / In delivery / Completed / Refunded badge for Client). Wrong number per page comes from
   `leads_wrong_numbers` (role-checked batch read). The last contact / meeting line stays underneath.
   The phone badge for New said "Status"; it says "New" now. A lead with a logged call but no WhatsApp
   opener reads "Contacted" (pill) over "New" (the WhatsApp pipeline badge) — both true.
3. **Voice note stays off the Next Action list** — a contact format, not an objective.
