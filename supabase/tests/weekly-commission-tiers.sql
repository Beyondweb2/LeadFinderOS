-- LIVE TEST of the weekly-tier stamping (migration 20260929180000). ALWAYS ROLLS BACK: it ends by raising.
-- Run through the Management API; the result is the text of the final exception.
-- Expect exact: WEEK[pi_t01=1@30 pi_t02=2@30 pi_t03=3@30 pi_t04=4@40 pi_t05=5@40 pi_t06=6@40 pi_t07=7@50 pi_t08=8@50 pi_t09=9@50 pi_t10=10@50] AFTER_REFUND[pi_t01=1 pi_t02=2 pi_t03=3 pi_t04=4 pi_t05=5 pi_t06=6 pi_t07=7 pi_t08=8 pi_t09=9 pi_t10=10] BOUNDARY[pi_sun=2026-10-05#11@50 pi_mon=2026-10-12#1@30] LEGACY[flat_30_v0@0.3000]
do $$
declare
  s uuid := gen_random_uuid();          -- a throwaway seller id (no FK on sold_by_user_id)
  r text := '';
  got text;
begin
  -- Ten sales, Monday 5 Oct 2026 10:00 London onward, one an hour — EXCEPT #7 and #8, which land in the same
  -- second and are inserted in REVERSE payment-id order, and #3, which arrives last but happened third.
  insert into payment_ledger (kind, status, amount_gbp, occurred_at, stripe_object_id, sold_by_user_id, note)
  select 'initial', 'succeeded', 99, timestamptz '2026-10-05 09:00:00+00' + (i || ' hours')::interval, 'pi_t' || lpad(i::text, 2, '0'), s, 'TEST'
    from generate_series(1, 10) i where i not in (3, 7, 8);
  insert into payment_ledger (kind, status, amount_gbp, occurred_at, stripe_object_id, sold_by_user_id, note)
    values ('initial', 'succeeded', 99, timestamptz '2026-10-05 16:00:00+00', 'pi_t08', s, 'TEST');
  insert into payment_ledger (kind, status, amount_gbp, occurred_at, stripe_object_id, sold_by_user_id, note)
    values ('initial', 'succeeded', 99, timestamptz '2026-10-05 16:00:00+00', 'pi_t07', s, 'TEST');
  insert into payment_ledger (kind, status, amount_gbp, occurred_at, stripe_object_id, sold_by_user_id, note)
    values ('initial', 'succeeded', 99, timestamptz '2026-10-05 12:00:00+00', 'pi_t03', s, 'TEST');

  select string_agg(stripe_object_id || '=' || commission_week_seq || '@' || (commission_rate * 100)::int, ' ' order by commission_week_seq)
    into got from payment_ledger where sold_by_user_id = s and commission_week_start = date '2026-10-05';
  r := r || 'WEEK[' || got || '] ';

  -- A later refund of client 2 must renumber nothing.
  insert into payment_ledger (kind, status, amount_gbp, occurred_at, stripe_object_id, sold_by_user_id, note)
    values ('refund', 'succeeded', 99, timestamptz '2026-10-08 10:00:00+00', 'ch_refund_t02', s, 'TEST');
  select string_agg(stripe_object_id || '=' || commission_week_seq, ' ' order by commission_week_seq)
    into got from payment_ledger where sold_by_user_id = s and kind = 'initial' and commission_week_start = date '2026-10-05';
  r := r || 'AFTER_REFUND[' || got || '] ';

  -- Sunday 11 Oct 23:30 London (22:30 UTC, BST) is still this week; Monday 00:30 London starts the next.
  insert into payment_ledger (kind, status, amount_gbp, occurred_at, stripe_object_id, sold_by_user_id, note)
    values ('initial', 'succeeded', 99, timestamptz '2026-10-11 22:30:00+00', 'pi_sun', s, 'TEST'),
           ('initial', 'succeeded', 99, timestamptz '2026-10-11 23:30:00+00', 'pi_mon', s, 'TEST');
  select string_agg(stripe_object_id || '=' || commission_week_start || '#' || commission_week_seq || '@' || (commission_rate * 100)::int, ' ')
    into got from payment_ledger where sold_by_user_id = s and stripe_object_id in ('pi_sun', 'pi_mon');
  r := r || 'BOUNDARY[' || got || '] ';

  -- A pre-tier row is never renumbered or counted.
  select coalesce(string_agg(commission_rule || '@' || commission_rate, ' '), 'none') into got from payment_ledger where commission_rule = 'flat_30_v0';
  r := r || 'LEGACY[' || got || ']';

  raise exception 'ROLLBACK_ONLY %', r;
end $$;
