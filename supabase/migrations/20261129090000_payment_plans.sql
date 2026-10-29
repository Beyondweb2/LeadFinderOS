-- PAYMENT PLANS (Paul, 2026-10-29): Findable Build paid three ways (pay in full / 6 months / 12 months), plus the
-- staff-only v5 plan (legacy_twelve). src/lib/paymentPlans.ts is the rule; this pins the data.
-- Additive only. No existing row is updated: a blank plan on a historical sign-up or client stays blank and is read
-- as the v5 plan by paymentPlanFromRow while the new options are not on sale (PAYMENT_OPTIONS_SELLABLE).

-- 1. The plan chosen at sign-up, on the same row as the route (plan_tier). Written by fn quick-close, read by
--    findable-checkout. NULL = not chosen.
alter table public.onboarding_responses add column if not exists payment_plan text;
alter table public.onboarding_responses drop constraint if exists onboarding_responses_payment_plan_check;
alter table public.onboarding_responses add constraint onboarding_responses_payment_plan_check
  check (payment_plan is null or payment_plan in ('full', 'six', 'twelve', 'legacy_twelve')) not valid;

-- 2. On the lead: the plan the client PAID on (stamped once by stripe-webhook from the checkout session), and when
--    the plan was paid in full (the last payment cleared, or the one payment on pay in full). paid_in_full_at is what
--    makes a Findable-built site eligible to transfer. Plain nullable columns: no rewrite of the large live table.
alter table public.outreach_leads add column if not exists payment_plan text;
alter table public.outreach_leads drop constraint if exists outreach_leads_payment_plan_check;
alter table public.outreach_leads add constraint outreach_leads_payment_plan_check
  check (payment_plan is null or payment_plan in ('full', 'six', 'twelve', 'legacy_twelve')) not valid;
alter table public.outreach_leads add column if not exists paid_in_full_at timestamptz;

-- 3. The paid lock (20260929170000) now covers the plan too: after payment it cannot be changed through the API.
create or replace function public.guard_paid_service_route()
returns trigger language plpgsql as $$
begin
  if old.status = 'paid'
     and (new.plan_tier is distinct from old.plan_tier
          or new.website_addon is distinct from old.website_addon
          or new.payment_plan is distinct from old.payment_plan)
     and coalesce(auth.role(), '') in ('anon', 'authenticated', 'service_role') then
    raise exception 'service route / payment plan is locked once paid (onboarding %, % -> %). Change it only by an admin SQL change together with Stripe.',
      old.id, coalesce(old.plan_tier, 'none') || '/' || coalesce(old.payment_plan, 'none'), coalesce(new.plan_tier, 'none') || '/' || coalesce(new.payment_plan, 'none');
  end if;
  return new;
end;
$$;
