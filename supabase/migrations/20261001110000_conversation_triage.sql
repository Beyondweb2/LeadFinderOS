-- ADMIN CONTROL CENTRE, release 2 (2026-09-30): reply triage + late opt-out suppression.
-- Additive. docs/admin-control-centre.md §Reply triage.

-- 1. One row per inbound WhatsApp message: who needs to act and why (src/lib/replyTriage.ts).
--    Open / answered is DERIVED at read time (fn admin-overview); only a manual "handled" is stored.
create table if not exists public.conversation_triage (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique,
  lead_id uuid,
  phone text,
  message_at timestamptz not null,
  category text not null,
  bucket text not null check (bucket in ('urgent_admin', 'admin_action', 'rep_action', 'no_action', 'review')),
  reason text not null,
  confidence numeric not null default 1,
  method text not null check (method in ('rule', 'ai', 'skipped')),
  rule_id text,
  rules_version text not null,
  model text,
  prompt_version text,
  action_taken text,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists conversation_triage_lead_idx on public.conversation_triage (lead_id, message_at desc);
create index if not exists conversation_triage_open_idx on public.conversation_triage (message_at desc) where resolved_at is null;
-- RLS on, no policies: service role only (fn conversation-triage writes, fn admin-overview reads).
alter table public.conversation_triage enable row level security;

-- 2. The inbound messages not yet triaged, oldest first (an anti-join PostgREST cannot express).
create or replace function public.conversation_triage_pending(_limit int)
returns table (id uuid, lead_id uuid, phone text, body text, message_type text, created_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select m.id, m.lead_id, m.phone, m.body, m.message_type, m.created_at
  from public.whatsapp_messages m
  where m.direction = 'inbound'
    and coalesce(m.test_mode, false) = false
    and not exists (select 1 from public.conversation_triage t where t.message_id = m.id)
  order by m.created_at, m.id
  limit greatest(1, least(coalesce(_limit, 200), 1000))
$$;
revoke all on function public.conversation_triage_pending(int) from public;
revoke all on function public.conversation_triage_pending(int) from anon, authenticated;
grant execute on function public.conversation_triage_pending(int) to service_role;

-- 3. History gets an "opted out" kind (the late-STOP suppression is recorded on the lead's timeline).
--    The list is the live constraint's list (read 2026-09-30) plus 'opted_out'.
alter table public.lead_activity drop constraint if exists lead_activity_kind_check;
alter table public.lead_activity add constraint lead_activity_kind_check check (kind = any (array[
  'lead_added', 'lead_claimed', 'lead_assigned', 'lead_unassigned', 'note', 'stage_changed', 'follow_up_set',
  'call_booked', 'call_outcome', 'website_control_set', 'audit_run', 'bulk_queued', 'marked_interested',
  'details_set', 'archived_set', 'contact_logged', 'crawl_run', 'report_link', 'state_changed', 'opted_out'
]::text[]));

-- 4. The cron invoker, the same shape as every other (CRON_SECRET from the vault, x-internal-job).
create or replace function public.invoke_conversation_triage()
returns void language plpgsql security definer
as $function$
declare v_cron_secret text;
begin
  select decrypted_secret into v_cron_secret from vault.decrypted_secrets where name = 'CRON_SECRET' limit 1;
  perform net.http_post(
    url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/conversation-triage',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', coalesce(v_cron_secret, ''), 'x-internal-job', '1'),
    body := '{"action":"run"}'::jsonb
  );
end $function$;
revoke all on function public.invoke_conversation_triage() from public;
revoke all on function public.invoke_conversation_triage() from anon, authenticated;

-- 5. Every two minutes. (Cron jobs live only in the database — CLAUDE.md §7.)
select cron.unschedule('conversation-triage-run') where exists (select 1 from cron.job where jobname = 'conversation-triage-run');
select cron.schedule('conversation-triage-run', '*/2 * * * *', 'select public.invoke_conversation_triage()');
