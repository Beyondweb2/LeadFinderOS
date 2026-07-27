-- CONTACT EMAIL on onboarding_responses.
--
-- WHY a new column rather than reusing gbp_manager_email: they are different addresses with
-- different jobs. gbp_manager_email must be a GOOGLE account that can be added as a manager on the
-- business's listing, and it is only required for the "yes to both" consent answer. contact_email is
-- where the report and documents go, is required of everyone, and needs to be nothing but a working
-- inbox. Trades routinely have a personal Gmail for Google and an info@ address for business post,
-- so collapsing them would either force Google-account semantics on everyone or lose one address.
--
-- Deliberately NOT prefilled from outreach_leads.email: only 1 of 466 leads has one, and
-- findable-onboarding's prefill returns a safe subset precisely so the public page never exposes a
-- lead's email/phone/notes. Publishing an address to anyone holding the ?lead= URL is not worth
-- 0.2% coverage, so the question is asked instead.
--
-- Nullable on purpose. The flow requires it, but the escape hatch ("I'll fill this in later") posts
-- a partial row by design, and the Stripe webhook backfills this column from the payer's checkout
-- email when it is empty. A NOT NULL here would turn a recoverable gap into a lost submission.

alter table public.onboarding_responses
  add column if not exists contact_email text;

comment on column public.onboarding_responses.contact_email is
  'Where reports and documents go. Asked at the town step; backfilled from the Stripe checkout email if empty. Distinct from gbp_manager_email, which must be a Google account.';

-- Answering "which signups can we actually reach":
--   select count(*) filter (where contact_email is not null) as reachable, count(*) from onboarding_responses;
