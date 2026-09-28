-- Sales Experience, release 2 (2026-09-28): the PAYMENT LEDGER and commission payouts. Additive only.
-- docs/sales-experience.md §4.
--
-- ⛔ A RECORD OF MONEY THAT MOVED, NOTHING ELSE. One row per real Stripe payment (the initial payment,
-- each paid recurring invoice), per refunded charge (the charge's cumulative refunded amount) and per
-- dispute (chargeback). Written only by the service role: stripe-webhook as events arrive, and the
-- admin-run backfill (fn sales-earnings, mode backfill) from Stripe's own history. Charging is untouched.
-- ⛔ IDEMPOTENT BY THE STRIPE OBJECT: unique (kind, stripe_object_id) — a retried webhook, or a backfill
-- run twice, can never create a second money row.
-- ⛔ COMMISSION IS DERIVED, NEVER STORED (src/lib/commission.ts). The one thing stored is a payout the
-- admin actually made (commission_payouts).
-- Both tables: RLS on, NO policies, no grants to anon/authenticated — read only through fn sales-earnings.

create table if not exists public.payment_ledger (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid references public.outreach_leads(id) on delete set null,
  kind text not null check (kind in ('initial', 'recurring', 'refund', 'chargeback')),
  -- payments: succeeded · chargebacks: Stripe's dispute status (won = the money came back)
  status text not null default 'succeeded',
  amount_gbp numeric(10,2) not null check (amount_gbp >= 0),
  currency text not null default 'gbp',
  occurred_at timestamptz not null,
  -- initial: payment intent (else charge) · recurring: invoice · refund: charge · chargeback: dispute
  stripe_object_id text not null,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  stripe_invoice_id text,
  stripe_customer_id text,
  stripe_event_id text,
  -- who sold the client, as it stood when the money arrived (outreach_leads.sold_by_user_id)
  sold_by_user_id uuid,
  source text not null default 'webhook' check (source in ('webhook', 'backfill')),
  note text,
  constraint payment_ledger_object_uq unique (kind, stripe_object_id)
);
create index if not exists payment_ledger_lead_idx on public.payment_ledger (lead_id, occurred_at);
create index if not exists payment_ledger_seller_idx on public.payment_ledger (sold_by_user_id, occurred_at);
create index if not exists payment_ledger_pi_idx on public.payment_ledger (stripe_payment_intent_id) where stripe_payment_intent_id is not null;
create index if not exists payment_ledger_charge_idx on public.payment_ledger (stripe_charge_id) where stripe_charge_id is not null;
alter table public.payment_ledger enable row level security;
revoke all on public.payment_ledger from anon, authenticated;

create table if not exists public.commission_payouts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id),
  -- the month of RECEIPTS this payout covers (first day of that month)
  period_month date not null check (extract(day from period_month) = 1),
  amount_gbp numeric(10,2) not null,
  paid_at date not null,
  recorded_by uuid references auth.users(id),
  note text,
  constraint commission_payouts_uq unique (user_id, period_month)
);
alter table public.commission_payouts enable row level security;
revoke all on public.commission_payouts from anon, authenticated;

-- The one-time "+£X earned" celebration: the newest commission this person has already been shown.
alter table public.user_preferences add column if not exists commission_seen_at timestamptz;
