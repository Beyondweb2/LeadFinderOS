

# Fix: Increase Maximum Search Radius to 100km

## Problem
The frontend slider was updated to allow 100km radius, but the backend edge function still validates a maximum of 50km. When users select a radius above 50km, the search fails with a validation error.

## Root Cause
There's a mismatch between:
- **Frontend**: `SearchForm.tsx` slider allows 1-100km
- **Backend**: `search-leads/index.ts` Zod schema limits radius to 50,000 meters (50km)

## Solution
Update the backend validation to allow up to 100km (100,000 meters).

## Changes Required

### 1. Update Edge Function Validation Schema
**File:** `supabase/functions/search-leads/index.ts`

```text
Location: Line 39
Current:  .max(50000, 'Maximum radius is 50km')
Update:   .max(100000, 'Maximum radius is 100km')
```

### 2. Adjust Grid Search Algorithm (Optional Optimization)
The deep search grid generation already handles larger radii, but we may want to add an additional tier for very large searches (80-100km):

```text
Location: Lines 344-356
Add condition for 80km+ searches to use 6x6 grid (36 points)
```

## Technical Details

| Parameter | Before | After |
|-----------|--------|-------|
| Max Radius | 50,000m (50km) | 100,000m (100km) |
| Validation Message | "Maximum radius is 50km" | "Maximum radius is 100km" |

## Impact
- Single line change in the edge function
- Edge function will be automatically redeployed
- Immediate fix for users trying to search with larger radii

## Note
The frontend correctly converts km to meters before sending to the API (`radius * 1000`), so a 100km selection sends 100,000 meters to the backend.

