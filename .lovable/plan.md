

## Plan: Block Expired Trial Users in SubscriptionGate

### What changes

**1. New component: `src/components/TrialExpiredScreen.tsx`**
- Styled consistently with `PaymentPausedScreen` and `SubscriptionCancelledScreen`
- Title: "Your trial has ended"
- Message: "Upgrade to continue finding leads and managing outreach."
- Primary CTA: "Upgrade Now" → calls `createCheckout()`
- Secondary CTA: "View Pricing" → navigates to `/landing#pricing`

**2. Update `src/components/SubscriptionGate.tsx`**
- Fetch `trial_used` alongside `setup_completed` from `user_trials` table (single query, no extra network call)
- After the existing `canceled` check, add a new block:
  - If `subStatus` is `null` (no Stripe subscription) AND `trialUsed` is `true` AND user is not an admin → render `<TrialExpiredScreen />`
- This sits **after** all existing checks (payment paused, cancelled) so those flows remain untouched
- Users who never started a trial (`trial_used: false`) continue through to the app for the gated discovery experience (existing behavior)

### Decision tree in SubscriptionGate (after change)

```text
Loading?           → spinner
isPaymentPaused?   → PaymentPausedScreen        (unchanged)
canceled?          → SubscriptionCancelledScreen (unchanged)
status=null + trial_used=true + !admin?
                   → TrialExpiredScreen          (NEW)
hasPaidAccess + !setupCompleted?
                   → /complete-setup redirect    (unchanged)
otherwise          → render children             (unchanged)
```

### What stays the same
- `useSubscription` hook — no changes
- `useTrial` hook — no changes
- Stripe webhooks, subscription records, grace period logic — untouched
- Active, trialing, past_due, canceled flows — identical
- Users without `trial_used` flag — still allowed in for gated discovery

### Technical details
- The `user_trials` query already runs in `SubscriptionGate`; we just add `trial_used` to the select: `.select('setup_completed, trial_used')`
- No new database queries, no new hooks, no schema changes

