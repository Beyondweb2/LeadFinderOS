

# Meta Pixel "StartTrial" Tracking on Successful Checkout

## Summary

Move the `StartTrial` pixel event from button clicks to the `/billing/success` page, firing only after server-side verification confirms the Stripe Checkout session completed successfully. Also harden the `create-checkout` origin to always use the production domain for Stripe redirect URLs.

## Changes

### 1. Harden origin in `create-checkout` edge function

**File:** `supabase/functions/create-checkout/index.ts`

Currently, `success_url` and `cancel_url` use `req.headers.get("origin")` directly (line 161-162), which could point to preview/dev domains where the pixel is not configured.

- Define an allowlist of valid origins: `https://lead-finder-app.com`, `https://www.lead-finder-app.com`, `https://leadfinderapp.lovable.app`
- If the incoming origin is not in the allowlist (or is missing), force it to `https://lead-finder-app.com`
- Apply this same logic to the portal redirect origin on line 84

### 2. Update `fbPixel.ts` to support `eventID` deduplication

**File:** `src/lib/fbPixel.ts`

- Add optional `eventId` and `customData` parameters to `trackFBEvent`
- When `eventId` is provided, pass it as the 4th argument: `fbq('track', eventName, {}, { eventID: eventId })`
- Update `trackStartTrial` to accept an optional `eventId` parameter

### 3. Fire `StartTrial` on `/billing/success` after server verification

**File:** `src/pages/BillingSuccess.tsx`

The existing `sync-subscription` call already:
- Retrieves the Stripe Checkout Session
- Verifies `status === 'complete'`
- Confirms the session belongs to the user
- Returns `subscription.status` (which is `trialing` for trial starts)

Changes:
- Add a `pixelFired` state ref (useRef) to guard against double-firing
- After `sync-subscription` returns success AND `subscription.status === 'trialing'`, fire `trackStartTrial(sessionId)` with the `session_id` as `eventID` for deduplication
- This ensures the pixel only fires for verified, completed checkout sessions with an active trial

### 4. Remove `StartTrial` from all CTA button clicks

**Files to update (remove `trackStartTrial()` calls):**
- `src/pages/Landing.tsx` — 6 occurrences on Link onClick handlers
- `src/components/DemoUpgradeDialog.tsx` — 1 occurrence
- `src/components/UpgradePromptDialog.tsx` — 1 occurrence
- `src/components/DemoUpgradePanel.tsx` — 1 occurrence
- `src/pages/HowToUse.tsx` — 1 occurrence

Remove the `trackStartTrial()` calls from these click handlers. The `trackStartTrial` import can also be removed from files that no longer use it. The `trackLead` import in `Landing.tsx` stays as-is.

## What stays unchanged

- Stripe price ID, trial logic, `user_trials` guard, subscription handling
- `sync-subscription` edge function (no modifications needed — its response already contains what we need)
- `stripe-webhook` logic
- `Lead` pixel tracking on demo CTA clicks
- All existing user data and subscriptions

## Technical Details

### Updated `trackFBEvent` signature

```typescript
export function trackFBEvent(eventName: string, eventId?: string) {
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    if (eventId) {
      window.fbq('track', eventName, {}, { eventID: eventId });
    } else {
      window.fbq('track', eventName);
    }
    console.log(`[Meta Pixel] Tracked: ${eventName}${eventId ? ` (eventID: ${eventId})` : ''}`);
  }
}
```

### BillingSuccess pixel firing logic

```typescript
const pixelFired = useRef(false);

// Inside the sync success handler:
if (data?.success && !pixelFired.current) {
  const subStatus = data.subscription?.status;
  if (subStatus === 'trialing') {
    trackStartTrial(sessionId);
  }
  pixelFired.current = true;
  setStatus('success');
}
```

### Origin allowlist in create-checkout

```typescript
const ALLOWED_ORIGINS = [
  'https://lead-finder-app.com',
  'https://www.lead-finder-app.com',
  'https://leadfinderapp.lovable.app',
];
const DEFAULT_ORIGIN = 'https://lead-finder-app.com';

const rawOrigin = req.headers.get('origin') || '';
const origin = ALLOWED_ORIGINS.includes(rawOrigin) ? rawOrigin : DEFAULT_ORIGIN;
```

## Files changed (summary)

| File | Change |
|------|--------|
| `supabase/functions/create-checkout/index.ts` | Enforce origin allowlist for success/cancel URLs |
| `src/lib/fbPixel.ts` | Add `eventId` support for deduplication |
| `src/pages/BillingSuccess.tsx` | Fire `StartTrial` after verified sync, with double-fire guard |
| `src/pages/Landing.tsx` | Remove `trackStartTrial()` from 6 CTA clicks |
| `src/components/DemoUpgradeDialog.tsx` | Remove `trackStartTrial()` call |
| `src/components/UpgradePromptDialog.tsx` | Remove `trackStartTrial()` call |
| `src/components/DemoUpgradePanel.tsx` | Remove `trackStartTrial()` call |
| `src/pages/HowToUse.tsx` | Remove `trackStartTrial()` call |

