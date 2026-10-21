# WhatsApp number quality rating and tier (2026-10-21)

Branch `feat/whatsapp-rating-watcher`. Rules: `src/lib/whatsappNumberHealth.ts` (one leaf, imported by the watcher, the queue and the panel).

## What it does
- **fn `whatsapp-number-health`** (cron every 15 min via `public.invoke_whatsapp_number_health()`, or an admin) asks Meta
  `GET /{WHATSAPP_PHONE_NUMBER_ID}?fields=quality_rating,messaging_limit_tier` with the sender's own token. If the API version
  no longer knows the tier field (#100) it asks for the rating alone and keeps the last known tier.
  - `mode: "probe"` answers and writes nothing.
  - `mode: "check"` stores `meta_quality_rating`, `meta_messaging_tier`, `meta_health_ok_at`, `meta_health_checked_at`,
    `meta_health_error` on `whatsapp_outreach_state` (id 1) and logs every change to `whatsapp_number_health_log`
    (service role only; kinds `rating_changed`, `tier_changed`, `read_failed`, `read_recovered`, `paused_red`, `cap_rise_refused`).
- **Rules** (`healthVerdict`):
  | Rating | Daily cap | Cap rises | Queue |
  |---|---|---|---|
  | GREEN | as set | allowed | unchanged |
  | YELLOW | halved (rounded down) | refused | unchanged |
  | RED | halved | refused | paused ONCE on the turn into red (`pause_changed_source 'auto'`, reason `RED_PAUSE_REASON`); a person resumes; not re-paused while it stays red |
  | cannot be read (never read, last good read older than `HEALTH_STALE_AFTER_MIN`, or UNKNOWN) | as set | refused | unchanged — never paused or slowed |
- The halving is applied in `process-whatsapp-queue` to the cap the drip uses (so the 1–2 minute random gap simply widens);
  the admin's stored cap is not changed (`pace.setCap` in the status payload). `set_pace` compares EFFECTIVE caps (blank = default),
  so clearing a low cap back to the default counts as a rise. Refusal = 200 `ok:false, error:'cap_rise_blocked'`.
- Untouched: the stored caps, the random gap, the failure-burst auto-pause, the Malaysia / Singapore auto switch-off, the held `whatsapp-status`.
- Panel: `NumberHealthLine` in `WhatsAppPaceSettings` (rating chip, tier, read time, the limit in words, a warning when the cap is above the tier).

## Deploy order
1. Migration `20261119090000_whatsapp_number_health.sql` (additive), read back.
2. `npx supabase functions deploy whatsapp-number-health` → `mode: "probe"` to prove the token reads the rating (step 1 of the brief).
3. `process-whatsapp-queue` (reads the new columns defensively — safe before or after 1), then the SPA.
4. Cron, by hand: `select cron.schedule('whatsapp-number-health-run', '*/15 * * * *', 'select public.invoke_whatsapp_number_health();');`

## The 7 failed sends of 21 Oct 2026 (read-only finding)
All 7 were cold `initial_contact_short` openers from the queue, 07:20–08:41 UTC, out of 97 sends that day (90 delivered / read).
Every one has a Meta message id — Meta ACCEPTED the send and the failure came later on the delivery report. No error code
is stored because the live `whatsapp-status` (v114, held) records the failed status but not Meta's code. 6 of the 7 leads were
then marked `no_whatsapp` (the old webhook's reading of a delivery failure); 1 (07:42) shows the message failed while its send
row says read — two reports disagreeing. The pattern (cold UK mobiles, accepted then failed, spread over 80 minutes, 7% of the
day) is what Meta's 131026 "not on WhatsApp / cannot receive" looks like, not a quality block — but without the code this is
an inference, not proof. The code arrives only once the held `whatsapp-status` is deployed.
