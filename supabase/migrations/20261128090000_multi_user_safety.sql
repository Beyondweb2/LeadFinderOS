-- MULTI-USER SAFETY (2026-10-27, docs/multi-user.md §10). Two changes, both additive in effect:
--
-- 1. lead_recipient: a reply on a lead whose salesperson has LEFT (team_members.status = 'disabled') notifies the book
--    owner, not the dead account. Suspended is unchanged (still theirs; Paul decides).
--
-- 2. lead_identity_lookup (Find Leads' "already in the CRM" answer) now says ALREADY ADDED for every business the add itself
--    would refuse — the same three extra checks coverage_add_leads makes on top of _lead_identity_rows (same name in the same
--    country, the same website, a previously-added name or Maps link in outreach_history). Before, a UK result could show
--    Add to CRM and then come back "not added". It also returns who ADDED the lead (added_by_name), shown as "Added by <name>".
--    The return shape gains one column, so the function is dropped and created again (one transaction); grants restated.
--    _lead_identity_rows and sales_add_lead are NOT changed (the website stays a warning there).

-- ── 1 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.lead_recipient(_lead uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select case
           when l.assigned_to_user_id is not null
            and not exists (select 1 from public.team_members t where t.user_id = l.assigned_to_user_id and t.status = 'disabled')
           then l.assigned_to_user_id
           else public.book_owner_id()
         end
  from public.outreach_leads l where l.id = _lead
$$;
revoke all on function public.lead_recipient(uuid) from public, anon, authenticated;

-- ── 2 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
drop function if exists public.lead_identity_lookup(jsonb);
create function public.lead_identity_lookup(_items jsonb)
returns table (k text, lead_id uuid, state text, owner_id uuid, owner_name text, added_at timestamptz, added_by_name text)
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
      return query select x->>'k', null::uuid, 'paused'::text, null::uuid, null::text, null::timestamptz, null::text
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
           public.website_identity(nullif(btrim(coalesce(x->>'website', '')), '')) as sid
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
  ), soft as (
    select it.ik,
           coalesce(n.id, s.id) as lid,
           (hn.nm is not null or hm.mu is not null) as hist
    from it
    left join by_name n on n.nm = it.nm and n.ctry = it.ctry
    left join by_site s on s.sid = it.sid
    left join hist_name hn on hn.nm = it.nm and hn.ctry = it.ctry
    left join hist_maps hm on hm.mu = it.mu
  ), merged as (
    select c.k,
           coalesce(c.lead_id, sf.lid) as lid,
           case
             when c.lead_id is not null then c.state
             when sf.lid is not null then null          -- decided below from the matched lead, the same rule as the core
             when sf.hist then 'protected'               -- added once and since removed: the add refuses it (previously_added)
             else 'new'
           end as st0
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
           a.display_name as added_by_name
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
         r.added_by_name
  from r;
end
$$;
revoke all on function public.lead_identity_lookup(jsonb) from public, anon;
grant execute on function public.lead_identity_lookup(jsonb) to authenticated;
