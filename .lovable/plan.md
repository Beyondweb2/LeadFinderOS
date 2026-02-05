

# Stripe Webhooks for Instant Access Revocation

## Overview
Implement a Stripe webhook handler that instantly revokes app access when a user unsubscribes, cancels, or their payment fails. This replaces the current 60-second polling delay with near-instant access control.

## How It Works

```text
User Cancels in Stripe Portal
          |
          v
    Stripe sends webhook event
    (customer.subscription.deleted/updated)
          |
          v
    Edge Function receives event
          |
          +-- Verify webhook signature
          |
          +-- Extract customer email
          |
          +-- Update subscriptions table
          |
          v
    Frontend checks subscriptions table
    (realtime or on next request)
          |
          v
    User is immediately blocked
```

## Database Changes

Create a `subscriptions` table to cache subscription status locally:

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | References auth user |
| stripe_customer_id | text | Stripe customer ID |
| stripe_subscription_id | text | Stripe subscription ID |
| status | text | active, canceled, past_due, etc. |
| current_period_end | timestamptz | When subscription ends |
| updated_at | timestamptz | Last update time |

RLS policies will ensure users can only read their own subscription data.

## Edge Function: stripe-webhook

A new edge function that:

1. Receives POST requests from Stripe
2. Verifies the webhook signature using `STRIPE_WEBHOOK_SECRET`
3. Handles these events:
   - `customer.subscription.created` - Creates/updates subscription record
   - `customer.subscription.updated` - Updates status (handles downgrades, payment failures)
   - `customer.subscription.deleted` - Marks subscription as cancelled
   - `invoice.payment_failed` - Marks subscription as past_due
4. Uses the customer email to find the matching user in your database
5. Updates the `subscriptions` table accordingly

## Frontend Changes

### Update useSubscription hook

1. Query the local `subscriptions` table first (faster than calling Stripe API)
2. Fall back to calling `check-subscription` if no local record exists
3. Enable Supabase Realtime on the `subscriptions` table for instant UI updates
4. When a webhook updates the database, the UI reacts immediately

### Update SubscriptionGate

- Check both the local database AND the Stripe API for redundancy
- Prioritize the local database for speed
- Show a "subscription cancelled" message instead of just redirecting

---

## Setup Required (Manual Steps)

### 1. Add Webhook Endpoint in Stripe Dashboard

1. Go to Stripe Dashboard > Developers > Webhooks
2. Click "Add endpoint"
3. Enter URL: `https://hhbdvgsnjequwooynxpr.supabase.co/functions/v1/stripe-webhook`
4. Select events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
5. Copy the "Signing secret" (starts with `whsec_`)

### 2. Add Webhook Secret

You'll need to add the `STRIPE_WEBHOOK_SECRET` as a secret in your project.

---

## Technical Details

### New Files
- `supabase/functions/stripe-webhook/index.ts` - Webhook handler edge function

### Modified Files
- `src/hooks/useSubscription.ts` - Query local database first, add realtime subscription
- `src/components/SubscriptionGate.tsx` - Add "subscription cancelled" messaging

### Database Migration
- Create `subscriptions` table with RLS policies
- Enable realtime on the table

### Config Updates
- `supabase/config.toml` - Add `[functions.stripe-webhook]` with `verify_jwt = false` (webhooks don't have JWT)

### Webhook Signature Verification
The edge function will use Stripe's `constructEvent` method:

```typescript
const sig = req.headers.get("stripe-signature");
const event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
```

This ensures only genuine Stripe events are processed, preventing spoofed requests.

### Security Considerations
- Webhook endpoint is public (no JWT) but protected by Stripe signature verification
- Service role key used to update subscriptions table (bypasses RLS for system updates)
- Frontend queries use anon key with RLS (users can only see their own data)

