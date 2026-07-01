-- WhatsApp Inbox (Phase A) — one append-only log of every in/out message.
-- Conversations are DERIVED by grouping on (user_id, phone). Writes happen only via
-- service-role edge functions (send-whatsapp-message now; the inbound webhook later).

create table if not exists public.whatsapp_messages (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  direction     text not null check (direction in ('inbound','outbound')),
  -- Conversation owner: outbound = the operator who sent; inbound = the matched
  -- lead's owner; NULL = unknown sender (unassigned → admin-only via RLS below).
  user_id       uuid references auth.users(id) on delete set null,
  lead_id       uuid references public.outreach_leads(id) on delete set null,
  phone         text not null,                     -- E.164 digits (Meta format) = conversation key
  body          text,
  message_type  text not null default 'text' check (message_type in ('text','template')),
  template_name text,
  wa_message_id text,                              -- Meta id (status join + inbound dedup)
  status        text not null default 'received',  -- inbound:'received'; out:'simulated'|'sent'|'failed'
  test_mode     boolean not null default true,
  error         text
);

alter table public.whatsapp_messages enable row level security;

-- Operators read ONLY their own conversations; admin reads all (incl. Unassigned).
drop policy if exists "wa_messages read own or admin" on public.whatsapp_messages;
create policy "wa_messages read own or admin" on public.whatsapp_messages
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'::app_role));

-- No insert/update/delete policies: ALL writes go through service-role edge
-- functions (send-whatsapp-message + the future inbound webhook), which bypass RLS.
-- Nothing can be forged by a client.

create index if not exists wa_messages_user_phone_idx on public.whatsapp_messages (user_id, phone, created_at desc);
create index if not exists wa_messages_phone_idx      on public.whatsapp_messages (phone, created_at desc);
create unique index if not exists wa_messages_wa_id_uq on public.whatsapp_messages (wa_message_id) where wa_message_id is not null;
