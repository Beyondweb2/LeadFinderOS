

# Geoapify Fallback Search Strategy for Unsupported Trade Categories

## Problem
Searching for trades like "electrician" returns zero results because Geoapify's `service` category doesn't have a sub-category for electricians, and the `name=electrician` filter is too strict for how businesses list themselves on OpenStreetMap.

## Solution
Add a 3-attempt fallback strategy inside `searchPlacesGeoapify`, keeping the function signature unchanged so neither the demo nor authenticated code paths need modification.

## How It Works

1. **Normalize the keyword** into an ordered list of variants:
   - Original (e.g. "electricians")
   - Singular form if it ends in "s" (e.g. "electrician")
   - For electrician-related terms, also try "electrical" and "electric"

2. **Attempt A** -- current behavior: `categories=service`, try each variant with `&name=` until one returns results. Stop on first success.

3. **Attempt B** (only if A returned 0): broaden categories to `service,office.company,office.association,office.consulting,office.financial,office.advertising_agency`. Try each variant with `&name=`.

4. **Attempt C** (only if B returned 0 and keyword was provided): same broad categories but drop `&name=` entirely. Tag response with `fallbackUsed: true`.

Maximum 3 Geoapify Places API calls per search.

## What Changes

**Single file**: `supabase/functions/search-leads/index.ts`

No UI files are touched.

## Technical Details

### New helper function: `generateKeywordVariants(keyword: string): string[]`
- Trims and lowercases
- Builds array: `[original, singular, ...electrician-specific]`
- Deduplicates

### Refactored `searchPlacesGeoapify`
- Accepts keyword, lat, lng, radius, apiKey (same signature)
- Returns `{ features: GeoapifyFeature[], fallbackUsed: boolean }`
- Internally runs Attempts A, B, C with structured logging showing which attempt and variant succeeded
- Each attempt is a single API call (tries variants sequentially but only makes a new HTTP request when the previous returned 0)
- Cap: 3 total HTTP requests maximum

### Response shape update
- The `leads` response object will include `fallbackUsed: boolean` alongside existing fields
- Both demo and authenticated paths will use the updated function

### Logging
Each attempt logs:
```
[SEARCH] Attempt A with variant "electrician" -> 0 results
[SEARCH] Attempt B with variant "electrical" -> 12 results (success)
```

