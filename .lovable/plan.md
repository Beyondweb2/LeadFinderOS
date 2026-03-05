

## Send Email Notification on Checkout Start

You already have Resend set up with `RESEND_API_KEY` and send emails from `noreply@lead-finder-app.com` to `beyondwebcraft@outlook.com`. I'll reuse this exact same pattern.

### Change: `supabase/functions/create-checkout/index.ts`

After the checkout session is created and the attempt is recorded (~line 220), add a fire-and-forget Resend email to `beyondwebcraft@outlook.com` with:
- **Subject**: `[LeadFinder] 🔔 New Checkout Started`
- **Body**: Email address of the person, whether they're a new or existing user, whether they have a trial, and timestamp
- Uses `RESEND_API_KEY` secret (already configured)
- Wrapped in try/catch so it never blocks or breaks checkout

No frontend changes. No new secrets. No new edge functions.

