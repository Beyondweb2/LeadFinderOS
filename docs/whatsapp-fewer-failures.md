# Fewer failed WhatsApp sends (2026-11-23, `feat/queue-fewer-failures`)

Why: the number is RED (since 25 Oct, tier TIER_2K, `can_send_message` LIMITED). On 22 Nov 26 of the queue's 120 sends
failed (21.7%) and the queue paused itself ("9 of the last 18 queue messages failed in the past 60 minutes").

## What we measured (read-only, 23 Nov)

**How V1 decided "has WhatsApp":** it didn't. Queue eligibility (`coldWhatsAppEligibility.ts`) only asks "is it a UK mobile
by its digits" (`^447\d{9}`). The first real answer is the send itself.

**Accuracy of "UK mobile = has WhatsApp"**, first queue send per lead, 60 days: 2,421 sends, **~12% failed** (296).
Weekly 7–17%; 22 Nov was the worst day (21.7%). Sends by a person (user_id set) failed 0.2%: they mostly go to people who
already wrote to us.

**Failure codes:** 358 failed sends in 60 days, **every one with no Meta code**. They are delivery failures that arrive by the
webhook, and the live `whatsapp-status` (v129, held) stores no code. The only coded failure was one `131000` (Something went
wrong) refused at send time. v129 does read the code to pick the lead's flag: 20 of 26 failures on 22 Nov were flagged
`no_whatsapp`, which v129 sets only for **131026** (not on WhatsApp). So most failures are 131026, but that is inferred from
the flag, not stored. **Codes can only be stored once the held webhook is deployed** (`docs/whatsapp-status-cutover-plan.md`).
Nothing in the Graph API lets us read a message's status afterwards.

**The signal we were ignoring** (properties of the number and the lead, no lookup; first sends, 60 days / last 7 days):

| Number range | Website | Sends | Failed |
|---|---|---|---|
| 077 / 078 / 079 | yes | 1,126 | 6.9% (7.0%) |
| 075 | yes | 238 | 7.6% (10.3%) |
| 077–079 | no | 478 | 14.6% (13.7%) |
| 075 | no | 120 | 20.0% (15.8%) |
| 073 / 074 / 076 | yes | 300 | 15.0% (22.2%) |
| 073 / 074 / 076 | no | 139 | **33.8% (44.2%)** |

Newer lists hold more 073/074 numbers, which is why the rate rose. Repeats: 17 of the 358 failures were a second try to a lead
that had already failed.

**Bursts:** Malaysia and Singapore were switched ON, so their caps (30 + 150) were added to the UK's 150 and the shared pacing
clock spread 330 over the day: the UK sent 17–20 an hour on 22 Nov.

## What changed

1. **Number cap from the rating** (`src/lib/whatsappQualityCap.ts`, asked by the cold guard, so every door: queue, a person's
   send, the Inbox drain). RED 60 / YELLOW 100 / GREEN 150 cold sends a London day for the whole number, never more than 15 in
   any rolling hour. The rating is the cached reading `whatsapp-number-health` stores every 15 minutes; absent or stale = RED.
   Each country's own cap still applies underneath (`min`).
2. **Pacing:** the queue spreads `min(UK left, number left)` over the minutes left (RED: about one every 14–15 minutes, with
   the usual jitter). The abroad caps no longer speed the UK up.
3. **UK-only queue** (`QUEUE_MARKETS = ["UK"]` in `process-whatsapp-queue`): an abroad lead is never picked, whatever its switch
   says. Malaysia and Singapore's WhatsApp switches were also turned OFF (Australia already was), so a person's send to them is
   refused too.
4. **One strike** (`src/lib/whatsappOneStrike.ts`; SQL `public.apply_whatsapp_one_strike`, migration `20261228090000`): a real
   send that failed with no code or 131026, on a number that never had a delivery and never wrote to us → the lead is
   **No WhatsApp** (status `no_whatsapp`, which the text queue accepts), leaves the hook / contact follow-up lanes, and every cold
   door refuses it (`whatsappStruckOut` in the queue before the send and in `send-whatsapp-message`). Statuses further along
   (replied, interested, not_interested, email_sent…) keep their status. Other codes (131049, template, account) are about us
   and are not a strike. Each queue tick runs the SQL for the last 3 days; the backfill ran once over everything.
5. **Likeliest first** (`src/lib/whatsappLikelihood.ts`): the queue sends low-risk leads before medium; **high-risk (073/074/076
   with no website) is held** (stays queued, nothing written) unless the number is GREEN. Text or call them instead.
6. **Queue screen** shows quality colour, the daily limit, sent today and this hour (`numberCap` in the status read).

## Expected failure rate

With high-risk held and low-risk first, and no repeats: **about 7–12%** depending on the queued mix (7% if the queue is
mostly older ranges with a website). It cannot reach zero: a first message to a never-tried number is the only allowed test
of whether it is on WhatsApp. Note: Meta's quality rating is driven by recipients' blocks and reports, not by undeliverable
numbers, so fewer failures protects the auto-pause and our own numbers more than the rating itself.

## Not done here

- Storing delivery-failure codes needs the held webhook (Findable switch).
- A website's own WhatsApp link (`wa.me/…`) would be a strong positive signal; the crawl does not store it today.
