-- TWO CLOSE OPTIONS (2026-10-07, fix/quick-close-two-options): the client's own answer to "are you still tied into a
-- contract with the agency / web company that looks after your site?" on the Full Setup page. Same three values as the
-- salesperson's call (in_contract | free | not_sure). Additive and idempotent; null = not asked (no agency).
alter table public.onboarding_responses add column if not exists agency_contract text;
alter table public.onboarding_responses drop constraint if exists onboarding_responses_agency_contract_check;
alter table public.onboarding_responses add constraint onboarding_responses_agency_contract_check
  check (agency_contract is null or agency_contract in ('in_contract', 'free', 'not_sure'));
