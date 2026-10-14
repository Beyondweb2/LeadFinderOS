-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- THE PRICE MODEL: A PER-PERSON SWITCH, A TEAM DEFAULT, AND THE MODEL ON EACH LEAD (2026-10-14, test day;
-- src/lib/priceModel.ts is the rule; docs/test-day-outreach.md).
--
-- Additive only:
--   · team_members.price_model             the person's own choice ('standard' | 'upfront_499'; NULL = the team default)
--   · public.sales_price_settings (1 row)  the admin's team default (RLS on, NO policies: read/written only through the
--                                          functions below)
--   · outreach_leads.price_model_offered / price_model_offered_at — the model a sign-up link was made under (stamped by
--                                          fn quick-close), so conversion can be compared by model
--   · functions: my_price_model() (both roles), set_my_price_model(text) (both roles, own row only),
--                set_default_price_model(text) (admin only), price_model_for(uuid) (service role: quick-close)
-- Nothing existing is altered. Rollback: drop the four functions and the table; the three columns can stay.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '5s';

alter table public.team_members add column if not exists price_model text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'team_members_price_model_check') then
    alter table public.team_members add constraint team_members_price_model_check
      check (price_model is null or price_model in ('standard', 'upfront_499')) not valid;
  end if;
end $$;

alter table public.outreach_leads add column if not exists price_model_offered text;
alter table public.outreach_leads add column if not exists price_model_offered_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'outreach_leads_price_model_offered_check') then
    alter table public.outreach_leads add constraint outreach_leads_price_model_offered_check
      check (price_model_offered is null or price_model_offered in ('standard', 'upfront_499')) not valid;
  end if;
end $$;

create table if not exists public.sales_price_settings (
  id integer primary key default 1 check (id = 1),
  default_price_model text not null default 'standard' check (default_price_model in ('standard', 'upfront_499')),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.sales_price_settings enable row level security;
revoke all on public.sales_price_settings from anon, authenticated;
insert into public.sales_price_settings (id) values (1) on conflict (id) do nothing;

-- The person's effective model (own → team default → standard). Service role only: quick-close asks it.
create or replace function public.price_model_for(_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select t.price_model from public.team_members t where t.user_id = _user and t.price_model in ('standard', 'upfront_499')),
    (select s.default_price_model from public.sales_price_settings s where s.id = 1),
    'standard');
$$;
revoke all on function public.price_model_for(uuid) from public, anon, authenticated;
grant execute on function public.price_model_for(uuid) to service_role;

-- What the signed-in person sees on the switch.
create or replace function public.my_price_model()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_role text := public.my_role();
begin
  if v_uid is null or v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  return jsonb_build_object(
    'model', public.price_model_for(v_uid),
    'own', (select price_model from public.team_members where user_id = v_uid),
    'team_default', (select default_price_model from public.sales_price_settings where id = 1),
    'is_admin', v_role = 'admin');
end $$;
revoke all on function public.my_price_model() from public, anon;
grant execute on function public.my_price_model() to authenticated;

-- One click: the person's own model (NULL = follow the team default). Their own row only.
create or replace function public.set_my_price_model(_model text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or public.my_role() is null then raise exception 'no_role' using errcode = '42501'; end if;
  if _model is not null and _model not in ('standard', 'upfront_499') then return jsonb_build_object('ok', false, 'error', 'unknown_model'); end if;
  update public.team_members set price_model = _model where user_id = v_uid;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_a_member'); end if;
  return jsonb_build_object('ok', true, 'model', public.price_model_for(v_uid));
end $$;
revoke all on function public.set_my_price_model(text) from public, anon;
grant execute on function public.set_my_price_model(text) to authenticated;

-- The team default. Admin only.
create or replace function public.set_default_price_model(_model text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'admin_only' using errcode = '42501'; end if;
  if _model not in ('standard', 'upfront_499') then return jsonb_build_object('ok', false, 'error', 'unknown_model'); end if;
  update public.sales_price_settings set default_price_model = _model, updated_at = now(), updated_by = auth.uid() where id = 1;
  return jsonb_build_object('ok', true, 'team_default', _model);
end $$;
revoke all on function public.set_default_price_model(text) from public, anon;
grant execute on function public.set_default_price_model(text) to authenticated;

-- Read back:
--   select column_name from information_schema.columns where (table_name, column_name) in (('team_members','price_model'),('outreach_leads','price_model_offered'),('outreach_leads','price_model_offered_at'));
--   select * from public.sales_price_settings;
