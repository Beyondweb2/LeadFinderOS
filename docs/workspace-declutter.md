# Lead workspace declutter pass (2026-10-01)

Paul: the lead popup "has become too visually busy … do NOT remove useful functionality". A hierarchy pass
on `LeadDetailDialog` (both roles, Outreach and the Inbox mount the same component). No backend change, no
SQL, no edge function.

## The audit (before)

| Control | Where it was | Kind | Now |
|---|---|---|---|
| Sales-state pill (`SalesStatePill`) | header, always | **duplicate** of the status pill / star / Next Action in most states | shown only when it adds a fact (`headerStateShown`) |
| Pipeline status select | header | primary | same control as Outreach/Inbox (`PipelineStatusSelect` → `pillStatusOf`) |
| Contact method ("Contact" pill) | beside the status | a channel preference, not state | "Preferred channel" under More tools (same write) |
| Star | title row | primary | unchanged |
| Owner (`LeadOwnerControl`) | strip | primary | with the status, row 1 |
| Next Action pill | strip | primary, but a pill | the Next Action **bar** (display + Edit) |
| Wrong number / agency chips | strip | contextual | unchanged |
| Last contact | strip | secondary | same line, quieter |
| Quick Close | title row, solid green | specialist shortcut competing with the next step | outline (`variant="quiet"`) |
| WhatsApp link | title row | primary | unchanged |
| Phone, email, Find email, Find socials, Call script, Voice note | tools row | everyday | unchanged, row 1 of tools |
| Crawl site, Site check | tools row | less frequent | More tools (revealed in place) |
| Welcome pack | tools row | client delivery | inline once paid, More tools before |
| AI visibility check (not run) | Work tab, long sentence | collapsible | one line + Propose questions; explanation on hover |
| Log a contact | Work tab, always open | collapsible | collapsed; opens on tap or from Outreach's Call; closes after a log |
| Learned on the call / Campaign / Call booked details | Work tab | keep | unchanged |
| Next Action editor | Work tab, always open | **second editable copy** of the header | opens on demand (bar Edit, Set one, an outcome's suggestion); closes after Save |
| Internal note | Work tab, amber 2-row box | keep | one quiet line until typed in |
| Sign-up link, WhatsApp outreach, Remove from my leads | Work tab | keep | unchanged |
| Tabs | Work / Scripts / Prospect / History / Client | keep | unchanged |
| Mark Paid | footer, always big green (admin, unpaid) | contextual | main button only at a payment stage (`markPaidIsMain`), otherwise a small "Mark paid" |

## The rules (src/lib/workspaceHeader.ts — pure, display only)

- `meetingIsTheNextAction` — Next Action "meeting" on the London day of `call_booked_at`.
- `headerStateShown(view, statusLabel, lead)` — enumerated per state: new/contacted/replied/interested/
  wrong_number/other never add a pill; meeting_booked unless it IS the Next Action; won/not_interested unless
  the status pill already reads the same; client unless the status pill already says Paid / In Delivery /
  Completed / Refunded.
- `noteBesideTime` — a meeting's saved note starts "Meeting at HH:MM"; under a bar that shows the time only
  the person's own words are drawn.
- `markPaidIsMain` — `price_given`, `won_pending_onboarding`, `payment_received` (no amount yet),
  `in_delivery`, `completed`, or sales state won. Paid is still `isPaidLead`; Mark Paid writes what it wrote.

Nothing stored: Meeting booked is still `salesStateOf`, History and every filter are untouched.

## Verified (2026-10-01, a local build against the live database, headless Edge, signed in as the admin
data account and as the Test salesperson)

States read: New, Contacted (reached by phone) vs an attempt (still New), Interested + New, Interested +
Contacted, Meeting booked as the Next Action (no pill — the original complaint), Meeting booked with no Next
Action (pill kept), Call tomorrow, Overdue (red bar), No Next Action, Price given (Mark Paid main), Paid client.
Widths 390 / 820 / 1440 / 1920: no horizontal scroll. Writes made, all on `ZZ QA` fixture leads: a Meeting
Next Action on "ZZ QA meeting booked" (tomorrow 08:30), an overdue Call on "ZZ QA2 salesperson" (as Test), a
"No answer" call on "ZZ QA5 sales" (as Test). Outreach's Call opened a real lead with Log a contact expanded
(no write — the Call tap logs nothing).

## Still messy / not done

- The sign-up link card's three buttons overflow its card at 390 px (pre-existing, `OnboardingLinkCard`).
- The Test salesperson's Outreach list shows 0 leads although the QA leads are assigned to it (the popup
  opens by `?lead=`); not investigated here.
