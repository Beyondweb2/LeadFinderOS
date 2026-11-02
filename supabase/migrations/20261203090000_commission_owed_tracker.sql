-- COMMISSION OWED (Paul, 2026-11-02, docs/commission-owed.md). Additive and idempotent.
--
--  1. payment_ledger: the sale's plan as Stripe recorded it, what the salesperson picked, any mismatch, the rule set the sale
--     is on, and the "payable on" date. The ledger row already holds the amount collected, the seller and the date.
--  2. commission_line_payments: every commission payment Paul marks as made by bank transfer. One live row per line and part
--     (a partial unique index), so two tabs can never record the same line twice. An undo stamps the row, never deletes it.
--  3. A trigger on outreach_leads.remeasure_results_sent_at is the ONE writer of the payable date. No backstop: no results, no date.
--  4. sales_handoff_set_field: one field, one atomic write, so two tabs editing different answers can never overwrite each other.
--
-- ⛔ HISTORY DOES NOT MOVE. Every row already in the ledger becomes payout_rule 'legacy' and keeps its numbers. Only rows inserted
--    after this migration take the new default. payment_ledger is small (25 rows on 2026-11-02) and a constant default rewrites nothing.

set local lock_timeout = '5s';

-- ── 1. THE SALE, ON ITS LEDGER ROW ───────────────────────────────────────────────────────────────────────────────────────────
alter table public.payment_ledger add column if not exists payout_rule text not null default 'legacy';
alter table public.payment_ledger alter column payout_rule set default 'plan_v1';
alter table public.payment_ledger drop constraint if exists payment_ledger_payout_rule_check;
alter table public.payment_ledger add constraint payment_ledger_payout_rule_check check (payout_rule in ('legacy', 'plan_v1'));
-- What Stripe's session recorded. It wins over what the salesperson picked.
alter table public.payment_ledger add column if not exists sale_plan text;
alter table public.payment_ledger add column if not exists sale_plan_picked text;
-- null = no mismatch. 'plan_differs' / 'amount_differs' (src/lib/salePlan.ts).
alter table public.payment_ledger add column if not exists sale_plan_flag text;
alter table public.payment_ledger add column if not exists commission_payable_on date;

-- ── 2. THE PAYABLE DATE ──────────────────────────────────────────────────────────────────────────────────────────────────────
-- ⛔ Mirrors commissionPayableDays in src/lib/commissionConfig.ts (scripts/commission-owed.test.ts pins the two).
create or replace function public.commission_payable_days(_terms text)
returns integer language sql immutable as $$
  select case when _terms = 'csa_v7_two_plans' then 7 else 14 end
$$;

create or replace function public.commission_payable_on_for(_lead uuid, _sent timestamptz)
returns date language sql stable security definer set search_path = public as $$
  select case when _sent is null then null
    else (_sent at time zone 'Europe/London')::date
      + public.commission_payable_days((select commercial_terms from public.client_service_terms where lead_id = _lead))
    end
$$;
revoke all on function public.commission_payable_on_for(uuid, timestamptz) from public, anon, authenticated;

-- The results sender can un-stamp a send that failed, and this follows it back to null.
create or replace function public.sync_commission_payable_on()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.payment_ledger
     set commission_payable_on = public.commission_payable_on_for(new.id, new.remeasure_results_sent_at)
   where lead_id = new.id and kind = 'initial' and payout_rule = 'plan_v1';
  return null;
end $$;
revoke all on function public.sync_commission_payable_on() from public, anon, authenticated;
drop trigger if exists trg_outreach_leads_commission_payable_on on public.outreach_leads;
create trigger trg_outreach_leads_commission_payable_on
  after update of remeasure_results_sent_at on public.outreach_leads
  for each row when (old.remeasure_results_sent_at is distinct from new.remeasure_results_sent_at)
  execute function public.sync_commission_payable_on();

-- A sale recorded after its results went out (a late backfill) still gets its date.
create or replace function public.ledger_commission_payable_on()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'initial' and new.payout_rule = 'plan_v1' and new.lead_id is not null then
    new.commission_payable_on := public.commission_payable_on_for(
      new.lead_id, (select remeasure_results_sent_at from public.outreach_leads where id = new.lead_id));
  end if;
  return new;
end $$;
revoke all on function public.ledger_commission_payable_on() from public, anon, authenticated;
drop trigger if exists trg_payment_ledger_commission_payable_on on public.payment_ledger;
create trigger trg_payment_ledger_commission_payable_on
  before insert on public.payment_ledger
  for each row execute function public.ledger_commission_payable_on();

-- ── 3. PAYMENTS PAUL MADE ────────────────────────────────────────────────────────────────────────────────────────────────────
-- ⛔ A record of a bank transfer made outside the app. Nothing here moves money. RLS on, no policies, no grants:
--    read and written only through fn sales-earnings, which scopes a salesperson to their own rows.
create table if not exists public.commission_line_payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  batch_id uuid not null,
  -- The engine's line id: 'pay:<ledger id>' or 'rev:<ledger id>'.
  line_key text not null,
  -- 1, or higher when a refund grew after its first offset was settled.
  part integer not null default 1 check (part >= 1),
  user_id uuid not null references auth.users(id),
  lead_id uuid references public.outreach_leads(id) on delete set null,
  -- Negative for an offset.
  amount_gbp numeric(10,2) not null,
  -- A snapshot of why, so the history can be shown to the salesperson as it stood when paid.
  business_name text,
  plan text,
  label text,
  rate numeric(5,4),
  client_amount_gbp numeric(10,2),
  collected_at timestamptz,
  payable_on date,
  paid_at timestamptz not null default now(),
  paid_by uuid not null references auth.users(id),
  undone_at timestamptz,
  undone_by uuid references auth.users(id)
);
create unique index if not exists commission_line_payments_one_live
  on public.commission_line_payments (line_key, part) where undone_at is null;
create index if not exists commission_line_payments_user on public.commission_line_payments (user_id, paid_at desc);
create index if not exists commission_line_payments_batch on public.commission_line_payments (batch_id);
alter table public.commission_line_payments enable row level security;
revoke all on public.commission_line_payments from anon, authenticated;

-- All or nothing, in one transaction: a line someone else just paid fails the whole batch with 23505.
create or replace function public.commission_record_line_payments(_batch uuid, _by uuid, _rows jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  insert into public.commission_line_payments
    (batch_id, line_key, part, user_id, lead_id, amount_gbp, business_name, plan, label, rate, client_amount_gbp, collected_at, payable_on, paid_by)
  select _batch, r.line_key, coalesce(r.part, 1), r.user_id, r.lead_id, r.amount_gbp, r.business_name, r.plan, r.label, r.rate, r.client_amount_gbp, r.collected_at, r.payable_on, _by
    from jsonb_to_recordset(_rows) as r(line_key text, part integer, user_id uuid, lead_id uuid, amount_gbp numeric, business_name text, plan text, label text, rate numeric, client_amount_gbp numeric, collected_at timestamptz, payable_on date);
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.commission_record_line_payments(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.commission_record_line_payments(uuid, uuid, jsonb) to service_role;

-- ── 4. ONE HANDOFF FIELD, ONE ATOMIC WRITE ───────────────────────────────────────────────────────────────────────────────────
-- ⛔ A read-merge-write of the jsonb loses the other tab's answer. This merges inside the UPDATE. The caller has already
--    checked who may write and cleaned the value (fn quick-close, salesHandoff.cleanHandoff). null clears the answer.
--    Returns the previous saved_at (null on the first save), so the caller can record one History line, not one per pause.
create or replace function public.sales_handoff_set_field(_lead uuid, _key text, _value text, _actor uuid)
returns table (previous_saved_at text, first_save boolean) language plpgsql security definer set search_path = public as $$
declare v_prev jsonb; v_now text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  select coalesce(sales_handoff, '{}'::jsonb) into v_prev from public.outreach_leads where id = _lead for update;
  if not found then raise exception 'lead_not_found'; end if;
  update public.outreach_leads
     set sales_handoff =
       (case when _value is null then v_prev - _key else v_prev || jsonb_build_object(_key, _value) end)
       || jsonb_build_object('saved_at', v_now, 'saved_by', _actor)
       || case when v_prev ? 'completed_at' and v_prev->>'completed_at' is not null then '{}'::jsonb
               else jsonb_build_object('completed_at', v_now, 'completed_by', _actor) end
   where id = _lead;
  return query select v_prev->>'saved_at', (v_prev->>'saved_at') is null;
end $$;
revoke all on function public.sales_handoff_set_field(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.sales_handoff_set_field(uuid, text, text, uuid) to service_role;
