

# Increase Minimum No-Website Leads from 3 to 5

## What changes

Two files need updating — one backend constant and one frontend threshold:

### 1. Backend: `supabase/functions/search-leads/index.ts`
- Change `MIN_NO_WEBSITE_TARGET` from `3` to `5` (line 20)
- Increase `MAX_EXPANSION_ATTEMPTS` from `12` to `16` to give more room to find the extra leads

### 2. Frontend: `src/pages/Index.tsx`
- Update the expanded search indicator threshold from `noWebsiteCount >= 3` to `>= 5` (line 205)
- Update the fallback message threshold from `noWebsiteCount < 3` to `< 5` (line 215)

### Cache note
Existing cached searches (24hr TTL) will still return old results until they expire. New searches will immediately use the higher target.

### Cost consideration
More expansion attempts means more Google Places API calls per search when the initial results don't have enough no-website leads. Typically 0–4 extra API calls per search.

