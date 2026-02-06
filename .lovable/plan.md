

# Fix: Stripe Checkout Not Opening

## Problem Identified

Based on the edge function logs, the checkout session **is being created successfully** - I can see multiple successful checkout sessions in the logs (e.g., `cs_live_a1rs0QburcVrz8mfmlDvThWbMj2B5k6xLBWqS66hyl4Sk3DEnmgznvNDln`). The URL is being returned correctly.

The issue is that the code uses `window.open(url, '_blank')` to open Stripe in a new tab, which **most mobile browsers and many desktop browsers block as a popup**. Since the `window.open()` call happens after an async operation (waiting for the edge function response), it's no longer considered a "trusted" user action and gets blocked.

## Solution

Change from opening in a new tab to redirecting the current page directly to Stripe checkout using `window.location.href`. This approach:
- Works on all browsers including mobile
- Is never blocked by popup blockers
- Is actually the recommended approach for payment flows

## Changes Required

### 1. Update `src/hooks/useSubscription.ts`

Change the `createCheckout` function:

```typescript
// Before (blocked by popup blockers)
if (data?.url) {
  window.open(data.url, '_blank');
}

// After (works everywhere)
if (data?.url) {
  window.location.href = data.url;
}
```

### 2. Update `openCustomerPortal` function (same file)

Apply the same fix for consistency:

```typescript
// Before
if (data?.url) {
  window.open(data.url, '_blank');
}

// After  
if (data?.url) {
  window.location.href = data.url;
}
```

## Why This Works

- `window.location.href` redirects the current page instead of opening a new tab
- This is never blocked by popup blockers because it's a navigation, not a popup
- Users return to the app after completing checkout (via the success_url configured in the edge function)
- This is the standard approach recommended by Stripe for checkout flows

## Technical Note

The success and cancel URLs are already configured correctly in the edge function:
- Success: `${origin}/` (redirects to home page after payment)
- Cancel: `${origin}/subscribe` (returns to subscribe page if cancelled)

