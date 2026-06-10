CREATE TABLE IF NOT EXISTS public.claim_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     uuid NOT NULL REFERENCES public.generated_sites(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  used_at     timestamptz,
  used_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS claim_tokens_site_id_idx ON public.claim_tokens (site_id);

ALTER TABLE public.claim_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage claim_tokens" ON public.claim_tokens;

CREATE POLICY "Admins manage claim_tokens"
  ON public.claim_tokens FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.claim_tokens TO authenticated;
GRANT ALL ON public.claim_tokens TO service_role;

CREATE OR REPLACE FUNCTION public.claim_generated_site(p_token_hash text, p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_token public.claim_tokens%ROWTYPE;
  v_site_id uuid;
BEGIN
  SELECT * INTO v_token FROM public.claim_tokens
    WHERE token_hash = p_token_hash
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_token';
  END IF;
  IF v_token.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'already_used';
  END IF;
  IF v_token.expires_at <= now() THEN
    RAISE EXCEPTION 'expired';
  END IF;
  UPDATE public.generated_sites
    SET owner_id = p_user_id
    WHERE id = v_token.site_id AND owner_id IS NULL
    RETURNING id INTO v_site_id;
  IF v_site_id IS NULL THEN
    RAISE EXCEPTION 'already_claimed';
  END IF;
  UPDATE public.claim_tokens
    SET used_at = now(), used_by = p_user_id
    WHERE id = v_token.id;
  RETURN v_site_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_generated_site(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_generated_site(text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_generated_site(text, uuid) TO service_role;