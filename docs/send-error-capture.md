# The real send error, and safer sending (2026-10-15, feat/send-error-capture)

## Why

On 14 Oct the first cold WhatsApp to Malaysia (one send) and Singapore (one send) both failed, and nobody could see why:
- the send path kept only a "temporary failure" class on the lead (`whatsapp_delivery_status = failed_temporary`) and Meta's raw JSON in `whatsapp_sends.error`, and only when Meta refused the send outright;
- both 14 Oct failures were **delivery-report** failures (Meta accepted, then failed the message). The `whatsapp-status` webhook reads only `errors[0].code` to route the lead and stores nothing about the error. Both rows have `error = NULL`.

So the 14 Oct codes are lost for good. The capture below catches every failure Meta answers at send time. A delivery-report failure's code arrives only through `whatsapp-status`, which is held (CLAUDE.md §8: not to be deployed until the Findable Meta App secret is ready). When it is next deployed, it should write `errors[0].code / title / error_data.details` to `whatsapp_sends.error_code / error_title / error_details` (and the message row) with `metaErrorParts` (`src/lib/sendErrorMeaning.ts`). It was not changed here.

## What was built

- **Columns** (migration `20261029090000_send_error_capture.sql`): `error_code / error_title / error_details` on `whatsapp_sends` and `whatsapp_messages`; `whatsapp_error_code / whatsapp_error_title / whatsapp_error_at` on `outreach_leads` (the queue row).
- **Capture**: `sendViaGraph` (`_shared/whatsapp-send.ts`) returns `errorParts`; `errorColumns(parts)` maps them. The opener lane (its own fetch), the auto-reply, hook and contact lanes of `process-whatsapp-queue`, and `send-whatsapp-message` all store them. Token-shaped strings are masked (`maskSecrets`). Media / voice sends keep the JSON in `error`; the screens read the code back from it (`partsFromStoredError`).
- **Meaning**: `src/lib/sendErrorMeaning.ts`. Meta and Twilio tables built from their current official lists (URLs in the file, read 2026-10-15). The raw code is ALWAYS shown; the meaning only when known.
- **Screens**: Inbox chip "Send failed · Meta 131049" (tooltip = meaning), the failed bubble shows code + meaning (both channels, one component); the queue panel's "Failed sends — last 7 days" (fn `process-whatsapp-queue` mode `recent_failures`, admin).
- **Per-country auto switch-off** (`country_whatsapp_auto_pause`, mirrored in `src/lib/countryAutoPause.ts`): counted on real sends to Malaysia / Singapore since the country was last switched on. Trial (≤5 sends): any failure except Meta 131026 switches it off. After: 2 of the last 5. A trigger on every failed write to `whatsapp_sends` / `whatsapp_messages` runs it, whoever wrote it, including the held webhook. It never breaks the write. Applied once on release: **Malaysia and Singapore were switched off** (each 1 of 1 failed). Banner in the country settings. The UK queue's burst auto-pause (`whatsappPace.ts`) is unchanged.
- **No auto-retry for MY / SG**: trigger `trg_whatsapp_my_sg_no_auto_retry` turns any failure re-queue (queue OR webhook) into `whatsapp_failed`. The hook / contact follow-up lanes clear their marker. A person re-queueing (attempts reset to 0) is not touched.
- **Who paused**: `whatsapp_outreach_state.pause_changed_at / _by / _source`, written in the same update as the flag; every change is appended to `whatsapp_queue_pause_log` (service role only) by trigger. The panel says "Paused by Paul 15 Oct, 09:28". The 14 Oct pause predates this, so it says "not recorded".
- **Call campaigns**: `sales_queue_opener(_lead_ids, _template, _confirm_call_campaign default false)` skips a Call-campaign lead as `call_campaign`. Outreach bulk + the per-lead controls ask first (`src/lib/callCampaignGuard.ts`, fails closed).

## Tests

`scripts/send-error-capture.test.ts`; `supabase/tests/send-error-capture.sql` (re-runnable, always rolled back: trial rule, 131026 exception, test sends ignored, MY hand-back vs UK retry, the pause log).
