-- 20261130120000_welcome_pack_sends_channel.sql
-- The welcome pack now goes on WhatsApp by default, email only as the fallback (Paul, 2026-10-29).
-- Branch feat/welcome-pack-whatsapp. Additive only: one column on welcome_pack_sends (empty when this was written).
-- Rows written before this column existed were email sends, hence the default.

alter table public.welcome_pack_sends add column if not exists channel text not null default 'email';

alter table public.welcome_pack_sends drop constraint if exists welcome_pack_sends_channel_check;
alter table public.welcome_pack_sends add constraint welcome_pack_sends_channel_check check (channel in ('whatsapp', 'email'));
