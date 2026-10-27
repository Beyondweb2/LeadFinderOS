-- THE NAME ON YOUR MESSAGES NEEDS PAUL'S APPROVAL (2026-10-27, docs/team-access-tidy.md §4a).
-- profiles.message_name stays THE name every sender signs with (sender-name.ts, useMyMessageName) — it now changes only
-- when an admin approves. A salesperson's typed name waits in message_name_pending until then.
-- ⛔ Enforced here, not in the browser: a signed-in non-admin who writes message_name (an old cached app, a hand-made
-- request) has it moved into message_name_pending and the approved name kept. The service role (auth.uid() null) and
-- admins write as before. Existing names stay approved (they are in use today); every new or changed name waits.

alter table public.profiles add column if not exists message_name_pending text;
alter table public.profiles add column if not exists message_name_pending_at timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_message_name_pending_shape') then
    alter table public.profiles add constraint profiles_message_name_pending_shape
      check (message_name_pending is null or (char_length(btrim(message_name_pending)) between 1 and 40 and message_name_pending !~ '[\r\n\t]'));
  end if;
end $$;

create or replace function public.profiles_message_name_approval()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.my_role() = 'admin' then return new; end if;
  if tg_op = 'INSERT' then
    if new.message_name is not null then
      new.message_name_pending := new.message_name; new.message_name_pending_at := now();
      new.message_name := null; new.message_name_set_at := null;
    end if;
  elsif new.message_name is distinct from old.message_name or new.message_name_set_at is distinct from old.message_name_set_at then
    if new.message_name is distinct from old.message_name and new.message_name is not null then
      new.message_name_pending := new.message_name; new.message_name_pending_at := now();
    end if;
    new.message_name := old.message_name; new.message_name_set_at := old.message_name_set_at;
  end if;
  return new;
end $$;
revoke all on function public.profiles_message_name_approval() from public, anon, authenticated;
drop trigger if exists trg_profiles_message_name_approval on public.profiles;
create trigger trg_profiles_message_name_approval before insert or update on public.profiles
  for each row execute function public.profiles_message_name_approval();

-- Approve (the waiting name becomes the name) or reject (the waiting name is dropped; the old name, if any, stays). Admin only.
create or replace function public.review_message_name(_user_id uuid, _approve boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pending text;
begin
  if public.my_role() is distinct from 'admin' then raise exception 'admin_only' using errcode = '42501'; end if;
  select message_name_pending into v_pending from public.profiles where user_id = _user_id for update;
  if v_pending is null then return jsonb_build_object('ok', false, 'error', 'nothing_waiting'); end if;
  if _approve then
    update public.profiles set message_name = v_pending, message_name_set_at = now(),
      message_name_pending = null, message_name_pending_at = null where user_id = _user_id;
  else
    update public.profiles set message_name_pending = null, message_name_pending_at = null where user_id = _user_id;
  end if;
  return jsonb_build_object('ok', true, 'approved', _approve, 'name', v_pending);
end $$;
revoke all on function public.review_message_name(uuid, boolean) from public, anon;
grant execute on function public.review_message_name(uuid, boolean) to authenticated;
