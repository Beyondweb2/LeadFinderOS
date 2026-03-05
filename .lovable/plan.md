
## Problem

When a logged-in user lands on `/landing` (e.g. because their subscription is blocked, or they were redirected by `SubscriptionGate`), the "Sign In" buttons are hidden because they're wrapped in `{!user && ...}`. The header CTA also changes from "Try it free" to "Subscribe". This means a user who signed out and back in, or whose session is stale, loses access to the Sign In button.

There are 3 places in `Landing.tsx` where Sign In is conditionally hidden:
1. **Header** (line 558): `{!user && <Button>Sign In</Button>}`
2. **Hero CTA** (line 616): `{!user && <Button>Sign in</Button>}`
3. **Footer** (line 1173): `{!user && <Link>Sign In</Link>}`

And the header CTA button (line 567) shows `user ? 'Subscribe' : 'Try it free'`.

## Plan

**Single file change: `src/pages/Landing.tsx`**

1. **Always show the Sign In links** — remove the `!user &&` guards from all three locations so the Sign In button is always visible regardless of auth state.

2. **Keep the CTA button text as "Try it free"** always (remove the ternary that switches to "Subscribe" when logged in). Logged-in users who need to subscribe will still scroll to pricing and go through the normal checkout flow.

These are purely display changes — no routing, Stripe, or auth logic is modified.
