-- AI HANDLES REPLIES (2026-10-11, Paul) — WhatsApp only, approve-to-send only. Rules: src/lib/aiReplyDraft.ts;
-- worker + actions: fn ai-reply-drafts; record: docs/ai-handles-replies.md.
-- ALSO: the failed-crawl fix (a failed crawl never overwrites the last good one) gets its note column here.
--
-- Additive only. Rollback (Paul only):
--   select cron.unschedule('ai-reply-drafts-run');
--   drop function public.invoke_ai_reply_drafts(); drop function public.my_ai_reply_drafts();
--   drop function public.ai_reply_draft_candidates(integer); drop table public.ai_reply_drafts;
--   alter table public.whatsapp_outreach_state drop column ai_handles_replies, drop column ai_handles_replies_since;
--   alter table public.lead_crawl_checks drop column last_failed_attempt;

set local lock_timeout = '5s';

-- ── 1. The switch: ONE global row, default OFF. `since` = when it was last turned on (no backlog is drafted). ──
alter table public.whatsapp_outreach_state add column if not exists ai_handles_replies boolean not null default false;
alter table public.whatsapp_outreach_state add column if not exists ai_handles_replies_since timestamptz;

-- ── 2. One row per inbound message ─────────────────────────────────────────────────────────────────────────
create table if not exists public.ai_reply_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,                                   -- the BOOK (whatsapp_messages.user_id)
  lead_id uuid not null references public.outreach_leads(id) on delete cascade,
  phone text not null,
  inbound_message_id uuid not null references public.whatsapp_messages(id) on delete cascade,
  inbound_at timestamptz not null,
  kind text not null check (kind in ('draft', 'needs_you', 'needs_template', 'skipped')),
  status text not null check (status in ('generating', 'pending', 'sending', 'sent', 'discarded', 'superseded', 'resolved', 'failed')),
  reason text,
  reason_label text,
  draft_text text,                                         -- what the AI wrote (the latest version)
  why jsonb,                                               -- for the person only: sources, checks, cost
  model text,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  cost_usd numeric(10, 6) not null default 0,              -- every model call for this row, regenerations included
  model_calls integer not null default 0,
  regenerations integer not null default 0,
  error text,
  claimed_by uuid,                                         -- Approve & send: who pressed it (pending → sending)
  claimed_at timestamptz,
  final_text text,                                         -- what was actually sent (the person's edit)
  sent_message_id uuid references public.whatsapp_messages(id) on delete set null,
  approved_by uuid,
  approved_at timestamptz,
  discarded_by uuid,
  discarded_at timestamptz,
  superseded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- ONE draft per inbound, ever (the worker's claim is this insert).
create unique index if not exists ai_reply_drafts_one_per_inbound on public.ai_reply_drafts (inbound_message_id);
-- ONE open row per conversation: a newer inbound supersedes the older pending one first.
create unique index if not exists ai_reply_drafts_one_open_per_phone on public.ai_reply_drafts (user_id, phone)
  where status in ('generating', 'pending', 'sending');
create index if not exists ai_reply_drafts_lead on public.ai_reply_drafts (lead_id, created_at desc);

-- Service role only: RLS on, NO policies, grants revoked. People read through my_ai_reply_drafts() and act through the function.
alter table public.ai_reply_drafts enable row level security;
revoke all on public.ai_reply_drafts from anon, authenticated;

-- ── 3. The Inbox's read: the OPEN rows the caller may see (the same scope as my_whatsapp_unread) ──────────
-- A row is closed the moment a real (or QA-simulated) outbound message follows its inbound: someone answered.
create or replace function public.my_ai_reply_drafts()
returns table (id uuid, phone text, lead_id uuid, kind text, status text, inbound_at timestamptz, reason text,
               reason_label text, draft_text text, why jsonb, error text, regenerations integer, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_role text := public.my_role(); v_uid uuid := auth.uid();
begin
  if v_uid is null or v_role is null then return; end if;
  return query
  select d.id, d.phone, d.lead_id, d.kind, d.status, d.inbound_at, d.reason, d.reason_label, d.draft_text, d.why, d.error,
         d.regenerations, d.created_at
  from public.ai_reply_drafts d
  join public.outreach_leads l on l.id = d.lead_id and l.is_archived is not true
  where d.status in ('generating', 'pending', 'sending') and d.kind <> 'skipped'
    and (v_role = 'admin' or (l.assigned_to_user_id = v_uid and not public.lead_is_client(l.amount_paid, l.status)))
    and not exists (select 1 from public.whatsapp_messages o
                    where o.phone = d.phone and o.direction = 'outbound' and o.created_at > d.inbound_at
                      and o.status in ('sent', 'delivered', 'read', 'simulated'));
end $$;
revoke all on function public.my_ai_reply_drafts() from public, anon;
grant execute on function public.my_ai_reply_drafts() to authenticated;

-- ── 4. The worker's candidates: the NEWEST inbound per conversation since the switch went on, settled, unanswered,
--       with no row yet. Service role only. ──────────────────────────────────────────────────────────────────
create or replace function public.ai_reply_draft_candidates(p_limit integer default 5)
returns table (inbound_id uuid, user_id uuid, phone text, lead_id uuid, inbound_at timestamptz, body text, message_type text)
language sql stable security definer set search_path = public as $$
  with s as (select ai_handles_replies_since as since from public.whatsapp_outreach_state where id = 1 and ai_handles_replies),
  last_in as (
    select distinct on (m.user_id, m.phone) m.id, m.user_id, m.phone, m.lead_id, m.created_at, m.body, m.message_type
    from public.whatsapp_messages m, s
    where m.direction = 'inbound' and m.created_at >= s.since and m.created_at > now() - interval '48 hours'
    order by m.user_id, m.phone, m.created_at desc
  )
  select li.id, li.user_id, li.phone,
         coalesce(li.lead_id, (select x.lead_id from public.whatsapp_messages x where x.phone = li.phone and x.lead_id is not null
                               order by x.created_at desc limit 1)),
         li.created_at, li.body, li.message_type
  from last_in li
  where li.created_at < now() - interval '30 seconds'
    and not exists (select 1 from public.ai_reply_drafts d where d.inbound_message_id = li.id)
    and not exists (select 1 from public.whatsapp_messages o where o.phone = li.phone and o.direction = 'outbound'
                      and o.created_at > li.created_at and o.status in ('sent', 'delivered', 'read', 'simulated'))
  order by li.created_at
  limit greatest(1, least(coalesce(p_limit, 5), 20));
$$;
revoke all on function public.ai_reply_draft_candidates(integer) from public, anon, authenticated;

-- ── 5. The failed-crawl note: a failed crawl keeps the last good row and records the attempt here ─────────────
alter table public.lead_crawl_checks add column if not exists last_failed_attempt jsonb;

-- ── 6. The worker door + cron (posts only while the switch is on, or a draft is mid-send) ─────────────────────
create or replace function public.invoke_ai_reply_drafts()
returns void language plpgsql security definer set search_path = public as $$
declare v_service_key text; v_anon_key text; v_cron_secret text;
begin
  if not exists (select 1 from public.whatsapp_outreach_state where id = 1 and ai_handles_replies)
     and not exists (select 1 from public.ai_reply_drafts where status in ('generating', 'sending')) then
    return;
  end if;
  select decrypted_secret into v_service_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
  select decrypted_secret into v_anon_key    from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY'         limit 1;
  select decrypted_secret into v_cron_secret from vault.decrypted_secrets where name = 'CRON_SECRET'               limit 1;
  perform net.http_post(
    url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/ai-reply-drafts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_service_key, ''),
      'apikey', coalesce(v_anon_key, ''),
      'x-internal-job', '1',
      'x-cron-secret', coalesce(v_cron_secret, '')
    ),
    body := jsonb_build_object('action', 'tick', 'triggered_by', 'pg_cron')
  );
end $$;
revoke all on function public.invoke_ai_reply_drafts() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'ai-reply-drafts-run') then perform cron.unschedule('ai-reply-drafts-run'); end if;
  perform cron.schedule('ai-reply-drafts-run', '* * * * *', 'select public.invoke_ai_reply_drafts()');
end $$;
