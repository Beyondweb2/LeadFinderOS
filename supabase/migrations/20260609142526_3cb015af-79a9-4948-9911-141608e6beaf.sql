-- Enums
DO $$ BEGIN
  CREATE TYPE public.site_status AS ENUM ('draft', 'published', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.hosting_status AS ENUM ('pending', 'active', 'suspended', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- generated_sites
CREATE TABLE public.generated_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.outreach_leads(id) ON DELETE CASCADE,
  site_name text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.site_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_sites TO authenticated;
GRANT ALL ON public.generated_sites TO service_role;
ALTER TABLE public.generated_sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage generated_sites"
  ON public.generated_sites FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_generated_sites_updated_at
  BEFORE UPDATE ON public.generated_sites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- preview_links
CREATE TABLE public.preview_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.outreach_leads(id) ON DELETE CASCADE,
  url text NOT NULL,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.preview_links TO authenticated;
GRANT ALL ON public.preview_links TO service_role;
ALTER TABLE public.preview_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage preview_links"
  ON public.preview_links FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_preview_links_updated_at
  BEFORE UPDATE ON public.preview_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- hosting_clients
CREATE TABLE public.hosting_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.outreach_leads(id) ON DELETE CASCADE,
  domain text NOT NULL,
  hosting_status public.hosting_status NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hosting_clients TO authenticated;
GRANT ALL ON public.hosting_clients TO service_role;
ALTER TABLE public.hosting_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage hosting_clients"
  ON public.hosting_clients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_hosting_clients_updated_at
  BEFORE UPDATE ON public.hosting_clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();