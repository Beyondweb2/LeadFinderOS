-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- THE BACKFILL AUDIT — read only. It changes nothing and decides nothing.
--
-- ⛔ IT DELIBERATELY DOES NOT PICK. Where there is no defensible answer the honest state is "no
-- baseline recorded", not a guess: a wrong pointer silently changes what a refund is measured
-- against, and a NULL one makes the re-measure refuse out loud. This query tells you which leads
-- have a defensible answer and which do not. You decide each one.
--
-- HOW IT GRADES:
--   ONE_CLEAN_BASELINE  exactly one multi-run audit → that is the baseline, no judgement needed
--   ONE_SET_MANY_AUDITS several multi-run audits but they all ask the SAME question set → any of
--                       them is a valid before side; take the earliest
--   AMBIGUOUS           several multi-run audits asking DIFFERENT sets → no defensible answer from
--                       the data alone. This is ABLM's shape. Leave NULL unless you can say which
--                       one you actually sold against
--   NO_MULTI_RUN        paid, but never got a multi-run measurement at all
-- ════════════════════════════════════════════════════════════════════════════════════════════════

with paid as (
  select id as lead_id, business_name, amount_paid, payment_date
  from public.outreach_leads
  where amount_paid > 0
),
-- One row per (audit, run-1 question set). The set is the FIRST run's questions, deduped
-- case-insensitively and ORDER-INDEPENDENT, exactly as the audit queue and the lock compare them.
audit_sets as (
  select a.lead_id,
         a.id                          as audit_id,
         a.created_at,
         a.audit_purpose,
         a.baseline_target_runs,
         a.is_measurement,
         (a.baseline_contract is not null) as has_contract,
         count(distinct lower(btrim(q.question))) as q_count,
         md5(string_agg(distinct lower(btrim(q.question)), '|' order by lower(btrim(q.question)))) as set_key
  from public.ai_audits a
  join public.ai_audit_runs r
    on r.audit_id = a.id
   and r.run_number = (select min(r2.run_number) from public.ai_audit_runs r2 where r2.audit_id = a.id)
  join public.ai_audit_queue q on q.run_id = r.id
  where a.lead_id in (select lead_id from paid)
    and coalesce(a.baseline_target_runs, 0) > 1      -- multi-run only: a 1-run audit is not a baseline
    and coalesce(a.is_market, false) = false
  group by a.id
),
rolled as (
  select p.lead_id,
         p.business_name,
         p.amount_paid,
         count(s.audit_id)                      as multi_run_audits,
         count(distinct s.set_key)              as distinct_question_sets,
         min(s.created_at)                      as earliest_multi_run,
         (array_agg(s.audit_id order by s.created_at))[1] as earliest_audit_id,
         (array_agg(s.q_count  order by s.created_at))[1] as earliest_q_count
  from paid p
  left join audit_sets s on s.lead_id = p.lead_id
  group by p.lead_id, p.business_name, p.amount_paid
)
select business_name,
       lead_id,
       amount_paid,
       multi_run_audits,
       distinct_question_sets,
       case
         when multi_run_audits = 0 then 'NO_MULTI_RUN'
         when multi_run_audits = 1 then 'ONE_CLEAN_BASELINE'
         when distinct_question_sets = 1 then 'ONE_SET_MANY_AUDITS'
         else 'AMBIGUOUS'
       end                                       as verdict,
       -- Only suggested where the data itself is unambiguous. NULL means: decide by hand or leave it.
       case
         when multi_run_audits = 1 or (multi_run_audits > 1 and distinct_question_sets = 1)
           then earliest_audit_id
         else null
       end                                       as defensible_baseline_audit_id,
       earliest_q_count                          as questions_in_that_set,
       earliest_multi_run,
       (select baseline_audit_id from public.outreach_leads l where l.id = rolled.lead_id) as pointer_now
from rolled
order by verdict, business_name;


-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- RG LOCKSMITHS, ON ITS OWN — the October re-measure is a controlled experiment, so this one has to
-- be checked rather than assumed. It lists EVERY multi-run audit with its question set, so you can
-- see with your own eyes whether one clean baseline exists.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
select a.id            as audit_id,
       a.created_at::date,
       a.audit_purpose,
       a.baseline_target_runs,
       a.is_measurement,
       (a.baseline_contract is not null) as has_contract,
       count(distinct r.id)              as runs,
       count(distinct lower(btrim(q.question))) as distinct_questions,
       md5(string_agg(distinct lower(btrim(q.question)), '|' order by lower(btrim(q.question)))) as set_key,
       string_agg(distinct btrim(q.question), ' | ' order by btrim(q.question)) as questions
from public.ai_audits a
left join public.ai_audit_runs  r on r.audit_id = a.id
left join public.ai_audit_queue q on q.audit_id = a.id
where a.lead_id = (
        select id from public.outreach_leads
        where business_name ilike '%RG Locksmiths%'
        order by amount_paid desc nulls last limit 1)
  and coalesce(a.baseline_target_runs, 0) > 1
group by a.id
order by a.created_at;
-- READ set_key: if every row shares one set_key, RG has one clean baseline and October holds.
-- If they differ, the October before/after compares only the questions common to the two sides —
-- check that before the date, not after it.


-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- SETTING A POINTER BY HAND, once you have decided. One lead at a time, deliberately.
-- The immutability trigger refuses to MOVE a pointer, so clear it first if you are correcting one.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- update public.outreach_leads set baseline_audit_id = null where id = 'PASTE-LEAD-UUID';
-- update public.outreach_leads set baseline_audit_id = 'PASTE-AUDIT-UUID'
--  where id = 'PASTE-LEAD-UUID' and baseline_audit_id is null;
