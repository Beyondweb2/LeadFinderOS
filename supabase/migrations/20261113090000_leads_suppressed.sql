-- Suppressed leads, read the role-checked way (2026-10-20). contact_suppressions has RLS on and NO policies
-- (service-role only since 20260714120000), so the Outreach screen's direct reads of it always came back empty:
-- the bulk-audit dialog and the bulk follow-up count never saw an opted-out or suppressed lead. The senders
-- were never affected (they read it as the service role).
--
-- ⛔ Lead ids in, lead ids out. Never a phone in (a phone argument would let anyone probe whether ANY number is
-- suppressed) and never the reason, the source or another owner's row out. The admin gets any lead; a
-- salesperson only leads they work (can_work_lead) — others are silently left out, never revealed.
-- ⛔ As strict as before: ANY suppression row (every reason) counts, matched on the lead id OR the lead's
-- number, in the server's key (phone_e164_key) and in the plain "+digits" form the screen used to send.
-- Read-only.
create or replace function public.leads_suppressed(_lead_ids uuid[])
 returns uuid[]
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select coalesce(array_agg(l.id), '{}')
    from public.outreach_leads l
   where public.my_role() is not null
     and l.id = any (coalesce(_lead_ids, '{}'))
     and cardinality(coalesce(_lead_ids, '{}')) <= 500
     and public.can_work_lead(l.id)
     and exists (select 1 from public.contact_suppressions s
                  where s.lead_id = l.id
                     or s.phone_e164 = public.phone_e164_key(l.phone)
                     or (nullif(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), '') is not null
                         and s.phone_e164 = '+' || regexp_replace(l.phone, '\D', '', 'g')))
$function$;

revoke all on function public.leads_suppressed(uuid[]) from public, anon;
grant execute on function public.leads_suppressed(uuid[]) to authenticated;
