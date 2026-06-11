-- Booking system — Phase 1: schema + RLS + double-booking guard.
--
-- Model: a shop (generated_sites row) has one or more staff (solo = one row).
-- Customers book anonymously (name + phone, no account). Per-staff weekly working
-- hours live in a related table (supports split shifts and its own RLS). Bookings
-- store the slot as [starts_at, ends_at); a GiST exclusion constraint prevents
-- overlapping slots per staff.
--
-- Access model (enforced below):
--   * Owner of the site: manage their staff + hours; READ their bookings; and
--     UPDATE their bookings (cancel / mark no-show).
--   * Anonymous customers: CREATE a booking (insert only) for a published site;
--     READ staff + working hours of published sites. They can NEVER read bookings
--     (no SELECT grant AND no SELECT policy) — customer names/phones are write-only.
--   * Admin + service_role: full access (admin via has_role; service_role bypasses RLS).
--
-- NOTE (Phase 3): working-hours conformance (the chosen slot actually falls inside
-- the staff's staff_working_hours) and "no bookings in the past" are intentionally
-- NOT enforced here. A CHECK constraint cannot call now(), and RLS does not validate
-- slot windows. Those rules will be enforced in the booking EDGE FUNCTION
-- (service_role) in Phase 3. RLS + the exclusion constraint in this migration cover
-- only: who may insert/read which rows, and no overlapping slots per staff.
--
-- Idempotent: safe to (re)run. Run via the Supabase SQL editor / Lovable SQL
-- runner (raw SQL), NOT the Lovable build chat.

-- Required for the exclusion constraint (gist equality on a uuid column).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────────────────────

-- Staff: one row per barber/stylist. Solo shop = exactly one row.
CREATE TABLE IF NOT EXISTS public.booking_staff (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     uuid NOT NULL REFERENCES public.generated_sites(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  avatar_url  text,
  sort_order  int  NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,   -- soft-delete: hide instead of hard-delete
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS booking_staff_site_id_idx ON public.booking_staff(site_id);

-- Per-staff working hours. Multiple rows per weekday = split shifts (e.g. lunch).
-- start_time/end_time are recurring wall-clock times; the app applies the shop's
-- timezone (Europe/London) when turning them into absolute slots.
CREATE TABLE IF NOT EXISTS public.staff_working_hours (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    uuid NOT NULL REFERENCES public.booking_staff(id) ON DELETE CASCADE,
  weekday     smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),  -- 0=Sun … 6=Sat (JS getDay())
  start_time  time NOT NULL,
  end_time    time NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_hours_valid CHECK (end_time > start_time),
  CONSTRAINT staff_hours_no_dupe UNIQUE (staff_id, weekday, start_time)
);
CREATE INDEX IF NOT EXISTS staff_working_hours_staff_id_idx ON public.staff_working_hours(staff_id);

-- Bookings: anonymous customer (name + phone), one staff, a time slot.
CREATE TABLE IF NOT EXISTS public.bookings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id        uuid NOT NULL REFERENCES public.generated_sites(id) ON DELETE CASCADE,
  staff_id       uuid NOT NULL REFERENCES public.booking_staff(id)   ON DELETE CASCADE,
  service_name   text NOT NULL CHECK (char_length(service_name)  BETWEEN 1 AND 120),
  customer_name  text NOT NULL CHECK (char_length(customer_name) BETWEEN 1 AND 120),
  customer_phone text NOT NULL CHECK (char_length(customer_phone) BETWEEN 3 AND 40),
  starts_at      timestamptz NOT NULL,
  ends_at        timestamptz NOT NULL,
  status         text NOT NULL DEFAULT 'confirmed',
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookings_time_valid   CHECK (ends_at > starts_at),
  CONSTRAINT bookings_status_valid CHECK (status IN ('confirmed','cancelled','completed','no_show')),
  -- DOUBLE-BOOKING GUARD: no two non-cancelled bookings for the same staff may
  -- have overlapping [start, end) ranges. Back-to-back slots are allowed.
  CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
    staff_id WITH =,
    (tstzrange(starts_at, ends_at, '[)')) WITH &&
  ) WHERE (status <> 'cancelled')
);
CREATE INDEX IF NOT EXISTS bookings_site_id_idx      ON public.bookings(site_id);
CREATE INDEX IF NOT EXISTS bookings_staff_starts_idx ON public.bookings(staff_id, starts_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper functions (SECURITY DEFINER so RLS policies stay simple / non-recursive)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.owns_site(_site_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.generated_sites
                 WHERE id = _site_id AND owner_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.site_is_published(_site_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.generated_sites
                 WHERE id = _site_id AND status = 'published');
$$;

CREATE OR REPLACE FUNCTION public.owns_staff(_staff_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.booking_staff s
                 JOIN public.generated_sites gs ON gs.id = s.site_id
                 WHERE s.id = _staff_id AND gs.owner_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.staff_site_published(_staff_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.booking_staff s
                 JOIN public.generated_sites gs ON gs.id = s.site_id
                 WHERE s.id = _staff_id AND gs.status = 'published');
$$;

-- Anon INSERT check: staff must be active, belong to the given site, and that
-- site must be published. One call validates the whole booking target.
CREATE OR REPLACE FUNCTION public.bookable_staff(_staff_id uuid, _site_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.booking_staff s
                 JOIN public.generated_sites gs ON gs.id = s.site_id
                 WHERE s.id = _staff_id AND s.site_id = _site_id
                   AND s.is_active AND gs.status = 'published');
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS + grants + policies
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.booking_staff        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_working_hours  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings             ENABLE ROW LEVEL SECURITY;

-- ── booking_staff ────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_staff TO authenticated;
GRANT SELECT ON public.booking_staff TO anon;   -- public reads who to book

DROP POLICY IF EXISTS "Admins manage booking_staff" ON public.booking_staff;
CREATE POLICY "Admins manage booking_staff" ON public.booking_staff
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Owners manage their staff" ON public.booking_staff;
CREATE POLICY "Owners manage their staff" ON public.booking_staff
  FOR ALL TO authenticated
  USING (public.owns_site(site_id))
  WITH CHECK (public.owns_site(site_id));

DROP POLICY IF EXISTS "Public reads staff of published sites" ON public.booking_staff;
CREATE POLICY "Public reads staff of published sites" ON public.booking_staff
  FOR SELECT TO anon, authenticated
  USING (public.site_is_published(site_id));

-- ── staff_working_hours ──────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_working_hours TO authenticated;
GRANT SELECT ON public.staff_working_hours TO anon;   -- public reads when to book

DROP POLICY IF EXISTS "Admins manage staff_working_hours" ON public.staff_working_hours;
CREATE POLICY "Admins manage staff_working_hours" ON public.staff_working_hours
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Owners manage their staff hours" ON public.staff_working_hours;
CREATE POLICY "Owners manage their staff hours" ON public.staff_working_hours
  FOR ALL TO authenticated
  USING (public.owns_staff(staff_id))
  WITH CHECK (public.owns_staff(staff_id));

DROP POLICY IF EXISTS "Public reads hours of published sites" ON public.staff_working_hours;
CREATE POLICY "Public reads hours of published sites" ON public.staff_working_hours
  FOR SELECT TO anon, authenticated
  USING (public.staff_site_published(staff_id));

-- ── bookings ─────────────────────────────────────────────────────────────────
-- Anon: INSERT ONLY. Revoke everything first (defensive against any default
-- grant, per the earlier generated_sites grant-drift lesson), then grant INSERT
-- alone — so anon has no read privilege on this table at all.
REVOKE ALL ON public.bookings FROM anon;
GRANT INSERT ON public.bookings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;

DROP POLICY IF EXISTS "Admins manage bookings" ON public.bookings;
CREATE POLICY "Admins manage bookings" ON public.bookings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Owners read their bookings" ON public.bookings;
CREATE POLICY "Owners read their bookings" ON public.bookings
  FOR SELECT TO authenticated
  USING (public.owns_site(site_id));

-- Owners may update their own bookings (cancel / mark no-show). The status CHECK
-- constraint above limits which status values are allowed.
DROP POLICY IF EXISTS "Owners update their bookings" ON public.bookings;
CREATE POLICY "Owners update their bookings" ON public.bookings
  FOR UPDATE TO authenticated
  USING (public.owns_site(site_id))
  WITH CHECK (public.owns_site(site_id));

-- Public can CREATE a booking for a published site + active staff of that site.
-- There is intentionally NO SELECT policy for anon on this table (see header):
-- combined with the INSERT-only grant, customer data is write-only to the public.
DROP POLICY IF EXISTS "Public can create a booking" ON public.bookings;
CREATE POLICY "Public can create a booking" ON public.bookings
  FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'confirmed' AND public.bookable_staff(staff_id, site_id));
