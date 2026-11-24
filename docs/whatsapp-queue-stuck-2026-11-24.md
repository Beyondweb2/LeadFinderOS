# WhatsApp queue "barely sending", 24 Nov 2026

Reported 14:01 London: 19 of 200 sent, 128 queued, the same 9 leads at the top since the morning. At 09:36 Paul's line
read "Not moving since 08:42: every lead that could go is waiting for its AI audit to finish". Valentin's read
"Not moving since 07:00: the queue has not picked these up", with 0 sent.

## What the data showed (read-only, 14:05)

- Delivery was healthy: 19 queue openers 07:00–08:42, all sent/delivered/read. The cold outage of 23 Nov
  (`docs/whatsapp-queue-200-spread.md`) was over.
- After 08:42 the queue had **no lead it was allowed to send**. All 10 left were `initial_contact` with no website, 9 of
  them on 073/074/076 numbers. Those are the HIGH band of the 23 Nov likelihood hold (`src/lib/whatsappLikelihood.ts`),
  held until the number is GREEN. Paul queued 118 more at 13:59 and sending resumed at 14:00.
- Meta rated the number GREEN at 14:00. So the held leads could go, but they still came last.

## The causes

1. **"Waiting for its AI audit" was false.** The send path never makes an opener wait (initial_contact has no
   audit-derived variable). The `my_queue` screen counted *every* lead with no completed audit as waiting, whatever its
   template. Now only a lead whose template needs an audit counts, and the tick says outright that an opener is never
   made to wait (`isInitialOpener(...) || !templateNeedsAudit(vars)`).
2. **Held leads did not block the tick.** They are filtered out before the look-ahead. But the screen did not apply the
   hold, so held leads read as "could go" and the line said "stuck". The screen now uses the same hold as the tick, and
   says "Held: newer mobile number and no website …" (`HIGH_RISK_HELD_LINE`, `_shared/queue-fairness.ts`).
3. **Valentin never got a turn.** The tick sorted the whole look-ahead by likelihood *after* the per-sender round-robin.
   Every one of Paul's low-risk leads beat every one of Valentin's high-risk leads, so the round-robin was undone.
   "Likeliest first" now ranks inside each sender (`fairQueueOrder(..., rankOf)`). Valentin, with nothing sent today,
   goes first.
4. **Default opener.** New queue items in Findable campaigns default to `initial_contact_short`, unless the campaign has
   chosen `initial_opener_v2` / `initial_contact_short` (`defaultQueueOpener`, `src/lib/openerVariant.ts`).
   ⚠️ `initial_contact` stored on a campaign is NOT treated as a choice: `campaign_launch` stamped it on every launched
   campaign from the old global setting. This is used by the Outreach "Queue WhatsApp" dialog, a rep's lead picker, and
   `campaign_launch` (migration `20261124140000_campaign_launch_short_opener.sql`). LeadFinderOS-style campaigns are
   unchanged.
   ⚠️ The 2 Nov rule (`coldOpenerFor`: the short opener goes as `initial_contact`, made while the number was RED) still
   holds in the queue whenever the number is not GREEN (`queueOpenerToSend`). The person sender
   (`send-whatsapp-message`) is unchanged and still always swaps.

Unchanged: daily limit 200, 20 an hour, send hours, the one-strike No-WhatsApp rule, the 5-failures self-pause, and the
likelihood hold itself. Tests: `scripts/whatsapp-queue-stuck.test.ts`.
