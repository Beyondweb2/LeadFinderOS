-- directory_businesses — fact-dense scraped businesses per niche+area, the raw pool used to
-- build "best [niche] in [area]" directory pages. Populated by edge functions (service_role)
-- from the Apify / Google Places search data (which already carries rating / reviewCount /
-- address / category — captured here rather than discarded).
--
-- RLS mirrors public.generated_sites (admin-managed; no per-user owner column exists on this
-- table, so the owner pattern used by outreach_leads doesn't apply): admins manage via the app,
-- edge functions read/write via the service role.

CREATE TABLE public.directory_businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  niche text NOT NULL,                 -- e.g. "accountant"
  area text NOT NULL,                  -- e.g. "peterborough" or "uk"
  place_id text,                       -- Google place id, for dedupe
  name text NOT NULL,
  website text,
  phone text,
  address text,
  city text,
  postal_code text,
  category text,
  rating numeric,
  review_count integer,
  is_client boolean NOT NULL DEFAULT false,  -- our paying client, featured honestly among competitors
  lead_id uuid REFERENCES public.outreach_leads(id) ON DELETE SET NULL,  -- link if it maps to one of our leads
  source text,                         -- "apify" / "places"
  scraped_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Re-scraping an area UPDATES rather than duplicates: one row per (niche, area, place_id).
-- Plain UNIQUE constraint (not a partial index): the scrape-directory edge function upserts via
-- supabase-js `.upsert(rows, { onConflict: "niche,area,place_id" })`, which emits a predicate-less
-- ON CONFLICT (niche, area, place_id). Postgres will only infer a NON-partial unique constraint/index
-- for that, so a partial index would break the upsert. Postgres treats NULLs as distinct, so rows
-- without a place_id are still all allowed. Named to match the live DB.
ALTER TABLE public.directory_businesses
  ADD CONSTRAINT directory_businesses_niche_area_place_key UNIQUE (niche, area, place_id);

-- Fast page-building lookups by niche + area.
CREATE INDEX idx_directory_businesses_niche_area
  ON public.directory_businesses (niche, area);

-- Grants + RLS (mirror public.generated_sites).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.directory_businesses TO authenticated;
GRANT ALL ON public.directory_businesses TO service_role;
ALTER TABLE public.directory_businesses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage directory_businesses"
  ON public.directory_businesses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
