-- 2026-10-10 — an inbound TEXT notifies exactly like an inbound WhatsApp message (close-out of the shared-inbox work).
--
-- THE GAP: trg_notify_whatsapp COALESCES — a second reply while the first is still unread folds into the same notification (count + 1, newest text),
-- and the title says "Replied after their audit" when our last message was an audit one. trg_notify_sms wrote ONE notification per text (deduped
-- only by message id), so a chatty prospect filled the bell with cards. This replaces the function (create or replace; the trigger is unchanged).
--
-- Same rules as the WhatsApp trigger: the recipient is lead_recipient(lead) (the assignee, else the book owner); unread + not cleared rows of kind
-- 'sms_reply' for that lead are updated in place; otherwise one new notification. The failed-send branch is unchanged.
-- Rollback: re-run the previous body (20261018090000_twilio_comms.sql, trg_notify_sms).
create or replace function public.trg_notify_sms()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_to uuid; v_name text; v_n integer; v_after_audit boolean;
begin
  begin
    if new.lead_id is null then return new; end if;
    v_to := public.lead_recipient(new.lead_id);
    select business_name into v_name from public.outreach_leads where id = new.lead_id;
    if new.direction = 'inbound' and new.status = 'received' then
      if v_to is null then return new; end if;
      select exists (select 1 from public.sms_messages m where m.lead_id = new.lead_id and m.direction = 'outbound'
        and m.template_key like 'audit%' and m.status not in ('failed', 'undelivered') and m.created_at < new.created_at) into v_after_audit;
      update public.notifications set count = count + 1, created_at = now(),
          body = left(coalesce(new.body, ''), 120),
          title = case when count + 1 > 1 then (count + 1) || ' new SMS replies · ' || coalesce(v_name, 'a prospect') else title end
        where user_id = v_to and kind = 'sms_reply' and lead_id = new.lead_id and read_at is null and cleared_at is null;
      get diagnostics v_n = row_count;
      if v_n = 0 then
        perform public.notify_person(v_to, 'sms_reply',
          case when v_after_audit then 'Replied after their audit (SMS) · ' else 'SMS reply · ' end || coalesce(v_name, 'a prospect'),
          left(coalesce(new.body, ''), 120),
          '/inbox?channel=sms&lead=' || new.lead_id::text, new.lead_id, 'sms_reply:' || new.id::text, 2::smallint);
      end if;
    elsif new.direction = 'outbound' and new.status in ('failed', 'undelivered')
          and (tg_op = 'INSERT' or old.status is distinct from new.status) then
      perform public.notify_person(coalesce(new.sent_by_user_id, v_to), 'sms_failed', 'SMS not delivered · ' || coalesce(v_name, 'a prospect'),
        'The text did not arrive. Check the number, or send the link another way.',
        '/inbox?channel=sms&lead=' || new.lead_id::text, new.lead_id, 'sms_failed:' || new.id::text, 2::smallint);
    end if;
  exception when others then raise warning 'trg_notify_sms: %', sqlerrm;
  end;
  return new;
end $$;
