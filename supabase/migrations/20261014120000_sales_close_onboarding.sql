-- SALES CLOSE → HANDOFF → PAID CLIENT ONBOARDING (2026-10-07,
-- docs/pre-sales-certification/sales-close-handoff-australia.md). Additive and idempotent.
--
--  1. client_onboarding_links — the paid client's secure onboarding form link (findable.live/details/<token>).
--     ⛔ The token is the key: 64 hex, unique; ONE open link per client (partial unique index); revocable;
--        written only by fn paid-client-hub (admin) and fn client-onboarding (the public form) on the service role.
--        RLS on, NO policies, no grants: nobody reads it through the API.
--  2. client_whatsapp_reads — one row per inbound WhatsApp message read for onboarding facts (message_id is the
--     key, so a message is read once). Service role only, like (1).
--  3. The kind lists widened: quick_close_events (+ call_answers_saved), lead_activity (+ onboarding_link_sent,
--     onboarding_form_submitted, whatsapp_facts_found), notifications (+ client_onboarding). Every existing
--     kind is kept (read back from production 2026-10-07).

create table if not exists public.client_onboarding_links (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.outreach_leads(id) on delete cascade,
  onboarding_id uuid references public.onboarding_responses(id) on delete set null,
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  route text check (route in ('build', 'optimise')),
  questions jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count integer not null default 0,
  submitted_at timestamptz,
  answers jsonb,
  conflicts jsonb,
  shared jsonb not null default '[]'::jsonb
);
create unique index if not exists client_onboarding_links_one_open
  on public.client_onboarding_links (lead_id) where revoked_at is null and submitted_at is null;
create index if not exists client_onboarding_links_lead on public.client_onboarding_links (lead_id, created_at desc);
alter table public.client_onboarding_links enable row level security;
revoke all on public.client_onboarding_links from anon, authenticated;

create table if not exists public.client_whatsapp_reads (
  message_id uuid primary key references public.whatsapp_messages(id) on delete cascade,
  lead_id uuid not null references public.outreach_leads(id) on delete cascade,
  read_at timestamptz not null default now(),
  outcome text not null check (outcome in ('facts', 'none', 'skipped', 'error')),
  facts jsonb not null default '[]'::jsonb,
  model text,
  prompt_version text,
  error text
);
create index if not exists client_whatsapp_reads_lead on public.client_whatsapp_reads (lead_id, read_at desc);
alter table public.client_whatsapp_reads enable row level security;
revoke all on public.client_whatsapp_reads from anon, authenticated;

-- 2b. whatsapp_template_status — Meta's LIVE status for a registered template (findable_signup_link /
--     findable_onboarding), cached by _shared/template-status.ts so a screen load is not a Meta call.
--     Approval is never hard-coded: this row is what Meta said, and when. Service role only.
create table if not exists public.whatsapp_template_status (
  name text primary key,
  status text not null,
  category text,
  language text,
  checked_at timestamptz not null default now(),
  error text
);
alter table public.whatsapp_template_status enable row level security;
revoke all on public.whatsapp_template_status from anon, authenticated;

alter table public.quick_close_events drop constraint if exists quick_close_events_kind_check;
alter table public.quick_close_events add constraint quick_close_events_kind_check check (kind = any (array[
  'answers_saved', 'review_requested', 'review_approved', 'link_generated', 'link_reused', 'link_refused', 'paid',
  'link_shared', 'link_share_failed', 'link_superseded',
  'call_answers_saved'
]::text[]));

alter table public.lead_activity drop constraint if exists lead_activity_kind_check;
alter table public.lead_activity add constraint lead_activity_kind_check check (kind = any (array[
  'lead_added', 'lead_claimed', 'lead_assigned', 'lead_unassigned', 'note', 'stage_changed', 'follow_up_set', 'call_booked',
  'call_outcome', 'website_control_set', 'audit_run', 'bulk_queued', 'marked_interested', 'details_set', 'archived_set',
  'contact_logged', 'crawl_run', 'report_link', 'state_changed', 'opted_out', 'transfer_requested', 'lost_reason_set',
  'payment_received', 'handoff_saved', 'onboarding_submitted', 'delivery_submitted', 'discovery_run', 'baseline_approved',
  'baseline_run', 'build_started', 'launched', 'payment_link_shared', 'client_info_requested', 'client_info_answered',
  'client_contact_opened', 'handoff_sent', 'client_intake', 'client_fact_set',
  'onboarding_link_sent', 'onboarding_form_submitted', 'whatsapp_facts_found'
]::text[]));

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind = any (array[
  'whatsapp_reply', 'whatsapp_failed', 'signup_opened', 'client_paid', 'commission_earned', 'commission_reversed',
  'audit_finished', 'template_decided', 'follow_up_due', 'lead_assigned', 'feedback_update', 'feature_update',
  'quick_close_review', 'quick_close_paid', 'transfer_request', 'team_update', 'team_task', 'client_info_request',
  'client_handoff', 'client_intake',
  'client_onboarding'
]::text[]));
