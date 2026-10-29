-- 20261130100000_welcome_pack_sends.sql
-- The welcome pack email, recorded as Resend accepted it (Paul, 2026-10-29). Branch feat/welcome-pack-next-action.
--
-- Additive only: one new table. No existing row or table is changed.
-- ⛔ SERVER-ONLY: RLS on and NO policies, so the browser reads nothing (200 []) and writes nothing. Only
--    paid-client-hub (service role) writes a row, after Paul presses Send, and only for a real (non-test) send.
--    admin-overview (service role) reads it so the "Send welcome pack" row leaves "What needs you" once sent.
-- ⛔ A TEST SEND IS NEVER RECORDED HERE (it goes to Paul only) — a row here means the client was sent it.

create table if not exists public.welcome_pack_sends (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.outreach_leads(id),
  user_id uuid not null,
  sent_by uuid,
  sent_to text not null,
  pack_url text not null,
  resend_id text,
  sent_at timestamptz not null default now()
);

create index if not exists welcome_pack_sends_lead_idx on public.welcome_pack_sends (lead_id, sent_at desc);

alter table public.welcome_pack_sends enable row level security;
