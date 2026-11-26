# WhatsApp queue: pause only for real danger (2026-11-26)

Paul: "for about a week I keep getting 'outreach has stopped' emails and sending keeps pausing. Fix it for good."
Code: `src/lib/queuePauseRules.ts` (the one rule), `process-whatsapp-queue`, `whatsapp-number-health`,
`_shared/operator-bell.ts`, migration `20261230090000_queue_auto_pause_kind.sql`. Tests: `scripts/queue-pause-rules.test.ts`.

## What the emails were (read-only, 19–26 Nov)

There is no email with the exact words "outreach has stopped"; V2 (`leadfinderos-v2`) sends no such email (checked, nothing
changed there). The V1 emails in that week, from `notifications` (every operator email has a bell row):

| Email | Count | Real danger? |
|---|---|---|
| "WhatsApp queue: Paul's / Valentin's messages are not moving" (stuck alert) | 13 (21, 23 ×7, 24 ×2, 25 ×2, 26) | No. Not a pause. Mostly Meta's quality reading flipped to RED and every queued lead was held by the likelihood hold, so nothing was sendable. |
| "WhatsApp queue paused itself: messages are failing" | 2 (23 Nov 12:42, 15:06) | Yes: every cold opener refused (unpaid WhatsApp account). |

Queue pauses in `whatsapp_queue_pause_log`, 19–26 Nov:

| When (London) | What | Real reason |
|---|---|---|
| 22 Nov 13:49 | auto-paused: "9 of the last 18 failed in 60 minutes" | Wrong reason: a batch of numbers not on WhatsApp (22 of that day's failures ended No WhatsApp; 76 others read the same day). Paul resumed 23 Nov 06:08. |
| 23 Nov 12:42 | auto-paused: 20 in a row failed | Real: WhatsApp refusing cold messages (billing). Paul resumed 12:52. |
| 23 Nov 13:00, 14:05 | UK 1-hour cool-down (probe) | Real, same outage; cleared itself. |
| 23 Nov 15:06 | auto-paused: 5 in a row failed | Real, same outage. Paul resumed 15:19. |

Meta's quality reading flipped GREEN↔RED 9 times between 18 and 26 Nov (`whatsapp_number_health_log`).
Async delivery failures carry no Meta code (the held `whatsapp-status` v129 saves none); the lead's flag shows which were
not-on-WhatsApp.

Released: nothing was still paused on 26 Nov (queue running, no cold stop, SMS running, UK on, cool-downs expired). Malaysia,
Singapore and Australia are off by a person's choice and were left off (a country is never switched on from code).

## The rule now

- Every failed send is one kind (`failureKind`): **lead** (131026, 130403, 131049, 131050, 131021, 131047, 130472, or
  `no_whatsapp`), **message** (template / value codes), **temporary** (1, 2, 4, 80007, 130429, 131000, 131016, 131056, 133004, or
  no answer at all), **danger** (login 0/3/10/190/200/131005, billing 131042, restricted 33/368/130497/131031/131045/131057/
  131063/131064/133010, spam limit 131048), **unexplained** (delivery failure with no code).
- Pause: ONE danger code, or `REFUSAL_RUN_PAUSE` (8) unexplained failures in a row with nothing delivered (counted since the
  last pause / resume, 6 h back at most), or a quality drop after the higher rating held a full day (`qualityDropPause`,
  in the watcher). The old 50%-in-an-hour rule is gone. The one-strike pass still protects leads inside a run of 5.
- Send time: a danger reply puts the lead back without using an attempt; a lead Meta names → WhatsApp failed, out of the queue;
  a temporary error keeps the usual 3-attempt retry and pushes the queue's next send back 5/10/20/40/60 min.
- Auto-resume (`autoResumeVerdict`, at the top of a tick): only the queue's own pause, only after `auto_resume_at`, only with a
  clean health reading taken after the pause, number not blocked, no cold stop. Login 15 min, refusal 2 h, spam limit / quality
  24 h. Billing and restrictions: a person. A second auto-pause in a London day waits for a person.
- The watcher's tripwire stop now emails (once a day) and clears itself after an hour once the reading is clean
  (`metaSafetyReason` null). Safety-limit email once a day (was hourly).
- Emails: one per problem per London day (`queue-auto-pause:<kind>:<day>`), "Why / What to do / when it starts again". The
  stuck alert is a bell only, once per sender per day.
- Unchanged: 200 a day, 20 an hour, 3-minute gap, opt-outs, the country cool-downs, the held `whatsapp-status`.
