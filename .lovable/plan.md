

## Problem

On iOS Safari, `window.open(url, '_blank')` is blocked by the popup blocker when called after an asynchronous operation (the email check + checkout API calls). Safari only allows `window.open` in the direct, synchronous call stack of a user gesture (tap/click). Since there are two sequential async calls before the `window.open`, Safari silently blocks it.

## Solution

Replace `window.open(checkoutData.url, '_blank')` with `window.location.href = checkoutData.url` for the email-first checkout flow. This performs a same-tab redirect which is never blocked by popup blockers on any platform.

## Changes

**`src/pages/Landing.tsx`** (line ~447):
- Change `window.open(checkoutData.url, '_blank')` to `window.location.href = checkoutData.url`
- Remove the `checkout-opened` event dispatch (not needed for same-tab navigation)

This is consistent with how the authenticated `createCheckout` in `useSubscription.tsx` already works (line ~209: `window.location.href = data.url`).

