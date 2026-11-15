-- Per-campaign "Run audit when they reply" (Paul, 2026-11-15). ADDITIVE ONLY.
-- Default ON, so every existing campaign behaves exactly as before. When OFF, a reply from a lead in the campaign
-- does not start the reply-triggered website check / AI audit (WhatsApp or SMS): the cron that creates those
-- audits (_shared/first-reply-audit.ts reconcileFirstReplyAuditIntents, run by process-ai-audit-queue) reads it.
-- Manual audits are untouched. campaigns has ~40 rows: a constant default adds no table rewrite worth noting.

alter table public.campaigns
  add column if not exists audit_on_reply boolean not null default true;

-- Admin only (the role from user_roles via my_role(), never the request): campaigns RLS lets only a campaign's
-- creator update it, and this is Paul's switch for every campaign.
create or replace function public.campaign_set_audit_on_reply(_campaign_id uuid, _on boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if public.my_role() is distinct from 'admin' then
    return jsonb_build_object('ok', false, 'error', 'admin_only');
  end if;
  update public.campaigns set audit_on_reply = coalesce(_on, true) where id = _campaign_id returning name into v_name;
  if v_name is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'id', _campaign_id, 'name', v_name, 'audit_on_reply', coalesce(_on, true));
end $$;

revoke all on function public.campaign_set_audit_on_reply(uuid, boolean) from public, anon;
grant execute on function public.campaign_set_audit_on_reply(uuid, boolean) to authenticated;
