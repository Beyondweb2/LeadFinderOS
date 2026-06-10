ALTER TABLE public.generated_sites
  ADD CONSTRAINT generated_sites_site_name_key UNIQUE (site_name);