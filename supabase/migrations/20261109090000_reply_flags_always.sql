-- REPLY FLAGS ALWAYS ON, DRAFTS STILL BEHIND THE SWITCH (2026-10-20, Paul). Rules: src/lib/replyMove.ts, src/lib/aiReplyDraft.ts;
-- worker: fn ai-reply-drafts; record: docs/ai-handles-replies.md.
--
-- Until now the worker ran only while "AI handles replies" was on. Now every NEW inbound reply (from reply_flags_since,
-- stamped when this is applied: old messages are never re-read) gets one ai_reply_drafts row: a "Needs you" flag, a stop
-- (opted out + queued follow-ups cancelled), an auto-reply label, or nothing. That pass is RULES ONLY (no model call, no
-- spend). The worker still writes a model DRAFT only while the switch is on; the switch itself is not touched here.
--
-- Additive only: one column, two functions replaced (same signatures). Rollback (Paul only): re-run sections 4 and 6 of
-- 20261022090000_ai_handles_replies.sql; alter table public.whatsapp_outreach_state drop column reply_flags_since;
set local lock_timeout = '5s';

alter table public.whatsapp_outreach_state add column if not exists reply_flags_since timestamptz not null default now();

-- The worker's candidates: the NEWEST inbound per conversation since the flags began, settled, unanswered, with no row yet.
create or replace function public.ai_reply_draft_candidates(p_limit integer default 5)
returns table (inbound_id uuid, user_id uuid, phone text, lead_id uuid, inbound_at timestamptz, body text, message_type text)
language sql stable security definer set search_path = public as $$
  with s as (select reply_flags_since as since from public.whatsapp_outreach_state where id = 1),
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

-- The worker door: posts only when there is a new reply to read, or a draft mid-send / mid-write (no idle calls).
create or replace function public.invoke_ai_reply_drafts()
returns void language plpgsql security definer set search_path = public as $$
declare v_service_key text; v_anon_key text; v_cron_secret text;
begin
  if not exists (select 1 from public.ai_reply_draft_candidates(1))
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
