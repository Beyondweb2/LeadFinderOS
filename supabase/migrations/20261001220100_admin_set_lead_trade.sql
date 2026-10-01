-- MISSING-TRADE AUTO-FIX (2026-10-01, docs/outreach-workspace.md). Additive.
-- The admin's "Fix automatically" saves a trade worked out from data we already hold (src/lib/tradeInference.ts).
-- ⛔ It writes ONLY search_keyword, ONLY while the lead still has no trade (search_keyword and category blank),
--    and records what was used in History (lead_activity 'details_set': the trade, source, confidence, evidence).
--    No status, owner, Next Action, message or suppression changes. Admin-only.
-- Rollback: drop function if exists public.admin_set_lead_trade(uuid, text, text, text, jsonb);
create or replace function public.admin_set_lead_trade(_lead_id uuid, _trade text, _source text, _confidence text, _evidence jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_trade text := nullif(btrim(coalesce(_trade, '')), ''); n integer;
begin
  if public.my_role() is distinct from 'admin' then raise exception 'admin_only' using errcode = '42501'; end if;
  if v_trade is null or length(v_trade) > 80 then return jsonb_build_object('ok', false, 'error', 'bad_trade'); end if;
  if _confidence not in ('high', 'medium') then return jsonb_build_object('ok', false, 'error', 'bad_confidence'); end if;
  update public.outreach_leads set search_keyword = v_trade
   where id = _lead_id and coalesce(btrim(search_keyword), '') = '' and coalesce(btrim(category), '') = '';
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', true, 'unchanged', true); end if;
  insert into public.lead_activity (lead_id, actor_user_id, kind, data)
  values (_lead_id, auth.uid(), 'details_set', jsonb_build_object(
    'search_keyword', v_trade, 'auto', true, 'source', _source, 'confidence', _confidence, 'evidence', coalesce(_evidence, '[]'::jsonb)));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.admin_set_lead_trade(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.admin_set_lead_trade(uuid, text, text, text, jsonb) to authenticated;
