-- SMS reminder send job — schema.
--
-- (1) is_paid: the manual paid-barber gate on generated_sites (set by hand for
--     now). Only paid sites get reminders. Default false so nothing texts until a
--     site is explicitly flagged paid.
-- (2) reminder_sent_at: stamped on a booking once its reminder has been sent, so
--     it is never texted twice.
--
-- Both idempotent. Run via the Supabase SQL editor / Lovable SQL runner (raw SQL),
-- NOT the Lovable build chat.

ALTER TABLE public.generated_sites
  ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT false;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;
