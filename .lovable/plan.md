## Goal

Apply the pasted SQL as a single Supabase migration: Phase 1 of the booking system — schema, RLS, grants, and a double-booking guard.

## Change

One migration that runs the pasted SQL verbatim (it is already idempotent and self-contained):

1. `CREATE EXTENSION IF NOT EXISTS btree_gist` — required for the GiST exclusion on `staff_id` (uuid) + tstzrange.
2. Tables:
   - `public.booking_staff` (one row per barber; solo shop = one row; soft-delete via `is_active`)
   - `public.staff_working_hours` (recurring weekday windows; split shifts allowed)
   - `public.bookings` (anonymous customer name + phone, one staff, `[starts_at, ends_at)` slot)
3. Indexes on `site_id`, `staff_id`, and `(staff_id, starts_at)`.
4. Double-booking guard on `bookings`: `EXCLUDE USING gist (staff_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE status <> 'cancelled'`.
5. Helper SECURITY DEFINER functions: `owns_site`, `site_is_published`, `owns_staff`, `staff_site_published`, `bookable_staff` — keep RLS simple and non-recursive.
6. Enable RLS on all three tables, grant per role, and create policies:
   - Owners: full manage on their staff + hours; SELECT and UPDATE on their bookings.
   - Admins: full manage everywhere via `has_role`.
   - Anon: SELECT on `booking_staff` + `staff_working_hours` for published sites; INSERT-only on `bookings` (no SELECT grant, no SELECT policy → customer data is write-only to the public).
   - Defensive `REVOKE ALL ON public.bookings FROM anon` before granting `INSERT` only.

## Access model (plain English)

- **Shop owner**: manages their own staff and working hours; can view their bookings and mark them cancelled / no-show / completed.
- **Admins**: full access via existing `has_role`.
- **Anonymous customers**: can see who works at a published shop and when; can submit a booking; cannot read any booking row (no name/phone leakage).
- **service_role / edge functions**: bypass RLS as usual (Phase 3 booking edge function will live here).

## Explicitly out of scope (deferred to Phase 3 edge function)

- Verifying the chosen slot falls within `staff_working_hours` (CHECK can't, RLS won't).
- Rejecting bookings in the past (CHECK can't call `now()`).
- Rate limiting / abuse protection on anonymous inserts.
- Any UI — frontend changes come in a later phase.

## Safety / idempotency

- All `CREATE`s use `IF NOT EXISTS`; all policies are `DROP POLICY IF EXISTS` then `CREATE POLICY`; functions are `CREATE OR REPLACE`. Safe to re-run.
- No changes to existing tables (`generated_sites`, `user_roles`, etc.) or existing policies.
- Grants follow the project's public-schema rule (explicit GRANT in the same migration as CREATE TABLE; `service_role` not granted because it bypasses RLS by design — confirm if you'd like it added explicitly anyway).

## Follow-up (later phases, not in this migration)

- Phase 2: owner UI under `/barber` to manage staff + working hours.
- Phase 3: `book-slot` edge function (service_role) that validates working hours + future time + reasonable duration before inserting.
- Phase 4: public booking widget on `/p/:slug` + SMS confirmation hook.
