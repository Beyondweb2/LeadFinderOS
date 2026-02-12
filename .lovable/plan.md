

# Fix: Stripe "Payment Method Not Available" Error

## Root Cause

The `create-checkout` edge function does **not** specify `payment_method_types` when creating the Stripe Checkout session. This lets Stripe auto-enable payment methods (Link, Google Pay, Apple Pay, etc.) that may not be fully configured on your Stripe account, causing the "Your payment method is currently not available" error.

## What Changes

**File: `supabase/functions/create-checkout/index.ts`**

Add `payment_method_types: ['card']` to the checkout session configuration. This restricts the checkout to standard card payments only, which are universally supported.

No other files, price IDs, trial logic, or subscription logic will be changed.

---

## Technical Details

In the session config object (around line 145), add:

```typescript
payment_method_types: ['card'],
```

This goes into the `stripe.checkout.sessions.create()` call alongside the existing `mode`, `line_items`, `success_url`, etc.

Additionally, add a log line to record the price ID and mode for future debugging:

```typescript
logStep("Creating checkout session", { 
  priceId: "price_1SxN38Gi4ps7kJ7R8UE1kYGS", 
  mode: "subscription",
  hasCustomer: !!customerId,
  trialUsed 
});
```

## After Fix

- Card payments will work immediately
- Link/wallet methods are excluded until you explicitly enable and configure them in your Stripe Dashboard
- You can re-add other payment methods later by expanding the array (e.g., `['card', 'link']`)

