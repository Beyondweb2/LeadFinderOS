-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- "CHECK BEFORE CALLING" — a salesperson's bulk pre-call check (2026-10-04, fix/07-sales-bulk-audit;
-- master plan M-034 / WS-7; docs/pre-sales-certification/fixes-07-sales-bulk-audit.md).
--
-- Two tables, written ONLY by fn sales-prospect-check (service role), read by the rep who owns the
-- batch and by the admin:
--   sales_check_batches — one press of "Check before calling": who, when, the idempotency key.
--   sales_check_items   — one row per lead in it: where its check got to, the audit it produced or
--                         reused, why it was skipped or failed.
-- ⛔ THE DATABASE IS THE DEDUPE:
--   · (actor_user_id, client_request_id) is UNIQUE — a double click, a retried request after a
--     network timeout or a second identical POST all land on the ONE batch;
--   · one ACTIVE batch per rep (partial unique index) — two tabs cannot start overlapping batches;
--   · (batch_id, lead_id) is UNIQUE — one lead once per batch.
-- ⛔ NO WRITE POLICY EXISTS. anon and authenticated hold no DML on these tables (revoked below), so a
--   browser can never forge an item, point it at another lead's audit or mark one done.
--
-- Plus the rep's daily allowance as a guard action (protection_settings.limits.actions.sales_check),
-- added to the live row only if it is not there yet — every other limit is untouched.
-- Additive and idempotent. No existing row is changed except the one jsonb key added.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
set local lock_timeout = '5s';

create table if not exists public.sales_check_batches (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  client_request_id text not null check (client_request_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  status text not null default 'active' check (status in ('active', 'waiting', 'finished')),
  refresh boolean not null default false,
  total integer not null check (total >= 0),
  cancelled_at timestamptz,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint sales_check_batches_request_key unique (actor_user_id, client_request_id)
);
create unique index if not exists sales_check_batches_one_active
  on public.sales_check_batches (actor_user_id) where status = 'active';
create index if not exists sales_check_batches_actor_created
  on public.sales_check_batches (actor_user_id, created_at desc);

create table if not exists public.sales_check_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.sales_check_batches(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  -- ⛔ NO FOREIGN KEY ON PURPOSE: an id that is not a lead becomes an ordinary item answered "Not one of
  -- your leads" (exactly like another rep's lead), instead of failing the whole batch — and the answer
  -- never tells a rep whether an id exists.
  lead_id uuid not null,
  position integer not null default 0,
  status text not null default 'queued'
    check (status in ('queued', 'starting', 'running', 'done', 'reused', 'failed', 'skipped')),
  reason text,
  detail text,
  audit_id uuid references public.ai_audits(id) on delete set null,
  run_id uuid references public.ai_audit_runs(id) on delete set null,
  audit_source text check (audit_source in ('new', 'reused', 'in_flight')),
  crawl_source text check (crawl_source in ('new', 'reused', 'with_audit', 'none', 'failed')),
  result_at timestamptz,
  est_cost_usd numeric not null default 0,
  attempts integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_check_items_batch_lead_key unique (batch_id, lead_id)
);
create index if not exists sales_check_items_batch on public.sales_check_items (batch_id, position);
-- The per-rep allowance counts this rep's fresh checks in the last 24 h.
create index if not exists sales_check_items_actor_fresh
  on public.sales_check_items (actor_user_id, started_at) where audit_source = 'new';

-- ── Access: read own (or admin), write never (service role only) ───────────────────────────────
alter table public.sales_check_batches enable row level security;
alter table public.sales_check_items enable row level security;

drop policy if exists "sales checks read own or admin" on public.sales_check_batches;
create policy "sales checks read own or admin" on public.sales_check_batches for select to authenticated
  using (actor_user_id = (select auth.uid()) or (select public.my_role()) = 'admin');
drop policy if exists "sales check items read own or admin" on public.sales_check_items;
create policy "sales check items read own or admin" on public.sales_check_items for select to authenticated
  using (actor_user_id = (select auth.uid()) or (select public.my_role()) = 'admin');

revoke all on public.sales_check_batches from anon;
revoke all on public.sales_check_items from anon;
revoke insert, update, delete, truncate, references, trigger on public.sales_check_batches from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.sales_check_items from authenticated;
grant select on public.sales_check_batches to authenticated;
grant select on public.sales_check_items to authenticated;
grant all on public.sales_check_batches to service_role;
grant all on public.sales_check_items to service_role;

-- ── The rep's daily allowance of fresh checks (src/lib/protectionLimits.ts DEFAULT_PROTECTION_LIMITS) ─
update public.protection_settings
   set limits = jsonb_set(limits, '{actions,sales_check}', '{"paid": true, "per_day": 40}'::jsonb, true),
       updated_at = now()
 where id = 1 and not (limits -> 'actions' ? 'sales_check');
