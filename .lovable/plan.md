

# Fix: Stripe checkout redirect getting stuck

## Problem
The "Get Unlimited Searches" button triggers an async call to `create-checkout`, then tries to redirect. Using `window.location.href` fails inside iframes, and `window.open` after an async call gets blocked by popup blockers. The result is a frozen loading screen.

## Solution
Use the standard pattern to avoid popup blockers: open a blank window **synchronously** (on the click event), then set its URL once the Stripe session URL is returned. If the call fails, close the blank window.

This applies to **two places** in `src/pages/Index.tsx`:
1. The `onUpgrade` handler passed to `SearchForm` (the "Get Unlimited Searches" button)
2. The paywall `Dialog` button ("Unlock unlimited")

## Technical Details

In both checkout handlers in `src/pages/Index.tsx`, replace the current pattern:

```typescript
// Before (broken)
if (data?.url) window.location.href = data.url;

// After (works reliably)
const win = window.open('', '_blank');  // opened synchronously = no popup block
// ... async call ...
if (data?.url) {
  if (win) win.location.href = data.url;
  else window.location.href = data.url; // fallback
} else {
  win?.close();
}
// In catch block: win?.close();
```

Also dispatch the `checkout-opened` event so the `CheckoutActivationOverlay` shows a "Waiting for payment..." screen while the user completes checkout in the new tab. This provides feedback instead of leaving the user on a seemingly frozen page.

## Files Changed
- `src/pages/Index.tsx` -- both checkout handlers updated
