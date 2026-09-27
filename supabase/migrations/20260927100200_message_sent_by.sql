-- Multi-user: WHO pressed send, separate from WHOSE book the conversation is in (2026-09-27).
--
-- whatsapp_messages.user_id stays the BOOK (the data account) for every row — the Inbox, the
-- 24-hour window, inbound routing and every dashboard key on it, and a salesperson's send must land
-- in the same conversation as the queue's opener. sent_by_user_id is the team member who sent it
-- by hand (NULL = the queue or an automation). whatsapp_sends.user_id keeps its existing meaning
-- (NULL = queue, set = the person who pressed the button).
alter table public.whatsapp_messages
  add column if not exists sent_by_user_id uuid references auth.users(id) on delete set null;
create index if not exists idx_whatsapp_messages_sent_by on public.whatsapp_messages (sent_by_user_id, created_at desc)
  where sent_by_user_id is not null;

-- Auto-assign on first contact now prefers the real sender.
create or replace function public.assign_lead_on_contact()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_sender uuid := coalesce(new.sent_by_user_id, new.user_id);
begin
  if new.lead_id is null then return new; end if;
  if not (new.direction = 'inbound' or new.status in ('sent', 'delivered', 'read')) then return new; end if;
  begin
    select case when exists (select 1 from public.team_members t where t.user_id = v_sender and t.status = 'active')
                then v_sender else public.book_owner_id() end
      into v_owner;
    if v_owner is not null then
      update public.outreach_leads
         set assigned_to_user_id = v_owner, assigned_at = now()
       where id = new.lead_id and assigned_to_user_id is null;
    end if;
  exception when others then
    raise warning 'assign_lead_on_contact: %', sqlerrm;
  end;
  return new;
end
$$;
revoke execute on function public.assign_lead_on_contact() from public, anon;
