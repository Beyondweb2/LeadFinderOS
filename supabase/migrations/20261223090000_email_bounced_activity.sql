-- 2026-11-17: a bounced email is recorded on the lead (resend-webhook, supabase/functions/_shared/email-bounce.ts).
--   · lead_activity kind 'email_bounced': the History line "Email bounced: x did not accept our email…", data.to = the
--     address (lower-case). Send more info and Quick Close refuse to email an address with such a row on the lead.
-- Additive only: the same kind list as 20261221090000_send_more_info.sql plus 'email_bounced'. No data is changed.
alter table public.lead_activity drop constraint if exists lead_activity_kind_check;
alter table public.lead_activity add constraint lead_activity_kind_check check (kind = any (array[
  'lead_added', 'lead_claimed', 'lead_assigned', 'lead_unassigned', 'note', 'stage_changed', 'follow_up_set', 'call_booked',
  'call_outcome', 'website_control_set', 'audit_run', 'bulk_queued', 'marked_interested', 'details_set', 'archived_set',
  'contact_logged', 'crawl_run', 'report_link', 'state_changed', 'opted_out', 'transfer_requested', 'lost_reason_set',
  'payment_received', 'handoff_saved', 'onboarding_submitted', 'delivery_submitted', 'discovery_run', 'baseline_approved',
  'baseline_run', 'build_started', 'launched', 'payment_link_shared', 'client_info_requested', 'client_info_answered',
  'client_contact_opened', 'handoff_sent', 'client_intake', 'client_fact_set', 'onboarding_link_sent',
  'onboarding_form_submitted', 'whatsapp_facts_found', 'sms_sent', 'call_made', 'work_closed', 'more_info_sent',
  'email_bounced'])) not valid;
alter table public.lead_activity validate constraint lead_activity_kind_check;

-- Read back:
--   select pg_get_constraintdef(oid) like '%email_bounced%' from pg_constraint where conname = 'lead_activity_kind_check';
