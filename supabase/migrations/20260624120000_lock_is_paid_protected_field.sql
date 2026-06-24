-- Security: add is_paid to the generated_sites protected-fields lock.
--
-- Before this, a site owner could set generated_sites.is_paid = true via their own
-- session (RLS "Owners update their site" allows UPDATE, and the protected-fields
-- trigger only locked owner_id / lead_id / site_name) — self-unlocking the paid
-- booking/SMS add-ons and bypassing Stripe entirely.
--
-- After this, only the Stripe webhook (service_role) and admins can change is_paid.
-- The trigger already exempts service_role + admins, and a site owner never sends
-- is_paid in their normal updates (content / status), so legitimate owner edits are
-- unaffected — only an explicit attempt to CHANGE is_paid is rejected.
--
-- Idempotent: CREATE OR REPLACE updates the function the existing BEFORE UPDATE
-- trigger already calls; the trigger itself does not need recreating.

CREATE OR REPLACE FUNCTION public.lock_generated_sites_protected_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- service_role (Stripe webhook, reset-test-barber) and admins bypass all locks.
  IF auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.owner_id  IS DISTINCT FROM OLD.owner_id
     OR NEW.lead_id   IS DISTINCT FROM OLD.lead_id
     OR NEW.site_name IS DISTINCT FROM OLD.site_name
     OR NEW.is_paid   IS DISTINCT FROM OLD.is_paid THEN
    RAISE EXCEPTION 'owner_id, lead_id, site_name and is_paid cannot be changed by the site owner';
  END IF;
  RETURN NEW;
END;
$$;
