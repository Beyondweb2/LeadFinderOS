-- "AUDIT AFTER FIRST REPLY" IS ITS OWN SWITCH (2026-10-22, Paul). Record: docs/ai-handles-replies.md "Two controls".
-- Until now Manual turned the reply audit off too (auto_reply_enabled = mode <> 'manual'). Now:
--   · reply_audit_enabled (On / Off) — run the website check and the audit when a prospect first replies. Independent of the mode.
--   · ai_reply_mode (Manual / Draft for approval / Auto) — unchanged, drafting only.
-- ⛔ auto_reply_enabled stays the column every deployed audit-arming path reads (process-whatsapp-queue, create-ai-audit,
--    process-ai-audit-queue, _shared/first-reply-audit.ts): the trigger now copies it FROM reply_audit_enabled, so none of
--    them changes or is redeployed. An old writer of auto_reply_enabled alone (process-whatsapp-queue's set_auto_reply /
--    set_first_reply_mode) moves reply_audit_enabled the same way, so the two can never disagree.
-- ⛔ Nothing else in the trigger changes: ai_handles_replies = mode <> 'manual', first_reply_mode = 'audit_only', leaving Manual
--    stamps ai_handles_replies_since, an old writer of ai_handles_replies alone moves the mode to draft / manual (never auto).
-- The live row keeps today's behaviour: reply_audit_enabled = its current auto_reply_enabled.
-- Rollback (Paul only): re-run section 3 of 20261117090000_inbox_reply_mode.sql (the column may stay).

set local lock_timeout = '5s';

alter table public.whatsapp_outreach_state add column if not exists reply_audit_enabled boolean;
update public.whatsapp_outreach_state set reply_audit_enabled = coalesce(auto_reply_enabled, false) where reply_audit_enabled is null;
alter table public.whatsapp_outreach_state alter column reply_audit_enabled set default false;
alter table public.whatsapp_outreach_state alter column reply_audit_enabled set not null;

create or replace function public._inbox_reply_mode_sync()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'UPDATE' and new.ai_reply_mode is not distinct from old.ai_reply_mode
     and new.ai_handles_replies is distinct from old.ai_handles_replies then
    -- An old writer of the switch alone: on = draft (never auto), off = manual.
    new.ai_reply_mode := case when new.ai_handles_replies is true then 'draft' else 'manual' end;
  end if;
  if tg_op = 'UPDATE' and new.reply_audit_enabled is not distinct from old.reply_audit_enabled
     and new.auto_reply_enabled is distinct from old.auto_reply_enabled then
    -- An old writer of the audit toggle alone moves the new switch.
    new.reply_audit_enabled := coalesce(new.auto_reply_enabled, false);
  end if;
  new.ai_handles_replies := new.ai_reply_mode <> 'manual';
  new.auto_reply_enabled := coalesce(new.reply_audit_enabled, false);
  new.first_reply_mode := 'audit_only';
  -- Leaving Manual starts the clock: replies from before are never drafted (no backlog spend).
  if new.ai_reply_mode <> 'manual' and (tg_op = 'INSERT' or old.ai_reply_mode = 'manual') then
    new.ai_handles_replies_since := now();
  end if;
  return new;
end; $$;
revoke all on function public._inbox_reply_mode_sync() from public, anon, authenticated;

-- Read back:
--   select ai_reply_mode, reply_audit_enabled, auto_reply_enabled, ai_handles_replies, first_reply_mode from public.whatsapp_outreach_state where id = 1;
--     (expect: draft, true, true, true, audit_only — today's behaviour unchanged)
