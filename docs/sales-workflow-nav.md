# Sales workflow, navigation, assignment and API cost accuracy (2026-09-30)

Paul: "When the dashboard tells me or a salesperson that something needs doing, we should be able to
click it, land in the correct place, and complete the action without searching around the platform."
Decisions (not to be re-asked) are in memory `sales-workflow-nav-decisions`: admin-only reassignment,
testing on the Test sales account + "Paul SALES" lead, billing never "confirmed" without real billing
data, legacy barber usage labelled "Legacy project · Not Findable", two SQL changes approved.

## Release A — links go where the work is done

⛔ **The rule:** a destination follows where the action is DONE, and every destination is a URL
(`src/lib/salesLinks.ts`) so the back button, a refresh and a pasted link all work.

| Link | Where the action is done |
|---|---|
| `/inbox?lead=<id>` | anything answered on WhatsApp (existing; now loads a not-yet-listed lead with its thread) |
| `/outreach?lead=<id>` | the lead's workspace: details, Work panel, the call script and its tel: link (NEW — was router state, lost on refresh) |
| `/outreach?show=no_trade` | Outreach showing exactly the leads the dashboard counted (`src/lib/leadTrade.ts`, one rule for both) |
| `/paid-clients/<id>?section=<stage>` | the hub opened and scrolled to the stage (`baseline`, `remeasure`, `build`, `payment` = the header card) |
| `/sales-dashboard?person=<userId>` | one salesperson's view (admin only; a rep's page is always their own) |
| `/inbox?filter=waiting` | the Inbox on "Waiting on us" (applied once, then the person's own choice) |

⛔ **A call link never presses the row's call button** — that button logs an attempt
(`executeContact`); a link must never record a call nobody made. Calls open the workspace.

### Navigation audit (source → intended → before → after)

| Source element | Intended destination | Before | After |
|---|---|---|---|
| Needs your attention · WhatsApp replies (triage: urgent / admin / review / live sale) | that conversation | `/inbox?lead=` ✓ | unchanged; a lead not yet in the list is loaded, not "not found" |
| Needs your attention · Quote gone quiet | chase on WhatsApp | lead popup (router state) | `/inbox?lead=` |
| Needs your attention · Signed up, not paid | chase on WhatsApp | lead popup (router state) | `/inbox?lead=` |
| Needs your attention · Setup not started | start the baseline | hub top | hub at **1. Official baseline** |
| Needs your attention · Re-measure overdue | run the re-measure | hub top | hub at **6. Remeasure** |
| Needs your attention · Payment failed | check the card / Stripe | hub top | hub payment card + **Stripe** button (subscription) |
| Needs your attention · Payment dispute | respond in Stripe | hub top | hub payment card + **Stripe** button (dispute) |
| Needs your attention · No trade stored (N leads) | set the trades | `/outreach`, unfiltered | `/outreach?show=no_trade` (removable pill) |
| Reply-sorting line · "N waiting in the Inbox" | the Inbox waiting view | plain text | link → `/inbox?filter=waiting` |
| Team comparison · salesperson name | their numbers and work lists | not clickable | `/sales-dashboard?person=` |
| Paid client health · business name | the client | hub ✓ | unchanged |
| Paid client health · each blocker | the stage that clears it | text | hub at that stage (`blockerSection`) |
| API costs · "Detailed usage log" | the usage breakdown | `/admin/api-usage` ✓ | unchanged (release B reworks the breakdown) |
| Sales dashboard · Follow-up queue · Overdue / Due today | where THAT action is done | always the lead popup | by the lead's action type: WhatsApp follow-up → Inbox; call / email / meeting / send info → workspace |
| Sales dashboard · Next best actions | as above | by type ✓ | the type list is now ONE list (`WHATSAPP_NEXT_ACTIONS`) |
| Focus · "Full workspace", Earnings client, Command palette lead, `/sales/lead/:id` | the workspace | router state | `/outreach?lead=` |
| Notification · "Lead assigned to you" | the conversation | `/inbox?lead=` → "Conversation not found" for a rep | the lead and its thread are loaded through the rep's own access; Outreach gets it at once too |
| A stale / reassigned link | say so | Inbox: blank pane; Outreach: nothing happened | Inbox: "This conversation is no longer in your Inbox"; Outreach: "That lead is not in your list" |
| An open conversation hidden by filters | keep it visible | the row vanished | drawn at the top, marked "outside your current filters" |

Not clickable, by design (read-only totals): funnel, channels, calls, revenue, commission, money
overview, bottlenecks, templates, niches, feature usage, traffic.

## Release B — API cost accuracy

**Where every figure comes from:** only `api_usage_log`, written by LeadFinderOS's own edge functions
when they spend. No provider billing is read anywhere. So **no other Move37 project's usage is in the
dashboard figure** — nothing outside this app writes that table. What cannot be shown is the reverse:
whether other projects share the same Google billing account, OpenAI organisation or Apify account.

**The four things the Cost panel now keeps apart** (`src/lib/apiCostAccounting.ts`, SQL
`admin_api_cost_detail`, migration `20261001180000`):
1. **Recorded usage value** — an estimate. Google = calls × list price; OpenAI = measured tokens × list
   price; Apify = the cost Apify reported per run.
2. **Google after its free monthly allowance** — per SKU, per London month: calls above the free cap ×
   the SKU's price. Still an estimate, never a bill: Google counts the cap across the whole billing
   account, and trial / promotional credits are not visible.
3. **Confirmed charges** — "Not available": no billing data is connected.
4. **Whose usage** — Findable (incl. background jobs doing Findable work) · Findable testing /
   development (the test accounts) · Legacy project · Not Findable (`generate-barber-site`, verified by
   name) · Unallocated (lead finding before Findable's first audit on 2026-07-11, and the retired
   contact-enrichment tools, which recorded no lead).

**SKUs** (verified 2026-09-30 against developers.google.com/maps/billing-and-pricing/pricing; the SKU is
set by the fields each caller asks for): Place Details Enterprise 1,000 free / $20 per 1,000
(google-place-details — asks for the phone); Place Details Essentials 10,000 / $5 (place-town.ts);
Text Search Enterprise 1,000 / $35 (search-leads, niche-sample — websiteUri); Text Search Pro 5,000 /
$32 (place-resolve.ts); Geocoding 10,000 / $5.

**Live, 2026-09-30:** 30 days — Findable $211.75, testing $2.97. All time — Findable $373.24, testing
$2.97, legacy $1.08, unallocated $14.19 (total = every recorded dollar, $391.48). Google September:
recorded $95.17, after the free allowance ≈ $45.66 (3,283 Place Details Enterprise vs 1,000 free);
August $49.43 → ≈ $14.00; July $23.33 → ≈ $0.78.

**Apify:** its own account figure for the billing cycle (`apify_account_usage`, from Apify's API) is
shown beside what we recorded — on 2026-09-30, $27.53 vs $24.23; the $3.30 gap is Unallocated (spend
our log does not record, or another user of the account — not assumed either way).
## Release C — Inbox: assignment, the star, the header, Next Action filters

- **Assign** (`LeadOwnerControl`, the existing header control, admin only — Paul's decision). The live
  `assign_lead` already refused a no-op (current owner → `unchanged`, no History, no notice); the page
  now says "Already assigned to X". The confirmation says "notified" only when the database really
  notified someone (`trg_notify_lead_assigned` never tells the person assigning, nor the admin/book
  owner). The notice now names who assigned it: "Paul assigned you <Business>", linked to
  `/inbox?lead=`. The lead record is moved, never copied: messages, notes, Next Action, star, meetings,
  socials, suppression and History are the same rows; `sold_by_user_id` (commission) is untouched.
- **Reaching the new owner at once:** the notification's realtime arrival announces the lead
  (`notifyLeadChanged`) → the Inbox loads the lead AND its thread (`loadLead`) and Outreach places the row;
  the deep link does the same if the list has not caught up. A rep who loses a lead has it removed from
  their Inbox on the next re-read, and a stale link says so.
- **Request transfer** (salespeople, on their own lead): SQL `request_lead_transfer` notifies every active
  admin (kind `transfer_request`), one per lead per person per day, History `transfer_requested`. It
  changes no ownership.
- **The star is the one interest mark.** The green "Interested" pill is hidden only when it repeats the
  star; meeting / won / not interested still show. The header star is the toggle for both roles through
  `lead_mark_interested` (History "Starred / Unstarred"; the admin used to write the row directly with no
  History). ⛔ SQL trigger `trg_outreach_leads_not_interested_clears_star`: a lead BECOMING not interested
  loses its star, whoever writes it (the sales stage RPC did not clear it). Existing rows untouched — 2
  starred not-interested leads remain as history.
- **Header:** the phone number moved into More (with Copy).
- **Next Action filters** (`src/lib/nextActionView.ts`, shared with Outreach): day — any / overdue / due
  today / due tomorrow / next 7 days / later / set, no date / no next action; type — call / WhatsApp
  follow-up / email / send information / meeting / other (from stored values only); sort — newest
  message / most recent reply / next action most overdue first. "Waiting on them" joins "Waiting on us".
  Remembered per person for the session; one Reset. Both roles. The open conversation always stays in
  the list whatever the filters.
- SQL: migration `20261001190000_sales_workflow_inbox.sql` (applied and read back; the star trigger was
  proven in a rolled-back block).