Add two missing columns required by the `send-reminders` edge function.

### What

1. **`generated_sites.is_paid`** — a `boolean NOT NULL DEFAULT false` that gates SMS reminder sending to paid barber sites only.
2. **`bookings.reminder_sent_at`** — an optional `timestamptz` used to guarantee exactly-once reminder delivery; stamped after a text is successfully sent.

### Why

The `send-reminders` edge function already queries both columns:
- `.eq("generated_sites.is_paid", true)` — restricts reminders to paid sites.
- `.is("reminder_sent_at", null)` — skips already-sent reminders.

Without these columns the function fails at runtime.

### Steps

1. **Run migration** — execute the two `ALTER TABLE` statements in a single migration so `generated_sites.is_paid` and `bookings.reminder_sent_at` are created atomically.
2. **Regenerate types** — after the migration is applied, the Supabase types file (`src/integrations/supabase/types.ts`) will be regenerated automatically to include the new columns.
3. **Verify edge function compatibility** — confirm `send-reminders` and `create-booking` references resolve correctly after the columns exist.

### No client code changes needed

- The `send-reminders` function already references both columns.
- The `create-booking` function already inserts `reminder_opt_in` (added in a prior migration).
- `BookingsManager.tsx` selects `*` and casts to a local type; it does not need to display `reminder_sent_at`.

### Technical details

- Both statements use `IF NOT EXISTS` so the migration is idempotent.
- `is_paid` defaults to `false` so all existing sites remain unpaid until explicitly toggled.
- `reminder_sent_at` is nullable so existing bookings correctly appear as "not yet reminded".
- No RLS changes are required; these columns are read/updated only by the `send-reminders` service-role edge function and by site owners via existing owner-scoped policies.