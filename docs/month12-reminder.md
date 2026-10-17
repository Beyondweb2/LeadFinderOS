# The payment-12 reminder (Client Service Agreement v5, clause 9A.5) — 2026-10-17

## What the agreement promises

v5 9A.5, last sentence: **"We will remind you before payment 12 that you can opt in."** — to the optional
£29.99/month Hosting and Maintenance service (9A.2). It names no lead time and no channel; 16.6 says notices are in
writing by email to the recorded address. So: one EMAIL to the "Email for notices" on the client's signed acceptance,
from `MONTH12_REMINDER_LEAD_DAYS` (30) days before payment 12, never on or after the payment-12 day.

- **v4**: 9A.5 has no reminder sentence → not sent.
- **v3**: 9A.3 promises a DIFFERENT reminder ("at least 30 days before your minimum term ends … how to cancel" the
  automatic Continuing Service). Not sent from here; it remains Paul's timeline prompt (`timelineActions`).
- The test is the signed TEXT (`client_agreement_acceptances.agreed_text` contains the sentence), not a version label.

The email says only what v5 says: Build does not continue after payment 12 (9A.2), the optional service and what it
covers (9A.3), cancelling (9A.4), the 30-day move window if they do not opt in (9A.5), the website transfers on final
payment (8.4). Reply to opt in. Signed "Paul, Findable", from alerts@findable.live, reply-to paul@findable.live.

## How it works

- Dates: `src/lib/finalPaymentDates.ts` (`finalPaymentDates(facts)`) — payment 12 from the REAL collected payments (`minimumTerm`), the
  reminder window, and `ownershipTransferDay` (known only once payment 12 is actually taken). The month-12 handover
  must use this, not its own arithmetic.
- Rules: `src/lib/month12Reminder.ts` (`month12ReminderVerdict`, every "no" named: not v5, not Build, refunded, ended,
  subscription cancelled, opt-in decided, already reminded, payment 12 taken, too early, too late, no email).
- Server: `_shared/month12-reminder.ts`, fn `month12-reminder` (internal, CRON_SECRET): `dry_run` (reads only),
  `run` (scheduled), `qa_drill` (one ZZ fixture, fast-forwarded day).
- Once per client: `month12_reminders` (primary key lead_id) is CLAIMED before the send; a failed send stays
  `failed`, Paul is emailed, never retried blind. A send stamps `client_service_terms.continuing_reminder_sent_at`
  + history `continuing_reminder_sent`, so Paul's timeline prompt clears.
- Kill switch: `month12_reminder_settings.enabled` (default false). Cron `month12-reminder-run` 10:00 UTC daily
  calls `invoke_month12_reminder()`, which posts only while it is on. QA leads are never reached by `run`.
- Migration `20261106090000_month12_reminder.sql` (additive; rollback in its header).

## The month-12 ownership handover — NOT built

Exists: the payment-12 day (expected and actual) and the ownership-transfer day (`finalPaymentDates`); the reminder.
Still needed: a record that payment 12 was taken and ownership passed (8.4), the files / export on request, the
opt-in decision captured from the client's reply (`continuing_decision` is set by hand today), the 30-day hosting
grace end and take-down step (9A.5), and stopping Build tooling for a transferred site.
