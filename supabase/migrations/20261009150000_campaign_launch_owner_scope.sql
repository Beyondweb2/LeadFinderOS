-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- A CAMPAIGN LAUNCH NEVER MESSAGES ANOTHER OWNER'S LEAD (2026-10-05, fix/outreach-lead-ownership;
-- docs/pre-sales-certification/outreach-ownership-safety.md).
--
-- Found in the ownership audit: campaign_launch picked every not_contacted lead in the campaign with
--   (v_role = 'admin' or o.assigned_to_user_id = auth.uid())
-- so when the ADMIN launched a campaign, membership alone decided who got the cold opener — a salesperson's
-- lead that sat in Paul's campaign, or Paul's lead left in a salesperson's campaign after a move (live
-- 2026-10-05: "roofers 2", created by Test, holds 82 active leads now assigned to Paul), would be messaged as
-- part of someone else's campaign. Campaign membership must never override ownership.
--
-- The rule now, for BOTH roles: a launch queues only leads the CAMPAIGN'S OWNER owns —
--   assigned_to_user_id = the campaign's created_by. Nothing else.
-- ⛔ An UNASSIGNED member is nobody's (Paul, 2026-10-05: "unassigned" is never a synonym for Paul's leads) —
--   it is not messaged either; the owner claims it first (Outreach → Unassigned → Claim for me).
-- Every member not queued for this reason is reported, never silently dropped:
--   skipped.other_owner = owned by someone else, skipped.unassigned = owned by nobody.
-- Live 2026-10-05: 52 never-contacted UNASSIGNED members sit in Paul's live campaigns (Locksmiths 24, Morgage 21,
-- Plumber 2 5, Accountants 1, plumber 1) — Find Leads adds made before trg_outreach_leads_added_by_owner.
-- For a salesperson nothing changes in practice (campaign_usable already limits them to their own campaigns,
-- and their own leads were the only ones considered).
--
-- Re-created from the LIVE body (read 2026-10-05; identical to 20261008100000) with only the owner filter and
-- the other_owner count added. Same signature, same grants. No row is updated by this migration.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.campaign_launch(_campaign_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_role text := public.my_role(); v_template text; v_all uuid[]; v_chunk uuid[]; v_r jsonb;
  v_queued integer := 0; v_skip jsonb := '{}'::jsonb; v_k text; v_n integer; i integer := 1; v_total integer;
  v_owner uuid; v_other integer := 0; v_unowned integer := 0;
  c_max constant integer := 2000;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if not public.campaign_usable(_campaign_id) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if exists (select 1 from public.campaigns where id = _campaign_id and method = 'call') then
    return jsonb_build_object('ok', false, 'error', 'call_campaign');
  end if;
  select initial_opener_template into v_template from public.whatsapp_outreach_state limit 1;
  if v_template is null or v_template not in ('initial_contact', 'initial_opener_v2') then
    return jsonb_build_object('ok', false, 'error', 'no_approved_opener');
  end if;
  /* The campaign's owner. A campaign with no recorded creator belongs to the book owner. */
  select coalesce(c.created_by, public.book_owner_id()) into v_owner from public.campaigns c where c.id = _campaign_id;
  select coalesce(array_agg(id order by created_at), '{}') into v_all from (
    select o.id, o.created_at from public.outreach_leads o
     where o.campaign_id = _campaign_id and o.status = 'not_contacted' and not coalesce(o.is_archived, false)
       and (v_role = 'admin' or o.assigned_to_user_id = auth.uid())
       and o.assigned_to_user_id = v_owner
     order by o.created_at limit c_max) s;
  /* Members not queued for ownership: counted, never queued. (A salesperson only ever sees their own, so for
     them both are 0.) */
  if v_role = 'admin' then
    select count(*) filter (where o.assigned_to_user_id is not null and o.assigned_to_user_id <> v_owner),
           count(*) filter (where o.assigned_to_user_id is null)
      into v_other, v_unowned
      from public.outreach_leads o
     where o.campaign_id = _campaign_id and o.status = 'not_contacted' and not coalesce(o.is_archived, false);
    if v_other > 0 then v_skip := v_skip || jsonb_build_object('other_owner', v_other); end if;
    if v_unowned > 0 then v_skip := v_skip || jsonb_build_object('unassigned', v_unowned); end if;
  end if;
  v_total := coalesce(array_length(v_all, 1), 0);
  while i <= v_total loop
    v_chunk := v_all[i : least(i + 199, v_total)];
    v_r := public.sales_queue_opener(v_chunk, v_template);
    if not coalesce((v_r ->> 'ok')::boolean, false) then return v_r; end if;
    v_queued := v_queued + coalesce((v_r ->> 'queued')::int, 0);
    for v_k, v_n in select key, value::int from jsonb_each_text(coalesce(v_r -> 'skipped', '{}'::jsonb)) loop
      v_skip := jsonb_set(v_skip, array[v_k], to_jsonb(coalesce((v_skip ->> v_k)::int, 0) + v_n));
    end loop;
    exit when (v_r -> 'skipped' ->> 'daily_limit') is not null;
    i := i + 200;
  end loop;
  if v_queued > 0 then
    update public.campaigns set default_template = v_template where id = _campaign_id and default_template is distinct from v_template;
  end if;
  return jsonb_build_object('ok', true, 'queued', v_queued, 'skipped', v_skip, 'template', v_template, 'considered', v_total);
end $function$;

-- Read back:
--   select prosrc ~ 'other_owner' from pg_proc where proname = 'campaign_launch';   -- true
--   select has_function_privilege('anon', 'public.campaign_launch(uuid)', 'execute');  -- false
