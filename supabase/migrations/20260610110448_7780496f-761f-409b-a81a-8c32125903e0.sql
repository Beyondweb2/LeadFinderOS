-- Claim tokens for assigning a generated site to a barber owner.

CREATE TABLE IF NOT EXISTS public.site_claim_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.generated_sites(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  used_at timestamptz,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_claim_tokens_site_id_idx ON public.site_claim_tokens(site_id);
CREATE INDEX IF NOT EXISTS site_claim_tokens_token_idx ON public.site_claim_tokens(token);

-- No anon/authenticated direct access; claims go through the RPC below.
GRANT ALL ON public.site_claim_tokens TO service_role;

ALTER TABLE public.site_claim_tokens ENABLE ROW LEVEL SECURITY;

-- Admins can manage tokens directly (issue / revoke / inspect).
CREATE POLICY "Admins manage claim tokens"
  ON public.site_claim_tokens
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Claim RPC: authenticated user redeems a token to become the site's owner.
-- SECURITY DEFINER so the call can read the token row and update generated_sites
-- (which is locked to admin/service_role by the protected-fields trigger).
CREATE OR REPLACE FUNCTION public.claim_site(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_token record;
  v_site record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_token IS NULL OR length(p_token) < 8 THEN
    RAISE EXCEPTION 'Invalid token';
  END IF;

  SELECT * INTO v_token
  FROM public.site_claim_tokens
  WHERE token = p_token
  FOR UPDATE;

  IF v_token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_token.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_used');
  END IF;

  IF v_token.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  SELECT id, owner_id, site_name INTO v_site
  FROM public.generated_sites
  WHERE id = v_token.site_id;

  IF v_site IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'site_missing');
  END IF;

  IF v_site.owner_id IS NOT NULL AND v_site.owner_id <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_owned');
  END IF;

  -- Bypass the protected-fields trigger via SECURITY DEFINER context.
  UPDATE public.generated_sites
  SET owner_id = v_uid
  WHERE id = v_site.id;

  UPDATE public.site_claim_tokens
  SET used_at = now(), used_by = v_uid
  WHERE id = v_token.id;

  RETURN jsonb_build_object('ok', true, 'site_id', v_site.id, 'site_name', v_site.site_name);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_site(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_site(text) TO authenticated;

-- The protected-fields trigger checks auth.role()/has_role; SECURITY DEFINER
-- calls inherit the caller's auth.uid(), so update owner_id BEFORE the trigger
-- would block it. Patch the trigger to also allow the claim_site path by
-- recognising NULL -> uid transitions when previous owner_id was NULL.
CREATE OR REPLACE FUNCTION public.lock_generated_sites_protected_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  -- Allow first-time claim: unclaimed -> current user
  IF OLD.owner_id IS NULL
     AND NEW.owner_id = auth.uid()
     AND NEW.lead_id IS NOT DISTINCT FROM OLD.lead_id
     AND NEW.site_name IS NOT DISTINCT FROM OLD.site_name THEN
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
