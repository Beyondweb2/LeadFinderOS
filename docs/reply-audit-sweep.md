# Reply-audit sweeper (2026-10-23)

Fn `reply-audit-sweep`, rules `src/lib/replyAuditSweep.ts`, test `scripts/reply-audit-sweep.test.ts`,
migration `20261126090000_reply_audit_sweep.sql`.

## Why

`firstReplyGuard` (`src/lib/firstReplyAutomation.ts`) was fixed on 2026-10-23 so an automated first reply
(greeting, away message, booking bot) arms an audit-only intent. SMS got it at once (twilio-webhook
redeployed). WhatsApp inbound runs in `whatsapp-status`, which is **held at live v129** until the Findable
cutover (`docs/whatsapp-status-cutover-plan.md`). Read of the live body (2026-10-23): it still has
`if (looksAutomated(input.body)) return { kind: 'skip', reason: 'auto_responder' }` and counts only
non-automated text as the first reply — so a lead whose only replies are bots never gets a reply audit.

Live count on 2026-10-23 (30 days): 393 leads replied on WhatsApp; 365 have a reply-audit claim; 28 do not;
25 of those are not archived, not paid, not suppressed and have no claim row of any kind (14 of them have no
audit at all).

## What it does

1. Stops unless: `AUTO_AUDIT_REPLY_ENABLED` is on, the Inbox reply mode runs audits (not "Do nothing"),
   and `protection_settings.mode` is `running` (prospecting pause and emergency stop both stop it).
2. Allowance = `protection_settings.reply_audit_sweep_per_day` less the claims it wrote in the last 24 h
   (`whatsapp_auto_replies.reason = 'reply_audit_sweep'`). A missing column / failed read = 0.
3. Leads with a WhatsApp inbound in the last `REPLY_AUDIT_SWEEP_WINDOW_DAYS`, with **no**
   `whatsapp_auto_replies` row at all (the unique `lead_id` row is the once-ever slot; a lead holding a row
   for another trigger is left alone).
4. Per lead, the reply the webhook would have armed on (first counting inbound after the first non-failed
   outbound). Skipped: archived, ever declined (any inbound), and everything `firstReplyGuard` skips
   (client, not human text, suppressed). Newest reply first.
5. Inserts the claim: `status 'audit_only'`, `audit_mode 'audit_only'`, `audit_status 'pending'`,
   `reason 'reply_audit_sweep'`. 23505 = someone claimed it first; theirs stands.
6. `process-ai-audit-queue` (`reconcileFirstReplyAuditIntents`, every 30 s) mints the fresh hook audit as
   for any webhook claim. Nothing is ever sent: the drain never sends an `audit_only` row.

Modes: `{"mode":"dry_run"}` (read only, lists who would be queued) and `{"mode":"run"}`.
Auth: `x-internal-job: 1` + `x-cron-secret`. Cron `reply-audit-sweep-run`, hourly at :23.

## Why its own column, not `limits.actions`

`validateLimits` refuses an unknown action key; adding one to `GUARD_ACTIONS` would make every
Security-panel save fail against the live `security-admin` until it and every function reaching
`protectionLimits.ts` were redeployed. A plain column changes nothing else.

## When whatsapp-status is cut over

The live webhook will arm these itself; the sweeper then finds nothing (it only reads leads with no row).
It can stay as a safety net, or be unscheduled (rollback lines are in the migration header).
