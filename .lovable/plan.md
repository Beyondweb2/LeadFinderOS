

# Fix Stripe Webhook 400 Errors

## Problem
All webhook deliveries are returning 400 because the `STRIPE_WEBHOOK_SECRET` stored in your backend doesn't match the signing secret for your live webhook endpoint in Stripe.

## Root Cause
The webhook code is correct -- it already verifies signatures and returns 200 on success. The only issue is a **secret mismatch**.

## Steps

### 1. Get your live webhook signing secret from Stripe
- Go to [Stripe Dashboard > Developers > Webhooks](https://dashboard.stripe.com/webhooks)
- Click on your live endpoint (`https://hhbdvgsnjequwooynxpr.supabase.co/functions/v1/stripe-webhook`)
- Under "Signing secret", click "Reveal" to copy the value (starts with `whsec_...`)

### 2. Update the secret
- I will use the secrets tool to prompt you to paste the correct live `STRIPE_WEBHOOK_SECRET` value

### 3. Redeploy the edge function
- Redeploy `stripe-webhook` to pick up the updated secret

### 4. Verify
- Trigger a test event from the Stripe webhook dashboard or wait for the next real event
- Confirm it returns 200

## Technical Details
- No code changes are needed -- the existing `stripe-webhook/index.ts` already:
  - Reads `STRIPE_WEBHOOK_SECRET` from environment
  - Calls `stripe.webhooks.constructEvent(body, signature, webhookSecret)`
  - Returns 400 on signature failure, 200 on success
- The only action is updating the secret value and redeploying

