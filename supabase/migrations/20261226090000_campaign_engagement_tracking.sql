-- Campaign performance tracking (Paul, 2026-11-22; docs/campaign-performance.md).
-- Three small append-only logs, written ONLY by edge functions through SECURITY DEFINER functions that only the
-- service role may call. The browser never writes them; the admin may read them; a salesperson reads nothing here
-- directly (the campaign-performance edge function folds them, role-checked).
--   report_views  — one row per load of a public report page (findable.live/r/<code>, app.leadfinderos.com/r/<code>),
--                   bots included but marked (bot_reason), js_at set when the page's own script pinged back.
--   tracked_links — one short code per link we put in an outbound message (findable.live/l/<code>).
--   link_clicks   — one row per hit on a tracked link, bots included but marked.
-- Additive only. No existing table is altered.

create table if not exists public.report_views (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null,
  lead_id uuid,
  user_id uuid,
  opened_at timestamptz not null default now(),
  user_agent text,
  bot_reason text,
  js_at timestamptz
);
create index if not exists report_views_lead_idx on public.report_views (lead_id, opened_at);
create index if not exists report_views_audit_idx on public.report_views (audit_id);

create table if not exists public.tracked_links (
  code text primary key,
  lead_id uuid,
  user_id uuid,
  template_name text,
  target_url text not null,
  created_at timestamptz not null default now(),
  constraint tracked_links_code_shape check (code ~ '^[a-z0-9]{8}$'),
  constraint tracked_links_target_ours check (target_url ~ '^https://(findable\.live|app\.leadfinderos\.com)/')
);
create index if not exists tracked_links_lead_idx on public.tracked_links (lead_id);

create table if not exists public.link_clicks (
  id uuid primary key default gen_random_uuid(),
  code text not null references public.tracked_links (code),
  lead_id uuid,
  user_id uuid,
  clicked_at timestamptz not null default now(),
  user_agent text,
  bot_reason text
);
create index if not exists link_clicks_lead_idx on public.link_clicks (lead_id, clicked_at);

-- RLS: on, admin read only. No insert/update/delete policy for anyone signed in (anon + authenticated hold DML grants,
-- so RLS is the only barrier — with no write policy every browser write is refused).
alter table public.report_views enable row level security;
alter table public.tracked_links enable row level security;
alter table public.link_clicks enable row level security;
drop policy if exists "report_views admin read" on public.report_views;
create policy "report_views admin read" on public.report_views for select using ((select public.my_role()) = 'admin');
drop policy if exists "tracked_links admin read" on public.tracked_links;
create policy "tracked_links admin read" on public.tracked_links for select using ((select public.my_role()) = 'admin');
drop policy if exists "link_clicks admin read" on public.link_clicks;
create policy "link_clicks admin read" on public.link_clicks for select using ((select public.my_role()) = 'admin');

-- ── writers (service role only) ────────────────────────────────────────────────────────────────
/* A report page load. Lead and owner come from the audit, never from the caller. Returns the view id (the page's
   script pings it back) or null when the audit does not exist. */
create or replace function public.log_report_view(p_audit_id uuid, p_user_agent text, p_bot_reason text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.report_views (audit_id, lead_id, user_id, user_agent, bot_reason)
  select a.id, a.lead_id, a.user_id, left(p_user_agent, 300), left(p_bot_reason, 60)
  from public.ai_audits a where a.id = p_audit_id
  returning id into v_id;
  return v_id;
end $$;

/* The page's own script ran: a real browser. Set once; a second ping changes nothing. Only within an hour of the
   load, so an old id cannot be replayed into a "JS" mark much later. */
create or replace function public.report_view_ping(p_view_id uuid)
returns boolean language sql security definer set search_path = public
as $$
  with u as (
    update public.report_views set js_at = now()
    where id = p_view_id and js_at is null and opened_at > now() - interval '1 hour'
    returning 1)
  select exists (select 1 from u)
$$;

/* A new tracked link for one outbound message. The code is made here (8 lower-case letters/digits), retried on the
   rare clash. The target must be one of OUR addresses (the check constraint) — never an open redirect. */
create or replace function public.create_tracked_link(p_lead_id uuid, p_template text, p_target text)
returns text language plpgsql security definer set search_path = public
as $$
declare v_code text; v_user uuid; i int;
begin
  select user_id into v_user from public.outreach_leads where id = p_lead_id;
  for i in 1..5 loop
    v_code := lower(substr(translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/=', ''), 1, 8));
    if v_code !~ '^[a-z0-9]{8}$' then continue; end if;
    begin
      insert into public.tracked_links (code, lead_id, user_id, template_name, target_url)
      values (v_code, p_lead_id, v_user, left(p_template, 80), p_target);
      return v_code;
    exception when unique_violation then null;
    end;
  end loop;
  return null;
end $$;

/* A hit on a tracked link: log it (bots marked) and hand back where to go. Unknown code → null (the proxy sends the
   visitor to the home page). */
create or replace function public.log_link_click(p_code text, p_user_agent text, p_bot_reason text)
returns text language plpgsql security definer set search_path = public
as $$
declare v_target text; v_lead uuid; v_user uuid;
begin
  select target_url, lead_id, user_id into v_target, v_lead, v_user from public.tracked_links where code = lower(p_code);
  if v_target is null then return null; end if;
  insert into public.link_clicks (code, lead_id, user_id, user_agent, bot_reason)
  values (lower(p_code), v_lead, v_user, left(p_user_agent, 300), left(p_bot_reason, 60));
  return v_target;
end $$;

revoke all on function public.log_report_view(uuid, text, text) from public, anon, authenticated;
revoke all on function public.report_view_ping(uuid) from public, anon, authenticated;
revoke all on function public.create_tracked_link(uuid, text, text) from public, anon, authenticated;
revoke all on function public.log_link_click(text, text, text) from public, anon, authenticated;
grant execute on function public.log_report_view(uuid, text, text) to service_role;
grant execute on function public.report_view_ping(uuid) to service_role;
grant execute on function public.create_tracked_link(uuid, text, text) to service_role;
grant execute on function public.log_link_click(text, text, text) to service_role;

-- Read back:
--   select table_name from information_schema.tables where table_schema='public' and table_name in ('report_views','tracked_links','link_clicks');
--   select tablename, policyname, cmd from pg_policies where tablename in ('report_views','tracked_links','link_clicks');
--   select p.proname, has_function_privilege('anon', p.oid, 'execute') anon_exec from pg_proc p
--    where p.proname in ('log_report_view','report_view_ping','create_tracked_link','log_link_click');
