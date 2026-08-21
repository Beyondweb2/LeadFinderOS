-- ════════════════════════════════════════════════════════════════════════════════════════════
-- HOOK FOLLOW-UP QUEUE MARKER — bulk hook_followup sends, paced through the WhatsApp queue.
--
-- A separate marker from the opener queue (status='queued'): the opener path REFUSES any lead with
-- prior WhatsApp history (its already_sent guard) and forces status='initial_contact' on send —
-- both correct for a cold opener and both wrong for a deliberate re-message to a lead who already
-- got the report. So hook_followup drains in its OWN lane in process-whatsapp-queue, keyed on this
-- column, sharing the SAME daily cap / 07:00–21:30 window / pacing (one send per tick — never a blast).
--
-- Set = queued (a timestamp, so the lane drains oldest-first). Cleared = sent, or de-queued because
-- the lead stopped being eligible. Additive, nullable, no default — nothing existing changes.
-- ════════════════════════════════════════════════════════════════════════════════════════════

alter table public.outreach_leads
  add column if not exists hook_followup_queued_at timestamptz;

-- Partial index: the drain lane only ever reads WHERE hook_followup_queued_at is not null, oldest first.
create index if not exists outreach_leads_hook_followup_queue_idx
  on public.outreach_leads (hook_followup_queued_at)
  where hook_followup_queued_at is not null;
