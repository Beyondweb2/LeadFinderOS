-- A salesperson can open the WhatsApp media (images, voice notes, documents) of the leads they work.
-- Safe to apply repeatedly. Additive: the admin's policy ("whatsapp media read own or admin") is
-- untouched.
--
-- WHY IT WAS BROKEN: every stored file sits under the BOOK OWNER's folder (inbound media is saved as
-- `<lead owner>/<hash>.<ext>` by _shared/whatsapp-inbound.ts, sent voice notes as
-- `<book owner>/voice-out-<id>.ogg` by voiceNoteObjectPath), and the only read policy was "your own
-- folder, or admin". A salesperson owns no folder, so createSignedUrl answered "not found".
--
-- THE RULE: media → the message that references it → that message's lead → assigned to the caller.
-- The set comes from whatsapp_messages.media_path, never from the object name, so a guessed or
-- altered path matches nothing. A message with a lead id counts ONLY through that lead (a Paul-owned
-- lead that happens to share the phone stays Paul's); a message with no lead id counts through the
-- phone forms of the rep's own leads, exactly as the sales message policy shows its text.
-- Clients, other reps' leads, a removed role (disabled) and a reassigned lead all fall out of
-- my_sales_lead_ids() on the next request. ⛔ Never a per-row function call in the policy: the set
-- is computed once per statement behind the (select my_role()) initplan.
create or replace function public.my_sales_media_paths()
returns setof text language plpgsql stable security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'sales' then return; end if;
  return query
    select m.media_path from public.whatsapp_messages m
    where m.media_path is not null
      and (m.lead_id in (select public.my_sales_lead_ids())
           or (m.lead_id is null and m.phone in (select public.my_sales_message_phones())));
end
$$;

revoke execute on function public.my_sales_media_paths() from public, anon;
grant execute on function public.my_sales_media_paths() to authenticated;

drop policy if exists "whatsapp media read assigned sales" on storage.objects;
create policy "whatsapp media read assigned sales" on storage.objects for select to authenticated
using (
  bucket_id = 'whatsapp-media'
  and (select public.my_role()) = 'sales'
  and name in (select public.my_sales_media_paths())
);
