-- ════════════════════════════════════════════════════════════════════════════════════════════
-- CROSS-CHANNEL SUPPRESSION — "one no anywhere means suppressed everywhere, forever".
--
-- ⛔ WHAT WAS WRONG. contact_suppressions was keyed on phone_e164 ONLY, so it could not express
--    "do not email this address" even in principle. It was read by the WhatsApp and SMS queues and
--    by nothing else — instantly-push and bulk-jobs never looked at it. Measured 2026-08-08:
--    142 leads have said no (31 not_interested, 1 opted_out, 1 closed, 4 suppressed phones,
--    114 archived). The WhatsApp queue reached 0 of them. The audit batch could reach 142 of 142.
--    instantly-push could reach 1 — and only because 141 had no email address yet. 79 of those 141
--    have a website, so the Find emails crawl would have handed them one.
--
-- ⚠️ NULLS ARE DISTINCT IN A POSTGRES UNIQUE CONSTRAINT, which is what makes this shape work:
--    phone_e164 becomes nullable and KEEPS its plain unique constraint, so twilio-inbound's
--    existing `upsert(..., { onConflict: "phone_e164" })` still infers it. A PARTIAL unique index
--    (WHERE phone_e164 IS NOT NULL) would NOT be inferable from `ON CONFLICT (phone_e164)` and
--    would break that upsert at runtime — which is exactly the sort of thing that only shows up
--    when someone texts STOP.
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1. VERIFY BEFORE (expect: 4 rows, and 142 leads to back-fill) ───────────────────────────────
-- select count(*) as suppressions_now from public.contact_suppressions;
-- select count(*) as to_backfill from public.outreach_leads
--   where status in ('not_interested','opted_out','closed') or is_archived = true;

-- ── 2. SCHEMA ──────────────────────────────────────────────────────────────────────────────────
alter table public.contact_suppressions
  alter column phone_e164 drop not null;

alter table public.contact_suppressions
  add column if not exists email   text,
  add column if not exists lead_id uuid;

-- Plain unique constraints (NOT partial) so ON CONFLICT (<col>) stays inferable for both.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contact_suppressions_email_key') then
    alter table public.contact_suppressions add constraint contact_suppressions_email_key unique (email);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contact_suppressions_lead_key') then
    alter table public.contact_suppressions add constraint contact_suppressions_lead_key unique (lead_id);
  end if;
  -- A row with no identifier at all would suppress nobody and block nothing.
  if not exists (select 1 from pg_constraint where conname = 'contact_suppressions_identifier_ck') then
    alter table public.contact_suppressions add constraint contact_suppressions_identifier_ck
      check (phone_e164 is not null or email is not null or lead_id is not null);
  end if;
end $$;

create index if not exists contact_suppressions_email_idx   on public.contact_suppressions (email);
create index if not exists contact_suppressions_lead_idx    on public.contact_suppressions (lead_id);

comment on column public.contact_suppressions.email is
  'Lowercased. Suppresses this address on every channel. NULL when the no arrived by phone.';
comment on column public.contact_suppressions.lead_id is
  'Suppresses this lead row even when it has neither phone nor email (archived rows often do).';

-- ── 3. BACKFILL — all 142, including the 114 archived ──────────────────────────────────────────
-- Idempotent: ON CONFLICT DO NOTHING covers all three unique constraints, so re-running is safe.
-- Two leads sharing a phone: the first wins, the second is skipped — the person is suppressed
-- either way, which is what matters.
insert into public.contact_suppressions (phone_e164, email, lead_id, reason, source)
select
  case when coalesce(trim(l.phone), '') <> ''
       then '+' || regexp_replace(l.phone, '\D', '', 'g') end,
  nullif(lower(trim(coalesce(l.email, ''))), ''),
  l.id,
  case
    when l.status = 'opted_out'     then 'opted_out'
    when l.status = 'not_interested' then 'not_interested'
    when l.status = 'closed'         then 'closed'
    when l.is_archived               then 'archived'
  end,
  'backfill_2026_08_08'
from public.outreach_leads l
where l.status in ('not_interested', 'opted_out', 'closed')
   or l.is_archived = true
on conflict do nothing;

-- ── 4. VERIFY AFTER ────────────────────────────────────────────────────────────────────────────
-- select count(*) as suppressions_after from public.contact_suppressions;      -- expect ~146
-- select source, reason, count(*) from public.contact_suppressions group by 1,2 order by 3 desc;
-- Nobody who said no should be missing:
-- select count(*) as still_unsuppressed
--   from public.outreach_leads l
--   where (l.status in ('not_interested','opted_out','closed') or l.is_archived = true)
--     and not exists (
--       select 1 from public.contact_suppressions s
--        where s.lead_id = l.id
--           or (s.phone_e164 is not null and s.phone_e164 = '+' || regexp_replace(coalesce(l.phone,''), '\D', '', 'g'))
--     );   -- expect 0
