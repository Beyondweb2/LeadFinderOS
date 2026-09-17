-- Inbox realtime and private inbound WhatsApp media. Safe to apply repeatedly.
alter table public.whatsapp_messages
  add column if not exists media_path text,
  add column if not exists media_mime_type text,
  add column if not exists media_filename text;

alter table public.whatsapp_messages drop constraint if exists whatsapp_messages_message_type_check;
alter table public.whatsapp_messages add constraint whatsapp_messages_message_type_check
  check (message_type in ('text', 'template', 'image', 'video', 'audio', 'document', 'sticker'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('whatsapp-media', 'whatsapp-media', false, 20971520, null)
on conflict (id) do update set public = false, file_size_limit = 20971520;

drop policy if exists "whatsapp media read own or admin" on storage.objects;
create policy "whatsapp media read own or admin" on storage.objects for select to authenticated
using (
  bucket_id = 'whatsapp-media' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_role(auth.uid(), 'admin'::app_role)
  )
);

do $$ begin
  alter publication supabase_realtime add table public.whatsapp_messages;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.outreach_leads;
exception when duplicate_object then null;
end $$;
