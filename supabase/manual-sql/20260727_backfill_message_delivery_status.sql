-- BACKFILL whatsapp_messages.status FROM whatsapp_sends.delivery_status
--
-- WHY. whatsapp_messages was insert-only: an outbound row was written as 'sent' and never touched
-- again, because the delivery webhook mirrored status onto whatsapp_sends alone. So per-message
-- delivered/read did not exist historically, and the dashboard had to infer engagement from the
-- lead-level ratchet (outreach_leads.whatsapp_delivery_status), which the campaign path sets and
-- which holds only ONE message id per lead — the opener's, in practice.
--
-- The webhook now writes per-message status going forward. This recovers the history that IS
-- recoverable: every send that has a whatsapp_sends row carrying a real receipt.
--
-- WHAT IT CANNOT RECOVER: audit_reply. Those 45 sends went out through the Inbox path, which never
-- wrote whatsapp_sends, so there is no receipt anywhere in our data to copy from — Meta's ~81% read
-- rate for them is not reconstructable. audit_reply's read rate therefore starts empty and only
-- becomes true for sends made after this deploy. That is expected, not a failure of the backfill.
--
-- Safety:
--   * only rows still at their insert-time status ('sent'/'simulated') are touched, so a status the
--     new webhook path has already written correctly is never overwritten;
--   * only real receipts are copied ('delivered','read','failed') — not 'sent'/'simulated', which
--     would be a no-op anyway;
--   * direction='outbound' guards the shared wa_message_id column: inbound rows are 'received' and
--     must not be rewritten;
--   * matched on the unique partial index wa_messages_wa_id_uq, so each message maps to one row.
--
-- Idempotent: re-running changes nothing, because the rows it updated no longer match the
-- status in ('sent','simulated') filter.
--
-- Expected: 168 rows (107 read, 25 delivered, 36 failed) as measured before running.

update public.whatsapp_messages m
   set status = s.delivery_status
  from public.whatsapp_sends s
 where m.wa_message_id = s.message_id
   and m.direction = 'outbound'
   and m.status in ('sent', 'simulated')
   and s.delivery_status in ('delivered', 'read', 'failed');

-- Verify: outbound status spread afterwards, and what audit_reply looks like specifically.
--   select status, count(*) from whatsapp_messages where direction='outbound' group by 1;
--   select status, count(*) from whatsapp_messages where template_name='audit_reply' group by 1;
