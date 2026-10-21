-- THE INBOX REPLY MODE (2026-10-21, Paul). Record: docs/ai-handles-replies.md "One mode".
-- ONE stored answer replaces "When a prospect replies" (Do nothing / Audit only / Audit and reply) AND the "AI handles
-- replies" switch: Manual · Draft for approval · Auto. Rules: src/lib/inboxReplyMode.ts.
--   manual — nothing automatic on a reply: no audit, no draft (Needs you flags still run: rules only, no model).
--   draft  — the reply audit runs and every reply gets a draft that waits for Approve & send (today's behaviour).
--   auto   — as draft, and a draft whose reply type an admin switched on (all off) may send itself (src/lib/aiAutoSend.ts).
--
-- ⛔ "Audit and reply" is RETIRED: first_reply_mode may only be 'audit_only' from now on (CHECK). No path can arm the old
--    template reply, because every path reads that column (process-whatsapp-queue, create-ai-audit, the completion step).
-- ⛔ The old columns stay, kept in step by a BEFORE trigger, so every deployed function keeps reading a true value:
--    ai_handles_replies = mode <> 'manual'; auto_reply_enabled = mode <> 'manual'; first_reply_mode = 'audit_only'.
--    An old writer of ai_handles_replies alone (a not-yet-redeployed function) moves the mode to draft / manual — never auto.
-- ⛔ Leaving Auto cancels every automatic reply still waiting (trg_ai_auto_send_switch, extended here).
-- Migration of the live row: AI on + Audit only → 'draft'. AI off → 'manual'.
-- Rollback (Paul only): drop trigger trg_inbox_reply_mode_sync on public.whatsapp_outreach_state; drop function public._inbox_reply_mode_sync();
--   alter table public.whatsapp_outreach_state drop constraint whatsapp_outreach_state_first_reply_mode_chk;
--   alter table public.whatsapp_outreach_state add constraint whatsapp_outreach_state_first_reply_mode_chk check (first_reply_mode in ('audit_only','send'));
--   (then re-run section 8 of 20261116090000_ai_auto_send.sql for the old switch trigger; the column may stay.)

set local lock_timeout = '5s';

-- ── 1. The mode ──────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.whatsapp_outreach_state add column if not exists ai_reply_mode text;
update public.whatsapp_outreach_state
   set ai_reply_mode = case when ai_handles_replies is true then 'draft' else 'manual' end
 where ai_reply_mode is null;
alter table public.whatsapp_outreach_state alter column ai_reply_mode set default 'manual';
alter table public.whatsapp_outreach_state alter column ai_reply_mode set not null;
alter table public.whatsapp_outreach_state drop constraint if exists whatsapp_outreach_state_ai_reply_mode_check;
alter table public.whatsapp_outreach_state add constraint whatsapp_outreach_state_ai_reply_mode_check
  check (ai_reply_mode in ('manual', 'draft', 'auto'));

-- ── 2. Retire "Audit and reply" ──────────────────────────────────────────────────────────────────────────────────
update public.whatsapp_outreach_state set first_reply_mode = 'audit_only' where first_reply_mode is distinct from 'audit_only';
alter table public.whatsapp_outreach_state drop constraint if exists whatsapp_outreach_state_first_reply_mode_chk;
alter table public.whatsapp_outreach_state add constraint whatsapp_outreach_state_first_reply_mode_chk
  check (first_reply_mode = 'audit_only');
-- A pitch row still parked for the old automatic send is retired, never sent (none existed on 2026-10-21).
update public.whatsapp_auto_replies set status = 'cancelled', reason = 'Audit and reply retired (inbox reply mode)', updated_at = now()
 where status in ('awaiting_audit', 'pending');

-- ── 3. Keep the old columns in step with the mode ────────────────────────────────────────────────────────────────
create or replace function public._inbox_reply_mode_sync()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'UPDATE' and new.ai_reply_mode is not distinct from old.ai_reply_mode
     and new.ai_handles_replies is distinct from old.ai_handles_replies then
    -- An old writer of the switch alone: on = draft (never auto), off = manual.
    new.ai_reply_mode := case when new.ai_handles_replies is true then 'draft' else 'manual' end;
  end if;
  new.ai_handles_replies := new.ai_reply_mode <> 'manual';
  new.auto_reply_enabled := new.ai_reply_mode <> 'manual';
  new.first_reply_mode := 'audit_only';
  -- Leaving Manual starts the clock: replies from before are never drafted (no backlog spend).
  if new.ai_reply_mode <> 'manual' and (tg_op = 'INSERT' or old.ai_reply_mode = 'manual') then
    new.ai_handles_replies_since := now();
  end if;
  return new;
end; $$;
revoke all on function public._inbox_reply_mode_sync() from public, anon, authenticated;
drop trigger if exists trg_inbox_reply_mode_sync on public.whatsapp_outreach_state;
create trigger trg_inbox_reply_mode_sync before insert or update on public.whatsapp_outreach_state
  for each row execute function public._inbox_reply_mode_sync();

-- ── 4. The kill switch follows the mode: anything but Auto cancels every waiting automatic reply ─────────────────
create or replace function public._ai_auto_send_switch()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.ai_reply_mode is distinct from 'auto' or new.ai_handles_replies is not true then
    update public.inbox_scheduled_sends set status = 'cancelled', cancel_reason = 'ai_mode_not_auto', updated_at = now()
     where ai_draft_id is not null and status in ('scheduled', 'held');
  else
    update public.inbox_scheduled_sends set status = 'cancelled', cancel_reason = 'ai_type_off', updated_at = now()
     where ai_draft_id is not null and status in ('scheduled', 'held')
       and not (coalesce(ai_intent, '') = any (coalesce(new.ai_auto_send_intents, '{}'::text[])));
  end if;
  return new;
end; $$;
revoke all on function public._ai_auto_send_switch() from public, anon, authenticated;
drop trigger if exists trg_ai_auto_send_switch on public.whatsapp_outreach_state;
create trigger trg_ai_auto_send_switch after update of ai_reply_mode, ai_handles_replies, ai_auto_send_intents on public.whatsapp_outreach_state
  for each row execute function public._ai_auto_send_switch();

-- Read back:
--   select ai_reply_mode, ai_handles_replies, auto_reply_enabled, first_reply_mode, ai_auto_send_intents from public.whatsapp_outreach_state where id = 1;
--     (expect: draft, true, true, audit_only, {})
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conname in
--     ('whatsapp_outreach_state_ai_reply_mode_check', 'whatsapp_outreach_state_first_reply_mode_chk');
--   select tgname from pg_trigger where tgname in ('trg_inbox_reply_mode_sync', 'trg_ai_auto_send_switch');
