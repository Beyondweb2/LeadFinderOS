-- Phase C — team-visible notes on a business. ADDITIVE ONLY.
-- One new team-readable table. outreach_leads (and its PRIVATE notes column)
-- are NOT touched.
--
-- lead_notes is the team-visible note layer. Notes are BUSINESS-GLOBAL — keyed
-- by the business (place_id, google_maps_url fallback), NOT by campaign — so a
-- note shows on that business in every campaign. The private per-user working
-- note stays in outreach_leads.notes and is unaffected.

CREATE TABLE IF NOT EXISTS public.lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- author
  place_id text,            -- primary business key (Google Place ID)
  google_maps_url text,     -- fallback business key
  business_name text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Read paths: notes for a given business, by either key.
CREATE INDEX IF NOT EXISTS idx_lead_notes_place_id ON public.lead_notes (place_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_google_maps_url ON public.lead_notes (google_maps_url);

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

-- Team-readable: any authenticated user can read every note.
CREATE POLICY "Authenticated users can view all notes"
  ON public.lead_notes FOR SELECT TO authenticated
  USING (true);

-- Write only your own notes.
CREATE POLICY "Users can insert their own notes"
  ON public.lead_notes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notes"
  ON public.lead_notes FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notes"
  ON public.lead_notes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER lead_notes_set_updated_at
  BEFORE UPDATE ON public.lead_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
