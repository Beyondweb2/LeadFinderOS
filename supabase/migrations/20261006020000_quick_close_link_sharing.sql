-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- QUICK CLOSE: LINK LIFECYCLE + SHARING (pre-sales fix workstream 2, 2026-10-04;
-- docs/pre-sales-certification/fixes-02-quick-close.md). Additive and idempotent.
--
-- 1. quick_close_events may record three more kinds:
--      link_shared        a payment link was copied / emailed / sent on WhatsApp (M-015)
--      link_share_failed  an email or WhatsApp send of the link was refused or failed
--      link_superseded    a Checkout Session was replaced (answers changed, a fresh link, a duplicate
--                         generation) and expired at Stripe so only one link can be paid (M-014 / B-16)
--    ⛔ NOT commission evidence: earnings.ts reads only link_generated / link_reused, unchanged.
-- 2. lead_activity (History) may record `payment_link_shared`.
--
-- ⛔ BOTH CHECKS ARE WIDENED FROM THEIR LIVE DEFINITION, never re-typed as a full list: other workstreams
--    widen lead_activity_kind_check in parallel, and a hand-written list here would silently delete
--    whatever they added (or they would delete ours). Each value is appended only if missing.
-- Apply BEFORE deploying fn quick-close (until then its new events and History rows are refused by the
-- check and only logged — no flow breaks, but nothing is recorded).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create or replace function pg_temp.qc_widen_kind_check(_table regclass, _constraint text, _add text[])
returns void language plpgsql as $$
declare v_def text; v_vals text[]; v text;
begin
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c where c.conrelid = _table and c.conname = _constraint;
  if v_def is null then raise exception 'constraint % on % not found', _constraint, _table; end if;
  -- Postgres prints the list as ARRAY['a'::text, …] (how every migration writes it) or as '{a,b}'::text[].
  if v_def ~ '''\{' then
    v_vals := string_to_array(substring(v_def from '''\{([^}]*)\}'''), ',');
  else
    select coalesce(array_agg(m[1] order by ord), '{}') into v_vals
      from regexp_matches(v_def, '''([^'']+)''', 'g') with ordinality as t(m, ord);
  end if;
  if coalesce(array_length(v_vals, 1), 0) = 0 then raise exception 'could not read the values of %', _constraint; end if;
  foreach v in array _add loop
    if not (v = any(v_vals)) then v_vals := v_vals || v; end if;
  end loop;
  execute format('alter table %s drop constraint %I', _table, _constraint);
  -- Written back in the ARRAY['…'] form, so the next widening (by anyone) reads it the usual way.
  execute format('alter table %s add constraint %I check (kind = any (array[%s]::text[]))', _table, _constraint,
    (select string_agg(quote_literal(x), ', ') from unnest(v_vals) as x));
end $$;

select pg_temp.qc_widen_kind_check('public.quick_close_events'::regclass, 'quick_close_events_kind_check',
  array['link_shared', 'link_share_failed', 'link_superseded']);
select pg_temp.qc_widen_kind_check('public.lead_activity'::regclass, 'lead_activity_kind_check',
  array['payment_link_shared']);
