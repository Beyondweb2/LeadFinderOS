-- HOW OLD IS THIS BUSINESS? — the Companies House check's cache (2026-10-02). Additive.
-- One row per Google place id: the machine's best Companies House match for a Find Leads result with
-- no website. Written only by fn companies-house-check (service role); read by any signed-in team member.
-- Kept 90 days for a strong match (CH_STRONG_CACHE_DAYS), 30 for a possible one, 14 for not found; any row
-- on an older CH_CHECK_VERSION, or whose listing name/postcode changed (fingerprint), is looked up again.
-- A failed lookup (no key, rate limit, outage) is never stored.
-- ⛔ This is the MACHINE's match, never a confirmed fact: nothing here is written to outreach_leads.

create table if not exists public.companies_house_checks (
  place_id text primary key,
  fingerprint text not null,
  business_name text not null,
  postcode text,
  town text,
  match text not null check (match in ('strong', 'possible', 'none')),
  company_number text,
  company_name text,
  company_status text,
  company_type text,
  incorporated_on date,
  registered_locality text,
  registered_postcode text,
  evidence jsonb not null default '[]'::jsonb,
  candidates_seen smallint not null default 0,
  requests smallint not null default 0,
  duration_ms integer not null default 0,
  version smallint not null,
  checked_at timestamptz not null default now()
);

alter table public.companies_house_checks enable row level security;
drop policy if exists companies_house_checks_team_read on public.companies_house_checks;
create policy companies_house_checks_team_read on public.companies_house_checks
  for select to authenticated using ((select public.my_role()) is not null);
revoke insert, update, delete, truncate on public.companies_house_checks from anon, authenticated;
revoke all on public.companies_house_checks from anon;
grant select on public.companies_house_checks to authenticated;
