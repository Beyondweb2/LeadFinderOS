# Lead workspace: the simplified Call flow (2026-10-06)

Branch `improve/lead-workspace-sales-flow`. Not merged, not deployed. Supersedes the Call-tab parts of
`docs/workspace-declutter.md` and `docs/pre-sales-certification/sales-workspace-v2.md`.

## Why

The Call tab ended in three permanent cards — Status, Log a contact (a channel × outcome matrix) and the
Next Action — plus a green Mark Paid bar under every tab. A rep on the phone scrolled a CRM form. Paul asked
for the Sales Dashboard feel: fast, visual, obvious.

## What it is now

- **Header (every tab, never scrolls):** name, Call / **Log** / WhatsApp, then phone · website · trade · town,
  then **Status** (the one coloured `PipelineStatusSelect` pill — the status is changed here now) and
  **Next** (`HeaderNextAction`: "Call · Tomorrow · 10:30 ✎" or "No next action · Set one"). A Not interested
  lead shows "Why: … Change" beside the status. Owner, chips and last contact follow (`LeadStateStrip`).
- **Call tab:** the last Log's result line → evidence + script (the playbook) with its sticky bar
  **Log outcome** + **Quick Close** → the AI check tools (folded) → recent WhatsApp. No CRM cards.
- **The Log window** (`src/components/LeadCallFlow.tsx`, rules in `src/lib/logOutcomeFlow.ts`):
  Interested · Not interested · Didn't answer · Call back · Send onboarding · Wrong number · Left voicemail;
  More: Spoke to owner, Meeting booked (and the message outcomes on other channels). "Logged as: Call ·
  Change" (defaults to Call, resets to Call every time the window closes). Optional "Add note" is saved
  with the outcome; it is an unsaved draft while typed and survives closing the window.
- **Saved first, then only the step the outcome needs** (same window):

  | Button | Records (`lead_log_contact`) | Rule (`outcomePlan`) | Then |
  |---|---|---|---|
  | Interested | `interested` | ⭐ | What happens next? Send onboarding / Call back / Set follow-up / No next action |
  | Not interested | `not_interested` | status, queue stopped, Next Action cleared | the lost-reason prompt only |
  | Didn't answer | `no_answer` | record | optional "Try again when?" (tomorrow, pre-filled; Skip) |
  | Call back | `call_back` | SAVES "Call · No date set" | "When should we call?" |
  | Send onboarding | `interested` | ⭐ | the Close tab (QuickClosePanel) |
  | Wrong number | `wrong_number` | number suppressed | — |
  | Left voicemail | `left_voicemail` | record | optional "Try again when?" (3 days) |
  | Meeting booked (More) | `meeting_booked` | ⭐ + SAVES "Meeting" | "When is the meeting?" |

  Pre-filled Next Actions are never saved without the person's Save (unchanged rule).
- **Mark paid:** a small admin-only action on the Close tab (`data-testid="mark-paid-admin"`), same
  `handleMarkPaid`; a little stronger at a payment stage (`markPaidIsMain`). Salespeople never see it.

## What did not change

Every write: `useLeadWork` (LeadCrmPanel.tsx) holds the old Work panel's logic verbatim — `lead_log_contact`,
`applyOutcome`, the one Next Action write (`saveNextAction`), the one meeting write (`bookMeeting`), the
double-tap ref, the server's duplicate window. No new status, no new outcome, no schema change, no edge
function touched (nothing to redeploy). `LeadWorkPanel` is now the Details tab only; the unused stacked
`LeadCrmPanel` export was deleted.

## Traps found

- **Every close must go through the reset.** The first build closed the window from Skip / Later / Save by
  calling the parent's setter directly, so the next Log reopened on the old step. `finish = () =>
  setLogOpen(false)`; the test pins it.
- **The first Escape closes the toast, not the window** when "Phone call logged" is showing — the app's
  Radix toast is the top layer. Existing app-wide behaviour, not new.
- **← / → inside a window stepped to the next lead** underneath (React events bubble through portals).
  The windows stop arrow keys (`keepKeysHere`).

## Verified

`npm run check` green (typecheck at baseline, 335/335 suites incl. `scripts/lead-workspace-sales-flow.test.ts`;
13 older suites re-pointed from the deleted cards to where each rule now lives). Visual QA: the real
`LeadDetailDialog` in a throwaway no-network harness (mocked client + roles), headless Edge at 1440 and
390 px, admin and sales: every step above clicked through; sales sees no Mark paid. Nobody has seen it
in the live app.
