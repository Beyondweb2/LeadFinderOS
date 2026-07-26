-- Findable onboarding: questionnaire answers from the public findable-site flow
-- (/onboarding?lead=<leadId>). One row per submission; the service-role edge function
-- (findable-onboarding) is the ONLY reader/writer — RLS is on with no anon policies.

create table public.onboarding_responses (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.outreach_leads(id) on delete set null,  -- null = generic mode (no lead link)
  audit_id uuid,                          -- the audit fired on submit (null in generic mode / audit skipped)
  standout text,                          -- Q1: what makes you stand out
  services text,                          -- Q2: services + priority areas (also fed to the audit as specialisms)
  confirmed_location text not null,       -- Q3: the customer-CONFIRMED service area (feeds the audit)
  accreditations text,                    -- Q4: optional trust signals
  gbp_consent text not null,              -- Q5: 'yes_all' | 'listings_only' | 'discuss'
  gbp_manager_email text,                 -- email to add as GBP manager (optional)
  business_name text,                     -- captured in generic mode (no lead to carry it)
  status text not null default 'submitted',  -- submitted → audit_running → audit_complete → paid
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index onboarding_responses_lead_idx on public.onboarding_responses (lead_id);
-- Rate-limit lookups: newest submission per lead.
create index onboarding_responses_lead_created_idx on public.onboarding_responses (lead_id, created_at desc);

alter table public.onboarding_responses enable row level security;
-- No policies on purpose: anon/authenticated get nothing; the service role bypasses RLS.
