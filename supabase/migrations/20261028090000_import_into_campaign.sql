-- CSV import asks WHICH CAMPAIGN (2026-10-14, Paul). import_leads_v3 = import_leads_v2, unchanged, plus a REQUIRED
-- campaign. It refuses before anything else when the campaign is missing or not one the caller may use
-- (campaign_usable: admin any live campaign, a salesperson only their own — another owner's answers exactly like
-- one that does not exist). After a COMMITTED call, every lead the call CREATED joins the campaign through the
-- existing per-lead rule, lead_set_campaign (one campaign_id column, one activity row each). Existing leads that were
-- only filled in keep their campaign. One transaction per call: if a new lead cannot join, the whole call is
-- refused and nothing in it is written, so an import never leaves new leads outside the chosen campaign.
-- ⛔ Joining a campaign queues nothing and sends nothing; launching stays campaign_launch's job, with its own rules.
-- import_leads_v2 stays for any open old screen; additive only.
CREATE OR REPLACE FUNCTION public.import_leads_v3(_rows jsonb, _commit boolean DEFAULT false, _file_name text DEFAULT NULL::text,
  _import_possible boolean DEFAULT false, _assign_to uuid DEFAULT NULL::uuid, _batch text DEFAULT NULL::text, _campaign_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_res jsonb;
  v_r jsonb;
  v_set jsonb;
  v_name text;
  v_joined integer := 0;
begin
  if public.my_role() is null then raise exception 'no_role' using errcode = '42501'; end if;
  if _campaign_id is null then return jsonb_build_object('ok', false, 'error', 'campaign_required'); end if;
  if not public.campaign_usable(_campaign_id) then return jsonb_build_object('ok', false, 'error', 'unknown_campaign'); end if;
  select name into v_name from public.campaigns where id = _campaign_id;

  v_res := public.import_leads_v2(_rows, _commit, _file_name, _import_possible, _assign_to, _batch);

  if (v_res ->> 'ok')::boolean is true and (v_res ->> 'committed')::boolean is true then
    for v_r in select r from jsonb_array_elements(coalesce(v_res -> 'rows', '[]'::jsonb)) r loop
      if v_r ->> 'outcome' = 'created' and v_r ->> 'lead_id' is not null then
        v_set := public.lead_set_campaign((v_r ->> 'lead_id')::uuid, _campaign_id);
        if (v_set ->> 'ok')::boolean is not true then
          raise exception 'campaign_join_failed: %', coalesce(v_set ->> 'error', 'refused') using errcode = 'P0001';
        end if;
        v_joined := v_joined + 1;
      end if;
    end loop;
  end if;

  return v_res || jsonb_build_object('campaign_id', _campaign_id, 'campaign_name', v_name, 'joined_campaign', v_joined);
end $function$;

revoke all on function public.import_leads_v3(jsonb, boolean, text, boolean, uuid, text, uuid) from public, anon;
grant execute on function public.import_leads_v3(jsonb, boolean, text, boolean, uuid, text, uuid) to authenticated;
