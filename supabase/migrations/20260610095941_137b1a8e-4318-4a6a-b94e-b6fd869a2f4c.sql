REVOKE SELECT ON public.generated_sites FROM anon;

GRANT SELECT (site_name, content) ON public.generated_sites TO anon;