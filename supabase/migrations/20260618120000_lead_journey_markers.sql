-- Lead-detail journey markers. ADDITIVE, nullable, no backfill.
-- Two manual milestone timestamps the operator sets in the lead detail popup
-- ("Site sent" and "Call booked") — real cross-device data, distinct from the
-- auto site-event signals (generated_sites.first_opened_at / addon_interest_at).
-- outreach_leads RLS is unchanged (existing per-user policies cover new columns).

alter table public.outreach_leads
  add column if not exists site_sent_at   timestamptz,
  add column if not exists call_booked_at timestamptz;
