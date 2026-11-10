-- A NAME WAITING FOR APPROVAL TELLS PAUL (2026-11-10, docs/salesperson-journey-audit.md).
-- A salesperson's first login asks "What name should we use on your messages?". The answer waits in
-- profiles.message_name_pending until an admin approves it on the Team page (migration 20261128100000), and until then
-- that person has NO name: any send that signs with their name is refused. Nothing told the admin a name was waiting.
-- On 2026-11-10 a salesperson created on 7 November had been waiting three days.
-- This adds ONE bell notification to the book owner each time a name starts waiting. Additive and idempotent.
-- Nothing here approves a name, changes a name or sends anything to anyone outside the app.

create or replace function public.notify_message_name_pending()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_who text;
begin
  if new.message_name_pending is null then return new; end if;
  if tg_op = 'UPDATE' and new.message_name_pending is not distinct from old.message_name_pending then return new; end if;
  select user_id into v_owner from public.team_members where is_book_owner = true limit 1;
  if v_owner is null or v_owner = new.user_id then return new; end if;
  select display_name into v_who from public.team_members where user_id = new.user_id;
  begin
    insert into public.notifications (user_id, kind, title, body, link, priority, dedupe_key)
    values (
      v_owner, 'team_update', 'A message name is waiting for your approval',
      coalesce(v_who, 'A team member') || ' wants to sign messages as "' || new.message_name_pending
        || '". Until you approve it on the Team page, messages that carry their name cannot be sent.',
      '/team', 2, 'message_name_pending:' || new.user_id::text || ':' || md5(new.message_name_pending)
    )
    on conflict (user_id, dedupe_key) do nothing;
  exception when others then
    -- The notice must never stop someone saving their name.
    raise warning 'notify_message_name_pending: %', sqlerrm;
  end;
  return new;
end $$;
revoke all on function public.notify_message_name_pending() from public, anon, authenticated;

drop trigger if exists trg_profiles_message_name_pending_notice on public.profiles;
-- No column list on purpose: the approval trigger (BEFORE) can move a typed name into the waiting slot from a statement that
-- never named message_name_pending, and "update of <column>" only looks at the statement. The function compares old and new.
create trigger trg_profiles_message_name_pending_notice
  after insert or update on public.profiles
  for each row execute function public.notify_message_name_pending();

-- Names already waiting when this is applied: the same notice, once each.
insert into public.notifications (user_id, kind, title, body, link, priority, dedupe_key)
select o.user_id, 'team_update', 'A message name is waiting for your approval',
       coalesce(t.display_name, 'A team member') || ' wants to sign messages as "' || p.message_name_pending
         || '". Until you approve it on the Team page, messages that carry their name cannot be sent.',
       '/team', 2, 'message_name_pending:' || p.user_id::text || ':' || md5(p.message_name_pending)
  from public.profiles p
  join public.team_members o on o.is_book_owner = true
  left join public.team_members t on t.user_id = p.user_id
 where p.message_name_pending is not null and p.user_id <> o.user_id
on conflict (user_id, dedupe_key) do nothing;
