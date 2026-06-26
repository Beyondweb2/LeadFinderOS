-- Phase 3b: operator-CONFIRMED services for booking-only pages.
--
-- Stores the services the operator reviewed/edited and confirmed (from a website
-- scan or by hand) before they populate a booking page. JSONB array of
-- { name: string, price?: string, durationMins?: number }. NULL = none confirmed
-- → generate-barber-site falls back to its existing Maps/defaults behaviour
-- (no regression). This is the ONLY path that carries operator-approved prices
-- onto a live booking page — scanned prices never auto-apply unconfirmed.
alter table public.outreach_leads
  add column if not exists confirmed_services jsonb default null;

comment on column public.outreach_leads.confirmed_services is
  'Phase 3b: operator-confirmed services for booking-only pages — JSONB array of {name, price?, durationMins?}. NULL = fall back to Maps/defaults in generate-barber-site.';
