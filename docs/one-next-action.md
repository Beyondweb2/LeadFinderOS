# One Next Action (2026-10-02)

Paul: "There should be ONE kind of Next Action." Branch `feat/one-next-action`.

## What was wrong

The Outreach Next Action column could show `+ Set` and, underneath it, `Meeting · Fri 2 Oct 15:15` or
`Call back · no day set`. Two systems were drawn in one cell:

1. **The saved Next Action** — `outreach_leads.next_action / next_action_date / next_action_time / next_action_note`,
   written by `lead_set_follow_up`. Editable, filterable, completable, in History.
2. **A derived hint** — `nextUpHint()` in `src/lib/nextActionView.ts`, drawn only by `OutreachTable.tsx` under the
   editor when no action was saved. It read:
   - `call_booked_at` (the "Meeting booked" fact) while current → "Meeting · …";
   - the newest logged contact's outcome (`lead_activity` `call_outcome` / `contact_logged`, `outcome = call_back`)
     → "Call back · no day set".
   Display only: no filter, reminder, dashboard or ✓ ever saw it.

Why `call_booked_at` drifted from the Next Action:
- `lead_set_follow_up` set `call_booked_at` when a Meeting got a time, but **never cleared it** when the Meeting was
  completed, cleared, changed to another type, or lost its time. All four live examples were this (QA leads:
  Meeting → Send proposal → completed; the booking stayed, so the hint drew the meeting under `+ Set`).
- The Work tab's "Call booked for" box (`lead_set_call_booked`) set a booking with **no** Meeting Next Action, and
  only moved an EXISTING Meeting's day/time.
- Logging "Call back" only PRE-FILLED a Call that could not be saved without a day; skipping it left nothing but
  the outcome row, which the hint then read.

Who read which: filters, counts, reminders (`notify_due_follow_ups`), Team Board tasks, the Inbox pill, the
workspace bar — the saved Next Action. "Meeting booked" state (`salesStateOf`), the dashboard Meetings list and
admin metrics — `call_booked_at`. The hint — both, for display.

## The model now

- **The Next Action is the one thing.** `call_booked_at` is its mirror:
  `call_booked_at = next_action_due_at(date, time)` when `next_action = 'meeting'` with a time, else `null`.
  Written only inside `lead_set_follow_up`, in the same UPDATE as the Next Action (migration
  `20261002180000_one_next_action.sql`). A stale booking on an unchanged action is lined up (`change: 'synced'`,
  no false History line).
- `lead_set_call_booked` is a wrapper: a time → `lead_set_follow_up('meeting', UK day, UK time)` (keeping a
  Meeting's note); null → clears a Meeting Next Action (cancelled), otherwise unchanged.
- CHECK `outreach_leads_booking_is_the_meeting` (`20261002180100_one_next_action_shape.sql`): a booking without its
  timed Meeting cannot be stored by anyone.
- History: every `call_booked` row is kept; a booking that ends records `reason` — `completed` ("Done"),
  `changed` ("Replaced by the next action"), `time_removed`, `cleared` ("Cancelled"; old rows with no reason too).
- `nextUpHint` is deleted. The Outreach cell (`NextActionEditor`, row and phone card) is `+ Set` OR the action and
  its green ✓ "Complete next action".
- The Work tab's "Call booked for" box is removed (a second editor of the meeting). The section is "Website · domain".

## Outcomes (`outcomePlan.setNextAction`, carried out by `leadOutcome.applyOutcome` via `lead_set_follow_up`)

| Outcome | Saves a Next Action? |
|---|---|
| Call back | **Call · No date set** (note "They asked to be called back"); the editor opens to add the day. Kept as-is if the action is already a Call. |
| Meeting booked | **Meeting** (no day) + the star; the "When is the meeting?" box puts the day + time on it (that books it). Kept if already a Meeting. |
| No answer / Left voicemail / Message sent / Connection sent / Spoke to owner | No — a suggestion is pre-filled; the person saves it or not. |
| Interested | No — the star only (Send information pre-filled). |
| Not interested | Clears the Next Action (and so the booking). |
| Wrong number | Nothing. |

Applies to clients too (a client asking for a call back is a call to make).

## Completion and rescheduling

- ✓ / Complete → `lead_set_follow_up('none', done)`: History "completed"; a Meeting's booking clears with it
  (History "Meeting booking · Done"); the lead's status and star are untouched; the cell returns to `+ Set`.
  The lead stops reading "Meeting booked" (the meeting is dealt with) — the History rows remain.
- Rescheduling from the Next Action editor or the post-outcome meeting box goes through the same write, so the
  booking and the Next Action can never hold two times.

## Live data (2026-10-02)

Audit before the change: 4 leads had a booking — all `ZZ QA` test leads: 3 with `next_action = 'none'` and a future
booking (the screenshot case), 1 Meeting without a time beside an 08:30 booking. Call back as the newest logged
outcome with no Next Action: 4 leads — 3 real (The Portsmouth Plumbing and Heating Co, Adcock Heat, Steve The
Plumber; nothing set after) and "Paul SALES" (a Next Action was set and cleared after the call-back — left alone).
Meeting booked logged with no time ever given: JB7 (archived) and Emergency Irlam Plumbers (has a Follow up) — not
guessed.

Normalised (backup table `_one_next_action_backup_20261002`, 7 rows, RLS on, no policies): the 4 QA bookings →
Meeting Next Action at the booking's UK day/time; the 3 real call-backs → Call · No date set. History rows written
with `actor_user_id = null` and `data.source = 'one_next_action_2026_10_02'`. After: 0 bookings without their
Meeting; then the CHECK was added.

## Tests

`scripts/one-next-action.test.ts` (the column, every outcome, the mirror SQL, no second editor, filters, History).
Updated: `lead-state`, `outreach-workspace`, `next-action-human-only`, `sales-shared-workflow`.
Live rolled-back SQL run (DO block ending in RAISE) as the Test salesperson and as Admin: complete a Meeting (booking
cleared, reason completed), book from the old box (Meeting set), reschedule from the editor and from the box (both
move together), change to Call (booking cleared), another rep's lead refused (`not_your_lead`), remove the time
(booking cleared, `time_removed`), cancel twice (second `unchanged`), and a raw UPDATE leaving a booking without its
Meeting refused by the CHECK.
