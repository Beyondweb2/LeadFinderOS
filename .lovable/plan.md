
# Diagnose 0 Results from Google Places Search

## Problem
Searches return 0 results after recent optimization. No edge function logs appear for `search-leads`, which means the function is likely crashing before reaching the Google API call.

## Root Cause Hypothesis
The `search-leads` function uses `supabaseClient.auth.getClaims(token)` (line 307) to authenticate users. This method:
- Was added recently to `@supabase/supabase-js` and may not be available in the version resolved by the floating `esm.sh` import
- Unlike `admin-users/index.ts` which has a `getUser()` fallback when `getClaims` fails, `search-leads` has no fallback
- If `getClaims` throws an unhandled error, the entire function crashes before any Google API call is made, which explains why there are zero logs

## Plan (Logging Only, No Refactoring)

### 1. Add top-level crash logging
Wrap the entire handler in a try/catch that logs any uncaught errors, so crashes are visible in edge function logs.

### 2. Add auth method diagnostic logging
Log whether `getClaims` succeeds or fails, and add a `getUser()` fallback (same pattern as `admin-users`) so authentication does not silently block the entire flow.

### 3. Add Google API diagnostic logging inside `textSearchPlaces`
Log these before and after each Google call:
- The exact endpoint URL
- The full request body (JSON)
- The exact field mask header value
- Whether the API key is present (not the key itself)
- The response status code
- The raw response body from Google (first 2000 chars)
- The number of places returned per page

### 4. Add geocode diagnostic logging
Log the geocode request URL, response status, and whether coordinates were successfully extracted.

### 5. Return diagnostic metadata in the response
Add a temporary `_debug` field to the JSON response containing:
```text
{
  googleCallsMade: { geocode: number, textSearchPages: number },
  apiKeyPresent: boolean,
  authMethod: "getClaims" | "getUser" | "failed",
  cached: boolean
}
```

## Technical Details

### Files modified
- `supabase/functions/search-leads/index.ts` -- add logging only, no structural changes

### What this will NOT do
- No refactoring
- No optimization changes
- No frontend changes
- No new files

### After deployment
1. Trigger a search in the preview (e.g. "electrician Leeds")
2. Check edge function logs for `search-leads`
3. The logs will reveal exactly where the failure occurs:
   - If auth fails: `getClaims` error will be logged
   - If Google returns 0 results: the raw response body will show why
   - If Google returns results but they're filtered out: the pre-filter count vs post-filter count will show the gap
