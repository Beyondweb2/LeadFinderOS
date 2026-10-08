-- Finn (2026-10-08): the provider stores a random placeholder hash on an INVITED user, so "has a hash" made
-- people who never chose a password read as activated. A person has really set a password when EITHER the
-- set-password page stamped user_metadata.password_set_at, OR a session of theirs signed in BY password.
-- Read-only, service role only, returns a boolean — never the hash.
create or replace function public.team_password_is_set(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce((
    select (u.raw_user_meta_data ? 'password_set_at')
        or exists (select 1 from auth.sessions s join auth.mfa_amr_claims a on a.session_id = s.id
                   where s.user_id = u.id and a.authentication_method = 'password')
    from auth.users u where u.id = _uid
  ), false);
$$;
revoke all on function public.team_password_is_set(uuid) from public, anon, authenticated;
grant execute on function public.team_password_is_set(uuid) to service_role;
