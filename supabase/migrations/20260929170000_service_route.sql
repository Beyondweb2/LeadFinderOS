-- SERVICE ROUTE (Paul, 2026-09-29): Findable Build = 12 payments, Findable Optimise = 6. Same £99 + £99/month.
-- Additive only. src/lib/findableOffer.ts is the rule; this pins the data.
--
-- ⛔ THE ROUTE IS THE EXISTING COLUMN onboarding_responses.plan_tier ('new_site' = Build, 'keep' = Optimise),
-- written by BOTH sale paths (the self-service questionnaire via findable-onboarding, and fn quick-close) and
-- read by findable-checkout, which refuses a row without one. No second route column.
-- ⛔ Existing customers are NOT touched: no row is updated here, nothing is inferred for a client who paid
-- before routes existed (their contract_total_payments stays NULL = not recorded).

-- 1. The route's values, pinned. (Live values on 2026-09-29: null, 'keep', 'new_site' only.)
alter table public.onboarding_responses drop constraint if exists onboarding_responses_plan_tier_check;
alter table public.onboarding_responses add constraint onboarding_responses_plan_tier_check
  check (plan_tier is null or plan_tier in ('keep', 'new_site'));

-- 2. The contract a client agreed to: the payment count named on the Stripe page they paid on, stamped once by
--    stripe-webhook at payment. NULL = not recorded — never fabricated for a historical client.
alter table public.outreach_leads add column if not exists contract_total_payments smallint;
alter table public.outreach_leads drop constraint if exists outreach_leads_contract_total_payments_check;
alter table public.outreach_leads add constraint outreach_leads_contract_total_payments_check
  check (contract_total_payments is null or contract_total_payments between 1 and 120);

-- 3. After payment the route cannot be changed through the API (anon / authenticated / service_role — every
--    app and edge-function path). The only way to change a paid client's route is a deliberate SQL change by
--    Paul (a direct database session has no API role), alongside the matching change in Stripe.
create or replace function public.guard_paid_service_route()
returns trigger language plpgsql as $$
begin
  if old.status = 'paid'
     and (new.plan_tier is distinct from old.plan_tier or new.website_addon is distinct from old.website_addon)
     and coalesce(auth.role(), '') in ('anon', 'authenticated', 'service_role') then
    raise exception 'service route is locked once paid (onboarding %, % -> %). Change it only by an admin SQL change together with Stripe.',
      old.id, coalesce(old.plan_tier, 'none'), coalesce(new.plan_tier, 'none');
  end if;
  return new;
end;
$$;
drop trigger if exists trg_onboarding_paid_route_lock on public.onboarding_responses;
create trigger trg_onboarding_paid_route_lock before update on public.onboarding_responses
  for each row execute function public.guard_paid_service_route();

-- 4. The stamped contract is immutable through the API once set (the same rule, for the lead's copy).
create or replace function public.guard_contract_total_payments()
returns trigger language plpgsql as $$
begin
  if old.contract_total_payments is not null
     and new.contract_total_payments is distinct from old.contract_total_payments
     and coalesce(auth.role(), '') in ('anon', 'authenticated', 'service_role') then
    raise exception 'contract_total_payments is immutable once set (lead %, % -> %). Change it only by an admin SQL change together with Stripe.',
      old.id, old.contract_total_payments, new.contract_total_payments;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_outreach_leads_contract_immutable on public.outreach_leads;
create trigger trg_outreach_leads_contract_immutable before update on public.outreach_leads
  for each row execute function public.guard_contract_total_payments();
