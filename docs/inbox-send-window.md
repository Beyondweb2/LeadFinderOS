# Inbox send window (2026-10-21, `feat/inbox-send-window`)

Paul: "every message I send from the Inbox must respect the lead's local send window, not just initial messages."

## What it does

- Inside the lead's send hours an Inbox send goes exactly as before.
- Outside them the **server** saves it as one `inbox_scheduled_sends` row ("Queued, sends at 07:00 their time") and
  fn `inbox-scheduled-send` (cron every minute) sends it when the hours open.
- Header: "Their time 21:40 · opens 07:00" / "Their time 10:15 · open until 21:30". Outside the hours every send button says
  **Queue**. A queued message can be edited (free text only) or cancelled until it goes.

## Where the rules live

| Piece | Where |
|---|---|
| Hours, next opening, header words, queue/hold/cancel decisions (pure) | `src/lib/inboxSendWindow.ts` |
| Queue gate + the drain's door (edge) | `supabase/functions/_shared/inbox-schedule.ts` |
| One drain tick (deps injected, tested with fakes) | `supabase/functions/_shared/inbox-scheduled-drain.ts` |
| The drain | fn `inbox-scheduled-send` (`verify_jwt = false`, CRON_SECRET only) |
| Voice-note wiring shared by the Inbox send and the drain | `supabase/functions/_shared/voice-note-deps.ts` |
| Table, read/edit/cancel/release functions, reply-hours setting, stop trigger, cron | migration `20261114090000_inbox_scheduled_sends.sql` |
| Browser | `useInboxScheduled`, `components/InboxSendWindow.tsx`, `Inbox.tsx` |
| Tests | `scripts/inbox-send-window.test.ts` |

## Rules

- **Hours = the outreach hours** for the channel and the destination's market: WhatsApp = the queue window (UK 07:00–21:30
  London; MY/SG their own), texts = the SMS queue window (UK 09:00–20:00 London). There is no per-lead zone in the data; the zone
  comes from the digits, as the queue's does. **One setting overrides both:** `whatsapp_outreach_state.reply_start_min /
  reply_end_min` (admin, `set_inbox_reply_hours`; blank = outreach hours). A half-set or bad value is "not set".
- **Every Inbox path:** typed reply, Quick reply, approved AI draft, template, hook / contact follow-up buttons → `send-whatsapp-message`
  with `via:"inbox"`; texts → `twilio-sms-send` with `via:"inbox"`; voice notes → `send-whatsapp-voice` (always, it is Inbox-only).
  Files (`send-whatsapp-media`) are **refused** outside the hours, not queued, and the button is hidden. Other screens (the Outreach
  WhatsApp dialog, Quick Close) are unchanged.
- **Queued only after every check.** Each sender queues at the point its dry run would return: after ownership, opt-out,
  wrong number, cold rules, QA safety and the payload build; before the usage guard and anything written or sent.
- **At Send:** free-form WhatsApp (text, AI draft, voice) whose 24 hours end before the window opens is refused on the spot
  ("24h window expired, use a template"). Templates and texts need no 24 hours.
- **At send time (drain), in this order:** any suppression for the number/lead → cancel (opt-out, wrong number, other); archived or
  stopped lead (`not_interested`, `wrong_number`, `opted_out`, `do_not_contact`) → cancel; unreadable suppression → wait; an earlier
  unsent row in the conversation → wait (order kept); a message from them newer than `checked_at` → **held, Needs you "They
  replied since, check before sending"**; WhatsApp 24 hours gone → **held, Needs you "24h window expired, use a template"**; window
  shut → park at next opening; else send.
- **Stop/angry cancels:** a trigger on `contact_suppressions` cancels waiting rows for that number or lead, whichever path wrote the
  suppression (the drafter's stop, triage phrases, an SMS STOP, Mark opted out).
- **The drain sends AS the person who queued it** (role re-read from `user_roles`; a disabled account sends nothing), through the
  channel's own sender, so every guard runs again. WhatsApp text/template goes through `send-whatsapp-message`'s CRON_SECRET door
  that names a **claimed** row — the row is the send; the request carries nothing else. Voice and texts run the shared modules in
  process (their functions are `verify_jwt = true`). A voice note sends under its row id, so a second attempt is a duplicate.
- **Pacing:** at most 10 sends a tick, 2 s apart. A failure is recorded ("Not sent — …") and never retried automatically; a row stuck
  in `sending` for 10 minutes is closed as unknown ("check the conversation").
- **Approved AI draft queued:** the browser completes the claim with `queued_for_send_hours` and discards the draft, so the same
  draft cannot be approved twice. `ai-reply-drafts` itself is unchanged.
- **The drip is untouched:** nothing here reads `whatsapp_queue_state` / `sms_queue_state` or moves `outreach_leads.status`.

## Not done / follow-ups

- The Outreach WhatsApp dialog (`LeadWhatsAppPanel`) and `LeadSmsPanel` still send at any hour (Paul's brief named the Inbox).
- Needs you is shown through the existing filter/count; the held row itself carries the actions.
- The queue's own hours are still a second copy inside `process-whatsapp-queue` (pre-existing).
