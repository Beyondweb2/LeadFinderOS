-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 STOP THE DUPLICATE SENDS FIRST  (2026-09-08 05:20 UTC)
--
-- Live right now: 27 businesses have received BOTH audit_reply_warm and audit_reply, 8–32 minutes
-- apart, and 9 more rows are queued to drain at ~10/minute.
--
-- WHY IT IS HAPPENING: first_reply_template is 'audit_reply_warm', so that is what went out. The
-- parked rows carry template_name = NULL, and the DEPLOYED code resolves NULL to the literal
-- 'audit_reply'. pitchEverSent is PER-TEMPLATE, so it saw no prior 'audit_reply' and sent again.
-- (CLAUDE.md §8 already records this shape from the SJA Locksmiths incident.)
--
-- Clicking Auto reply → OFF in the Inbox is faster than this file and does step 1 on its own.
-- Run step 1 anyway if you are not at the app.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1. STOP IT. Both switches, because either alone leaves a way through. ──────────────────────
update public.whatsapp_outreach_state
   set auto_reply_enabled = false,
       paused = true,
       updated_at = now()
 where id = 1;

-- ── 2. RETIRE THE ROWS STILL WAITING, so nothing resumes when you switch back on ───────────────
-- Look first (expect ~9):
select id, lead_id, status, template_name, fire_after, created_at
  from public.whatsapp_auto_replies
 where status in ('pending', 'processing')
 order by fire_after;

-- Then retire them. Terminal + a reason, never deleted: the row IS the lead's once-ever slot, and
-- deleting it would let the same lead be armed again by a later reply.
update public.whatsapp_auto_replies
   set status = 'skipped_stale',
       reason = 'retired 2026-09-08: parked pitch, template drift caused duplicate sends',
       updated_at = now()
 where status in ('pending', 'processing');

-- ── 3. STAMP THE NULL TEMPLATES, so a future drain cannot resolve them to the old template ────
-- This is the actual root cause made harmless in data as well as in code. Any row that survives
-- with template_name NULL is a row whose template the code decides — and the two sides of that
-- decision disagreed today.
update public.whatsapp_auto_replies
   set template_name = 'audit_reply_warm', updated_at = now()
 where template_name is null
   and status in ('pending', 'processing', 'awaiting_audit', 'audit_only');

-- ── 4. SUPPRESS THE ONE WHO SAID NO ───────────────────────────────────────────────────────────
-- ACO Heating and Plumbing LTD is status 'not_interested' and received a warm send at 05:02.
-- Marking the status never wrote a suppression row (CLAUDE.md §8: the app has never written one),
-- so nothing was stopping it. This closes the phone AND the email AND the lead id.
insert into public.contact_suppressions (phone, email, lead_id, reason, source, created_at)
select l.phone, l.email, l.id, 'not_interested', 'manual_2026_09_08', now()
  from public.outreach_leads l
 where l.status = 'not_interested'
   and l.is_archived = false
   and not exists (
     select 1 from public.contact_suppressions s
      where s.lead_id = l.id or (s.phone is not null and s.phone = l.phone)
   );

-- ── 5. CONFIRM ────────────────────────────────────────────────────────────────────────────────
select auto_reply_enabled, paused, first_reply_template
  from public.whatsapp_outreach_state where id = 1;      -- expect false, true, audit_reply_warm

select status, count(*) from public.whatsapp_auto_replies
 group by status order by count(*) desc;                  -- expect 0 pending, 0 processing

select count(*) as suppressions from public.contact_suppressions;
