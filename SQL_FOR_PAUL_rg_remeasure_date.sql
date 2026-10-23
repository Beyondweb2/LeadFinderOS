-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- PIN RG LOCKSMITHS' RE-MEASURE DATE — run this, and it only matters for him.
--
-- 🔴 WHY IT IS NEEDED. The product moved to a 4-week cycle on 2026-09-03, so
-- REMEASURE_OFFSET_DAYS went 56 → 28. That constant only supplies a DEFAULT for a lead whose
-- remeasure_due_date is null — and RG's is null, so his date is derived. Without this his
-- re-measure would silently jump from 6 Oct to 8 Sep (five days from the change).
--
-- ⛔ AND HE IS THE ONE LEGACY OUTCOME-GUARANTEE CLIENT. He was sold "named in more AI answers
-- after 8 WEEKS than today" — audit-baseline.ts freezes that promise and its scored question set
-- for him specifically. Moving his date would change what he was sold, four weeks early, without
-- anyone deciding to.
--
-- Ronnie needs nothing: his row already carries 2026-10-13, so the constant never touched him.
--
-- Baseline 2026-08-11 + 56 days = 2026-10-06, which is the date already recorded in CLAUDE.md §5
-- as his re-measure ("~6 Oct").
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- Guarded on the null: if a date has been set by hand since, this changes nothing.
update public.outreach_leads
   set remeasure_due_date = '2026-10-06'
 where id = '800425fe-00cc-46bf-a281-df57de6f8d4e'
   and remeasure_due_date is null;

-- CONFIRM (expect one row, 2026-10-06)
select business_name, payment_date::date, remeasure_due_date
  from public.outreach_leads
 where amount_paid > 0
 order by payment_date;
