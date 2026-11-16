-- Send more info (Paul, 2026-11-16, docs/send-more-info.md). Additive and idempotent.
--   · public.more_info_settings (1 row): the price line both the email and the text say ({{price_line}}). RLS on, NO policies:
--     read and written only by fn send-more-info (service role; saving is admin-only in the handler).
--   · lead_activity kind 'more_info_sent': the History line "More info sent by Valentin via SMS".
--   · protection_settings: the guard action email_send (a person pressing Send on an email), only when absent.
-- Rollback:
--   drop table if exists public.more_info_settings;
--   (the kind and the guard action are harmless when unused)
set lock_timeout = '5s';

create table if not exists public.more_info_settings (
  id boolean primary key default true check (id),
  price_line text not null default '£99 a month for 12 months (or £999 up front)' check (length(btrim(price_line)) between 1 and 160),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.more_info_settings enable row level security;
revoke all on public.more_info_settings from anon, authenticated;
insert into public.more_info_settings (id) values (true) on conflict (id) do nothing;

alter table public.lead_activity drop constraint if exists lead_activity_kind_check;
alter table public.lead_activity add constraint lead_activity_kind_check check (kind = any (array[
  'lead_added', 'lead_claimed', 'lead_assigned', 'lead_unassigned', 'note', 'stage_changed', 'follow_up_set', 'call_booked',
  'call_outcome', 'website_control_set', 'audit_run', 'bulk_queued', 'marked_interested', 'details_set', 'archived_set',
  'contact_logged', 'crawl_run', 'report_link', 'state_changed', 'opted_out', 'transfer_requested', 'lost_reason_set',
  'payment_received', 'handoff_saved', 'onboarding_submitted', 'delivery_submitted', 'discovery_run', 'baseline_approved',
  'baseline_run', 'build_started', 'launched', 'payment_link_shared', 'client_info_requested', 'client_info_answered',
  'client_contact_opened', 'handoff_sent', 'client_intake', 'client_fact_set', 'onboarding_link_sent',
  'onboarding_form_submitted', 'whatsapp_facts_found', 'sms_sent', 'call_made', 'work_closed', 'more_info_sent'])) not valid;
alter table public.lead_activity validate constraint lead_activity_kind_check;

update public.protection_settings
   set limits = jsonb_set(limits, '{actions,email_send}', '{"paid":false,"per_min":6,"per_hour":60,"per_day":200}'::jsonb, true)
 where id = 1 and not (limits -> 'actions' ? 'email_send');

-- Read back:
--   select price_line from public.more_info_settings;
--   select limits -> 'actions' -> 'email_send' from public.protection_settings;
--   select pg_get_constraintdef(oid) like '%more_info_sent%' from pg_constraint where conname = 'lead_activity_kind_check';
