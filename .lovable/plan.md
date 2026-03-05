

## Create "Start Free Trial" Bridge Page

### Summary
Create a new `/start-free-trial` page that sits between the landing page and Stripe checkout. Update all landing page CTAs to link to this page instead of scrolling to the pricing card email input. The pricing card keeps its info but loses the email input step.

### New File: `src/pages/StartFreeTrial.tsx`

A single centered card page matching the app's dark theme and existing design system:

- **Header**: Logo + "Sign In" link (same as `/start` page pattern)
- **Card**: `rounded-2xl` with the same gradient background/border/shadow used on the pricing card
- **Headline**: "Start your 5-day free trial"
- **Subtext**: "Get full access to LeadFinder and start finding potential clients in minutes."
- **Feature checklist**: 5 items with green Check icons (same `hsl(142 76% 50%)` color, `strokeWidth={2.5}`)
- **Trust section**: Two paragraphs about full access and cancel-anytime reassurance
- **Card reassurance**: Muted text about card details requirement
- **CTA Button**: "Start My Free Trial" using `btn-premium` class → triggers email input + checkout flow (reuses the same `check-email-subscription` → `create-checkout` pattern from Landing.tsx)
- **Trust indicators**: "Secure payment powered by Stripe" + "Cancel anytime from your dashboard" in muted text

The page will include an email input that appears when the CTA is clicked (same pattern as current pricing card), checking for existing users before redirecting to Stripe.

### Changes to `src/pages/Landing.tsx`

1. **All `scrollToPricing` calls** in CTA buttons (hero, sticky mobile, section CTAs, footer "Try it free") → change to `navigate('/start-free-trial')`
2. **`handlePricingCTAClick`** → change to `navigate('/start-free-trial')`
3. **Pricing card**: Remove the email input step (`showEmailStep` state and related UI). Keep only the pricing info, feature list, and a CTA button that links to `/start-free-trial`
4. **Remove** `checkoutEmail`, `showEmailStep`, `emailError`, `isCheckingEmail`, `isStartingCheckout` state and `handleEmailContinue` function (moved to the new page)
5. **Footer** "Try it free" link → `Link to="/start-free-trial"`
6. **Mobile sticky CTA** → navigate to `/start-free-trial`

### Changes to `src/App.tsx`

Add route:
```tsx
<Route path="/start-free-trial" element={<StartFreeTrial />} />
```
Public route (no auth required, no ProtectedRoute wrapper).

### No other files changed
The checkout logic (`create-checkout` edge function) remains identical. The new page just calls it from a different location.

