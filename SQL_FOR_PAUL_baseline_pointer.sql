-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- THE BASELINE POINTER — one column naming THE baseline, claimed in the same transaction as the
-- audit that creates it, and immutable once set.
--
-- WHY A TRIGGER AND NOT APPLICATION CODE:
-- Paul's requirement was "write it in the SAME statement that creates the audit, not after".
-- Two tables (ai_audits, outreach_leads) CANNOT be written by one PostgREST statement, so an edge
-- function can only ever do insert-then-update — which is exactly the best-effort hole
-- baseline_contract already has, and the ambiguity the 2026-09-12 fix now has to stop on.
-- A trigger runs inside the INSERT's own transaction: the pointer cannot exist without the audit,
-- and cannot fail separately from it.
--
-- WHY A CONDITIONAL UPDATE AND NOT A CONSTRAINT (Paul's question 1b):
-- A CHECK constraint sees only the row being written, never the value it is replacing, so
-- "immutable once set" is not expressible as one. UNIQUE does not help either — it forbids two
-- leads sharing a pointer, which is not the rule we want. Immutability across an UPDATE is
-- inherently a trigger. So there are two:
--   1. the CLAIM trigger uses `WHERE baseline_audit_id IS NULL` — first baseline wins, later ones
--      are no-ops rather than overwrites;
--   2. the GUARD trigger REJECTS any statement that changes a non-null pointer, so nothing else in
--      the system (or a stray hand-run UPDATE) can move it silently.
-- Belt and braces, and the second is what makes "never overwritten" true rather than intended.
--
-- SAFE TO RUN MORE THAN ONCE. Every statement is IF NOT EXISTS / CREATE OR REPLACE / DROP-then-
-- CREATE. It adds columns and triggers; it changes no existing row.
--
-- ⚠️ RUN THIS BEFORE RELYING ON THE FEATURE, BUT IT IS NOT URGENT TO RUN IT FIRST. The deployed
-- code is migration-tolerant: without these columns it sheds `audit_purpose` from the insert and
-- the like-for-like refusal simply never fires (no pointer is ever found). Nothing breaks; the
-- feature is absent rather than half-present.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1. THE PURPOSE, ON THE AUDIT ────────────────────────────────────────────────────────────────
-- There was no purpose column at all, which is why nothing could identify THE baseline:
-- baseline_contract is written to EVERY audit startPaidBaseline creates, so ten runaway baselines
-- produced ten contracts and none of them was authoritative.
alter table public.ai_audits
  add column if not exists audit_purpose text;

comment on column public.ai_audits.audit_purpose is
  'baseline | measurement | market | audit. Written by create-ai-audit IN the insert. Read by the '
  'claim trigger below to set outreach_leads.baseline_audit_id in the same transaction.';

-- ── 2. THE POINTER, ON THE LEAD ─────────────────────────────────────────────────────────────────
-- ON DELETE SET NULL deliberately: deleting a baseline audit (as after the 2026-09-12 duplicates)
-- must leave the lead with NO baseline recorded, which the replay refuses on. It must never leave a
-- pointer at a row that is gone — planReplay has a branch for that, but the honest state is null.
alter table public.outreach_leads
  add column if not exists baseline_audit_id uuid
  references public.ai_audits(id) on delete set null;

comment on column public.outreach_leads.baseline_audit_id is
  'THE baseline audit for this client. Claimed by trigger in the same transaction as the audit '
  'insert; immutable once set (see trg_outreach_leads_baseline_pointer_immutable). NULL means no '
  'baseline is recorded, which is a real answer and makes a re-measure refuse rather than guess.';

create index if not exists idx_outreach_leads_baseline_audit
  on public.outreach_leads (baseline_audit_id)
  where baseline_audit_id is not null;

-- ── 3. THE CLAIM: first baseline wins, in the audit's own transaction ───────────────────────────
create or replace function public.claim_baseline_pointer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only a baseline claims the pointer. A measurement, a market audit and an outreach hook do not.
  if new.audit_purpose is distinct from 'baseline' or new.lead_id is null then
    return new;
  end if;
  -- WHERE baseline_audit_id IS NULL is the whole idempotency rule: the second, third and tenth
  -- baseline are no-ops rather than overwrites. Had this existed on 2026-09-12 the ten duplicate
  -- audits would still have been created, but the FIRST would have stayed authoritative throughout.
  update public.outreach_leads
     set baseline_audit_id = new.id
   where id = new.lead_id
     and baseline_audit_id is null;
  return new;
end;
$$;

drop trigger if exists trg_ai_audits_claim_baseline_pointer on public.ai_audits;
create trigger trg_ai_audits_claim_baseline_pointer
  after insert on public.ai_audits
  for each row
  execute function public.claim_baseline_pointer();

-- ── 4. THE GUARD: never overwritten, enforced ───────────────────────────────────────────────────
-- This is the half that makes "never overwritten" true rather than merely intended. Clearing it to
-- NULL is allowed (that is how you unset a wrong pointer, and how ON DELETE SET NULL works);
-- MOVING it from one audit to another is refused.
create or replace function public.guard_baseline_pointer_immutable()
returns trigger
language plpgsql
as $$
begin
  if old.baseline_audit_id is not null
     and new.baseline_audit_id is not null
     and new.baseline_audit_id is distinct from old.baseline_audit_id then
    raise exception
      'baseline_audit_id is immutable once set (lead %, % -> %). Clear it to NULL first if it is '
      'genuinely wrong — a silently moved baseline changes what a refund is measured against.',
      old.id, old.baseline_audit_id, new.baseline_audit_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_outreach_leads_baseline_pointer_immutable on public.outreach_leads;
create trigger trg_outreach_leads_baseline_pointer_immutable
  before update of baseline_audit_id on public.outreach_leads
  for each row
  execute function public.guard_baseline_pointer_immutable();

-- ── 5. VERIFY — read the schema back, do not trust the success message ──────────────────────────
-- A migration that "ran fine" while the code still cannot see a column is a recorded failure mode.
select 'columns' as check, table_name, column_name
  from information_schema.columns
 where (table_name = 'ai_audits'      and column_name = 'audit_purpose')
    or (table_name = 'outreach_leads' and column_name = 'baseline_audit_id')
union all
select 'triggers', event_object_table, trigger_name
  from information_schema.triggers
 where trigger_name in ('trg_ai_audits_claim_baseline_pointer',
                        'trg_outreach_leads_baseline_pointer_immutable')
 order by 1, 2, 3;
-- EXPECT 4 rows: 2 columns + 2 triggers.
