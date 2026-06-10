DROP FUNCTION IF EXISTS public.claim_site(text);

DROP TABLE IF EXISTS public.site_claim_tokens;

CREATE OR REPLACE FUNCTION public.lock_generated_sites_protected_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.lead_id IS DISTINCT FROM OLD.lead_id
     OR NEW.site_name IS DISTINCT FROM OLD.site_name THEN
    RAISE EXCEPTION 'owner_id, lead_id and site_name cannot be changed by the site owner';
  END IF;
  RETURN NEW;
END;
$$;