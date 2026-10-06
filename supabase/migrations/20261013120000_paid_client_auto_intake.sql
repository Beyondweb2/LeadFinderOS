-- PAID CLIENT AUTO-INTAKE + SEND TO PAUL (2026-10-06,
-- docs/pre-sales-certification/paid-client-auto-intake-final-sales-check.md). Additive only — no existing row is
-- rewritten, no column is added to outreach_leads.
--
-- 1. client_handoff_sends — the AUTHORITATIVE "Send to Paul": one row per client, written once by fn quick-close
--    (the seller, or the admin) when the handoff is complete. A snapshot of the answers, who sent it (name kept,
--    so a later Disable never erases it), when, and the sign-up it belongs to. ⛔ ONE PER LEAD (unique): a
--    double press, a retry or a second tab reads the first row back — never a second send, notice or History line.
-- 2. client_intake — the ONE canonical intake state per paid client. Queued by the TRIGGER below the moment a lead
--    enters the Paid Clients list (a Stripe payment, the QA simulation, Mark Paid, the manual add — every path,
--    because they all write the same row), drained by fn client-intake. The consolidated profile itself is DERIVED
--    on every read (src/lib/clientIntake.ts); only the run state and Paul's own confirmations are stored here.
--    ⛔ ONE ROW PER LEAD (primary key): a duplicate webhook, a retry or a re-run can never start a second intake.
-- 3. The new notification kinds (client_handoff, client_intake) and History kinds (handoff_sent, client_intake,
--    client_fact_set); every live kind kept (read back 2026-10-06).
-- 4. invoke_client_intake() + the cron backstop (client-intake-run, every minute; posts only when a row is due).
--
-- ⛔ A TRIGGER THAT NEVER BLOCKS A PAYMENT: every failure inside it is swallowed with a warning.
-- ⛔ NO WRITE GRANTS on either table. client_intake has NO policies at all (service role only — paid-client-hub,
--    admin-gated, is the only reader). client_handoff_sends: the admin reads every row, the sender only their own.
--
-- Rollback (nothing else depends on these objects):
--   select cron.unschedule('client-intake-run');
--   drop trigger if exists trg_client_intake_on_paid on public.outreach_leads;
--   drop function if exists public.trg_client_intake_on_paid(); drop function if exists public.invoke_client_intake();
--   drop table if exists public.client_intake; drop table if exists public.client_handoff_sends;
--   (the widened CHECKs may stay — a wider CHECK harms nothing)

set local lock_timeout = '5s';

-- ── 1. SEND TO PAUL ─────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.client_handoff_sends (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.outreach_leads(id) on delete cascade,
  /* The sign-up this handoff belongs to (the onboarding row Quick Close works on), when there is one. */
  onboarding_id uuid,
  sent_by_user_id uuid not null references auth.users(id),
  /* Snapshotted at the send: a Disable later never erases who handed it over. */
  sent_by_name text,
  sent_by_role text not null check (sent_by_role in ('sales', 'admin')),
  sent_at timestamptz not null default now(),
  /* Before payment, Paul sees "Awaiting payment"; the auto-intake merges it the moment payment lands. */
  paid_when_sent boolean not null default false,
  /* The cleaned answers (src/lib/salesHandoff.ts cleanHandoff) and the Quick Close answers, as sent. */
  handoff jsonb not null,
  close_summary jsonb,
  constraint client_handoff_sends_one_per_lead unique (lead_id)
);
alter table public.client_handoff_sends enable row level security;
revoke all on public.client_handoff_sends from anon, authenticated;
grant select on public.client_handoff_sends to authenticated;
drop policy if exists client_handoff_sends_read on public.client_handoff_sends;
create policy client_handoff_sends_read on public.client_handoff_sends for select to authenticated using (
  (select public.my_role()) = 'admin' or sent_by_user_id = (select auth.uid()));

-- ── 2. THE INTAKE ───────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.client_intake (
  lead_id uuid primary key references public.outreach_leads(id) on delete cascade,
  /* queued → running → (crawling →) ready | needs_attention. "ready" still allows a re-run. */
  status text not null default 'queued' check (status in ('queued', 'running', 'crawling', 'ready', 'needs_attention')),
  trigger_source text not null default 'payment' check (trigger_source in ('payment', 'manual_paid', 'rerun', 'backfill')),
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  last_run_at timestamptz,
  /* A run holds the row until lease_until; a crashed run is picked up again after it. */
  lease_until timestamptz,
  attempts integer not null default 0,
  /* The ONE full crawl an intake may start (null = reused / not needed / not started). Never a second. */
  crawl_job_id uuid,
  crawl_started_at timestamptz,
  /* Per-source outcome of the last run: [{ key, status, detail, cost }]. Display only. */
  steps jsonb not null default '[]'::jsonb,
  /* Counts of the last run: sources_checked, fields_populated, still_needed, conflicts. Display only. */
  summary jsonb,
  /* Paul's own decisions per field: { field: { confirmed?: {value, by, at}, rejected?: [normalised values] } }.
     ⛔ Automatic research never writes this — only paid-client-hub intake_fact (admin). */
  overrides jsonb not null default '{}'::jsonb,
  ready_notified_at timestamptz,
  error text,
  updated_at timestamptz not null default now()
);
create index if not exists client_intake_due on public.client_intake (status, lease_until) where status in ('queued', 'running', 'crawling');
alter table public.client_intake enable row level security;
revoke all on public.client_intake from anon, authenticated;

-- ── 3. KINDS (every live kind kept, read back 2026-10-06) ───────────────────────────────────────────────────
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'whatsapp_reply', 'whatsapp_failed', 'signup_opened', 'client_paid', 'commission_earned', 'commission_reversed',
  'audit_finished', 'template_decided', 'follow_up_due', 'lead_assigned', 'feedback_update', 'feature_update',
  'quick_close_review', 'quick_close_paid', 'transfer_request', 'team_update', 'team_task',
  'client_info_request', 'client_handoff', 'client_intake'));

alter table public.lead_activity drop constraint if exists lead_activity_kind_check;
alter table public.lead_activity add constraint lead_activity_kind_check check (kind = any (array[
  'lead_added', 'lead_claimed', 'lead_assigned', 'lead_unassigned', 'note', 'stage_changed', 'follow_up_set', 'call_booked',
  'call_outcome', 'website_control_set', 'audit_run', 'bulk_queued', 'marked_interested', 'details_set', 'archived_set',
  'contact_logged', 'crawl_run', 'report_link', 'state_changed', 'opted_out', 'transfer_requested', 'lost_reason_set',
  'payment_received', 'handoff_saved', 'onboarding_submitted', 'delivery_submitted', 'discovery_run', 'baseline_approved',
  'baseline_run', 'build_started', 'launched', 'payment_link_shared',
  'client_info_requested', 'client_info_answered', 'client_contact_opened',
  'handoff_sent', 'client_intake', 'client_fact_set'
]::text[]));
-- One "Sent to Paul" per client, and one "intake ready" line per client (a re-run never repeats it).
create unique index if not exists lead_activity_one_handoff_sent on public.lead_activity (lead_id) where kind = 'handoff_sent';
create unique index if not exists lead_activity_one_intake_ready on public.lead_activity (lead_id)
  where kind = 'client_intake' and (data->>'event') = 'ready';

-- ── 4. THE WORKER DOOR ──────────────────────────────────────────────────────────────────────────────────────
-- Posts to fn client-intake ONLY when a row is due (queued, or a lease that ran out). Same secrets and headers
-- as invoke_crawl_worker (CRON_SECRET + x-internal-job).
create or replace function public.invoke_client_intake()
returns void language plpgsql security definer set search_path = public as $$
declare v_service_key text; v_anon_key text; v_cron_secret text;
begin
  if not exists (select 1 from public.client_intake
                 where status = 'queued' or (status in ('running', 'crawling') and (lease_until is null or lease_until < now()))) then
    return;
  end if;
  select decrypted_secret into v_service_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
  select decrypted_secret into v_anon_key    from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY'         limit 1;
  select decrypted_secret into v_cron_secret from vault.decrypted_secrets where name = 'CRON_SECRET'               limit 1;
  perform net.http_post(
    url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/client-intake',
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
revoke all on function public.invoke_client_intake() from public, anon, authenticated;

-- ── 5. THE TRIGGER: entering the Paid Clients list queues the intake (src/lib/paidClient.ts isPaidClient) ──
-- A lead is a paid client when an amount is recorded, or it carries a paid status (never refunded). The intake
-- is queued on the TRANSITION into the list only — and never for an ended or refunded client.
create or replace function public.trg_client_intake_on_paid()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_now boolean; v_was boolean; v_n integer;
begin
  begin
    v_now := new.service_terminated_at is null and new.status is distinct from 'refunded'
      and (coalesce(new.amount_paid, 0) > 0 or new.status in ('payment_received', 'in_delivery', 'completed'));
    if not v_now then return new; end if;
    v_was := tg_op = 'UPDATE' and (coalesce(old.amount_paid, 0) > 0
      or (old.status in ('payment_received', 'in_delivery', 'completed') and old.status is distinct from 'refunded'));
    if v_was then return new; end if;
    insert into public.client_intake (lead_id, status, trigger_source)
      values (new.id, 'queued', case when coalesce(new.amount_paid, 0) > 0 then 'payment' else 'manual_paid' end)
      on conflict (lead_id) do nothing;
    get diagnostics v_n = row_count;
    /* Start at once (pg_net sends after this transaction commits); the cron is the backstop. */
    if v_n > 0 then perform public.invoke_client_intake(); end if;
  exception when others then raise warning 'trg_client_intake_on_paid: %', sqlerrm;
  end;
  return new;
end $$;
revoke all on function public.trg_client_intake_on_paid() from public, anon, authenticated;
drop trigger if exists trg_client_intake_on_paid on public.outreach_leads;
create trigger trg_client_intake_on_paid after insert or update of amount_paid, status on public.outreach_leads
  for each row execute function public.trg_client_intake_on_paid();

-- ── 6. THE CRON BACKSTOP (DB-only, like every cron here — CLAUDE.md §7) ─────────────────────────────────────
do $$ begin
  if exists (select 1 from cron.job where jobname = 'client-intake-run') then perform cron.unschedule('client-intake-run'); end if;
  perform cron.schedule('client-intake-run', '* * * * *', 'select public.invoke_client_intake()');
end $$;
