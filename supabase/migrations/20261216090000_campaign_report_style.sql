-- Per-campaign "Report style" (Paul, 2026-11-15). ADDITIVE ONLY.
-- 'findable' (the default: every existing campaign renders exactly as before) or 'leadfinderos' (the LeadFinderOS-branded
-- report for web developers / agencies: no Findable name, logo, price or guarantee; served at app.leadfinderos.com/r/<code>).
-- render-audit-report reads it at RENDER time through the audit's lead, so changing it changes every report of that campaign's
-- leads, including links already sent. campaigns has ~40 rows: a constant default adds no table rewrite worth noting.

alter table public.campaigns
  add column if not exists report_style text not null default 'findable';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'campaigns_report_style_check') then
    alter table public.campaigns add constraint campaigns_report_style_check check (report_style in ('findable', 'leadfinderos'));
  end if;
end $$;

-- Admin only (the role from user_roles via my_role(), never the request), the same as campaign_set_audit_on_reply.
create or replace function public.campaign_set_report_style(_campaign_id uuid, _style text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if public.my_role() is distinct from 'admin' then
    return jsonb_build_object('ok', false, 'error', 'admin_only');
  end if;
  if _style is null or _style not in ('findable', 'leadfinderos') then
    return jsonb_build_object('ok', false, 'error', 'bad_style');
  end if;
  update public.campaigns set report_style = _style where id = _campaign_id returning name into v_name;
  if v_name is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'id', _campaign_id, 'name', v_name, 'report_style', _style);
end $$;

revoke all on function public.campaign_set_report_style(uuid, text) from public, anon;
grant execute on function public.campaign_set_report_style(uuid, text) to authenticated;

-- Paul, 2026-11-15: "Set 'Web devs/agencies · WhatsApp' to LeadFinderOS." By id, so a renamed campaign cannot be missed or a
-- same-named one hit.
update public.campaigns set report_style = 'leadfinderos'
  where id = '17c5cff4-83a7-4fab-ba07-3182c4c8324c' and report_style <> 'leadfinderos';
