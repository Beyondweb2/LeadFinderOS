ALTER TABLE public.generated_sites
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS generated_sites_owner_id_idx ON public.generated_sites(owner_id);

DROP POLICY IF EXISTS "Owners read their site" ON public.generated_sites;
CREATE POLICY "Owners read their site" ON public.generated_sites
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owners update their site" ON public.generated_sites;
CREATE POLICY "Owners update their site" ON public.generated_sites
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.lock_generated_sites_protected_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

DROP TRIGGER IF EXISTS lock_generated_sites_protected_fields ON public.generated_sites;
CREATE TRIGGER lock_generated_sites_protected_fields
  BEFORE UPDATE ON public.generated_sites
  FOR EACH ROW EXECUTE FUNCTION public.lock_generated_sites_protected_fields();