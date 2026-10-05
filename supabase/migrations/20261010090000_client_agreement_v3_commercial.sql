-- 20261010090000_client_agreement_v3_commercial.sql
-- Client Service Agreement v3 + Option B payment timing + Continuing Service tracking (2026-10-05).
-- Branch feature/client-agreement-commercial-alignment. NOT APPLIED — run by the integration session,
-- one statement block at a time, read back, BEFORE deploying any function that reads these objects.
--
-- Additive only: new nullable columns on client_agreement_acceptances (a hand-made, write-once table —
-- its UPDATE/DELETE/TRUNCATE refusal triggers are untouched), and three new tables. No existing row is
-- changed. Ronnie, MCL, RG and the historical QA clients get NO client_service_terms row, so nothing in
-- the v3 timeline, payment scheduling or commission rules can reach them.

-- ── 1. The acceptance evidence, tied to ONE sign-up ─────────────────────────────────────────────────
alter table public.client_agreement_acceptances
  add column if not exists onboarding_id uuid,
  add column if not exists authority_confirmed boolean,
  add column if not exists marketing_opt_out boolean,
  add column if not exists commercial_terms text;

-- A v3 acceptance is ALWAYS the agreement page, ALWAYS bound to the sign-up (onboarding row) it was
-- signed for, and ALWAYS carries the separate authority confirmation (clause 1.4). v1 rows are unaffected.
alter table public.client_agreement_acceptances
  drop constraint if exists v3_acceptance_is_complete;
alter table public.client_agreement_acceptances
  add constraint v3_acceptance_is_complete check (
    agreement_version <> 'v3'
    or (method = 'agree_page' and onboarding_id is not null and authority_confirmed is true and commercial_terms is not null)
  );

-- One v3 signature per sign-up: a second POST (double click, back button) cannot create a second row.
create unique index if not exists client_agreement_acceptances_one_v3_per_signup
  on public.client_agreement_acceptances (onboarding_id, agreement_version)
  where onboarding_id is not null;

create index if not exists client_agreement_acceptances_lead_idx
  on public.client_agreement_acceptances (lead_id, accepted_at desc);

-- ── 2. The agreement-copy emails, recorded only as the provider answered ────────────────────────────
create table if not exists public.client_agreement_emails (
  id uuid primary key default gen_random_uuid(),
  acceptance_id uuid not null references public.client_agreement_acceptances(id),
  lead_id uuid not null,
  recipients text[] not null,
  status text not null check (status in ('sent', 'failed', 'refused')),
  provider text not null default 'resend',
  provider_message_id text,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists client_agreement_emails_acceptance_idx on public.client_agreement_emails (acceptance_id, created_at desc);
alter table public.client_agreement_emails enable row level security;
revoke all on public.client_agreement_emails from anon, authenticated;

-- ── 3. One row per v3 client: the commercial terms and the timeline FACTS ─────────────────────────
-- Dates that are arithmetic (Refund Window, Approval Date, minimum-term completion, reminder due) are
-- NOT stored — src/lib/clientTimeline.ts derives them. Stored here: what Paul confirmed, what Stripe
-- was set to, and the Continuing Service bookkeeping.
create table if not exists public.client_service_terms (
  lead_id uuid primary key references public.outreach_leads(id),
  commercial_terms text not null check (commercial_terms in ('csa_v3_option_b')),
  agreement_acceptance_id uuid references public.client_agreement_acceptances(id),
  service_route text check (service_route in ('build', 'optimise')),
  initial_paid_at timestamptz,
  -- clause 5.1
  access_date date,
  access_confirmed_at timestamptz,
  access_confirmed_by uuid,
  access_email_sent_at timestamptz,
  -- clause 5.8
  guarantee_ceased_at timestamptz,
  guarantee_ceased_reason text,
  -- clause 5.6: what Stripe was set to, and when Stripe's read-back agreed
  payment_start_date date,
  payment_start_basis text check (payment_start_basis in ('results', 'fallback')),
  payment_start_trial_end timestamptz,
  payment_start_confirmed_at timestamptz,
  -- clause 9A: manual for now (CONTINUING_SERVICE_AUTOMATION, all false)
  continuing_prepared_at timestamptz,
  continuing_reminder_sent_at timestamptz,
  continuing_reminder_sent_by uuid,
  continuing_decision text check (continuing_decision in ('continue', 'cancel')),
  continuing_decision_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint access_needs_confirmation check (access_date is null or access_confirmed_at is not null),
  constraint ceased_needs_reason check (guarantee_ceased_at is null or coalesce(trim(guarantee_ceased_reason), '') <> '')
);
alter table public.client_service_terms enable row level security;
revoke all on public.client_service_terms from anon, authenticated;

-- The terms and the bound acceptance never change once stamped; the Access Date, once confirmed,
-- is never cleared (a correction is a new confirmation, recorded in the history).
create or replace function public.guard_client_service_terms() returns trigger
language plpgsql as $$
begin
  if new.commercial_terms is distinct from old.commercial_terms then
    raise exception 'client_service_terms.commercial_terms is fixed once stamped';
  end if;
  if old.agreement_acceptance_id is not null and new.agreement_acceptance_id is distinct from old.agreement_acceptance_id then
    raise exception 'client_service_terms.agreement_acceptance_id is fixed once stamped';
  end if;
  if old.initial_paid_at is not null and new.initial_paid_at is distinct from old.initial_paid_at then
    raise exception 'client_service_terms.initial_paid_at is fixed once stamped';
  end if;
  if old.access_date is not null and new.access_date is null then
    raise exception 'client_service_terms.access_date cannot be cleared';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_guard_client_service_terms on public.client_service_terms;
create trigger trg_guard_client_service_terms before update on public.client_service_terms
  for each row execute function public.guard_client_service_terms();

-- ── 4. The history: append-only ────────────────────────────────────────────────────────────────────
create table if not exists public.client_service_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.outreach_leads(id),
  kind text not null,
  actor_user_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint client_service_events_kind_check check (kind in (
    'terms_stamped', 'access_confirmed', 'access_email_sent', 'access_email_failed', 'guarantee_ceased',
    'payment_start_scheduled', 'payment_start_refused', 'continuing_prepared', 'continuing_reminder_sent',
    'continuing_will_continue', 'continuing_will_cancel', 'paid_without_v3_agreement'
  ))
);
create index if not exists client_service_events_lead_idx on public.client_service_events (lead_id, created_at desc);
alter table public.client_service_events enable row level security;
revoke all on public.client_service_events from anon, authenticated;

create or replace function public.refuse_client_service_events_change() returns trigger
language plpgsql as $$
begin
  raise exception 'client_service_events is append-only';
end $$;
drop trigger if exists trg_client_service_events_no_update on public.client_service_events;
create trigger trg_client_service_events_no_update before update or delete on public.client_service_events
  for each row execute function public.refuse_client_service_events_change();
drop trigger if exists trg_client_service_events_no_truncate on public.client_service_events;
create trigger trg_client_service_events_no_truncate before truncate on public.client_service_events
  for each statement execute function public.refuse_client_service_events_change();

-- ── 5. Payments HELD by the webhook backstop (no valid v3 signature) ─────────────────────────────────
-- Defence in depth behind the payment gate: a Findable payment Stripe reports WITHOUT a valid v3
-- acceptance for that client / sign-up / service / version (a pre-cutover session, a Payment Link, a
-- forged session) is recorded HERE and nowhere else — no Paid Client lifecycle, no subscription, no
-- ledger row (so no commission). Paul resolves each by hand (refund, or sign-and-migrate).
create table if not exists public.client_payment_holds (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  checkout_session_id text not null unique,
  payment_intent_id text,
  payment_link_id text,
  lead_id uuid,
  onboarding_id uuid,
  amount_gbp numeric(10,2),
  customer_email text,
  reason text not null,
  stripe_event_id text,
  resolved_at timestamptz,
  resolution text check (resolution is null or resolution in ('refunded', 'signed_and_migrated', 'not_findable')),
  resolved_by uuid
);
create index if not exists client_payment_holds_open_idx on public.client_payment_holds (lead_id) where resolved_at is null;
alter table public.client_payment_holds enable row level security;
revoke all on public.client_payment_holds from anon, authenticated;

-- Read back (run after applying):
--   select count(*) from public.client_payment_holds;                                                     -- 0
--   select column_name from information_schema.columns where table_name = 'client_agreement_acceptances'
--     and column_name in ('onboarding_id','authority_confirmed','marketing_opt_out','commercial_terms');   -- 4 rows
--   select conname from pg_constraint where conname = 'v3_acceptance_is_complete';                         -- 1 row
--   select count(*) from public.client_service_terms;                                                      -- 0
--   select relrowsecurity from pg_class where relname in ('client_service_terms','client_service_events','client_agreement_emails'); -- all true
