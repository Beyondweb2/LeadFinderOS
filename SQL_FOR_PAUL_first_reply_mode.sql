-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- THE THREE-WAY REPLY RULE  (2026-09-08)
--
-- Adds the mode column behind the new Inbox control, and retires the parked pitches that would
-- otherwise fire the moment the rule is switched on.
--
-- 🔴 RUN THIS BEFORE THE CODE IS DEPLOYED — or rather, it is safe either way, and here is why:
-- firstReplyMode() resolves a missing column, a failed read, a NULL and an unknown value all to
-- 'audit_only'. So deploying first means the rule measures and sends nothing; it cannot become a
-- sending rule by accident. (CLAUDE.md's SQL-first rule exists because findable-onboarding v18
-- died for 20 minutes on absent columns — this code is written not to.)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1. THE MODE COLUMN ────────────────────────────────────────────────────────────────────────
-- Two fields, not one, and deliberately: `auto_reply_enabled` stays the on/off, `first_reply_mode`
-- says which of the two working behaviours applies. Collapsing them into one enum would lose the
-- chosen behaviour every time the rule is paused.
alter table public.whatsapp_outreach_state
  add column if not exists first_reply_mode text not null default 'audit_only';

-- A typo must not be storable: the trigger would then have to guess, and its guess is 'audit_only',
-- which would silently ignore an operator who had asked for sending.
do $$
begin
  alter table public.whatsapp_outreach_state
    add constraint whatsapp_outreach_state_first_reply_mode_chk
    check (first_reply_mode in ('audit_only', 'send'));
exception
  when duplicate_object then null;   -- already applied
end $$;

-- Paul's main use. Explicit rather than relying on the column default, because the row already
-- exists and a default only applies to new rows.
update public.whatsapp_outreach_state
   set first_reply_mode = 'audit_only', updated_at = now()
 where id = 1;

-- ── 2. RETIRE THE PARKED PITCHES ──────────────────────────────────────────────────────────────
-- 🔴 WHY: measured 2026-09-08, there are 18 `pending` first_reply rows sitting past their
-- fire_after — held back by nothing but the toggle being off. Four belong to leads already at
-- status `report_sent`. Turning the rule on would have sent all eighteen, days late, on the next
-- tick. The code now also refuses anything older than AUTO_REPLY_STALE_MS (6h), so this is
-- cleanup rather than the fix — but it means the rows read honestly instead of looking pending.
--
-- Look first. Expect ~18 rows, all trigger first_reply (or null), all fire_after in the past.
select id, lead_id, status, trigger, template_name, fire_after, created_at
  from public.whatsapp_auto_replies
 where status = 'pending'
   and coalesce(trigger, 'first_reply') = 'first_reply'
   and fire_after < now() - interval '6 hours'
 order by created_at;

-- Then retire them. Terminal, with the reason on the row, so nothing re-arms them and the history
-- says what happened. Not deleted: the row is this lead's once-ever slot, and deleting it would
-- let the same lead be armed again by a later reply.
update public.whatsapp_auto_replies
   set status = 'skipped_stale',
       reason = 'retired 2026-09-08: parked while the reply rule was off, too old to send',
       updated_at = now()
 where status = 'pending'
   and coalesce(trigger, 'first_reply') = 'first_reply'
   and fire_after < now() - interval '6 hours';

-- ── 3. CONFIRM ────────────────────────────────────────────────────────────────────────────────
-- Expect: mode 'audit_only', enabled false (until you press the control), and 0 stale pending rows.
select first_reply_mode, auto_reply_enabled, first_reply_template
  from public.whatsapp_outreach_state where id = 1;

select status, count(*)
  from public.whatsapp_auto_replies
 group by status
 order by count(*) desc;
