-- The guarantee depends on whether the actual domain already exists, not whether we rebuild its site.
alter table public.onboarding_responses
  add column if not exists domain_status text;

alter table public.onboarding_responses
  add constraint onboarding_responses_domain_status_check
  check (domain_status is null or domain_status in ('existing', 'new'));
