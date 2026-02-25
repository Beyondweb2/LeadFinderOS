

# Implementation Plan

Three parallel workstreams: (A) Stripe webhook hardening, (B) white outline fix, (C) landing page button reorder.

---

## A. Stripe Webhook Hardening

### A1. Database Migration

Create a migration that:

1. Adds `stripe_event_id` column to `funnel_events` with a partial unique index (WHERE stripe_event_id IS NOT NULL)
2. Creates `webhook_events` table with RLS blocking all public access

```sql
-- funnel_events: idempotency column
ALTER TABLE public.funnel_events
  ADD COLUMN IF NOT EXISTS stripe_event_id text;

CREATE UNIQUE INDEX IF NOT EXISTS funnel_events_stripe_event_id_key
  ON public.funnel_events (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;

-- webhook_events: audit log
CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text NOT NULL,
  event_type text NOT NULL,
  user_id uuid,
  payload_summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX webhook_events_stripe_event_id_key
  ON public.webhook_events (stripe_event_id);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No public access" ON public.webhook_events FOR ALL USING (false);
```

### A2. Rewrite `supabase/functions/stripe-webhook/index.ts`

**New helper: `resolveUserId`** — tiered resolution:
1. By `stripe_subscription_id` → query `subscriptions` table
2. By `stripe_customer_id` → query `subscriptions` table
3. Legacy fallback: Stripe customer email → `listUsers({ page:1, perPage:1000 })` with `.toLowerCase()` normalization, logged as `[LEGACY-FALLBACK]`

**New helper: `logWebhookEvent`** — fire-and-forget insert into `webhook_events` (catches errors silently)

**New helper: `idempotentFunnelInsert`** — checks for existing `stripe_event_id` before inserting; skips if duplicate

**New handler: `checkout.session.completed`** (inserted before `invoice.paid` block):
- Extract `client_reference_id` (user_id), `customer`, `subscription` from session
- Guard: no `client_reference_id` → log + return 200
- Guard: no `subscription` → still clear `checkout_abandoned`, log funnel event, return 200
- Fetch full subscription from Stripe
- Compute `current_period_end`: if `status === 'trialing'` and `trial_end` exists → use `trial_end`; else use `current_period_end`
- Upsert `subscriptions` table (onConflict: `stripe_subscription_id`), including `payment_failure_count: 0` default
- Map `plan_status` using consistent enum: `{ trialing: 'trialing', active: 'active', past_due: 'past_due', canceled: 'canceled' }`
- Update `user_trials`: `plan_status`, `trial_used = true`, `checkout_abandoned = false`
- Idempotent funnel insert: `checkout_completed`
- Log to `webhook_events`

**Refactor subscription/invoice handlers** (lines 66-71 and 212-235):
- Replace email-only lookup with `resolveUserId(subscriptionId, customerId)`
- Apply same tiered resolution to `invoice.paid` affiliate handler

**Fix `plan_status` mapping** (lines 365-367):
- Replace `'cancelled'` with `'canceled'` (match Stripe spelling)
- Preserve granular statuses: `trialing → trialing`, `active → active`, `past_due → past_due`, `canceled → canceled`

**Make existing funnel insert idempotent** (lines 390-397):
- Use `idempotentFunnelInsert` helper with `stripe_event_id = event.id`

**Log all events to `webhook_events`**:
- Insert at top of handler (user_id null initially)
- Update with resolved user_id after resolution

### A3. Frontend: Update `src/hooks/useTrial.ts`

Line 7 — expand `planStatus` type:
```typescript
planStatus: 'trial' | 'active' | 'trialing' | 'expired' | 'canceled' | 'past_due' | null;
```

This replaces `'cancelled'` with `'canceled'` to match the webhook. The only place `planStatus` is checked against these string values is line 176 (`planStatus === 'trial'`), which is unaffected. The `useSubscription` hook handles access gating separately.

---

## B. White Outline Fix

The white outlines come from `ring-offset-background` in shadcn components. This Tailwind utility sets the ring-offset color, but `ring-offset-background` isn't a standard Tailwind color — it's a convention from shadcn that expects a matching CSS custom property or Tailwind mapping.

The fix: in `src/index.css`, add a global rule that sets `--tw-ring-offset-color` to the background color, preventing the white default.

```css
@layer base {
  * {
    @apply border-border;
    --tw-ring-offset-color: hsl(var(--background));
  }
}
```

This single line ensures ring offsets always match the background, eliminating white outlines on buttons, dropdowns, selects, dialogs, and all other focused elements.

---

## C. Landing Page: Move Sign In Button

Currently the header buttons are ordered: `Sign In` (ghost) → `Try it free` (premium).

Swap order so on desktop: `Try it free` → `Sign In`. The `Sign In` button moves to the right of the CTA.

**File: `src/pages/Landing.tsx`**, lines 483-495:

```tsx
<div className="flex items-center gap-2 sm:gap-3">
  <Button 
    asChild 
    className="font-semibold text-sm px-3 sm:px-4 btn-premium"
  >
    <Link to="/auth?intent=upgrade">
      Try it free
    </Link>
  </Button>
  <Button variant="ghost" className="text-muted-foreground hover:text-foreground text-sm px-2 sm:px-4" asChild>
    <Link to="/auth">Sign In</Link>
  </Button>
</div>
```

---

## Files Changed

| File | Change |
|---|---|
| **Migration** | Add `stripe_event_id` to `funnel_events`, create `webhook_events` table |
| `supabase/functions/stripe-webhook/index.ts` | Full rewrite: checkout handler, tiered user resolution, consistent `canceled` spelling, idempotent funnels, webhook logging |
| `src/hooks/useTrial.ts` | Expand `planStatus` type, replace `cancelled` → `canceled` |
| `src/index.css` | Add `--tw-ring-offset-color` to base layer to fix white outlines |
| `src/pages/Landing.tsx` | Swap button order in header |

