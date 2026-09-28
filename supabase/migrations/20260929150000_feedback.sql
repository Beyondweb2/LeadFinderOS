-- Sales Experience, release 5 (2026-09-28): FEEDBACK, rebuilt. Additive only. docs/sales-experience.md §7.
-- ⛔ This replaces the Feedback page deleted in the deep clean (2026-09-16; Paul overturned that for this
-- work). The old empty `team_feedback` table is LEFT IN PLACE until this one is proven (Paul).
-- ⛔ SAVED FIRST, THEN EMAILED (fn feedback-submit, service role): a Resend failure never loses feedback.
-- ⛔ A person reads only their OWN feedback (and its status); the admin reads all. Nobody writes from the
-- browser: the function inserts; set_feedback_status (admin) moves the status and tells the author.

create table if not exists public.feedback_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id),
  author_name text,
  author_email text,
  author_role text,
  kind text not null check (kind in ('feature', 'bug', 'confusing', 'other')),
  message text not null check (length(btrim(message)) between 3 and 4000),
  -- what the app captured: the page, the screen size, the browser, the app build — never a secret
  context jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new', 'reviewing', 'planned', 'fixed', 'wont_do')),
  status_changed_at timestamptz,
  admin_note text,
  email_status text not null default 'pending' check (email_status in ('pending', 'sent', 'failed', 'not_configured')),
  email_error text,
  emailed_at timestamptz
);
create index if not exists feedback_items_by_author on public.feedback_items (user_id, created_at desc);
create index if not exists feedback_items_by_status on public.feedback_items (status, created_at desc);
alter table public.feedback_items enable row level security;
revoke all on public.feedback_items from anon;
revoke insert, update, delete on public.feedback_items from authenticated;
grant select on public.feedback_items to authenticated;
drop policy if exists "feedback: own or admin" on public.feedback_items;
create policy "feedback: own or admin" on public.feedback_items for select to authenticated
  using (user_id = (select auth.uid()) or (select public.my_role()) = 'admin');

create or replace function public.set_feedback_status(_id uuid, _status text, _note text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r record; v_title text;
begin
  if public.my_role() is distinct from 'admin' then raise exception 'admin_only'; end if;
  if _status not in ('new', 'reviewing', 'planned', 'fixed', 'wont_do') then raise exception 'bad_status'; end if;
  update public.feedback_items set status = _status, status_changed_at = now(),
      admin_note = coalesce(nullif(btrim(coalesce(_note, '')), ''), admin_note)
    where id = _id returning * into r;
  if r.id is null then raise exception 'not_found'; end if;
  -- The feedback loop: the author hears when it is genuinely planned, done or declined.
  v_title := case _status
    when 'fixed' then case when r.kind = 'feature' then 'Your suggestion was added' when r.kind = 'bug' then 'The bug you reported is fixed' else 'Your feedback was acted on' end
    when 'planned' then 'Your feedback is planned'
    when 'wont_do' then 'Update on your feedback'
    else null end;
  if v_title is not null and r.user_id <> auth.uid() then
    perform public.notify_person(r.user_id, 'feedback_update', v_title,
      left(r.message, 90) || coalesce(' — ' || r.admin_note, ''), null, null, 'feedback:' || r.id || ':' || _status, 1::smallint);
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.set_feedback_status(uuid, text, text) from public, anon;
grant execute on function public.set_feedback_status(uuid, text, text) to authenticated;
