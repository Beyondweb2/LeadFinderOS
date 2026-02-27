
-- Challenge main state table
CREATE TABLE public.user_challenges_10_outreach (
  user_id uuid NOT NULL PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  started_at timestamptz,
  completed_at timestamptz,
  count integer NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  skipped boolean NOT NULL DEFAULT false,
  modal_shown boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Dedupe table for unique lead contacts
CREATE TABLE public.user_challenge_10_outreach_contacts (
  user_id uuid NOT NULL,
  lead_id text NOT NULL,
  first_contacted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lead_id)
);

-- RLS for challenge state
ALTER TABLE public.user_challenges_10_outreach ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own challenge"
  ON public.user_challenges_10_outreach FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own challenge"
  ON public.user_challenges_10_outreach FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own challenge"
  ON public.user_challenges_10_outreach FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS for dedupe contacts
ALTER TABLE public.user_challenge_10_outreach_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own challenge contacts"
  ON public.user_challenge_10_outreach_contacts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own challenge contacts"
  ON public.user_challenge_10_outreach_contacts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Server-side atomic increment function
CREATE OR REPLACE FUNCTION public.challenge_10_record_contact(p_lead_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_challenge record;
  v_inserted boolean := false;
  v_new_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check challenge exists and is active
  SELECT * INTO v_challenge
  FROM public.user_challenges_10_outreach
  WHERE user_id = v_uid;

  IF v_challenge IS NULL OR NOT v_challenge.enabled OR v_challenge.completed OR v_challenge.started_at IS NULL THEN
    RETURN jsonb_build_object('incremented', false, 'count', COALESCE(v_challenge.count, 0), 'completed', COALESCE(v_challenge.completed, false), 'reason', 'challenge_not_active');
  END IF;

  -- Attempt dedupe insert (will fail silently on duplicate)
  BEGIN
    INSERT INTO public.user_challenge_10_outreach_contacts (user_id, lead_id)
    VALUES (v_uid, p_lead_id);
    v_inserted := true;
  EXCEPTION WHEN unique_violation THEN
    v_inserted := false;
  END;

  IF NOT v_inserted THEN
    RETURN jsonb_build_object('incremented', false, 'count', v_challenge.count, 'completed', v_challenge.completed, 'reason', 'already_contacted');
  END IF;

  -- Atomic increment clamped to 10
  v_new_count := LEAST(v_challenge.count + 1, 10);

  UPDATE public.user_challenges_10_outreach
  SET count = v_new_count,
      completed = (v_new_count >= 10),
      completed_at = CASE WHEN v_new_count >= 10 THEN now() ELSE NULL END,
      updated_at = now()
  WHERE user_id = v_uid;

  RETURN jsonb_build_object('incremented', true, 'count', v_new_count, 'completed', v_new_count >= 10);
END;
$$;
