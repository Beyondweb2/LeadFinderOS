-- ══ THE NICHE CHECK'S SAMPLES (2026-09-28, src/lib/nicheSample.ts, fn niche-sample) ══════════════
-- One row per niche check: the plan that was shown and run (towns, bands, questions), the audit per
-- town (the ONE audit engine, purpose discovery, is_market), and the raw Google market search per
-- town. ⛔ The VERDICT IS NOT STORED — it is derived on read from the audits and this evidence, so a
-- rule change re-reads every old sample rather than freezing it (CLAUDE.md §6 "derived, never stored").
-- Service-role only: RLS on with NO policies; the niche-sample function is the only reader/writer.
create table if not exists public.niche_samples (
  id uuid primary key default gen_random_uuid(),
  trade text not null,
  trade_key text not null,
  method_version integer not null,
  plan jsonb not null,
  audit_ids jsonb not null default '{}'::jsonb,
  places jsonb not null default '{}'::jsonb,
  places_cost_usd numeric not null default 0,
  status text not null default 'starting',
  error text,
  created_by uuid,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists niche_samples_trade_key_idx on public.niche_samples (trade_key, created_at desc);
alter table public.niche_samples enable row level security;
revoke all on public.niche_samples from anon, authenticated;
