-- CLIENT MISSING-INFO ACTIONS (2026-10-05, docs/pre-sales-certification/client-missing-info-actions.md).
-- Additive only — no existing row is rewritten.
--
-- Paul, on a Paid Client with missing setup information, can ASK THE SALESPERSON who sold it. One request
-- per client may be outstanding at a time; it is answered when the seller saves their handoff or the
-- client details (fn quick-close), and it never stores the information itself — the answers land on the
-- same lead / handoff fields the setup checklist already reads (src/lib/handoffReadiness.ts).
--
-- ⛔ ONE OPEN REQUEST PER CLIENT: a partial UNIQUE index — the one conditional write only one caller can
--    win (CLAUDE.md §4). A double press, two tabs or a retry can never create a second request.
-- ⛔ NO WRITE GRANTS. Rows are written only by fn paid-client-hub (admin) and fn quick-close (the seller),
--    on the service role. A signed-in person may READ: the admin every row, a salesperson only the
--    requests addressed to them (seller_user_id). Another salesperson sees nothing.
--
-- Rollback (nothing else depends on these objects):
--   drop table if exists public.client_info_requests;
--   (the widened CHECKs may stay — a wider CHECK harms nothing)

create table if not exists public.client_info_requests (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.outreach_leads(id) on delete cascade,
  /* The seller (outreach_leads.sold_by_user_id at the time of the request — stamped once at payment). */
  seller_user_id uuid not null references auth.users(id),
  requested_by uuid not null references auth.users(id),
  requested_at timestamptz not null default now(),
  /* The checklist keys that were missing (src/lib/clientMissingInfo.ts MISSING_INFO_KEYS). Display only:
     what is missing NOW is always re-derived from the checklist. */
  items text[] not null default '{}',
  reminded_at timestamptz,
  remind_count integer not null default 0,
  answered_at timestamptz,
  answered_by uuid,
  closed_at timestamptz,
  closed_reason text check (closed_reason is null or closed_reason in ('answered', 'cancelled')),
  constraint client_info_requests_closed_has_reason check ((closed_at is null) = (closed_reason is null))
);
create unique index if not exists client_info_requests_one_open on public.client_info_requests (lead_id) where closed_at is null;
create index if not exists client_info_requests_seller_open on public.client_info_requests (seller_user_id) where closed_at is null;
create index if not exists client_info_requests_lead on public.client_info_requests (lead_id, requested_at desc);

alter table public.client_info_requests enable row level security;
revoke all on public.client_info_requests from anon, authenticated;
grant select on public.client_info_requests to authenticated;
drop policy if exists client_info_requests_read on public.client_info_requests;
create policy client_info_requests_read on public.client_info_requests for select to authenticated using (
  (select public.my_role()) = 'admin' or seller_user_id = (select auth.uid()));

-- The salesperson's "CLIENT INFO NEEDED" notice (and Paul's "answered" notice). Every live kind kept
-- (read back 2026-10-05).
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'whatsapp_reply', 'whatsapp_failed', 'signup_opened', 'client_paid', 'commission_earned', 'commission_reversed',
  'audit_finished', 'template_decided', 'follow_up_due', 'lead_assigned', 'feedback_update', 'feature_update',
  'quick_close_review', 'quick_close_paid', 'transfer_request', 'team_update', 'team_task',
  'client_info_request'));

-- History: requested / answered / Paul opened the client's contact. Every live kind kept (read back 2026-10-05).
alter table public.lead_activity drop constraint if exists lead_activity_kind_check;
alter table public.lead_activity add constraint lead_activity_kind_check check (kind = any (array[
  'lead_added', 'lead_claimed', 'lead_assigned', 'lead_unassigned', 'note', 'stage_changed', 'follow_up_set', 'call_booked',
  'call_outcome', 'website_control_set', 'audit_run', 'bulk_queued', 'marked_interested', 'details_set', 'archived_set',
  'contact_logged', 'crawl_run', 'report_link', 'state_changed', 'opted_out', 'transfer_requested', 'lost_reason_set',
  'payment_received', 'handoff_saved', 'onboarding_submitted', 'delivery_submitted', 'discovery_run', 'baseline_approved',
  'baseline_run', 'build_started', 'launched', 'payment_link_shared',
  'client_info_requested', 'client_info_answered', 'client_contact_opened'
]::text[]));
