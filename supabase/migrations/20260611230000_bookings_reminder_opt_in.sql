-- Booking SMS reminder opt-in (consent only — no SMS is sent yet).
--
-- Adds a single boolean to public.bookings. Default FALSE so existing rows, and
-- any future booking that doesn't explicitly opt in, are correctly "not opted in"
-- (consent must be an active choice). Idempotent — safe to (re)run.
--
-- Run via the Supabase SQL editor / Lovable SQL runner (raw SQL), NOT the build chat.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reminder_opt_in boolean NOT NULL DEFAULT false;
