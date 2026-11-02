# The cold WhatsApp guard (2026-11-02, `fix/whatsapp-safety-guard`)

> **Later the same day (`fix/uk-cap-separate-from-malaysia`, migration `20261202090000`): the team cap is gone, on Paul's instruction.** Each country has its own cold cap and none draws on another's. See "Separate caps" below; older sections describe the first version where they mention a team cap.

Why: the number has been rated RED since 25 Oct. The queue had a cap, a gap and rating checks; a person's cold send had none. Malaysia kept switching itself off for good. Rule: `src/lib/whatsappColdGuard.ts`. Database half: `supabase/functions/_shared/cold-whatsapp-gate.ts`. Migration: `20261201090000_whatsapp_safety_guard.sql`. Tests: `scripts/whatsapp-cold-guard.test.ts`.

## What every cold send now asks (queue, person, queued Inbox message)

First "no" wins:

| Check | What happens |
|---|---|
| **Cold stop** | Stored tier dropped, or Meta says flagged / restricted / banned / blocked. ALL cold WhatsApp stops, whole drip included. Latched by `whatsapp-number-health`; a person clears it (Clear and restart, on the pause log). |
| **Cool-down** | A country rests 24 hours, then restarts by itself. `whatsapp_on` is not touched, leads can still be queued. Restart now is the override (on the pause log). |
| **Country cap** | `whatsapp_daily_cap`, its own count on its own local day, from the queue and from people. UK 150 (default `DEFAULT_UK_COLD_CAP`), Malaysia 30, any other its stored value or `DEFAULT_ABROAD_COLD_CAP`. No country draws on another's. |
| **Probe** | The first 3 after a window opens or a cool-down ends, then wait for delivery reports. 2 delivered carries on. 2 failed rests the country (24 hours abroad, 1 hour UK). After 30 minutes, one delivered with no second failure carries on; nothing delivered is a failure. |
| **Gap** | One conditional write (`claimColdSlot`, `cold_gap_until`): at most one cold send every 1 to 2 minutes, whichever door. The queue's pacing still spreads the cap across the day on top. |

**Counted:** cold templates (`isColdOutreachTemplate`) plus the queue's own follow-up lanes. **Not counted, not stopped:** in-window replies, continuation templates, Quick Close, the welcome pack, test and QA sends. Numbers not on WhatsApp are left out of the probe.

**A person's send:** a stop, cool-down or cap is refused with the reason. The gap or a waiting probe only queues it for the next slot (`inbox_scheduled_sends`). Outside hours it queues as before and asks when it runs.

Unreadable guard = nothing cold goes.

## Separate caps (2 Nov, later)

Under the first version, RED made the team cap 50, and Malaysia's 30 came out of it, so the UK could get as few as 20 a day. Paul's instruction: only Malaysia is capped low, the UK goes back to 100+.

- **Where the UK's cap lives:** `outreach_country_settings.whatsapp_daily_cap`, like every other country, set on the Countries screen. `whatsapp_outreach_state.daily_cap` is no longer read; it stays in the table, NULL. `set_pace` no longer takes it.
- **A rating changes no cap.** RED and YELLOW are a banner only: no halving (Malaysia's included, which was offered as optional and not taken, so the screens read "Malaysia 0 of 30"), and no block on changing a cap. `healthLimitedCap`, `capRiseRefused` and `halveCap` are gone. The tripwire is unchanged.
- **Pacing:** the shared clock now spreads what the countries that are on have left (`coldAllowanceLeft`) over the minutes left, so a Malaysian send no longer slows the UK. At 150 + 30 from 07:00 that is a send about every 5 minutes.
- **The tick** stops early only when every country that is on has used its cap. A country at its cap is held by `leadSendable` like a window, and the other carries on.
- **Pause log:** `cap_changed`, by trigger for a person's change, and by hand in the migration for the UK's 150 (under the admin account).

⚠️ **What this does not fix:** on 2 Nov there were 0 leads queued, and the UK sent 0 to 3 a day from 31 Oct. The cap only matters once leads are queued. And the number is RED with Meta warning that its limit will drop if the rating does not improve: more volume on RED is Paul's call (2 Nov), and the tripwire is what catches a tier drop.

## Why Malaysia's 07:00 sends failed (2 Nov, 23:00 UTC on 1 Nov)

Six `initial_contact` openers were queued from the Inbox around 14:31 to 14:40 UTC, after Malaysia's hours, so all six got `send_at` 23:00 UTC (07:00 Malaysia). The drain (`inbox-scheduled-send`) sends up to 10 a tick, 2 seconds apart, and no cold rule read those rows. Four went about 4 seconds apart, all failed, and with an earlier failure that made 5 of 5, which switched the country off at 23:00:21. The last two were then refused. Fix: a cold row in the drain takes the one slot; the others move forward (`coldTurn`).

⚠️ **The burst explains the spacing, not proven to explain the failures.** On 27 Oct, 5 Malaysian queue sends from 23:00 UTC also all failed while 1 to 2 minutes apart, while that afternoon's run to other Malaysian numbers had mostly delivered. Without Meta's codes (below) the reason is unknown. The probe limits what a repeat can cost: 3 sends, then a rest.

## What went wrong on deploy (2 Nov, 09:38 UTC)

The first live tick read Malaysia's failed sends from 23:00 UTC as today's probe and started a cool-down, although Paul had switched it back on at 08:10 UTC. Caught by the live check. The probe now starts at the latest of the window opening, the end of a cool-down and the last switch-on (`probeStart`), and the mistaken rest was cleared the same morning (on the pause log).

## Meta's own reading (2 Nov, 09:45 UTC)

`status` CONNECTED, `health_status.can_send_message` LIMITED, rating RED, tier TIER_2K. LIMITED does NOT trip the stop: only FLAGGED / RESTRICTED / BANNED / BLOCKED do, as asked. Stopping on LIMITED would have stopped all cold WhatsApp on the first read. 

What LIMITED covers, read the same day (`whatsapp-number-health` mode `probe` returns Meta's whole answer; it stores nothing):

| Entity | Can send | What Meta adds |
|---|---|---|
| Phone number | LIMITED | "Your messaging limit will decrease if your quality rating doesn't improve". Also SIP calling not enabled (138024). |
| WhatsApp account (WABA) | AVAILABLE | |
| Business | AVAILABLE | |
| App | AVAILABLE | SIP server not configured (138025). |

So the limit is on the number alone, and the only messaging note is a warning that the tier will fall if RED persists. Meta does not state that this note is what causes LIMITED: that is an inference. The SIP errors are about WhatsApp's own calling, which we do not use (browser calling is Twilio). If the tier does fall, the tripwire stops all cold WhatsApp.

## Other changes

- **Opener:** `coldOpenerFor` turns `initial_contact_short` into `initial_contact` at both senders, every country. `initial_opener_v2` is left alone: it is a person's explicit choice (2026-09-27) and has not been sent in the last 10 days.
- **RED:** a warning banner, cap halved, rises blocked. It no longer pauses the queue (`shouldPauseForRating` removed).
- **AI replies:** the Auto mode is retired. `modeMayAutoSend` is always false, the server refuses `auto`, a stored `auto` reads as Draft. Every AI-written reply needs approval. Live value at the change: `manual`.
- **Pause log:** every on/off a person makes to a country's WhatsApp, SMS or calls (who, when), plus cool-down and cold-stop events.
- **Australia** no longer has a budget outside the team cap (one number, one allowance). It is off.
- **Singapore** is unchanged: its old automatic switch-off stands until a person switches it on.

## What the missing Meta error codes block

`whatsapp-status` is held (`docs/whatsapp-status-cutover-plan.md`), and the live v129 stores no code from delivery reports. So until it is deployed:

- **The "systemic" rule is half blind.** A delivery failure about our account or template looks the same as any other failure. Only refusals at send time carry a code.
- **We cannot prove why a failure happened.** Malaysia's failures read "Meta gave no error code". Quality-limit blocks, per-user marketing limits (131049) and undeliverable numbers cannot be told apart. "Not on WhatsApp" is inferred from the lead flag.
- **The probe and the pattern rule therefore count failures by flag, not by reason,** so a burst of failures caused by a recipient limit can start a cool-down that is not strictly about us.

Nothing here needs the webhook. Once it is live, the codes make these rules more exact without changing them.
