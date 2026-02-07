

## Summary

Currently, the trial system limits **all** trial users to 1 search per day. The user wants:

- **Stripe trial users (card upfront, 7-day trial via checkout)** → **Unlimited searches** + full access
- **Free users (no card, just signed up)** → **1 search per day** + limited access

This requires distinguishing between two types of users:
1. **Stripe trialing** = Has a subscription with `status: 'trialing'` (paid trial, full access)
2. **App trial** = Has `user_trials` record but no Stripe subscription (free trial, limited access)

---

## Current vs New Model

| User Type | Current Behavior | New Behavior |
|-----------|------------------|--------------|
| Stripe `trialing` | 1 search/day (wrong) | **Unlimited** searches |
| Stripe `active` | Unlimited | Unlimited (no change) |
| App trial (no card) | 1 search/day | 1 search/day (no change) |
| Expired/No subscription | Blocked | Blocked (no change) |

---

## Implementation Plan

### 1. Update `search-leads` Edge Function

Modify the subscription/trial checking logic to:
- **Skip daily limit enforcement** for users with `subscribed: true` and `status: 'trialing'` (Stripe trial)
- **Only enforce daily limit** for users on the app trial (no Stripe subscription)

```text
Current Flow:
  Has subscription? → Allow unlimited
  On app trial? → Enforce 1 search/day limit
  Neither? → Block

New Flow:
  Has Stripe subscription (active OR trialing)? → Allow unlimited
  On app trial (no Stripe)? → Enforce 1 search/day limit
  Neither? → Block
```

### 2. Update `useTrial` Hook

The frontend hook should reflect that Stripe trialing users have no daily limit:
- When `useSubscription` returns `status: 'trialing'`, set `searchesRemaining: Infinity` or similar
- The `TrialLimitDialog` should only appear for app trial users, not Stripe trial users

### 3. Update `TrialBanner` Component

Ensure messaging is clear:
- Stripe trialing users: Show "X days until first charge" (existing)
- App trial users: Show "X searches remaining today" or "Subscribe for unlimited"

### 4. Update `SubscriptionGate` Component

No changes needed - it already allows access for both `subscribed` and `isOnTrial` users.

---

## Technical Details

### Edge Function Changes (`search-leads/index.ts`)

The key change is in the subscription check block (around line 598-692):

```typescript
// NEW: Check for Stripe subscription first (including trialing)
const { data: subscription } = await serviceClient
  .from('subscriptions')
  .select('status')
  .eq('user_id', userId)
  .maybeSingle();

const validStatuses = ['active', 'trialing', 'past_due'];
const hasActiveSubscription = subscription && validStatuses.includes(subscription.status);

// If user has Stripe subscription (including trialing), allow unlimited searches
if (hasActiveSubscription) {
  console.log(`User ${userId} has valid subscription (${subscription.status}) - unlimited searches`);
  // Continue to search - no limits
}
else {
  // Check app trial for free users
  const { data: trial } = await serviceClient
    .from('user_trials')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  
  // ... enforce daily limit only here
}
```

### Frontend Hook Changes (`useTrial.ts`)

Add awareness of Stripe subscription status:

```typescript
// Import useSubscription status
// If user has Stripe trialing status, they have unlimited searches
const { status: stripeStatus } = useSubscription();
const isStripeTrialing = stripeStatus === 'trialing';

// Override limits for Stripe trial users
if (isStripeTrialing) {
  return {
    ...state,
    searchesRemaining: Infinity,
    isOnTrial: true, // Still on trial but with full access
  };
}
```

---

## Files to Modify

1. **`supabase/functions/search-leads/index.ts`** - Core logic change: skip daily limit for Stripe trial users
2. **`src/hooks/useTrial.ts`** - Set unlimited searches for Stripe trialing users
3. **`src/components/TrialBanner.tsx`** - (Optional) Add messaging for free trial users
4. **`src/pages/Index.tsx`** - (Minor) Update trial limit dialog conditions

---

## Testing Checklist

1. **Stripe trialing user**: Search multiple times in one day → should work without limits
2. **Free trial user (no card)**: Search twice → should see limit dialog after first search
3. **Active subscriber**: Unlimited searches → no change
4. **Expired trial**: Blocked → no change

