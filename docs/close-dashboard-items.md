# Closing items on the Sales dashboard (2026-10-10)

Paul: "What to do next" and Follow-ups (Replied, unanswered was 76) showed leads that may be dead, and the salesperson
could not clear them.

## What was there before
- Both lists are DERIVED on every load by `foldSalesWorkspace` (`src/lib/salesWorkspace.ts`), run inside fn
  `sales-performance`. Nothing was stored per item, so there was nothing to clear.
- "Replied, unanswered" = `conversationState(...).waitingSinceMs` over the lead's WhatsApp thread — and, since the later
  pass below, its SMS thread too.
- The lead popup's Close tab is Quick Close (the sale). The "stop" outcomes are the Call tab's `not_interested` and
  `wrong_number` (`CALL_OUTCOMES`, carried out by `leadOutcome.ts applyOutcome`).

## What was built
- **fn `lead_close_work(_lead_ids uuid[], _reason 'done'|'dead', _outcome)`** (migration `20261021090000`), SECURITY
  DEFINER. Per lead: `can_work_lead` (admin any; sales only their assigned, non-client lead — a refusal is returned by
  id and nothing is written); the Next Action is cleared ONLY through `lead_set_follow_up(…'none'…, _done => true)`
  (History "completed", meeting mirror cleared with it); `outreach_leads.work_closed_at / work_closed_by` stamped;
  one `lead_activity` row `work_closed` ({reason, outcome, cleared_next_action}). Never status, star or campaign.
  ≤ 500 leads per call.
- **Done, no action needed** = that function alone.
- **Dead lead** = `src/lib/closeWork.ts`: close first (the permission check), then the Call tab's own
  `applyOutcome(lead, 'not_interested' | 'wrong_number', …, logged = false)` — the same status / star / queue stop /
  number block / History state line. No new status. No lost-reason prompt in bulk.
- **The rule** = `isClosedItem(closedAt, lastReplyMs, itemAt)` in `salesWorkspace.ts`: an item that existed when the
  lead was closed is hidden until a newer inbound reply (WhatsApp in the facts; SMS read by `sales-performance` into
  `lastSmsReplyMs`). Anything that happens after the close (an audit, an opened sign-up page, a meeting) shows. A due
  Next Action is never gated — closing cleared it, so one present now was set afterwards by a person.
- UI: `sections.tsx` (tick, Close per row, Select all / Close N), one `CloseWorkDialog` (count + the two choices).

## 2026-10-10 (later): text replies included
Paul: yes, include SMS. `smsWaitingSinceMs` (salesWorkspace.ts) runs the SAME `conversationState` rule over each lead's
`sms_messages` thread (read by `sales-performance` for every lead; undelivered = failed). An opt-out text
(`isStopMessage`) is never a reply needing an answer, and when it is their newest text nothing is owed on that thread.
WhatsApp keeps its item when both wait; a text-only wait is "New text reply", link `sms` → `/inbox?channel=sms&lead=`
(`smsLinkForLead`). A STOP never re-opens a closed lead (`lastSmsReplyOf`). The facts (responded, warmth, pipeline) are
still WhatsApp-only — unchanged. Test: `scripts/sms-replies-unanswered.test.ts`.

## Tests
- `scripts/close-next-actions.test.ts` — the rule through the real fold, the migration text, History words.
- `supabase/tests/close-next-actions.sql` — live, always rolled back: bulk, another rep's lead refused, owner can
  close any, status/star/campaign unchanged, who/when in History, anon refused.
