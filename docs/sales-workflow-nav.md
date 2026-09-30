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
