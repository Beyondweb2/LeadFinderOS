-- Add the newly-added WhatsApp template "barber_fresha_booksy" to the Inbox mirror
-- function. mirror_whatsapp_send_to_inbox() mirrors each queue send (whatsapp_sends)
-- into the Inbox (whatsapp_messages) and hardcodes the display body per template name.
-- This CREATE OR REPLACE reproduces the existing function from
-- 20260706140000_mirror_add_booking_switch_barbers.sql VERBATIM, adding ONLY the new
-- `when 'barber_fresha_booksy'` branch before the `else` — every existing branch and
-- everything else is unchanged. The trigger (trg_mirror_whatsapp_send) references this
-- function by name, so replacing the function is enough; the trigger is NOT recreated.
--
-- ⚠️ DISPLAY-ONLY: this only affects what the Inbox SHOWS for a queue send. It does NOT
-- affect what is actually sent to Meta (that's the edge functions). Without this, a
-- queue send of barber_fresha_booksy still delivers correctly; the Inbox row just reads
-- the literal "[barber_fresha_booksy]" until this is applied.
--
-- barber_fresha_booksy body puts the URL first ({{1}}) then the business name ({{2}}) —
-- the reverse of the other templates — matching the edge send (vars ["url","name"]).
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
      when 'booking_switch_barbers' then
        'Hi ' || coalesce(NEW.business_name,'your business') || ', tired of paying commission on your own clients? I''ve set you up with online booking and your own website - no commission, keep more of what you earn:' || E'\n\n' || coalesce(NEW.claim_url,'') || E'\n\n' || 'SMS reminders and your own domain included, flat £29.99 a month. Have a look and let me know what you think.'
      when 'barber_fresha_booksy' then
        'made you this 👇' || E'\n' || coalesce(NEW.claim_url,'') || E'\n\n' ||
        'Hey ' || coalesce(NEW.business_name,'your business') || ', right now people can only book you through fresha/booksy - who take a cut of every booking and keep your customers on their app, not yours (bit cheeky). That''s your shops own booking site up there - fully yours to customize too - colours, photos, prices, whatever you fancy. free if you want it, no stress if not'
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
