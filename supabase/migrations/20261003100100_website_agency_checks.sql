-- WHO RUNS THEIR WEBSITE? — the agency check's cache (2026-10-01). Additive.
-- One row per website DOMAIN (registrable, www-less): the machine's verdict for that site. Written only by
-- fn agency-check (service role); read by any signed-in team member (Find Leads shows it before a lead is
-- added, the lead's Work panel after). A result is reused for 30 days (AGENCY_CACHE_DAYS), a failed check
-- for 1 (AGENCY_FAILED_CACHE_DAYS), and any row on an older rules version is checked again; a different
-- domain is simply a different row, checked at once.
-- ⛔ This is the MACHINE's answer. The human's answer stays outreach_leads.website_control
--    (lead_set_website_control) and is never written from here.

create table if not exists public.website_agency_checks (
  domain text primary key,
  website text not null,
  classification text not null check (classification in ('agency_likely', 'no_evidence', 'unknown')),
  confidence smallint not null check (confidence between 0 and 100),
  agency text,
  agency_domain text,
  evidence jsonb not null default '[]'::jsonb,
  platform text,
  status text not null check (status in ('ok', 'failed')),
  failure_reason text,
  pages_checked smallint not null default 0,
  requests smallint not null default 0,
  duration_ms integer not null default 0,
  version smallint not null,
  checked_at timestamptz not null default now()
);

alter table public.website_agency_checks enable row level security;
drop policy if exists website_agency_checks_team_read on public.website_agency_checks;
create policy website_agency_checks_team_read on public.website_agency_checks
  for select to authenticated using ((select public.my_role()) is not null);
revoke insert, update, delete, truncate on public.website_agency_checks from anon, authenticated;
revoke all on public.website_agency_checks from anon;
grant select on public.website_agency_checks to authenticated;
