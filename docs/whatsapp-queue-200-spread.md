# WhatsApp queue: 200 a day, evenly spread, failure breaker (2026-11-23 pm, `fix/queue-200-spread`)

Supersedes the cap part of `docs/whatsapp-fewer-failures.md` (same day, morning). One strike, the UK-only queue and the
number-range hold stay.

## Why the queue looked "stuck" (measured read-only, 23 Nov ~12:20 London)

- The alert said nothing had gone for Valentin since 10:19. In fact the queue sent for Valentin at 11:11, 11:34, 11:55 and
  12:13. The alert fired because RED's pace (~1 every 14 min) shared between two senders took Valentin's gap past the stuck
  threshold. Not a pacing-clock, cap, risk-hold or cron fault.
- **The real problem: every one of the queue's 19 cold sends that day failed (07:00–12:13), 0 delivered.** Every one had a
  Meta message id and no error at send time; the failure came by the webhook. Person-sent cold openers at 07:02 failed too.
  Messages to people already in a conversation delivered normally (25 of 30). Cold sends had been slipping since ~13:20 on
  22 Nov (the auto-pause at 13:49 that day).
- The payload was correct (one parameter, the business name). No error code is stored anywhere: the held webhook (v129) keeps
  none, so the exact Meta code is unknown. Meta's reading: quality RED, tier TIER_2K, status CONNECTED, can_send_message
  LIMITED (LIMITED since 2 Nov, so not new).
- The auto-pause never tripped: it needs 8 queue sends inside 60 minutes and RED's pace sent 3–4 an hour.
- Each failure then hit **one strike**: about 28 leads (19 on 23 Nov, ~9 on 22 Nov pm) are now No WhatsApp although the
  failure was the number being refused, not the lead. They were NOT restored (a data change; Paul decides).

## What changed

1. **Number cap** (`src/lib/whatsappQualityCap.ts`, through the cold guard, every door): 200 cold a London day for the whole
   number, at most 20 in any rolling hour. The quality colour sets no cap.
2. **Even spread**: the queue spreads what is left over the minutes left in the window (unchanged formula), now never closer than
   3 minutes (`COLD_MIN_GAP_MIN` = 60 / 20). The queue is UK-only, so "each country's window" is the London 07:00–21:30 window.
3. **Fair share**: unchanged per-sender round-robin (`_shared/queue-fairness.ts`): senders with something queued take turns,
   so none can starve another; a share one sender does not use goes to the others (no hard per-sender cap, which would waste the
   number's day). Each sender's line shows sent today and fair share (cap ÷ senders with a queue).
4. **Safety net**: tier below TIER_2K, or status FLAGGED / RESTRICTED / BANNED, or can_send BLOCKED, or no fresh reading
   → 60 a day. `whatsapp-number-health` emails Paul (bell + email, `raiseOperatorAlert`) on the turn into it. The tripwire's
   full stop for the same events is unchanged and still wins (stricter); 60 is the floor once a person clears the stop.
5. **Failure-run breaker** (`src/lib/whatsappPace.ts failureRunVerdict`): 5 settled queue sends in a row failed, none delivered
   between → the queue pauses itself (same write as the auto-pause) and emails Paul. Only sends after the last pause/resume
   count, so Resume starts a fresh count. Normal (~12% failed) gives 5 in a row about 1 in 40,000.
6. **One strike skips runs** (`strikeSinceAfterRuns`): the per-tick pass starts after the latest run of 5+ failures, so an outage
   no longer marks leads No WhatsApp. (The per-lead check before a send is unchanged.)
7. Queue screen: "Normal limit / Safety limit", daily limit, sent today, this hour; per sender: sent today, fair share, next send.

## Not done / open

- The UK's own stored cap (`outreach_country_settings`, UK = 150) still sits under the number's 200, so the UK day tops out at
  150 until an admin sets UK to 200 on the countries screen. Not changed from code (a stored admin setting).
- ~~The 28 leads struck during the outage~~ DONE 23 Nov 12:58 (Paul said restore): the run was 25 sends (22 Nov 13:34 → 23 Nov
  12:35, nothing delivered between); those 25 leads (18 Paul, 7 Valentin) were set back to queued (contact_method whatsapp,
  delivery status cleared). The lone 22 Nov 13:24 failure (deliveries either side) stays struck. `whatsappStruckOut` now leaves
  out failures inside a run (`failureRunWindows`, 30 days), so the per-send check does not strike them again.
- Paul resumed the queue at 12:52; the next two sends (12:54, 12:59) failed too, so the breaker pauses it again after 5.
- The queue was not paused by hand (the write was refused by the session's permission check); the breaker pauses it on its first
  tick after the deploy, because the last 19 queue sends failed.
- The exact Meta code needs the held webhook (Findable switch).
