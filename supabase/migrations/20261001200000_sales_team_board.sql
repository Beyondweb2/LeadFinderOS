-- SALES TEAM BOARD (2026-10-01, docs/sales-team-board.md). Additive only — no existing row is rewritten.
--
-- Paul → the sales team: announcements, targeting priorities, template updates, custom messages
-- (INFORMATION) and tasks / lead assignments (WORK). One post, a frozen list of recipients, and each
-- recipient's own read + task state.
--
-- ⛔ SERVER-DECIDED. The browser never writes these tables: every write is a SECURITY DEFINER function
--    below that checks the caller (admin for publishing; the recipient themself for read / status).
-- ⛔ THE RECIPIENT LIST IS A SNAPSHOT taken at publish (team_posts.recipients + one recipient row each):
--    a later change to the team never changes who a published post went to.
-- ⛔ A LEAD ASSIGNMENT IS THE CANONICAL MOVE (assign_lead) plus one board task. The task never stores a
--    second due date: it shows the lead's own Next Action (a date given in the dialog is written THERE,
--    through lead_set_follow_up). Completing the task changes nothing on the lead.
-- ⛔ A REASSIGNED LEAD cancels the previous holder's open tasks for it (trigger), whichever screen moved it.
-- ⛔ NO DUPLICATES: client_key makes a publish idempotent; notifications use notify_person's dedupe key.
--
-- Rollback (nothing else depends on these objects):
--   drop trigger if exists trg_team_lead_reassigned on public.outreach_leads;
--   drop function if exists public.trg_team_lead_reassigned(), public.assign_lead_with_brief(uuid,uuid,text,date,text,text),
--     public.team_board_admin(integer), public.team_board_mine(), public.team_task_set_status(uuid,text),
--     public.team_board_mark_read(uuid[]), public.team_cancel_task(uuid,uuid), public.team_discard_draft(uuid),
--     public.team_edit_published(uuid,text,text,date,text), public.team_save_post(uuid,text,text,text,jsonb,text,uuid,date,text,text,uuid[],boolean,text,uuid),
--     public.team_everyone(), public._team_eligible(uuid), public._team_publish(uuid), public.team_recipients_preview();
--   drop table if exists public.team_post_events, public.team_post_recipients, public.team_posts;
--   (and the two notification kinds may stay — a wider CHECK harms nothing)

create table if not exists public.team_posts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  author_user_id uuid not null references auth.users(id),
  kind text not null check (kind in ('announcement', 'targeting', 'template_update', 'task', 'lead_assignment', 'custom')),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body text check (body is null or char_length(body) <= 4000),
  details jsonb not null default '{}'::jsonb,
  link text check (link is null or (link like '/%' and link not like '//%')),
  lead_id uuid references public.outreach_leads(id) on delete set null,
  due_date date,
  priority text check (priority is null or priority in ('low', 'normal', 'high')),
  status text not null default 'draft' check (status in ('draft', 'published', 'discarded')),
  published_at timestamptz,
  audience text not null default 'selected' check (audience in ('selected', 'everyone')),
  recipients uuid[] not null default '{}',
  client_key text unique,
  follow_up_of uuid references public.team_posts(id) on delete set null,
  edited_at timestamptz,
  edit_count integer not null default 0
);
create index if not exists team_posts_published_idx on public.team_posts (published_at desc) where status = 'published';
create index if not exists team_posts_lead_idx on public.team_posts (lead_id) where lead_id is not null;

create table if not exists public.team_post_recipients (
  post_id uuid not null references public.team_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  task_status text check (task_status is null or task_status in ('todo', 'in_progress', 'completed', 'cancelled')),
  status_at timestamptz,
  completed_at timestamptz,
  completed_by uuid,
  cancelled_reason text,
  primary key (post_id, user_id)
);
create index if not exists team_post_recipients_user_idx on public.team_post_recipients (user_id, created_at desc);

create table if not exists public.team_post_events (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.team_posts(id) on delete cascade,
  at timestamptz not null default now(),
  actor_user_id uuid,
  kind text not null check (kind in ('created', 'draft_saved', 'published', 'edited', 'status', 'cancelled', 'discarded', 'reassigned')),
  data jsonb not null default '{}'::jsonb
);
create index if not exists team_post_events_post_idx on public.team_post_events (post_id, at);

-- RLS: reads are own-rows / admin; there are NO write grants — only the functions below write.
alter table public.team_posts enable row level security;
alter table public.team_post_recipients enable row level security;
alter table public.team_post_events enable row level security;
revoke all on public.team_posts, public.team_post_recipients, public.team_post_events from anon, authenticated;
grant select on public.team_posts, public.team_post_recipients, public.team_post_events to authenticated;
drop policy if exists team_posts_read on public.team_posts;
create policy team_posts_read on public.team_posts for select to authenticated using (
  (select public.my_role()) = 'admin'
  or (status = 'published' and (select auth.uid()) = any(recipients)));
drop policy if exists team_post_recipients_read on public.team_post_recipients;
create policy team_post_recipients_read on public.team_post_recipients for select to authenticated using (
  (select public.my_role()) = 'admin' or user_id = (select auth.uid()));
drop policy if exists team_post_events_read on public.team_post_events;
create policy team_post_events_read on public.team_post_events for select to authenticated using ((select public.my_role()) = 'admin');

-- Two new notification kinds (the CHECK is widened, every existing kind kept).
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'whatsapp_reply', 'whatsapp_failed', 'signup_opened', 'client_paid', 'commission_earned', 'commission_reversed',
  'audit_finished', 'template_decided', 'follow_up_due', 'lead_assigned', 'feedback_update', 'feature_update',
  'quick_close_review', 'quick_close_paid', 'transfer_request', 'team_update', 'team_task'));

-- ── Who may receive: an ACTIVE team member holding the sales role ───────────────────────────────────
create or replace function public._team_eligible(_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members t join public.user_roles r on r.user_id = t.user_id
    where t.user_id = _user and t.status = 'active' and r.role = 'sales')
$$;
revoke all on function public._team_eligible(uuid) from public, anon, authenticated;

/* "Everyone": the active sales team WITHOUT the test accounts (metric_exclusions kind 'user' — Paul,
   2026-09-30). A test account can still be picked by name. */
create or replace function public.team_everyone()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(t.user_id order by t.display_name), '{}') from public.team_members t
   where public._team_eligible(t.user_id)
     and not exists (select 1 from public.metric_exclusions x where x.kind = 'user' and x.value = t.user_id::text)
$$;
revoke all on function public.team_everyone() from public, anon, authenticated;

-- Publish a saved post: freeze recipients, one recipient row each, one notification each. Internal.
create or replace function public._team_publish(_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare p record; u uuid; v_task boolean; v_by text; n_notified integer := 0; v_ok boolean;
begin
  select * into p from public.team_posts where id = _id for update;
  if p.status <> 'draft' then return jsonb_build_object('ok', false, 'error', 'already_published'); end if;
  if coalesce(array_length(p.recipients, 1), 0) = 0 then return jsonb_build_object('ok', false, 'error', 'no_recipients'); end if;
  v_task := p.kind in ('task', 'lead_assignment');
  update public.team_posts set status = 'published', published_at = now(), updated_at = now() where id = _id;
  select nullif(btrim(display_name), '') into v_by from public.team_members where user_id = p.author_user_id;
  foreach u in array p.recipients loop
    insert into public.team_post_recipients (post_id, user_id, task_status, status_at)
      values (_id, u, case when v_task then 'todo' end, case when v_task then now() end)
      on conflict (post_id, user_id) do nothing;
    -- The lead-assignment notice is trg_notify_lead_assigned's (one notice, never two).
    if p.kind <> 'lead_assignment' then
      perform public.notify_person(u, case when v_task then 'team_task' else 'team_update' end,
        coalesce(v_by, 'The admin') || case when v_task then ' gave you a task' else ' posted an update' end,
        left(p.title, 200), '/sales-dashboard?item=' || _id, p.lead_id, 'team:' || _id, case when v_task then 2 else 1 end::smallint);
      select exists (select 1 from public.notifications where user_id = u and dedupe_key = 'team:' || _id) into v_ok;
      if v_ok then n_notified := n_notified + 1; end if;
    end if;
  end loop;
  insert into public.team_post_events (post_id, actor_user_id, kind, data)
    values (_id, auth.uid(), 'published', jsonb_build_object('recipients', to_jsonb(p.recipients), 'audience', p.audience));
  return jsonb_build_object('ok', true, 'id', _id, 'recipients', coalesce(array_length(p.recipients, 1), 0), 'notified', n_notified);
end $$;
revoke all on function public._team_publish(uuid) from public, anon, authenticated;

/* ── Admin: save a draft or publish (one function; _publish chooses) ────────────────────────────────
   _id null = new (a retry with the same _client_key returns the first post, nothing duplicated);
   _id set  = an existing DRAFT (a published post is never rewritten here — team_edit_published). */
create or replace function public.team_save_post(
  _id uuid, _kind text, _title text, _body text, _details jsonb, _link text, _lead_id uuid, _due date,
  _priority text, _audience text, _recipients uuid[], _publish boolean, _client_key text, _follow_up_of uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid; v_rec uuid[]; u uuid; v_owner uuid; v_existing record;
begin
  if public.my_role() is distinct from 'admin' then raise exception 'admin_only' using errcode = '42501'; end if;
  if _kind not in ('announcement', 'targeting', 'template_update', 'task', 'custom') then
    return jsonb_build_object('ok', false, 'error', 'bad_kind'); end if;
  if nullif(btrim(coalesce(_title, '')), '') is null then return jsonb_build_object('ok', false, 'error', 'title_required'); end if;
  if _link is not null and (_link not like '/%' or _link like '//%') then return jsonb_build_object('ok', false, 'error', 'bad_link'); end if;
  if _priority is not null and _priority not in ('low', 'normal', 'high') then return jsonb_build_object('ok', false, 'error', 'bad_priority'); end if;
  if _audience not in ('selected', 'everyone') then return jsonb_build_object('ok', false, 'error', 'bad_audience'); end if;
  if _kind = 'template_update' and coalesce(_details->>'approval', '') not in ('approved', 'draft') then
    return jsonb_build_object('ok', false, 'error', 'template_approval_required'); end if;

  if _id is null and _client_key is not null then
    select id, status into v_existing from public.team_posts where client_key = _client_key;
    if v_existing.id is not null then
      return jsonb_build_object('ok', true, 'id', v_existing.id, 'duplicate', true, 'status', v_existing.status);
    end if;
  end if;

  -- Recipients: 'everyone' is decided here (never trusted from the browser); a named list is checked.
  if _audience = 'everyone' then v_rec := public.team_everyone();
  else
    v_rec := '{}';
    foreach u in array coalesce(_recipients, '{}') loop
      if not public._team_eligible(u) then return jsonb_build_object('ok', false, 'error', 'not_an_active_salesperson'); end if;
      if not (u = any(v_rec)) then v_rec := v_rec || u; end if;
    end loop;
  end if;

  -- A task linked to a lead goes only to the one person who holds it (anyone else could not open it).
  if _lead_id is not null then
    select assigned_to_user_id into v_owner from public.outreach_leads where id = _lead_id;
    if not found then return jsonb_build_object('ok', false, 'error', 'lead_not_found'); end if;
    if _kind = 'task' and (coalesce(array_length(v_rec, 1), 0) <> 1 or v_owner is distinct from v_rec[1]) then
      return jsonb_build_object('ok', false, 'error', 'lead_not_theirs'); end if;
  end if;

  if _id is null then
    insert into public.team_posts (author_user_id, kind, title, body, details, link, lead_id, due_date, priority, audience, recipients, client_key, follow_up_of)
      values (auth.uid(), _kind, btrim(_title), nullif(btrim(coalesce(_body, '')), ''), coalesce(_details, '{}'::jsonb), _link, _lead_id,
              case when _kind = 'task' then _due end, _priority, _audience, v_rec, _client_key, _follow_up_of)
      returning id into v_id;
    insert into public.team_post_events (post_id, actor_user_id, kind) values (v_id, auth.uid(), 'created');
  else
    update public.team_posts set kind = _kind, title = btrim(_title), body = nullif(btrim(coalesce(_body, '')), ''),
        details = coalesce(_details, '{}'::jsonb), link = _link, lead_id = _lead_id, due_date = case when _kind = 'task' then _due end,
        priority = _priority, audience = _audience, recipients = v_rec, updated_at = now()
      where id = _id and status = 'draft' returning id into v_id;
    if v_id is null then return jsonb_build_object('ok', false, 'error', 'not_a_draft'); end if;
    insert into public.team_post_events (post_id, actor_user_id, kind) values (v_id, auth.uid(), 'draft_saved');
  end if;

  if _publish then return public._team_publish(v_id); end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'status', 'draft', 'recipients', coalesce(array_length(v_rec, 1), 0));
end $$;
revoke all on function public.team_save_post(uuid, text, text, text, jsonb, text, uuid, date, text, text, uuid[], boolean, text, uuid) from public, anon;
grant execute on function public.team_save_post(uuid, text, text, text, jsonb, text, uuid, date, text, text, uuid[], boolean, text, uuid) to authenticated;

/* ── Admin: a LABELLED edit of a published post. The previous words are kept in team_post_events;
   recipients see "Edited" and get one notice per edit. Recipients and kind never change. */
create or replace function public.team_edit_published(_id uuid, _title text, _body text, _due date, _priority text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare p record; u uuid; v_by text;
begin
  if public.my_role() is distinct from 'admin' then raise exception 'admin_only' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(_title, '')), '') is null then return jsonb_build_object('ok', false, 'error', 'title_required'); end if;
  if _priority is not null and _priority not in ('low', 'normal', 'high') then return jsonb_build_object('ok', false, 'error', 'bad_priority'); end if;
  select * into p from public.team_posts where id = _id for update;
  if p.id is null or p.status <> 'published' then return jsonb_build_object('ok', false, 'error', 'not_published'); end if;
  if p.title = btrim(_title) and p.body is not distinct from nullif(btrim(coalesce(_body, '')), '')
     and p.due_date is not distinct from (case when p.kind = 'task' then _due end) and p.priority is not distinct from _priority then
    return jsonb_build_object('ok', true, 'unchanged', true); end if;
  insert into public.team_post_events (post_id, actor_user_id, kind, data) values (_id, auth.uid(), 'edited',
    jsonb_build_object('before', jsonb_build_object('title', p.title, 'body', p.body, 'due_date', p.due_date, 'priority', p.priority)));
  update public.team_posts set title = btrim(_title), body = nullif(btrim(coalesce(_body, '')), ''),
      due_date = case when kind = 'task' then _due else due_date end, priority = _priority,
      edited_at = now(), edit_count = edit_count + 1, updated_at = now()
    where id = _id;
  select nullif(btrim(display_name), '') into v_by from public.team_members where user_id = auth.uid();
  foreach u in array p.recipients loop
    perform public.notify_person(u, 'team_update', coalesce(v_by, 'The admin') || ' edited a post', left(btrim(_title), 200),
      '/sales-dashboard?item=' || _id, p.lead_id, 'team:' || _id || ':edit:' || (p.edit_count + 1), 1::smallint);
  end loop;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.team_edit_published(uuid, text, text, date, text) from public, anon;
grant execute on function public.team_edit_published(uuid, text, text, date, text) to authenticated;

create or replace function public.team_discard_draft(_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'admin_only' using errcode = '42501'; end if;
  update public.team_posts set status = 'discarded', updated_at = now() where id = _id and status = 'draft';
  if not found then return jsonb_build_object('ok', false, 'error', 'not_a_draft'); end if;
  insert into public.team_post_events (post_id, actor_user_id, kind) values (_id, auth.uid(), 'discarded');
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.team_discard_draft(uuid) from public, anon;
grant execute on function public.team_discard_draft(uuid) to authenticated;

-- Admin: cancel a task for one recipient (or all). A completed task stays completed.
create or replace function public.team_cancel_task(_id uuid, _user uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  if public.my_role() is distinct from 'admin' then raise exception 'admin_only' using errcode = '42501'; end if;
  update public.team_post_recipients set task_status = 'cancelled', status_at = now(), cancelled_reason = 'cancelled_by_admin'
    where post_id = _id and (_user is null or user_id = _user) and task_status in ('todo', 'in_progress');
  get diagnostics n = row_count;
  if n > 0 then insert into public.team_post_events (post_id, actor_user_id, kind, data)
    values (_id, auth.uid(), 'cancelled', jsonb_build_object('user', _user, 'count', n)); end if;
  return jsonb_build_object('ok', true, 'cancelled', n);
end $$;
revoke all on function public.team_cancel_task(uuid, uuid) from public, anon;
grant execute on function public.team_cancel_task(uuid, uuid) to authenticated;

-- ── The recipient: mark read (own rows; the matching notifications too) ─────────────────────────────
create or replace function public.team_board_mark_read(_ids uuid[])
returns integer language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'not_allowed'; end if;
  update public.team_post_recipients set read_at = now() where user_id = auth.uid() and read_at is null and post_id = any(coalesce(_ids, '{}'));
  get diagnostics n = row_count;
  update public.notifications set read_at = now()
    where user_id = auth.uid() and read_at is null and kind in ('team_update', 'team_task')
      and split_part(dedupe_key, ':', 2) = any(select x::text from unnest(coalesce(_ids, '{}')) x);
  return n;
end $$;
revoke all on function public.team_board_mark_read(uuid[]) from public, anon;
grant execute on function public.team_board_mark_read(uuid[]) to authenticated;

/* The recipient moves THEIR OWN task: to do / in progress / completed. Cancelled is the admin's (or the
   reassignment's) and cannot be reopened here. ⛔ Nothing on the lead changes: no stage, no Next Action,
   no message, no suppression. */
create or replace function public.team_task_set_status(_id uuid, _status text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r record;
begin
  if auth.uid() is null then raise exception 'not_allowed'; end if;
  if _status not in ('todo', 'in_progress', 'completed') then return jsonb_build_object('ok', false, 'error', 'bad_status'); end if;
  select * into r from public.team_post_recipients where post_id = _id and user_id = auth.uid() for update;
  if r.post_id is null or r.task_status is null then return jsonb_build_object('ok', false, 'error', 'not_your_task'); end if;
  if r.task_status = 'cancelled' then return jsonb_build_object('ok', false, 'error', 'task_cancelled'); end if;
  if r.task_status = _status then return jsonb_build_object('ok', true, 'unchanged', true); end if;
  update public.team_post_recipients set task_status = _status, status_at = now(), read_at = coalesce(read_at, now()),
      completed_at = case when _status = 'completed' then now() end, completed_by = case when _status = 'completed' then auth.uid() end
    where post_id = _id and user_id = auth.uid();
  insert into public.team_post_events (post_id, actor_user_id, kind, data)
    values (_id, auth.uid(), 'status', jsonb_build_object('from', r.task_status, 'to', _status));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.team_task_set_status(uuid, text) from public, anon;
grant execute on function public.team_task_set_status(uuid, text) to authenticated;

/* ── Reads. The recipient's own board. A lead is named only if the caller may work it now
   (can_work_lead) — a lead that has moved on reads "no longer in your list". The Next Action shown is
   the LEAD's own (one date, never a copy). */
create or replace function public.team_board_mine()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'published_at' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', p.id, 'kind', p.kind, 'title', p.title, 'body', p.body, 'details', p.details, 'link', p.link,
      'due_date', p.due_date, 'priority', p.priority, 'published_at', p.published_at, 'edited_at', p.edited_at,
      'author', coalesce((select nullif(btrim(t.display_name), '') from public.team_members t where t.user_id = p.author_user_id), 'Admin'),
      'read_at', r.read_at, 'task_status', r.task_status, 'status_at', r.status_at, 'completed_at', r.completed_at,
      'cancelled_reason', r.cancelled_reason,
      'lead', case when p.lead_id is null then null
        when public.can_work_lead(p.lead_id) then (select jsonb_build_object('id', l.id, 'name', l.business_name, 'next_action', l.next_action::text,
          'next_action_date', l.next_action_date, 'next_action_note', l.next_action_note, 'mine', true) from public.outreach_leads l where l.id = p.lead_id)
        else jsonb_build_object('id', null, 'name', null, 'mine', false) end
    ) as x
    from public.team_post_recipients r join public.team_posts p on p.id = r.post_id
    where r.user_id = auth.uid() and p.status = 'published' and p.published_at > now() - interval '120 days'
  ) s
$$;
revoke all on function public.team_board_mine() from public, anon;
grant execute on function public.team_board_mine() to authenticated;

-- The admin's oversight: every post of the last _days (drafts always), each recipient's state.
create or replace function public.team_board_admin(_days integer default 60)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'admin_only' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(x order by coalesce(x->>'published_at', x->>'created_at') desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', p.id, 'kind', p.kind, 'title', p.title, 'body', p.body, 'details', p.details, 'link', p.link, 'status', p.status,
      'due_date', p.due_date, 'priority', p.priority, 'created_at', p.created_at, 'published_at', p.published_at,
      'edited_at', p.edited_at, 'edit_count', p.edit_count, 'audience', p.audience, 'recipient_ids', to_jsonb(p.recipients), 'follow_up_of', p.follow_up_of,
      'lead', case when p.lead_id is null then null else (select jsonb_build_object('id', l.id, 'name', l.business_name,
        'owner', l.assigned_to_user_id, 'next_action', l.next_action::text, 'next_action_date', l.next_action_date) from public.outreach_leads l where l.id = p.lead_id) end,
      'recipients', coalesce((select jsonb_agg(jsonb_build_object('user_id', r.user_id,
          'name', coalesce((select t.display_name from public.team_members t where t.user_id = r.user_id), 'Former member'),
          'read_at', r.read_at, 'task_status', r.task_status, 'status_at', r.status_at, 'completed_at', r.completed_at,
          'cancelled_reason', r.cancelled_reason) order by r.created_at) from public.team_post_recipients r where r.post_id = p.id), '[]'::jsonb)
    ) as x
    from public.team_posts p
    where p.status = 'draft' or (p.status = 'published' and p.published_at > now() - make_interval(days => greatest(1, least(coalesce(_days, 60), 365))))
  ) s);
end $$;
revoke all on function public.team_board_admin(integer) from public, anon;
grant execute on function public.team_board_admin(integer) to authenticated;

/* ── ASSIGN A LEAD WITH A BRIEF — the canonical move (assign_lead) + one board task ─────────────────
   Used by the Admin dashboard's Assign and by the Inbox / lead-popup owner picker. Bulk moves stay on
   plain assign_lead (no board task per lead). Same owner → assign_lead's no-op: no task, no notice,
   no History. To the admin/book owner (or unassigned) → the move only; the previous holder's task is
   cancelled by the trigger below. */
create or replace function public.assign_lead_with_brief(_lead_id uuid, _to_user_id uuid, _note text, _due date, _reason text, _client_key text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r jsonb; l record; v_post uuid; v_from uuid; v_note text := nullif(btrim(coalesce(_note, '')), ''); v_notified boolean := false;
begin
  if public.my_role() is distinct from 'admin' then raise exception 'admin_only' using errcode = '42501'; end if;
  if _client_key is not null and exists (select 1 from public.team_posts where client_key = _client_key) then
    return jsonb_build_object('ok', true, 'duplicate', true); end if;
  select assigned_to_user_id into v_from from public.outreach_leads where id = _lead_id;
  r := public.assign_lead(_lead_id, _to_user_id);
  if not coalesce((r->>'ok')::boolean, false) or coalesce((r->>'unchanged')::boolean, false) then return r; end if;
  if _to_user_id is null or not public._team_eligible(_to_user_id) then return r || jsonb_build_object('task', false); end if;

  -- A due date given here IS the lead's Next Action (one date). The type is kept, or becomes a follow-up.
  if _due is not null then
    select next_action::text as na, next_action_note into l from public.outreach_leads where id = _lead_id;
    perform public.lead_set_follow_up(_lead_id, case when l.na is null or l.na = 'none' then 'follow_up' else l.na end, _due, l.next_action_note);
  end if;

  select id, business_name, assigned_at into l from public.outreach_leads where id = _lead_id;
  insert into public.team_posts (author_user_id, kind, title, body, details, lead_id, status, audience, recipients, client_key)
    values (auth.uid(), 'lead_assignment', coalesce(nullif(btrim(l.business_name), ''), 'A lead'), v_note,
            jsonb_strip_nulls(jsonb_build_object('reason', nullif(btrim(coalesce(_reason, '')), ''), 'from_user', v_from)),
            _lead_id, 'draft', 'selected', array[_to_user_id], _client_key)
    returning id into v_post;
  insert into public.team_post_events (post_id, actor_user_id, kind, data) values (v_post, auth.uid(), 'created', jsonb_build_object('from', v_from, 'to', _to_user_id));
  perform public._team_publish(v_post);

  -- The one notice is the assignment trigger's; it now carries the instructions.
  update public.notifications set body = left(coalesce('Instructions: ' || v_note, 'On your Team board now.') || ' It is in your Inbox and Outreach with its whole conversation.', 280)
    where user_id = _to_user_id and dedupe_key = 'assigned:' || _lead_id || ':' || l.assigned_at::text;
  select exists (select 1 from public.notifications where user_id = _to_user_id and dedupe_key = 'assigned:' || _lead_id || ':' || l.assigned_at::text) into v_notified;
  -- History: the assignment row assign_lead just wrote gains the note and the board task.
  update public.lead_activity set data = data || jsonb_strip_nulls(jsonb_build_object('note', v_note, 'team_post_id', v_post))
    where id = (select id from public.lead_activity where lead_id = _lead_id and kind = 'lead_assigned' and actor_user_id = auth.uid() order by created_at desc limit 1);
  return r || jsonb_build_object('task', true, 'task_id', v_post, 'notified', v_notified);
end $$;
revoke all on function public.assign_lead_with_brief(uuid, uuid, text, date, text, text) from public, anon;
grant execute on function public.assign_lead_with_brief(uuid, uuid, text, date, text, text) to authenticated;

-- ── A lead that moves cancels the previous holder's open tasks for it (every path: popup, bulk, Team) ─
create or replace function public.trg_team_lead_reassigned()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.assigned_to_user_id is not distinct from old.assigned_to_user_id then return new; end if;
    with c as (
      update public.team_post_recipients r set task_status = 'cancelled', status_at = now(), cancelled_reason = 'reassigned'
        from public.team_posts p
       where p.id = r.post_id and p.lead_id = new.id and p.kind in ('lead_assignment', 'task')
         and r.task_status in ('todo', 'in_progress') and r.user_id is distinct from new.assigned_to_user_id
      returning r.post_id, r.user_id)
    insert into public.team_post_events (post_id, actor_user_id, kind, data)
      select c.post_id, auth.uid(), 'reassigned', jsonb_build_object('user', c.user_id, 'to', new.assigned_to_user_id) from c;
  exception when others then raise warning 'trg_team_lead_reassigned: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists trg_team_lead_reassigned on public.outreach_leads;
create trigger trg_team_lead_reassigned after update of assigned_to_user_id on public.outreach_leads
  for each row execute function public.trg_team_lead_reassigned();

-- The composer's recipient list (admin): every active salesperson, each marked test or not, so the
-- preview says exactly who "Everyone" is before anything is sent.
create or replace function public.team_recipients_preview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'admin_only' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('user_id', t.user_id, 'name', t.display_name,
      'test', exists (select 1 from public.metric_exclusions x where x.kind = 'user' and x.value = t.user_id::text)) order by t.display_name), '[]'::jsonb)
    from public.team_members t where public._team_eligible(t.user_id));
end $$;
revoke all on function public.team_recipients_preview() from public, anon;
grant execute on function public.team_recipients_preview() to authenticated;
