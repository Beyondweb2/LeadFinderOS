

## Issue

The Resend error says `mail.lead-finder-app.com` is not verified, but your screenshot shows the verified domain is `lead-finder-app.com` (without the `mail.` subdomain). The `from` address in both edge functions uses the wrong subdomain.

## Plan

Update the `from` email address in two files:

1. **`supabase/functions/test-abandoned-email/index.ts`** — Change `from: "Paul <paul@mail.lead-finder-app.com>"` to `from: "Paul <paul@lead-finder-app.com>"`

2. **`supabase/functions/lifecycle-emails/index.ts`** — Same change: `from: "Paul <paul@mail.lead-finder-app.com>"` to `from: "Paul <paul@lead-finder-app.com>"`

No other changes needed. The functions will redeploy automatically.

