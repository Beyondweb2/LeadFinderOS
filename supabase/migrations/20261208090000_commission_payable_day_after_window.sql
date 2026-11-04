-- COMMISSION BECOMES PAYABLE THE DAY AFTER THE GUARANTEE WINDOW (Paul, 2026-11-04, docs/commission-owed.md). Additive and idempotent.
--
-- commission_payable_days() stays the client's refund window (7 on v7, 14 on older agreements). The payable date is now the day after
-- that window's last day, so nothing is due while the client can still claim.
--
-- HISTORY DOES NOT MOVE: no row is updated. On 2026-11-04 results had never been sent, so no ledger row held a date.

create or replace function public.commission_payable_on_for(_lead uuid, _sent timestamptz)
returns date language sql stable security definer set search_path = public as $$
  select case when _sent is null then null
    else (_sent at time zone 'Europe/London')::date
      + public.commission_payable_days((select commercial_terms from public.client_service_terms where lead_id = _lead))
      + 1
    end
$$;
