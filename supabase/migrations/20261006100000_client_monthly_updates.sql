-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- THE MONTHLY CLIENT UPDATE (closeout, 2026-10-02).
--
-- findable.live/terms promises every client on the monthly a concise update: the AI visibility
-- measurements available for that period, any change in whether AI names the business, the
-- improvements completed, the opportunities identified and the next steps — and says so when the
-- measurements are unchanged, inconclusive or unavailable. It is "prepared and sent BY HAND". Until
-- now there was nowhere to prepare or record one. This is the operator's record: one row per client
-- per London calendar month, a DRAFT Paul writes, then SENT (when, how, and the exact text).
--
-- ⛔ Nothing here sends anything, and nothing here writes a claim. The facts function only READS stored
--    evidence (weekly_check_runs, client_pages marked live, client_opportunities marked implemented);
--    what the client is told about work done is what the operator typed.
-- ⛔ Admin only. RLS on, NO policies, no table grants: every read and write is one of the three
--    SECURITY DEFINER functions below, each checking my_role() = 'admin' first (the sales_team_board
--    pattern). A salesperson never reaches it.
-- ⛔ A SENT row is the record of what the client received: it is never edited (the save refuses it).
-- Idempotent: safe to run twice.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.client_monthly_updates (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.outreach_leads(id) on delete cascade,
  -- the book owner (the lead's own user_id), as on every table
  user_id uuid not null,
  -- the first day of the London calendar month the update covers
  period_month date not null check (period_month = date_trunc('month', period_month)::date),
  status text not null default 'draft' check (status in ('draft', 'sent')),
  measured_note text check (char_length(measured_note) <= 4000),
  work_done text check (char_length(work_done) <= 4000),
  opportunities text check (char_length(opportunities) <= 4000),
  next_steps text check (char_length(next_steps) <= 4000),
  -- the exact words the client received, stored when it is marked sent
  message text check (char_length(message) <= 12000),
  sent_at timestamptz,
  sent_channel text check (sent_channel in ('email', 'whatsapp', 'other')),
  sent_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint client_monthly_updates_one_per_month unique (lead_id, period_month),
  constraint client_monthly_updates_sent_is_complete check (
    (status = 'draft' and sent_at is null) or
    (status = 'sent' and sent_at is not null and sent_channel is not null and message is not null)
  )
);

alter table public.client_monthly_updates enable row level security;
revoke all on table public.client_monthly_updates from anon, authenticated;

-- ── facts: the stored evidence for one client and one month, plus every update row the client has ──
create or replace function public.monthly_update_facts(_lead_id uuid, _month date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m date := date_trunc('month', _month)::date;
  e date := (date_trunc('month', _month) + interval '1 month')::date;
  l record;
begin
  if public.my_role() is distinct from 'admin' then raise exception 'admin_only' using errcode = '42501'; end if;
  if _lead_id is null or _month is null then return jsonb_build_object('ok', false, 'error', 'bad_request'); end if;
  select id, user_id, business_name, amount_paid, payment_date into l from public.outreach_leads where id = _lead_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'lead_not_found'); end if;

  return jsonb_build_object(
    'ok', true,
    'month', m,
    'lead', jsonb_build_object('id', l.id, 'business_name', l.business_name, 'payment_date', l.payment_date),
    -- the weekly AI visibility checks whose week starts in the month (monitoring; never the guarantee)
    'checks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'week_start', r.week_start, 'status', r.status, 'completed_at', r.completed_at, 'reason', r.reason,
        'questions', r.summary -> 'questions', 'named', r.summary -> 'named', 'answered', r.summary -> 'answered'
      ) order by r.week_start)
      from public.weekly_check_runs r
      where r.lead_id = _lead_id and r.week_start >= m and r.week_start < e), '[]'::jsonb),
    -- pages the page generator holds as LIVE, last touched in the month (a suggestion for the operator,
    -- never a claim: "live" here is the generator's status, and a touch is not proof of a new page)
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'label', coalesce(nullif(p.title, ''), nullif(p.h1, ''), nullif(concat_ws(' in ', nullif(p.service, ''), nullif(p.town, '')), ''), p.slug),
        'published_url', p.published_url, 'created_at', p.created_at, 'updated_at', p.updated_at
      ) order by p.updated_at)
      from public.client_pages p
      where p.lead_id = _lead_id and p.status = 'live'
        and (p.updated_at at time zone 'Europe/London')::date >= m and (p.updated_at at time zone 'Europe/London')::date < e), '[]'::jsonb),
    -- opportunities recorded as implemented in the month (what_changed is the operator's own record)
    'implemented', coalesce((
      select jsonb_agg(jsonb_build_object('question', o.question, 'what_changed', o.what_changed, 'implemented_at', o.implemented_at) order by o.implemented_at)
      from public.client_opportunities o
      where o.lead_id = _lead_id and o.implemented_at is not null
        and (o.implemented_at at time zone 'Europe/London')::date >= m and (o.implemented_at at time zone 'Europe/London')::date < e), '[]'::jsonb),
    -- opportunities still open (identified, not yet worked or rechecked)
    'open_opportunities', coalesce((
      select jsonb_agg(jsonb_build_object('question', o.question, 'status', o.status) order by o.created_at)
      from (select * from public.client_opportunities o2
            where o2.lead_id = _lead_id and o2.status in ('new', 'planned', 'in_progress')
            order by o2.created_at limit 20) o), '[]'::jsonb),
    'update', (select to_jsonb(u) from public.client_monthly_updates u where u.lead_id = _lead_id and u.period_month = m),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('period_month', u.period_month, 'status', u.status, 'sent_at', u.sent_at, 'sent_channel', u.sent_channel) order by u.period_month desc)
      from public.client_monthly_updates u where u.lead_id = _lead_id), '[]'::jsonb)
  );
end $$;

-- ── save a DRAFT (create or update); a sent update is the record and is refused ──
create or replace function public.monthly_update_save(_lead_id uuid, _month date, _measured_note text, _work_done text, _opportunities text, _next_steps text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m date := date_trunc('month', _month)::date;
  owner uuid;
  cur record;
  clean text[];
begin
  if public.my_role() is distinct from 'admin' then raise exception 'admin_only' using errcode = '42501'; end if;
  if _lead_id is null or _month is null then return jsonb_build_object('ok', false, 'error', 'bad_request'); end if;
  select user_id into owner from public.outreach_leads where id = _lead_id;
  if owner is null then return jsonb_build_object('ok', false, 'error', 'lead_not_found'); end if;
  if m > date_trunc('month', (now() at time zone 'Europe/London'))::date then
    return jsonb_build_object('ok', false, 'error', 'future_month');
  end if;
  clean := array[nullif(btrim(_measured_note), ''), nullif(btrim(_work_done), ''), nullif(btrim(_opportunities), ''), nullif(btrim(_next_steps), '')];
  if exists (select 1 from unnest(clean) t where char_length(t) > 4000) then
    return jsonb_build_object('ok', false, 'error', 'too_long');
  end if;
  select * into cur from public.client_monthly_updates where lead_id = _lead_id and period_month = m for update;
  if found and cur.status = 'sent' then return jsonb_build_object('ok', false, 'error', 'already_sent'); end if;
  insert into public.client_monthly_updates as u (lead_id, user_id, period_month, measured_note, work_done, opportunities, next_steps, updated_by)
  values (_lead_id, owner, m, clean[1], clean[2], clean[3], clean[4], auth.uid())
  on conflict (lead_id, period_month) do update
    set measured_note = excluded.measured_note, work_done = excluded.work_done, opportunities = excluded.opportunities,
        next_steps = excluded.next_steps, updated_at = now(), updated_by = auth.uid()
    where u.status = 'draft';
  return jsonb_build_object('ok', true, 'period_month', m);
end $$;

-- ── mark it SENT: stores the exact text, the channel, who and when. Once only. ──
create or replace function public.monthly_update_mark_sent(_lead_id uuid, _month date, _channel text, _message text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m date := date_trunc('month', _month)::date;
  cur record;
begin
  if public.my_role() is distinct from 'admin' then raise exception 'admin_only' using errcode = '42501'; end if;
  if _channel is null or _channel not in ('email', 'whatsapp', 'other') then return jsonb_build_object('ok', false, 'error', 'bad_channel'); end if;
  if nullif(btrim(_message), '') is null then return jsonb_build_object('ok', false, 'error', 'empty_message'); end if;
  if char_length(_message) > 12000 then return jsonb_build_object('ok', false, 'error', 'too_long'); end if;
  select * into cur from public.client_monthly_updates where lead_id = _lead_id and period_month = m for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_draft'); end if;
  if cur.status = 'sent' then return jsonb_build_object('ok', false, 'error', 'already_sent'); end if;
  update public.client_monthly_updates
     set status = 'sent', sent_at = now(), sent_channel = _channel, sent_by = auth.uid(), message = _message,
         updated_at = now(), updated_by = auth.uid()
   where id = cur.id;
  return jsonb_build_object('ok', true, 'period_month', m);
end $$;

revoke all on function public.monthly_update_facts(uuid, date) from public, anon;
revoke all on function public.monthly_update_save(uuid, date, text, text, text, text) from public, anon;
revoke all on function public.monthly_update_mark_sent(uuid, date, text, text) from public, anon;
grant execute on function public.monthly_update_facts(uuid, date) to authenticated;
grant execute on function public.monthly_update_save(uuid, date, text, text, text, text) to authenticated;
grant execute on function public.monthly_update_mark_sent(uuid, date, text, text) to authenticated;
