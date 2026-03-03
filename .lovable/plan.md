

## Plan

### 1. Fix abandon email trigger — set `checkout_started_at` in `create-checkout`

**File:** `supabase/functions/create-checkout/index.ts`

After the Stripe checkout session is successfully created (around line 200, after `const session = await stripe.checkout.sessions.create(...)`), add:

```typescript
// Record checkout start for lifecycle email tracking
if (user) {
  await supabaseClient
    .from('user_trials')
    .update({ checkout_started_at: new Date().toISOString() })
    .eq('user_id', user.id);
}
```

This ensures the `lifecycle-emails` function can find users who started but didn't complete checkout.

### 2. Update abandon email copy in `lifecycle-emails`

**File:** `supabase/functions/lifecycle-emails/index.ts`

Replace the current email body with copy aligned to the 5-day free trial model. Key messaging:

- You won't be charged for 5 days
- Cancel anytime before the trial ends — completely free
- Use the app fully during the trial to find clients
- Even if you cancel, any clients you land during the trial are yours to keep
- Emphasise the risk-free nature: potentially free clients

Update subject line rotation to match the new tone (e.g., "5 days free — no charge today", "You won't pay a thing for 5 days").

### Summary

Two edge function edits:
1. `create-checkout` — add one `update` call to set `checkout_started_at` after session creation
2. `lifecycle-emails` — rewrite email HTML/text body and subject lines for the 5-day trial messaging

