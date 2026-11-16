-- FIND LEADS SAYS THE LEAD'S STATUS (2026-11-16, v1-team-visibility, docs/multi-user.md §11).
--
-- New salespeople start today; Paul's brief: a business already in the CRM shows "Already added by <name> · <status>",
-- whatever its status (archived, opted out, Do Not Contact …), and an opt-out / Do Not Contact always blocks.
--
-- lead_identity_lookup gains ONE column, lead_status — a coarse key, never money or a conversation:
--   opted_out · do_not_contact · wrong_number · client · archived · not_interested · contacted · not_contacted
-- Safety first: an opt-out / suppression wins over every other status, so the line a rep reads is the one that stops them.
--
-- And ONE new refusal: a result that matches NO lead but whose phone is on the opt-out / Do Not Contact list
-- (contact_suppressions) is answered 'protected' + do_not_contact (or wrong_number) instead of 'new', so Find Leads shows
-- no Add button for it. Every sender already refuses that phone; this stops it being added in the first place.
--
-- Nothing else changes: the same matching (_lead_identity_rows + the three extra checks), the same states, the same masking
-- of ids for a salesperson, the same rate limit. _lead_identity_rows / sales_add_lead / coverage_add_leads are NOT changed.
-- The return shape gains a column, so the function is dropped and created again (one transaction); grants restated.
-- Rollback: re-run section 2 of 20261128090000_multi_user_safety.sql.

begin;
drop function if exists public.lead_identity_lookup(jsonb);
create function public.lead_identity_lookup(_items jsonb)
returns table (k text, lead_id uuid, state text, owner_id uuid, owner_name text, added_at timestamptz, added_by_name text, lead_status text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_role text := public.my_role();
  v_uid uuid := auth.uid();
  v_g jsonb;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  /* 2026-09-29: a salesperson's lookup is rate-limited (actions.lead_lookup) and refused while suspended — answered as
     state 'paused' per item, never an exception. */
  if v_role = 'sales' then
    v_g := public.guard_action(v_uid, 'lead_lookup', null, 0, 1, 'lead_identity_lookup');
    if not coalesce((v_g ->> 'ok')::boolean, false) then
      return query select x->>'k', null::uuid, 'paused'::text, null::uuid, null::text, null::timestamptz, null::text, null::text
        from jsonb_array_elements(case when jsonb_typeof(_items) = 'array' then _items else '[]'::jsonb end) x;
      return;
    end if;
  end if;
  return query
  with core as (
    select * from public._lead_identity_rows(_items)
  ), it as (
    -- The keys exactly as coverage_add_leads normalises them (name: single spaces, trimmed; country: UK by default).
    select x->>'k' as ik,
           nullif(btrim(regexp_replace(coalesce(x->>'name', ''), '\s+', ' ', 'g')), '') as nm,
           coalesce(nullif(btrim(coalesce(x->>'country', '')), ''), 'UK') as ctry,
           nullif(btrim(coalesce(x->>'maps_url', '')), '') as mu,
           public.website_identity(nullif(btrim(coalesce(x->>'website', '')), '')) as sid,
           public.phone_e164_key(nullif(btrim(coalesce(x->>'phone', '')), '')) as e164
    from jsonb_array_elements(_items) x
    where x->>'k' in (select c.k from core c where c.lead_id is null)
  ), by_name as (
    select distinct on (coalesce(l.country, 'UK'), l.business_name) coalesce(l.country, 'UK') as ctry, l.business_name as nm, l.id
    from public.outreach_leads l
    where l.business_name in (select it.nm from it where it.nm is not null)
    order by coalesce(l.country, 'UK'), l.business_name, l.created_at
  ), by_site as (
    select distinct on (s.sid) s.sid, s.id
    from (select public.website_identity(l.website) as sid, l.id, l.created_at from public.outreach_leads l where l.website is not null) s
    where s.sid in (select it.sid from it where it.sid is not null)
    order by s.sid, s.created_at
  ), hist_name as (
    select distinct coalesce(h.country, 'UK') as ctry, h.business_name as nm from public.outreach_history h
    where h.business_name in (select it.nm from it where it.nm is not null)
  ), hist_maps as (
    select distinct h.google_maps_url as mu from public.outreach_history h
    where h.google_maps_url in (select it.mu from it where it.mu is not null)
  ), supp_phone as (
    -- NEW: the phone of an unmatched result is on the opt-out / Do Not Contact list.
    select s.phone_e164, (s.wrong_number_at is not null) as wrong
    from public.contact_suppressions s
    where s.phone_e164 in (select it.e164 from it where it.e164 is not null)
  ), soft as (
    select it.ik,
           coalesce(n.id, s.id) as lid,
           (hn.nm is not null or hm.mu is not null) as hist,
           sp.wrong as supp_wrong,
           (sp.phone_e164 is not null) as supp
    from it
    left join by_name n on n.nm = it.nm and n.ctry = it.ctry
    left join by_site s on s.sid = it.sid
    left join hist_name hn on hn.nm = it.nm and hn.ctry = it.ctry
    left join hist_maps hm on hm.mu = it.mu
    left join supp_phone sp on sp.phone_e164 = it.e164
  ), merged as (
    select c.k,
           coalesce(c.lead_id, sf.lid) as lid,
           case
             when c.lead_id is not null then c.state
             when sf.lid is not null then null          -- decided below from the matched lead, the same rule as the core
             when sf.hist then 'protected'               -- added once and since removed: the add refuses it (previously_added)
             when coalesce(sf.supp, false) then 'protected'  -- NEW: no lead, but the phone is on the opt-out / DNC list
             else 'new'
           end as st0,
           case when c.lead_id is null and sf.lid is null and coalesce(sf.supp, false)
                then case when sf.supp_wrong then 'wrong_number' else 'do_not_contact' end
           end as nolead_status
    from core c left join soft sf on sf.ik = c.k
  ), r as (
    select m.k, l.id as lead_id,
           coalesce(m.st0, case
             when l.assigned_to_user_id = v_uid then 'yours'
             when l.assigned_to_user_id is not null then 'owned'
             when public.lead_claim_block(l.id, v_uid) is not null then 'protected'
             else 'claimable'
           end) as state,
           l.assigned_to_user_id as owner_id, t.display_name as owner_name, l.created_at as added_at,
           a.display_name as added_by_name,
           coalesce(m.nolead_status, case
             when l.id is null then null
             when coalesce(l.status, '') = 'opted_out' then 'opted_out'
             when exists (select 1 from public.contact_suppressions s
                           where s.wrong_number_at is null
                             and (s.lead_id = l.id or (public.phone_e164_key(l.phone) is not null and s.phone_e164 = public.phone_e164_key(l.phone))))
               then 'do_not_contact'
             when coalesce(l.status, '') = 'do_not_contact' then 'do_not_contact'
             when public.lead_is_client(l.amount_paid, l.status) then 'client'
             when coalesce(l.status, '') = 'wrong_number'
               or exists (select 1 from public.contact_suppressions s
                           where s.wrong_number_at is not null
                             and (s.lead_id = l.id or (public.phone_e164_key(l.phone) is not null and s.phone_e164 = public.phone_e164_key(l.phone))))
               then 'wrong_number'
             when l.is_archived is true then 'archived'
             when coalesce(l.status, '') in ('not_interested', 'closed') then 'not_interested'
             when public.lead_contact_attempt_at(l.id) is not null then 'contacted'
             else 'not_contacted'
           end) as lead_status
    from merged m
    left join public.outreach_leads l on l.id = m.lid
    left join public.team_members t on t.user_id = l.assigned_to_user_id
    left join public.team_members a on a.user_id = l.added_by_user_id
  )
  /* MASKED FOR SALES (2026-09-29): the internal lead id and owner id only for a lead the caller may act on. Names only. */
  select r.k,
         case when v_role = 'admin' or r.state in ('yours', 'claimable') then r.lead_id end,
         r.state,
         case when v_role = 'admin' or r.state = 'yours' then r.owner_id end,
         r.owner_name,
         r.added_at,
         r.added_by_name,
         r.lead_status
  from r;
end
$$;
revoke all on function public.lead_identity_lookup(jsonb) from public, anon;
grant execute on function public.lead_identity_lookup(jsonb) to authenticated;
commit;
