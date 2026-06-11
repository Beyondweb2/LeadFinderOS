ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reminder_opt_in boolean NOT NULL DEFAULT false;