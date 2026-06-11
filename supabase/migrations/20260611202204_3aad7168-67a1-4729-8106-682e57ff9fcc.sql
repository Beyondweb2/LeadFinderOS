CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS public.booking_staff (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     uuid NOT NULL REFERENCES public.generated_sites(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  avatar_url  text,
  sort_order  int  NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS booking_staff_site_id_idx ON public.booking_staff(site_id);

CREATE TABLE IF NOT EXISTS public.staff_working_hours (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    uuid NOT NULL REFERENCES public.booking_staff(id) ON DELETE CASCADE,
  weekday     smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time  time NOT NULL,
  end_time    time NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_hours_valid CHECK (end_time > start_time),
  CONSTRAINT staff_hours_no_dupe UNIQUE (staff_id, weekday, start_time)
);
CREATE INDEX IF NOT EXISTS staff_working_hours_staff_id_idx ON public.staff_working_hours(staff_id);

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
  CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
    staff_id WITH =,
    (tstzrange(starts_at, ends_at, '[)')) WITH &&
  ) WHERE (status <> 'cancelled')
);
CREATE INDEX IF NOT EXISTS bookings_site_id_idx      ON public.bookings(site_id);
CREATE INDEX IF NOT EXISTS bookings_staff_starts_idx ON public.bookings(staff_id, starts_at);

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

CREATE OR REPLACE FUNCTION public.bookable_staff(_staff_id uuid, _site_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.booking_staff s
                 JOIN public.generated_sites gs ON gs.id = s.site_id
                 WHERE s.id = _staff_id AND s.site_id = _site_id
                   AND s.is_active AND gs.status = 'published');
$$;

ALTER TABLE public.booking_staff        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_working_hours  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings             ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_staff TO authenticated;
GRANT ALL ON public.booking_staff TO service_role;
GRANT SELECT ON public.booking_staff TO anon;

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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_working_hours TO authenticated;
GRANT ALL ON public.staff_working_hours TO service_role;
GRANT SELECT ON public.staff_working_hours TO anon;

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

REVOKE ALL ON public.bookings FROM anon;
GRANT INSERT ON public.bookings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;

DROP POLICY IF EXISTS "Admins manage bookings" ON public.bookings;
CREATE POLICY "Admins manage bookings" ON public.bookings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Owners read their bookings" ON public.bookings;
CREATE POLICY "Owners read their bookings" ON public.bookings
  FOR SELECT TO authenticated
  USING (public.owns_site(site_id));

DROP POLICY IF EXISTS "Owners update their bookings" ON public.bookings;
CREATE POLICY "Owners update their bookings" ON public.bookings
  FOR UPDATE TO authenticated
  USING (public.owns_site(site_id))
  WITH CHECK (public.owns_site(site_id));

DROP POLICY IF EXISTS "Public can create a booking" ON public.bookings;
CREATE POLICY "Public can create a booking" ON public.bookings
  FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'confirmed' AND public.bookable_staff(staff_id, site_id));