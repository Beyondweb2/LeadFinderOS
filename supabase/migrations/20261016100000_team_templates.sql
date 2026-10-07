-- TEAM TEMPLATES (2026-10-07, feature/shared-sales-templates): one shared library for the whole sales team, beside each
-- person's own. ONE table, ONE row per Team template — never a copy per salesperson.
--   scope 'personal' (default: every existing row) — visible and editable only by its owner, exactly as before.
--   scope 'team'    — managed by an admin; every admin and salesperson can READ it while it is not archived; nobody else can touch it.
-- ⛔ ENFORCED HERE, not only in the screens: a salesperson's policy can neither write a team row nor turn one of their own into one.
-- Additive and idempotent. Existing rows keep scope 'personal' (Paul's nine barber-era defaults are NOT promoted: they are not copy
-- the team should use; Paul shares any of his templates with one click on the Templates page).
alter table public.templates add column if not exists scope text not null default 'personal';
alter table public.templates add column if not exists archived_at timestamptz;
alter table public.templates add column if not exists sort_order integer not null default 0;
alter table public.templates drop constraint if exists templates_scope_check;
alter table public.templates add constraint templates_scope_check check (scope in ('personal', 'team'));
create index if not exists templates_scope_idx on public.templates (scope, archived_at, sort_order);

drop policy if exists "Users can view their own templates" on public.templates;
drop policy if exists "Users can create their own templates" on public.templates;
drop policy if exists "Users can update their own templates" on public.templates;
drop policy if exists "Users can delete their own templates" on public.templates;
drop policy if exists templates_select on public.templates;
drop policy if exists templates_insert on public.templates;
drop policy if exists templates_update on public.templates;
drop policy if exists templates_delete on public.templates;

-- READ: your own rows; every ACTIVE team template for an admin or a salesperson; an admin also reads archived team rows.
create policy templates_select on public.templates for select to authenticated using (
  user_id = (select auth.uid())
  or (scope = 'team' and archived_at is null and (select public.my_role()) in ('admin', 'sales'))
  or (scope = 'team' and (select public.my_role()) = 'admin')
);
-- CREATE: your own personal row; a team row only if you are an admin (and it is yours as the author).
create policy templates_insert on public.templates for insert to authenticated with check (
  user_id = (select auth.uid())
  and (scope = 'personal' or (scope = 'team' and (select public.my_role()) = 'admin'))
);
-- CHANGE: your own personal row (and it stays personal); a team row only as an admin.
create policy templates_update on public.templates for update to authenticated
  using ((scope = 'personal' and user_id = (select auth.uid())) or (scope = 'team' and (select public.my_role()) = 'admin'))
  with check ((scope = 'personal' and user_id = (select auth.uid())) or (scope = 'team' and (select public.my_role()) = 'admin'));
-- DELETE: same.
create policy templates_delete on public.templates for delete to authenticated
  using ((scope = 'personal' and user_id = (select auth.uid())) or (scope = 'team' and (select public.my_role()) = 'admin'));
