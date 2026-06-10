## Deploy claim-share Edge Function

### What
Deploy the existing `claim-share` Edge Function located at `supabase/functions/claim-share/index.ts` to the production backend.

### How
1. Deploy via `supabase functions deploy claim-share`.
2. Confirm successful deployment.

### No code changes
The function file will not be modified. It is already configured in `supabase/config.toml` with `verify_jwt = false`.