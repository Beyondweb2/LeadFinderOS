-- Phase A — team foundations. ADDITIVE ONLY.
-- Two new team-readable tables (profiles, campaigns) + one nullable column on
-- outreach_leads. outreach_leads RLS is NOT touched — it stays strictly
-- private (auth.uid() = user_id). All team visibility comes from the new
-- tables, which expose only non-sensitive fields.

-- ============================================================
-- 1. profiles — team-readable identity surface (name + photo only)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read every profile (this is the intentional
-- team-visible exposure: display name + avatar only).
CREATE POLICY "Authenticated users can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (true);

-- A user may insert only their own profile row.
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- A user may update only their own profile row.
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- keep updated_at fresh (reuses existing helper)
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create a profile row when a new auth user is created. Name/avatar are
-- lifted from signup metadata when present, else a sensible fallback.
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- One-time backfill of existing users.
INSERT INTO public.profiles (user_id, display_name, avatar_url)
SELECT
  u.id,
  COALESCE(
    u.raw_user_meta_data->>'display_name',
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    split_part(u.email, '@', 1)
  ),
  u.raw_user_meta_data->>'avatar_url'
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- 2. campaigns — thin grouping concept, team-readable
-- ============================================================
CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- Everyone on the team can see the campaign list (so they can pick one to work in).
CREATE POLICY "Authenticated users can view all campaigns"
  ON public.campaigns FOR SELECT TO authenticated
  USING (true);

-- Any authenticated user can create a campaign (must stamp themselves as creator).
CREATE POLICY "Users can create campaigns"
  ON public.campaigns FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Only the creator can rename or delete their campaign.
CREATE POLICY "Creators can update their campaigns"
  ON public.campaigns FOR UPDATE TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creators can delete their campaigns"
  ON public.campaigns FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

-- ============================================================
-- 3. outreach_leads.campaign_id — nullable, no backfill.
--    (RLS on outreach_leads is intentionally NOT modified.)
-- ============================================================
ALTER TABLE public.outreach_leads
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_outreach_leads_campaign_id
  ON public.outreach_leads(campaign_id);
