-- A PERSON VOUCHES FOR A LEAD'S TOWN (2026-10-16, Paul). Additive only.
--
-- WHY. Ethan's imported leads were refused by the audit ("town_unverified: Google could not confirm the town"). Read from the
-- live row (Majesty Event): the import ran with the Batch name left blank, so import_batch was NULL, and the audit town gate
-- recognises a typed-town lead only by lead_source or import_batch. 851 leads imported that day had no import_batch.
--   1. outreach_leads.town_confirmed_by / town_confirmed_at: who said the town is right ('researcher' = the import checkbox,
--      'operator' = Confirm town in the audit popup). The audit gate reads it (typed-town.ts townConfirmedByPerson); the
--      real-town text check (typedTown.ts) still applies, so "Online" / "not established" / blank stay blocked.
--   2. import_leads_v4 = import_leads_v3 + (a) the batch name defaults to the file name when left blank, so an import is
--      always recognisable as one; (b) _confirmed_rows: the file row numbers whose town the person said was checked. Only
--      leads CREATED by this very call, whose town is not blank, are stamped. Nothing is messaged or queued.
--   3. lead_confirm_town(lead, town): the popup's one-click fix. Same ownership rule as lead_set_details (_require_work).
--   4. Backfill: leads created by a CSV import that have no import_batch get the import's file name (a fill of a NULL).
-- import_leads_v3 stays for any open old screen.

alter table public.outreach_leads add column if not exists town_confirmed_by text;
alter table public.outreach_leads add column if not exists town_confirmed_at timestamptz;
comment on column public.outreach_leads.town_confirmed_by is 'researcher | operator — a person vouched for search_location as this lead''s town. Read by the audit town gate; never written by code that guesses.';

create or replace function public.import_leads_v4(_rows jsonb, _commit boolean default false, _file_name text default null::text,
  _import_possible boolean default false, _assign_to uuid default null::uuid, _batch text default null::text, _campaign_id uuid default null::uuid,
  _confirmed_rows integer[] default '{}'::integer[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_res jsonb;
  v_r jsonb;
  v_batch text;
  v_confirmed integer := 0;
begin
  if public.my_role() is null then raise exception 'no_role' using errcode = '42501'; end if;
  v_batch := left(nullif(btrim(regexp_replace(coalesce(_batch, ''), '\s+', ' ', 'g')), ''), 80);
  if v_batch is null then
    v_batch := left(nullif(btrim(regexp_replace(regexp_replace(coalesce(_file_name, ''), '\.[A-Za-z0-9]{1,5}$', ''), '[\r\n\t_]+', ' ', 'g')), ''), 80);
  end if;

  v_res := public.import_leads_v3(_rows, _commit, _file_name, _import_possible, _assign_to, v_batch, _campaign_id);

  if (v_res ->> 'ok')::boolean is true and (v_res ->> 'committed')::boolean is true and coalesce(array_length(_confirmed_rows, 1), 0) > 0 then
    for v_r in select r from jsonb_array_elements(coalesce(v_res -> 'rows', '[]'::jsonb)) r loop
      if v_r ->> 'outcome' = 'created' and v_r ->> 'lead_id' is not null and (v_r ->> 'row')::integer = any (_confirmed_rows) then
        update public.outreach_leads
           set town_confirmed_by = 'researcher', town_confirmed_at = now()
         where id = (v_r ->> 'lead_id')::uuid and nullif(btrim(search_location), '') is not null;
        if found then v_confirmed := v_confirmed + 1; end if;
      end if;
    end loop;
  end if;

  return v_res || jsonb_build_object('towns_confirmed', v_confirmed, 'batch', v_batch);
end $function$;

revoke all on function public.import_leads_v4(jsonb, boolean, text, boolean, uuid, text, uuid, integer[]) from public, anon;
grant execute on function public.import_leads_v4(jsonb, boolean, text, boolean, uuid, text, uuid, integer[]) to authenticated;

create or replace function public.lead_confirm_town(_lead_id uuid, _town text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_town text := nullif(btrim(regexp_replace(coalesce(_town, ''), '\s+', ' ', 'g')), '');
begin
  perform public._require_work(_lead_id);
  if v_town is null then return jsonb_build_object('ok', false, 'error', 'town_required'); end if;
  if length(v_town) > 100 then return jsonb_build_object('ok', false, 'error', 'too_long'); end if;
  update public.outreach_leads
     set search_location = v_town, town_confirmed_by = 'operator', town_confirmed_at = now()
   where id = _lead_id;
  insert into public.lead_activity (lead_id, actor_user_id, kind, data)
  values (_lead_id, auth.uid(), 'details_set', jsonb_build_object('search_location', v_town, 'town_confirmed', true));
  return jsonb_build_object('ok', true);
end $function$;

revoke all on function public.lead_confirm_town(uuid, text) from public, anon;
grant execute on function public.lead_confirm_town(uuid, text) to authenticated;
