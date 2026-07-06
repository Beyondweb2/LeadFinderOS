-- Add the newly-approved WhatsApp template "barber_poor_website" to the Inbox
-- mirror function. mirror_whatsapp_send_to_inbox() mirrors each queue send
-- (whatsapp_sends) into the Inbox (whatsapp_messages) and hardcodes the display
-- body per template name. This CREATE OR REPLACE reproduces the existing function
-- from 20260701160000_backfill_drifted_objects.sql VERBATIM, adding ONLY the new
-- `when 'barber_poor_website'` branch before the `else` — the existing
-- booking_page_intro / no_website_barbers branches and everything else are
-- unchanged. The existing trigger (trg_mirror_whatsapp_send) references this
-- function by name, so replacing the function is enough; the trigger is NOT
-- recreated here.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mirror_whatsapp_send_to_inbox()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner uuid; v_body text;
begin
  begin
    select ol.user_id into v_owner from public.outreach_leads ol where ol.id = NEW.lead_id;
    v_body := case NEW.template
      when 'booking_page_intro' then
        'Hi, I came across ' || coalesce(NEW.business_name,'your business') ||
        ' and built you an online booking page so customers can book appointments directly' || E'\n\n' ||
        'Here it is: ' || coalesce(NEW.claim_url,'') || E'\n\n' ||
        'You can edit it yourself - services, prices, hours' || E'\n\n' ||
        'Have a look and let me know what you think'
      when 'no_website_barbers' then
        'Hi, I noticed ' || coalesce(NEW.business_name,'your business') ||
        ' doesn''t have a website, so I built you one - it''s live and free. You can edit it yourself: photos, text, services, colours.' || E'\n\n' ||
        'Here it is: ' || coalesce(NEW.claim_url,'') || E'\n\n' ||
        'It''s yours to keep, free - let me know what you think.'
      when 'barber_poor_website' then
        'Hi ' || coalesce(NEW.business_name,'your business') || ', here''s an updated version of your website - it''s free 🙂' || E'\n\n' || coalesce(NEW.claim_url,'') || E'\n\n' || 'It''s fresh, mobile-friendly and easy to customise yourself - photos, text and colours in a couple of taps.' || E'\n\n' || 'Have a look and let me know what you think.'
      else '[' || coalesce(NEW.template,'template') || ']'
    end;
    insert into public.whatsapp_messages
      (direction, user_id, lead_id, phone, body, message_type, template_name, wa_message_id, status, test_mode)
    values ('outbound', v_owner, NEW.lead_id, NEW.phone, v_body, 'template', NEW.template,
            NEW.message_id, coalesce(NEW.delivery_status,'sent'), coalesce(NEW.test_mode,true));
  exception when others then null;  -- never break the send's audit insert
  end;
  return NEW;
end $function$;
