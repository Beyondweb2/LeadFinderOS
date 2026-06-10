## Migration: remove orphan claim path & remove first-claim bypass

Run the provided SQL verbatim as a single migration:

1. `DROP FUNCTION IF EXISTS public.claim_site(text)` — removes the legacy RPC that bypassed the protected-fields trigger.
2. `DROP TABLE IF EXISTS public.site_claim_tokens` — removes the orphan tokens table (the canonical one is `public.claim_tokens`, used by `claim_generated_site`).
3. `CREATE OR REPLACE FUNCTION public.lock_generated_sites_protected_fields()` — tightens the trigger so owners can never change `owner_id`, `lead_id`, or `site_name`. First-time claims must now go through the SECURITY DEFINER `claim_generated_site(text, uuid)` RPC (service_role bypass).

## Impact / follow-ups

- Any client code calling `supabase.rpc('claim_site', ...)` will break. Claims must use `claim_generated_site` via a server-side (edge function / service_role) path.
- No table/column shape changes, so `src/integrations/supabase/types.ts` only loses the `claim_site` function and `site_claim_tokens` table entries (regenerated automatically after migration).
- No frontend code changes included in this step — I'll audit references to `claim_site` / `site_claim_tokens` after the migration runs and report back before touching app code.
