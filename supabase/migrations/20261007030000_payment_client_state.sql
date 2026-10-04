-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- PAYMENT + CLIENT STATE (pre-sales certification fix 03 / WS-3, 2026-10-04).
-- docs/pre-sales-certification/fixes-03-payment-client.md has the why; this file is the schema.
--
-- 1. outreach_leads.subscription_claim / subscription_claimed_at — the CLAIM on a client's one monthly
--    subscription (M-017). _shared/delayed-subscription.ts writes it with a conditional update (only
--    while it and stripe_subscription_id are both blank) before it calls Stripe, so one checkout can
--    own at most one subscription; Stripe's Idempotency-Key keyed by the same checkout covers a
--    concurrent re-delivery of that checkout. The value is the Checkout Session id.
-- 2. outreach_leads.client_contacted_at / _by / _via — Paul's FIRST CONTACT after payment (M-018),
--    written once by paid-client-hub `record_first_contact`. Until it is set, a client paid since the
--    rule shipped shows WAITING FOR FINDABLE · "Introduce yourself and send the setup link" (derived:
--    src/lib/firstContact.ts + deliveryStage.ts). Nothing is back-filled.
-- 3. The monthly update refuses an ENDED or REFUNDED client (the ended-client guard): until now
--    monthly_update_save / monthly_update_mark_sent never read service_terminated_at, so nothing stopped
--    a draft or a "sent" record for a client whose engagement is over. Both functions are re-created
--    from 20261006100000_client_monthly_updates.sql with ONLY that refusal added (read live 2026-10-04:
--    the live definitions match that file and have no end check).
--
-- ⚠️ NAMED 20261007 03xxxx, NOT 20261006 03xxxx (the plan's per-workstream hour is kept: 03 = WS-3). It
--    re-creates two functions first created by 20261006100000, so it must SORT AFTER that file — a
--    rebuild from migrations in order would otherwise put the old, unguarded functions back.
-- Additive and idempotent: safe to run twice. Nothing is dropped, nothing is rewritten, no row changes.
-- Run statement by statement and read back (information_schema.columns, pg_get_functiondef).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

alter table public.outreach_leads add column if not exists subscription_claim text;
alter table public.outreach_leads add column if not exists subscription_claimed_at timestamptz;

alter table public.outreach_leads add column if not exists client_contacted_at timestamptz;
alter table public.outreach_leads add column if not exists client_contacted_by uuid;
alter table public.outreach_leads add column if not exists client_contacted_via text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'outreach_leads_client_contacted_via_check') then
    alter table public.outreach_leads add constraint outreach_leads_client_contacted_via_check
      check (client_contacted_via is null or client_contacted_via in ('phone', 'email', 'whatsapp', 'other'));
  end if;
end $$;

-- ── save a DRAFT (create or update); a sent update is the record and is refused; an ended or refunded
--    client is refused (pre-sales fix 03) ──
create or replace function public.monthly_update_save(_lead_id uuid, _month date, _measured_note text, _work_done text, _opportunities text, _next_steps text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m date := date_trunc('month', _month)::date;
  owner uuid;
  ended_at timestamptz;
  lead_status text;
  cur record;
  clean text[];
begin
  if public.my_role() is distinct from 'admin' then raise exception 'admin_only' using errcode = '42501'; end if;
  if _lead_id is null or _month is null then return jsonb_build_object('ok', false, 'error', 'bad_request'); end if;
  select user_id, service_terminated_at, status into owner, ended_at, lead_status from public.outreach_leads where id = _lead_id;
  if owner is null then return jsonb_build_object('ok', false, 'error', 'lead_not_found'); end if;
  if ended_at is not null then return jsonb_build_object('ok', false, 'error', 'service_ended'); end if;
  if lead_status = 'refunded' then return jsonb_build_object('ok', false, 'error', 'refunded'); end if;
  if m > date_trunc('month', (now() at time zone 'Europe/London'))::date then
    return jsonb_build_object('ok', false, 'error', 'future_month');
  end if;
  clean := array[nullif(btrim(_measured_note), ''), nullif(btrim(_work_done), ''), nullif(btrim(_opportunities), ''), nullif(btrim(_next_steps), '')];
  if exists (select 1 from unnest(clean) t where char_length(t) > 4000) then
    return jsonb_build_object('ok', false, 'error', 'too_long');
  end if;
  select * into cur from public.client_monthly_updates where lead_id = _lead_id and period_month = m for update;
  if found and cur.status = 'sent' then return jsonb_build_object('ok', false, 'error', 'already_sent'); end if;
  insert into public.client_monthly_updates as u (lead_id, user_id, period_month, measured_note, work_done, opportunities, next_steps, updated_by)
  values (_lead_id, owner, m, clean[1], clean[2], clean[3], clean[4], auth.uid())
  on conflict (lead_id, period_month) do update
    set measured_note = excluded.measured_note, work_done = excluded.work_done, opportunities = excluded.opportunities,
        next_steps = excluded.next_steps, updated_at = now(), updated_by = auth.uid()
    where u.status = 'draft';
  return jsonb_build_object('ok', true, 'period_month', m);
end $$;

-- ── mark it SENT: stores the exact text, the channel, who and when. Once only. Never for an ended or
--    refunded client (pre-sales fix 03) ──
create or replace function public.monthly_update_mark_sent(_lead_id uuid, _month date, _channel text, _message text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m date := date_trunc('month', _month)::date;
  cur record;
  ended_at timestamptz;
  lead_status text;
begin
  if public.my_role() is distinct from 'admin' then raise exception 'admin_only' using errcode = '42501'; end if;
  if _channel is null or _channel not in ('email', 'whatsapp', 'other') then return jsonb_build_object('ok', false, 'error', 'bad_channel'); end if;
  if nullif(btrim(_message), '') is null then return jsonb_build_object('ok', false, 'error', 'empty_message'); end if;
  if char_length(_message) > 12000 then return jsonb_build_object('ok', false, 'error', 'too_long'); end if;
  select service_terminated_at, status into ended_at, lead_status from public.outreach_leads where id = _lead_id;
  if ended_at is not null then return jsonb_build_object('ok', false, 'error', 'service_ended'); end if;
  if lead_status = 'refunded' then return jsonb_build_object('ok', false, 'error', 'refunded'); end if;
  select * into cur from public.client_monthly_updates where lead_id = _lead_id and period_month = m for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_draft'); end if;
  if cur.status = 'sent' then return jsonb_build_object('ok', false, 'error', 'already_sent'); end if;
  update public.client_monthly_updates
     set status = 'sent', sent_at = now(), sent_channel = _channel, sent_by = auth.uid(), message = _message,
         updated_at = now(), updated_by = auth.uid()
   where id = cur.id;
  return jsonb_build_object('ok', true, 'period_month', m);
end $$;

revoke all on function public.monthly_update_save(uuid, date, text, text, text, text) from public, anon;
revoke all on function public.monthly_update_mark_sent(uuid, date, text, text) from public, anon;
grant execute on function public.monthly_update_save(uuid, date, text, text, text, text) to authenticated;
grant execute on function public.monthly_update_mark_sent(uuid, date, text, text) to authenticated;
