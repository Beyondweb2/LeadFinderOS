-- Lead state follow-up (Paul, 2026-09-30, docs/lead-state-model.md): when a HUMAN moves a lead that was
-- Not interested back to Interested / Meeting booked (status 'interested') or Won
-- ('won_pending_onboarding'), clear ONLY the Not interested suppression.
--   ⛔ Only reason = 'not_interested', and only a row with NO Wrong number mark on it. Never touched:
--      Wrong number, 'replied_no' (the prospect's own decline), 'closed', 'archived', opt-outs, any other.
--   ⛔ Only these two target statuses, and only from 'not_interested'. Nothing automatic writes either
--      target (the status audit, 2026-09-30): the queue, the inbound handler and the hook automation write
--      replied / report_sent / not_interested — so a weak contact (no answer, voicemail) or a reply can
--      never reach this. A trigger on the status change, so the admin's direct edit and a salesperson's
--      lead_set_stage behave the same.
--   History says so (details_set, suppression_cleared). Applied live 2026-09-30 and tested rolled back.
create or replace function public.trg_outreach_leads_revive_clears_not_interested()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_key text; v_n int := 0;
begin
  if old.status is distinct from 'not_interested' or new.status not in ('interested', 'won_pending_onboarding') then
    return new;
  end if;
  v_key := public.phone_e164_key(new.phone);
  delete from public.contact_suppressions s
   where s.reason = 'not_interested' and s.wrong_number_at is null
     and ((v_key is not null and s.phone_e164 = v_key)
       or s.lead_id = new.id
       or (nullif(btrim(coalesce(new.email, '')), '') is not null and s.email = lower(btrim(new.email))));
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into public.lead_activity (lead_id, actor_user_id, kind, data)
    values (new.id, auth.uid(), 'details_set', jsonb_build_object('suppression_cleared', 'not_interested'));
  end if;
  return new;
end $function$;

drop trigger if exists trg_outreach_leads_revive_clears_not_interested on public.outreach_leads;
create trigger trg_outreach_leads_revive_clears_not_interested
  after update of status on public.outreach_leads
  for each row execute function public.trg_outreach_leads_revive_clears_not_interested();
