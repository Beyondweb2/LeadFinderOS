-- campaign_launch: Findable campaigns open with initial_contact_short (Paul, 2026-11-24: "best reply rate"), unless the
-- campaign has chosen another opener. The ONLY change is how v_template is picked; everything else is the live body of
-- 20261009150000_campaign_launch_owner_scope.sql (read back from pg_get_functiondef 2026-11-24 before writing: identical).
--   · Findable campaign (report_style null / 'findable'): its default_template if that is initial_opener_v2 or
--     initial_contact_short, else initial_contact_short. ⚠️ 'initial_contact' on a campaign is NOT read as a choice: this
--     function stamped it on every launched campaign from the global setting, so it says nothing about what anyone chose.
--   · LeadFinderOS-style campaign: unchanged (the global initial_opener_template, initial_contact / initial_opener_v2).
-- sales_queue_opener already accepts initial_contact_short (20261030090000). Meta's live status still gates it at send.
-- Same name, argument, owner and grants (create or replace keeps the ACL).
-- Read back: select prosrc like '%initial_contact_short%' from pg_proc where proname = 'campaign_launch';  -- true

create or replace function public.campaign_launch(_campaign_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_role text := public.my_role(); v_template text; v_all uuid[]; v_chunk uuid[]; v_r jsonb;
  v_queued integer := 0; v_skip jsonb := '{}'::jsonb; v_k text; v_n integer; i integer := 1; v_total integer;
  v_owner uuid; v_other integer := 0; v_unowned integer := 0;
  v_style text; v_chosen text;
  c_max constant integer := 2000;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if not public.campaign_usable(_campaign_id) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if exists (select 1 from public.campaigns where id = _campaign_id and method = 'call') then
    return jsonb_build_object('ok', false, 'error', 'call_campaign');
  end if;
  select c.report_style, c.default_template into v_style, v_chosen from public.campaigns c where c.id = _campaign_id;
  if coalesce(v_style, 'findable') <> 'leadfinderos' then
    v_template := case when v_chosen in ('initial_opener_v2', 'initial_contact_short') then v_chosen else 'initial_contact_short' end;
  else
    select initial_opener_template into v_template from public.whatsapp_outreach_state limit 1;
    if v_template is null or v_template not in ('initial_contact', 'initial_opener_v2') then
      return jsonb_build_object('ok', false, 'error', 'no_approved_opener');
    end if;
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
