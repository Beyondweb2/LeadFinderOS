-- GROUPED WHATSAPP REPLY NOTIFICATIONS (2026-10-01, docs/outreach-workspace.md). Additive, read-only.
-- The bell's one "N new WhatsApp replies from M businesses" card counts from the SAME unread truth as the
-- Inbox (my_whatsapp_unread: per person, per number, since the person last opened it, assignment-checked),
-- adding how many unread inbound messages each unread conversation holds. It reuses that function, so the
-- rule lives once: a conversation the Inbox calls unread is exactly one this counts.
-- Rollback: drop function if exists public.my_whatsapp_unread_counts();
create or replace function public.my_whatsapp_unread_counts()
returns table(phone text, lead_id uuid, last_inbound_at timestamptz, unread_messages integer)
language sql stable security definer set search_path = public as $$
  select u.phone, u.lead_id, u.last_inbound_at,
         (select count(*)::int from public.whatsapp_messages m
           where m.phone = u.phone and m.direction = 'inbound'
             and m.created_at > greatest(coalesce(r.last_read_at, public.whatsapp_unread_since()), public.whatsapp_unread_since()))
  from public.my_whatsapp_unread() u
  left join public.whatsapp_conversation_reads r on r.user_id = auth.uid() and r.phone = u.phone
$$;
revoke all on function public.my_whatsapp_unread_counts() from public, anon;
grant execute on function public.my_whatsapp_unread_counts() to authenticated;
