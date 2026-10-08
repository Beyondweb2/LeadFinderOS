-- Resend activation (2026-10-08): the Team page must tell a salesperson who has NOT finished activating
-- (never chose a password) from one who has. last_sign_in_at cannot: the invite link itself signs them in,
-- and a mail scanner opening it counts too. The truth is whether auth.users holds a password hash.
-- Read-only, service role only, returns a boolean — never the hash.
create or replace function public.team_password_is_set(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce((select u.encrypted_password is not null and u.encrypted_password <> '' from auth.users u where u.id = _uid), false);
$$;
revoke all on function public.team_password_is_set(uuid) from public, anon, authenticated;
grant execute on function public.team_password_is_set(uuid) to service_role;
