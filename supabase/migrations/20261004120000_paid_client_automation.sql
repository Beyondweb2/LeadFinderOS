-- ══ PAID CLIENT AUTOMATION (2026-10-02, docs/paid-client-automation.md) ══════════════════════════════
-- Payment → Paid Client → setup checklist → Ready for delivery. Additive only; apply ONE statement block
-- at a time (CLAUDE.md §6: never db push). Plain nullable columns: metadata-only, no table rewrite.
--
--  outreach_leads.sales_handoff          the salesperson's short handoff (src/lib/salesHandoff.ts is the
--                                        shape; written only by fn quick-close, cleaned by an allowlist)
--  outreach_leads.delivery_submitted_at  "Submit for delivery" — set ONCE (the readiness is derived, the
--  outreach_leads.delivery_submitted_by  submission is the one stored act; the snapshot is in History)
--  outreach_leads.new_client_email_at    the claim that makes the "New Findable client" email go ONCE per
--                                        lead, whatever Stripe retries (stripe-webhook)

set local lock_timeout = '5s';

alter table public.outreach_leads
  add column if not exists sales_handoff jsonb,
  add column if not exists delivery_submitted_at timestamptz,
  add column if not exists delivery_submitted_by uuid,
  add column if not exists new_client_email_at timestamptz;

-- History: the delivery workflow's meaningful events (the CHECK is the live list of 2026-10-02 plus these).
alter table public.lead_activity drop constraint if exists lead_activity_kind_check;
alter table public.lead_activity add constraint lead_activity_kind_check check (kind = any (array[
  'lead_added', 'lead_claimed', 'lead_assigned', 'lead_unassigned', 'note', 'stage_changed',
  'follow_up_set', 'call_booked', 'call_outcome', 'website_control_set', 'audit_run', 'bulk_queued',
  'marked_interested', 'details_set', 'archived_set', 'contact_logged', 'crawl_run', 'report_link',
  'state_changed', 'opted_out', 'transfer_requested', 'lost_reason_set',
  'payment_received', 'handoff_saved', 'onboarding_submitted', 'delivery_submitted',
  'discovery_run', 'baseline_approved', 'baseline_run', 'build_started', 'launched'
]::text[]));

-- ONE "Payment received" event per lead, ever: a retried Stripe event inserts nothing (23505 is read as
-- "already recorded"). Recurring payments are not History events (the ledger records them).
create unique index if not exists lead_activity_one_payment_received
  on public.lead_activity (lead_id) where kind = 'payment_received';
-- Likewise one "Launched" per lead.
create unique index if not exists lead_activity_one_launched
  on public.lead_activity (lead_id) where kind = 'launched';
