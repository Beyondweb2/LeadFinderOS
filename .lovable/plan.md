

## Plan: Block cancelled users and redirect to Stripe for payment

### Problem
When a user cancels their subscription, the webhook correctly sets their status to `canceled` in the database. However, the `SubscriptionGate` only blocks `past_due`, `unpaid`, and `paused` statuses. **Cancelled users pass through and retain full app access.**

Additionally, on sign-in, the `PublicRoute` only redirects users with active/trialing subscriptions — cancelled users are let through to the auth page normally but then get into the app via `SubscriptionGate` without being stopped.

### Changes

#### 1. SubscriptionGate — block cancelled users
**File:** `src/components/SubscriptionGate.tsx`

Add `canceled` and `cancelled` (both spellings) to the blocked status check. When a cancelled user is detected, show a dedicated screen that redirects them to Stripe checkout to resubscribe.

Update the `isPaymentBlocked` logic:
```
const isPaymentBlocked = isPaymentPaused || subStatus === 'past_due' || subStatus === 'unpaid';
const isCancelled = subStatus === 'canceled' || subStatus === 'cancelled';
```

- If `isPaymentBlocked` → show `PaymentPausedScreen` (existing)
- If `isCancelled` → show a new `SubscriptionCancelledScreen` component

#### 2. New component: SubscriptionCancelledScreen
**File:** `src/components/SubscriptionCancelledScreen.tsx`

A simple card (similar to `PaymentPausedScreen`) that tells the user their subscription has ended and provides a button to resubscribe via `createCheckout()` from `useSubscription`. This redirects them to Stripe checkout.

- Headline: "Your subscription has ended"
- Body: "Resubscribe to continue using LeadFinder."
- CTA: "Resubscribe" button calling `createCheckout()`
- Secondary: "Back to Home" link to `/landing`

#### 3. useSubscription — expose `hasUsedTrial` from check-subscription response
The `check-subscription` edge function already returns `has_used_trial`. Pass this through so the cancelled screen can determine whether to show "Start Free Trial" or "Resubscribe". Actually, simpler: just use `createCheckout()` which already handles this server-side (it blocks duplicate trials and redirects to portal if needed).

No changes needed to `useSubscription` or edge functions — `createCheckout` already handles the logic.

#### 4. Auth page — no changes needed
The Auth page itself doesn't need modification. After sign-in, the user enters `ProtectedRoute` → `SubscriptionGate`, which will now catch cancelled users and show the resubscribe screen. This is the correct flow.

### What stays unchanged
- Stripe webhook logic (already correctly sets `canceled` status)
- Auth/sign-in flow
- Payment/checkout edge functions
- Database schema
- UI design patterns (new screen matches existing `PaymentPausedScreen` style)

