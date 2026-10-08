# WhatsApp queue → send → Inbox reliability (2026-10-08, `fix/whatsapp-queue-send-reliability`)

Recon-first pass over the cold-WhatsApp path. What was found live, what was changed, what was proved.

## Found (live production, read-only, 2026-10-08)

- **No real outbound since 2026-10-01 15:07 UTC.** Every outbound in the last 7 days is a QA-simulator `simulated` row. The 138 real sends
  since 25 Sep all have a Meta message id, a matching `whatsapp_messages` row, and zero `whatsapp_sends` rows without one.
- **The 09:19 batch (7 real plumbers) never sends:** queued from `test1`, a test account in `metric_exclusions` (`kind = 'user'`). The drip
  deliberately never chooses a real business held by a test account (`src/lib/qaSafety.ts` REFUSE) — correct, but silent: they showed as
  "Waiting". The queue panel now says so (`testHeldQueuedCount`).
- **Two roofers sat `queued` for 9 days with NO phone.** The Outreach dialog's gate (`classifyLineType`) called an empty number "eligible";
  the drip's selection excludes a null phone, so nothing ever looked at them. Now refused up front and swept out of the queue.
- **"Already contacted" was one label for five different things.** Of 25 New leads that `lead_first_contact_at` calls contacted: 19 had no
  message of their own — only another lead row sharing the phone (a second Google listing, same search, different `place_id`); 6 had a
  sign-up row (QA quick closes / a free check); 0 had a message of their own. The admin toast also lumped "already in the queue", "No WhatsApp"
  and "opted out" into "already contacted, queued or suppressed".
- **Call does not cause it.** `handleCallClick` writes `contact_method = 'call'` only; nothing in the queue, the drip, `lead_first_contact_at`,
  `lead_reached_contact` or `opener_contact_block` reads `contact_method`. The one attempt stamp (`last_outreach_attempt_at`) comes from
  "Open in WhatsApp app" (`executeContact`, WhatsApp only) and is a deliberate duplicate-opener protection — kept, now labelled
  `whatsapp_app_opened`.
- **Inbox already shows outbound-only conversations** (`conversations` is built from the message log; the only scope is the lead's
  owner, unarchived, has a phone). Nothing changed there.
- **A Meta rejection at send time** is recorded (`whatsapp_sends.error`, lead → `no_whatsapp` / retry / `whatsapp_failed`), never marked Sent,
  never stamps `whatsapp_sent_at`. A *later* failure arrives by webhook (`whatsapp-status`, not touched here) and carries no error text:
  27 recent `failed` rows have `error` null.

## Changed

| What | Where |
|---|---|
| One eligibility rule: a positive allowlist on the DIGITS (UK mobile only). No number / unparseable / landline / India / Australia all refused. One existing state for all of them: `no_whatsapp_needs_sms` (never a new status). | `src/lib/coldWhatsAppEligibility.ts` |
| Dialog: refuses by that rule, flags the lead (unless it is already past the start), every skip has its own bucket + up to 5 business names | `OutreachTable.tsx` `handleQueueForWhatsApp`, `whatsappQueueView.ts` |
| Drip: `bad_number`, non-UK, `phone_already_contacted`, logged-conversation drop-outs no longer hard-code `not_contacted` (it DOWNGRADED a Contacted lead that was re-queued); they return to the pre-queue status, flag No WhatsApp when unreachable, reconcile New → Contacted on the lead's OWN thread / a logged conversation | `process-whatsapp-queue` |
| Drip: sweep of queued leads with no phone | `process-whatsapp-queue` |
| Drip: outbound-log insert retried once (checks the Meta id is not already on a row first), then a `client_error_reports` row `queue_outbound_log_failed` | `process-whatsapp-queue` |
| Sales/campaign SQL: `lead_contact_basis()` splits the old `already_contacted` into `already_contacted` (own message) / `sign_up_started` / `whatsapp_app_opened` / `number_already_contacted`; `no_phone` / `not_a_uk_mobile` flag No WhatsApp; own message or logged conversation reconciles New → Contacted | migration `20261017090000_queue_truthful_flags.sql` |
| Panel: test-account-held and unsendable callouts | `WhatsAppQueuePanel.tsx` |

Test: `scripts/queue-send-reliability.test.ts`.

## Rules this taught

- **Reconcile status only on the lead's OWN evidence.** A thread on another lead row sharing the phone blocks the cold opener, and proves nothing
  about this row's status.
- **Never hard-code `not_contacted` when pulling a lead out of the queue** — use `statusBeforeQueue` (`previous_status`).
- **Contact Method is the route, not the evidence.** Keep it out of every eligibility rule.
- **A held-by-design lead must be visible** — silence reads as "waiting".

## Still open

- Duplicate lead rows are created because a Find Leads pool add carries no phone at insert, so the phone dedupe cannot run; the phone arrives
  from a later Place Details lookup. The drip's phone-history seatbelt catches them. Fixing it means a post-lookup merge/flag — not done.
- `whatsapp-status` writes `failed` without the Meta error text. That function was deliberately not deployed in this pass.
- No live Meta send was made: no number in the system is verifiably Paul's. Needs his own number.
