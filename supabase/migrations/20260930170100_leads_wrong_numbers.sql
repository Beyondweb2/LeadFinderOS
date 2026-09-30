-- Lead state follow-up (2026-09-30): the Outreach row's sales-state pill shows "Wrong number" for a page
-- of leads in ONE call. contact_suppressions has no browser policies (read through lead_wrong_number,
-- one lead at a time); this is the same reading for many. ⛔ Role-checked: the admin gets any lead, a
-- salesperson only leads they work (can_work_lead) — others are silently left out, never revealed.
-- Read-only. Applied live 2026-09-30 and read back.
create or replace function public.leads_wrong_numbers(_lead_ids uuid[])
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
                  where s.wrong_number_at is not null and s.phone_e164 = public.phone_e164_key(l.phone))
$function$;

revoke all on function public.leads_wrong_numbers(uuid[]) from public, anon;
grant execute on function public.leads_wrong_numbers(uuid[]) to authenticated;
