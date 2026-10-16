-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRACT CALL ALERTS (Paul, 2026-10-16) — docs/contract-call-alert.md
--
-- When a lead answers "not sure" or "tied in" about their agency contract, on ANY route (findable.live sign-up or
-- its copied link, the agreement page, Quick Close / the Call screen, Paul's manual onboarding), Paul gets ONE email
-- and the lead shows on his "Needs your attention" list. This table is both:
--   · the LEDGER that makes it once per lead per answer (a repeat of the same answer — a refresh, a second save —
--     sends nothing; a CHANGED answer is a new row and a new email), and
--   · the MARKER the admin dashboard reads ("Needs you").
-- A 'free' row is recorded only when it changes an earlier alert (it closes that alert; it sends nothing).
--
-- ⛔ SERVICE ROLE ONLY: RLS on with no policies, the claim function executable by service_role only. Nothing in the
--    browser reads or writes it; edge functions do, through _shared/contract-alert.ts.
-- Additive only.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
create table if not exists public.contract_call_alerts (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.outreach_leads(id) on delete cascade,
  answer        text not null check (answer in ('not_sure', 'in_contract', 'free')),
  contract_ends date,
  provider      text check (provider is null or length(provider) <= 200),
  source        text not null check (source in ('findable_onboarding', 'sales_confirm', 'agreement', 'quick_close', 'manual_onboarding')),
  emailed_at    timestamptz,
  email_error   text check (email_error is null or length(email_error) <= 500),
  created_at    timestamptz not null default now()
);
create index if not exists contract_call_alerts_lead_created on public.contract_call_alerts (lead_id, created_at desc);
alter table public.contract_call_alerts enable row level security;
revoke all on public.contract_call_alerts from anon, authenticated;

-- THE ONE CLAIM. Under a per-lead lock: if the newest row for this lead already says this answer, nothing (null);
-- a 'free' with nothing to close, nothing (null); otherwise a new row, whose id is returned (the caller then emails).
create or replace function public.contract_alert_claim(_lead_id uuid, _answer text, _contract_ends date, _provider text, _source text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last text;
  v_id uuid;
begin
  if _answer not in ('not_sure', 'in_contract', 'free') then return null; end if;
  perform pg_advisory_xact_lock(hashtext('contract_alert:' || _lead_id::text));
  select answer into v_last from public.contract_call_alerts where lead_id = _lead_id order by created_at desc, id desc limit 1;
  if v_last is not distinct from _answer then return null; end if;
  if _answer = 'free' and v_last is null then return null; end if;
  insert into public.contract_call_alerts (lead_id, answer, contract_ends, provider, source)
    values (_lead_id, _answer, _contract_ends, nullif(left(coalesce(_provider, ''), 200), ''), _source)
    returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.contract_alert_claim(uuid, text, date, text, text) from public, anon, authenticated;
grant execute on function public.contract_alert_claim(uuid, text, date, text, text) to service_role;
