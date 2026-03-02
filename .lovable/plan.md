

## Issue

The CTA flow itself is correct: all buttons route to `/auth?intent=upgrade` → signup → `/subscribe` (5-day card-upfront trial). However, the **disclaimer text** under multiple CTAs still references the **old model** ("No card required"), which contradicts the current card-upfront 5-day free trial.

## Locations to fix

**Landing page (`src/pages/Landing.tsx`):**
1. **Line 555** — Hero CTA disclaimer: `"No card required · Instant access · Cancel anytime"` → `"5-day free trial · £0 today · Cancel anytime"`
2. **Line 995** — Final CTA button text: `"Start free access"` → `"Start Free Trial — £0 Today"`
3. **Line 1001** — Final CTA disclaimer: `"No card required · Full access instantly · Cancel anytime"` → `"5-day free trial · £0 today · Cancel anytime"`

**Start page (`src/pages/Start.tsx`):**
4. **Line 31** — Benefits list item: `"No card required to start"` → remove or replace with a relevant benefit
5. **Line 35** — Trust point: `"No card required to create an account"` → update to reflect trial model
6. **Line 90-91** — Hero CTA disclaimer: `"No card required · Full access · Takes 30 seconds"` → `"5-day free trial · £0 today · Cancel anytime"`
7. **Line 213-214** — Final CTA disclaimer: `"No card required · Full access"` → `"5-day free trial · £0 today"`

All CTA button links (`/auth?intent=upgrade`) are correct and don't need changing. The signup → `/subscribe` redirect in Auth.tsx is also correct.

