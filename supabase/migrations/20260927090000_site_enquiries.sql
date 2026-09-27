-- SITE ENQUIRIES (2026-09-27) — one row per enquiry sent from a Findable client website's form,
-- written only by the site-enquiry edge function. Stored BEFORE the email is sent, so a failed
-- email is visible here (notify_error) rather than lost. mode 'test' = a preview / localhost
-- submission, sent to Resend's test inbox, never to the client.
--
-- ⛔ SERVICE ROLE ONLY: RLS on, NO policies, grants revoked (CLAUDE.md §6 — anon/authenticated hold
--    grants on every public table). It holds members of the public's contact details.
-- Additive and idempotent.

create table if not exists public.site_enquiries (
  id uuid primary key default gen_random_uuid(),
  site text not null,
  mode text not null,
  origin text,
  ip_hash text,
  name text not null,
  phone text,
  email text,
  service text,
  location text not null,
  message text not null,
  notify_error text,
  resend_id text,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint site_enquiries_mode_check check (mode in ('production', 'test'))
);

create index if not exists site_enquiries_site_created_idx on public.site_enquiries (site, created_at desc);
create index if not exists site_enquiries_ip_created_idx on public.site_enquiries (ip_hash, created_at desc);

alter table public.site_enquiries enable row level security;
revoke all on table public.site_enquiries from anon, authenticated;

comment on table public.site_enquiries is
  'Enquiries from Findable client website forms (fn site-enquiry). Service role only (RLS, no policies). mode test = preview/localhost, never delivered to the client.';
