

## Attribution Persistence Fix

### Root Cause

There are two bugs causing `user_trials` to have null attribution:

**Bug 1 — Wrong localStorage key in `CompleteSetup.tsx`** (lines 143-151): The component reads UTM data directly from `leadfinder_utm_data` with manual expiry checking, but the main capture system (inline script in `index.html`) stores data in `traffic_attribution`. The helper `getStoredUtmData()` already handles both keys correctly, but `CompleteSetup` doesn't use it.

**Bug 2 — Server-side fallback may silently fail**: The `complete-signup` function has a fallback to read from `checkout_attempts`, but if the email matching query returns no rows (e.g. timing, casing), the UTM data stays empty and gets spread as an empty object — writing nothing to `user_trials`.

### Fix Plan

#### 1. Fix `CompleteSetup.tsx` — Use `getStoredUtmData()`

Replace the manual localStorage read (lines 140-151) with the existing `getStoredUtmData()` helper that correctly checks `traffic_attribution` first, then `leadfinder_utm_data`.

- Import `getStoredUtmData` from `@/lib/utmCapture`
- Replace the manual `try/catch` block with a single call to `getStoredUtmData()`
- Remove the destructive `localStorage.removeItem` calls (attribution should persist for potential retry)

#### 2. Harden `complete-signup` server-side fallback

Make the `checkout_attempts` fallback unconditional — always attempt to fill missing UTM fields from `checkout_attempts`, not just when the request body is empty. Change the condition from a complex `||` gate to: always query `checkout_attempts` and merge any missing fields.

This ensures that even if the client sends no UTM data, the server always recovers it from the already-correct `checkout_attempts` record.

#### 3. Harden `ensure-trial` backfill for existing trials

The `ensure-trial` function already has backfill logic for existing trials (line 187), but it only runs when `utmData` from the client has values. Add a secondary server-side fallback: if the client sends UTM data AND the existing trial has null attribution, write it. This is already implemented but the client may not send data either. Fix this by ensuring the `useTrial.ts` hook always sends the current stored UTM data (it already does via `getStoredUtmData()`  — this path is correct).

### Files Changed

| File | Change |
|------|--------|
| `src/pages/CompleteSetup.tsx` | Use `getStoredUtmData()` instead of manual localStorage read |
| `supabase/functions/complete-signup/index.ts` | Make `checkout_attempts` UTM fallback unconditional |

### What This Fixes

- `CompleteSetup` will now correctly read UTM data from `traffic_attribution` (where the inline script stores it)
- `complete-signup` will always recover UTM data from `checkout_attempts` as a guaranteed server-side fallback
- `user_trials` will have populated `utm_source`, `utm_campaign`, `traffic_source` etc.
- Admin Dashboard Source column will show the correct source (e.g. "Meta Ads") instead of "Organic"

### What Is NOT Changed

- Landing capture logic
- Checkout flow / Stripe
- Ad-entry guest logic
- Routes
- Admin Dashboard display logic
- `ensure-trial` function (already correct for its path)
- `index.html` inline script

