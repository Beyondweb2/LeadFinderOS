-- business_reports — AI-written, publicly-served business report pages (yoursites.uk/r/<slug>).
-- Rendered fully server-side by functions/r/[slug].ts for AI crawlers. Admin/edge-generated
-- content; no per-user owner column, so RLS mirrors public.generated_sites:
--   (1) "Admins manage …"        — admins manage via the app (has_role).
--   (2) "Public can read published …" — anon + logged-in read ONLY published rows, column-scoped.
-- Edge functions write via the service role (bypasses RLS). RUN IN THE SUPABASE SQL EDITOR.

CREATE TABLE public.business_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,            -- clean URL, e.g. "ablm-associates" (UNIQUE ⇒ indexed)
  business_name text NOT NULL,
  lead_id uuid,                         -- link to outreach_leads (plain uuid, no FK by design)
  audit_id uuid,                        -- link to ai_audits if generated from an audit
  title text NOT NULL,                  -- page <title> / H1
  meta_description text,
  html_content text NOT NULL,           -- the AI-written report body as HTML
  json_ld text,                         -- schema markup for the page (JSON-LD)
  status text NOT NULL DEFAULT 'draft', -- draft | published
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Slug is the lookup hot-path. The UNIQUE constraint already creates a btree index on slug, so
-- the serving function's `?slug=eq.<slug>` lookup is indexed — no separate index needed. (Kept
-- explicit for clarity; IF NOT EXISTS makes it a harmless no-op alongside the UNIQUE index.)
CREATE INDEX IF NOT EXISTS idx_business_reports_slug ON public.business_reports (slug);

-- Grants (mirror generated_sites).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_reports TO authenticated;
GRANT ALL ON public.business_reports TO service_role;
-- Anon may read ONLY the columns the public page needs (excludes id/lead_id/audit_id/status/timestamps).
GRANT SELECT (slug, business_name, title, meta_description, html_content, json_ld) ON public.business_reports TO anon;

ALTER TABLE public.business_reports ENABLE ROW LEVEL SECURITY;

-- (1) Admins manage everything (create/edit/preview drafts) — mirrors generated_sites.
CREATE POLICY "Admins manage business_reports"
  ON public.business_reports FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- (2) Public/anon may read ONLY published rows — mirrors "Public can read published generated_sites".
CREATE POLICY "Public can read published business_reports"
  ON public.business_reports FOR SELECT TO anon, authenticated
  USING (status = 'published');

CREATE TRIGGER update_business_reports_updated_at
  BEFORE UPDATE ON public.business_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
