-- Sales Team Board follow-up (2026-10-01): moving your own task marks its notification read too.
-- Found in the live test: the bell kept "Paul gave you a task" unread after the task was completed.
-- Replaces one function; nothing else changes. Rollback: re-run its definition from 20261001200000.

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
  -- The task's own notice is done with too (found live 2026-10-01: a completed task left its bell item unread).
  update public.notifications set read_at = now()
    where user_id = auth.uid() and read_at is null and kind in ('team_task', 'team_update') and split_part(dedupe_key, ':', 2) = _id::text;
  insert into public.team_post_events (post_id, actor_user_id, kind, data)
    values (_id, auth.uid(), 'status', jsonb_build_object('from', r.task_status, 'to', _status));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.team_task_set_status(uuid, text) from public, anon;
grant execute on function public.team_task_set_status(uuid, text) to authenticated;
