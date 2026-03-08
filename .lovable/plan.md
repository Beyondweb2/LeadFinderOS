

## Plan: Add payment failure email reminder via Resend

### Changes

#### 1. `supabase/functions/stripe-webhook/index.ts` — Send email on first payment failure

After the payment failure tracking block (around line 385), add a fire-and-forget email send via Resend when `isPaymentFailure && currentFailureCount === 0` (first failure only).

**Email style** — matches existing lifecycle emails from `Paul from LeadFinder <paul@lead-finder-app.com>`:
- Casual, personal tone signed by "Paul"
- Same HTML structure (sans-serif, 15px, `#1a1a1a`, max-width 600px)
- Footer with LeadFinder branding and `https://lead-finder-app.com`
- Link to `https://lead-finder-app.com/dashboard` (not the Lovable preview URL)

**Subject:** "Action needed: update your payment method"

**Body (no 7-day mention, just "update or lose access"):**
> Hey [name],
>
> We couldn't process your subscription payment for LeadFinder.
>
> Please update your payment method to avoid losing access.
>
> [Update payment method] → https://lead-finder-app.com/dashboard
>
> If you've already updated your card, you can ignore this email.
>
> – Paul, LeadFinder

Uses `fetch("https://api.resend.com/emails")` with `RESEND_API_KEY` (same pattern as lifecycle-emails). Fire-and-forget — failure is logged but doesn't block the webhook response.

#### 2. `src/components/PaymentWarningBanner.tsx` — Remove days remaining countdown

Remove the `daysRemaining` calculation and the `(X days remaining)` text from the grace period banner. Update copy to just say "update your card to avoid losing access" without mentioning a timeframe.

### What stays unchanged
- All other webhook logic, subscription gate, payment paused screen
- Database schema
- Existing email templates

