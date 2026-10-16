-- The simple findable.live onboarding (findable-site feat/onboarding-simple, 2026-10-16) asks three things
-- LeadFinderOS could not store, so findable-onboarding / findable-checkout dropped them:
--   design_choice         'keep' (keep the look of their current site) | 'improve' (let us improve it) | null
--   agency_contract_ends  the date a client still tied into an agency contract says it ends (null = not given)
--   access_ack_at         when the client ticked "I can get you access" on the plan screen (stamped once)
-- Additive only: three nullable columns, no rewrite, no default, no backfill. Existing rows read null.
set local lock_timeout = '5s';

alter table public.onboarding_responses add column if not exists design_choice text;
alter table public.onboarding_responses add column if not exists agency_contract_ends date;
alter table public.onboarding_responses add column if not exists access_ack_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'onboarding_responses_design_choice_check'
      and conrelid = 'public.onboarding_responses'::regclass
  ) then
    alter table public.onboarding_responses
      add constraint onboarding_responses_design_choice_check
      check (design_choice is null or design_choice in ('keep', 'improve'));
  end if;
end $$;
