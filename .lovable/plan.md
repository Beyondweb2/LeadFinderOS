

# Fix: Phone Numbers Not Fetching for All Businesses

## Problem
When a business is added to the CRM, the phone lookup runs but sometimes Google Places returns no phone number. The system then caches that "no phone" result for 30 days, making retries useless -- they just return the cached null.

In this case, the business "T&D ELECTRICAL LLC" has a phone number visible on Google Maps, but the initial API call missed it. Now the cached null blocks all future attempts.

## Root Cause
The `google-place-details` edge function caches ALL results for 30 days, including results where the phone is null. This means a temporary API hiccup or incomplete response gets "locked in" for a month.

## Solution

### 1. Don't cache null-phone results long-term
In `supabase/functions/google-place-details/index.ts`:
- Only cache results where a phone number was actually found for the full 30 days
- For null-phone results, either skip caching entirely or cache for a much shorter window (e.g., 1 hour) so the system retries sooner

### 2. Add a force-refresh option
- Add support for a `forceRefresh` parameter in the edge function request body
- When `forceRefresh: true` is passed, skip the cache check and go directly to Google Places API
- This allows the frontend retry button to actually re-query Google

### 3. Add a "Retry" button in the UI
In `src/hooks/useOutreach.ts`:
- Create a `retryPhoneFetch` function that calls the edge function with `forceRefresh: true`
- Expose this function so the Track Leads and CRM pages can offer a retry option for leads with no phone

### 4. Clear stale null-phone cache entry now
- Delete the current cached null entry for `ChIJNZYK75oFdkgRO2IDdVyjIuw` so the next fetch actually hits Google

## Technical Details

### Files modified
- `supabase/functions/google-place-details/index.ts` -- add short TTL for null-phone results and `forceRefresh` support
- `src/hooks/useOutreach.ts` -- add `retryPhoneFetch` function with `forceRefresh: true`

### Edge function changes (google-place-details)
```text
1. Parse optional `forceRefresh` boolean from request body
2. If forceRefresh is true, skip the cache lookup entirely
3. After Google API call: only upsert into phone_cache if phone is not null
   (or use a 1-hour TTL for null results by setting created_at to now minus 29 days)
4. Return results as normal
```

### Hook changes (useOutreach.ts)
```text
1. Add retryPhoneFetch(outreachLeadId, placeId, businessName) function
2. It calls google-place-details with { placeId, forceRefresh: true }
3. On success, updates the lead record and UI state
4. Expose retryPhoneFetch from the hook
```

### Database cleanup
- Run a one-time delete on phone_cache for the affected place_id so the fix takes effect immediately

