-- Sales Experience, release 1 (2026-09-28): WhatsApp UNREAD per person + personal targets.
-- Additive only. docs/sales-experience.md §2.
--
-- ⛔ UNREAD IS PER PERSON AND PER NUMBER. A conversation is unread for you when its newest INBOUND
-- message is newer than the last time YOU opened that number's thread. A number you have never opened
-- counts from UNREAD_TRACKING_START (whatsapp_unread_since()) — so the day this ships, only replies from
-- that day on show as unread, never the whole history.
-- ⛔ Nothing here changes a message, a lead or who can see either. The count function mirrors what the
-- Inbox lists: the caller's visible messages (admin: all; sales: own leads / own numbers — the same sets
-- the RLS policies use), grouped by number, the newest lead on the thread, not archived, and for Sales
-- never a client (the sales_leads view hides clients, so the Inbox does too).

create table if not exists public.whatsapp_conversation_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  phone text not null,
  last_read_at timestamptz not null default now(),
  primary key (user_id, phone)
);
alter table public.whatsapp_conversation_reads enable row level security;
revoke all on public.whatsapp_conversation_reads from anon;
drop policy if exists wa_reads_own_select on public.whatsapp_conversation_reads;
create policy wa_reads_own_select on public.whatsapp_conversation_reads for select to authenticated
  using (user_id = (select auth.uid()));
-- No insert/update/delete policy: only mark_whatsapp_read() writes (security definer, own row only).

create or replace function public.whatsapp_unread_since()
returns timestamptz language sql immutable as $$ select timestamptz '2026-09-28 00:00:00+00' $$;

create or replace function public.mark_whatsapp_read(_phone text)
returns timestamptz language plpgsql volatile security definer set search_path = public as $$
declare v_at timestamptz := now();
begin
  if auth.uid() is null or public.my_role() is null then raise exception 'not_allowed'; end if;
  if _phone is null or _phone !~ '^[0-9]{6,16}$' then raise exception 'bad_phone'; end if;
  insert into public.whatsapp_conversation_reads (user_id, phone, last_read_at)
    values (auth.uid(), _phone, v_at)
    on conflict (user_id, phone) do update set last_read_at = greatest(public.whatsapp_conversation_reads.last_read_at, excluded.last_read_at);
  return v_at;
end $$;
revoke all on function public.mark_whatsapp_read(text) from public, anon;
grant execute on function public.mark_whatsapp_read(text) to authenticated;

-- The caller's unread conversations: one row per number (phone, lead, newest inbound).
create or replace function public.my_whatsapp_unread()
returns table (phone text, lead_id uuid, last_inbound_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_role text := public.my_role(); v_uid uuid := auth.uid();
begin
  if v_uid is null or v_role is null then return; end if;
  return query
  with vis as (
    select m.phone, m.lead_id, m.direction, m.created_at from public.whatsapp_messages m
    where (v_role = 'admin'
        or (v_role = 'sales' and (m.lead_id in (select public.my_sales_lead_ids()) or m.phone in (select public.my_sales_message_phones()))))
  ), conv as (
    select v.phone,
           max(v.created_at) filter (where v.direction = 'inbound') as last_in,
           (array_agg(v.lead_id order by v.created_at desc) filter (where v.lead_id is not null))[1] as lead_id
    from vis v group by v.phone
  )
  select c.phone, c.lead_id, c.last_in
  from conv c
  join public.outreach_leads l on l.id = c.lead_id and l.is_archived is not true
  left join public.whatsapp_conversation_reads r on r.user_id = v_uid and r.phone = c.phone
  where c.last_in is not null
    and c.last_in > greatest(coalesce(r.last_read_at, public.whatsapp_unread_since()), public.whatsapp_unread_since())
    and (v_role = 'admin' or (l.assigned_to_user_id = v_uid and not public.lead_is_client(l.amount_paid, l.status)));
end $$;
revoke all on function public.my_whatsapp_unread() from public, anon;
grant execute on function public.my_whatsapp_unread() to authenticated;

-- Personal targets (optional, the person's own row; display only — nothing is enforced by them).
alter table public.user_preferences add column if not exists sales_targets jsonb;
