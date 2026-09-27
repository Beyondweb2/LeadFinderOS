-- Sales WhatsApp media security tests (2026-09-27). RUN AGAINST THE LIVE DATABASE; ALWAYS ROLLED BACK.
-- Proves the storage policy "whatsapp media read assigned sales" (migration 20260927110000) at the
-- layer the Storage API asks: a SELECT on storage.objects under the caller's JWT. createSignedUrl,
-- download and the Inbox player all go through that SELECT, so a row the caller cannot select is a
-- file they cannot open, whatever path or id they send.
-- The last statement raises the results as JSON, so nothing can commit: fake auth users
-- (example.invalid), test leads, messages and storage rows all disappear. How to run: send the file
-- as one query to the Management API (docs/multi-user.md, "Re-running the security tests").
begin;

create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated, anon;
grant usage, select on sequence t_results_n_seq to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'media-sales-a@example.invalid', '{}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'media-sales-b@example.invalid', '{}', '{}', now(), now()),
  ('cccccccc-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'media-norole@example.invalid', '{}', '{}', now(), now());
insert into public.user_roles (user_id, role) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'sales'), ('bbbbbbbb-0000-4000-8000-0000000000b1', 'sales');
insert into public.team_members (user_id, display_name) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'Media Sales A'), ('bbbbbbbb-0000-4000-8000-0000000000b1', 'Media Sales B');

-- Four test leads, all in the book (user_id = the book owner), phones in Ofcom's drama range.
create temp table t_fx (k text primary key, lead_id uuid, phone text);
grant select on t_fx to authenticated, anon;
with ins as (
  insert into public.outreach_leads (user_id, business_name, phone, place_id, assigned_to_user_id, amount_paid, status) values
    (public.book_owner_id(), 'TEST Media A Plumbing', '07700 900101', 'TEST_MEDIA_A_' || gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-0000000000a1', null, 'replied'),
    (public.book_owner_id(), 'TEST Media B Plumbing', '07700 900102', 'TEST_MEDIA_B_' || gen_random_uuid(), 'bbbbbbbb-0000-4000-8000-0000000000b1', null, 'replied'),
    (public.book_owner_id(), 'TEST Media Paul Plumbing', '07700 900103', 'TEST_MEDIA_P_' || gen_random_uuid(), public.book_owner_id(), null, 'replied'),
    (public.book_owner_id(), 'TEST Media Paid Plumbing', '07700 900104', 'TEST_MEDIA_C_' || gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-0000000000a1', 99, 'payment_received')
  returning id, business_name, phone
)
insert into t_fx (k, lead_id, phone)
select case business_name when 'TEST Media A Plumbing' then 'A' when 'TEST Media B Plumbing' then 'B' when 'TEST Media Paul Plumbing' then 'P' else 'C' end, id, phone from ins;

-- One image, one voice note and one document per lead, plus a lead-less inbound on A's phone, a
-- lead-less inbound on Paul's phone, and an object nothing references.
create temp table t_media (k text, kind text, path text);
grant select on t_media to authenticated, anon;
insert into t_media (k, kind, path)
select f.k, x.kind, public.book_owner_id()::text || '/test-media-' || lower(f.k) || '-' || x.kind || '-' || substr(md5(random()::text), 1, 8) || '.' || x.ext
from t_fx f cross join (values ('image', 'jpg'), ('audio', 'ogg'), ('document', 'bin')) as x(kind, ext);
insert into t_media values
  ('A_nolead', 'image', public.book_owner_id()::text || '/test-media-a-nolead-' || substr(md5(random()::text), 1, 8) || '.jpg'),
  ('P_nolead', 'image', public.book_owner_id()::text || '/test-media-p-nolead-' || substr(md5(random()::text), 1, 8) || '.jpg'),
  ('orphan', 'document', public.book_owner_id()::text || '/test-media-orphan-' || substr(md5(random()::text), 1, 8) || '.bin');

insert into storage.objects (bucket_id, name, metadata)
select 'whatsapp-media', path, jsonb_build_object('mimetype', 'application/octet-stream', 'size', 1) from t_media;

insert into public.whatsapp_messages (user_id, lead_id, phone, direction, message_type, body, status, test_mode, media_path, media_mime_type, media_filename)
select public.book_owner_id(), f.lead_id, '44' || public.phone_key(f.phone), 'inbound', m.kind, '[' || m.kind || ']', 'received', true, m.path,
       case m.kind when 'image' then 'image/jpeg' when 'audio' then 'audio/ogg' else 'application/pdf' end, m.kind
from t_media m join t_fx f on f.k = m.k;
insert into public.whatsapp_messages (user_id, lead_id, phone, direction, message_type, body, status, test_mode, media_path)
select public.book_owner_id(), null, '44' || public.phone_key(f.phone), 'inbound', 'image', '[image]', 'received', true, m.path
from t_media m join t_fx f on f.k = left(m.k, 1) where m.k in ('A_nolead', 'P_nolead');

insert into t_results (name, ok, detail) select 'fixtures: 4 leads, 15 objects', (select count(*) from t_fx) = 4 and (select count(*) from t_media) = 15, null;

-- ─── as SALES A ───
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-0000000000a1', true);

insert into t_results (name, ok, detail) select 'A: role is sales', public.my_role() = 'sales', public.my_role();
insert into t_results (name, ok, detail) select 'A: opens image on own lead', exists (select 1 from storage.objects o join t_media m on m.path = o.name where m.k = 'A' and m.kind = 'image'), null;
insert into t_results (name, ok, detail) select 'A: opens voice note on own lead', exists (select 1 from storage.objects o join t_media m on m.path = o.name where m.k = 'A' and m.kind = 'audio'), null;
insert into t_results (name, ok, detail) select 'A: opens document on own lead', exists (select 1 from storage.objects o join t_media m on m.path = o.name where m.k = 'A' and m.kind = 'document'), null;
insert into t_results (name, ok, detail) select 'A: opens lead-less inbound on own phone', exists (select 1 from storage.objects o join t_media m on m.path = o.name where m.k = 'A_nolead'), null;
insert into t_results (name, ok, detail) select 'A: cannot open Sales B media', not exists (select 1 from storage.objects o join t_media m on m.path = o.name where m.k = 'B'), null;
insert into t_results (name, ok, detail) select 'A: cannot open Paul media', not exists (select 1 from storage.objects o join t_media m on m.path = o.name where m.k in ('P', 'P_nolead')), null;
insert into t_results (name, ok, detail) select 'A: cannot open paid-client media (assigned to A)', not exists (select 1 from storage.objects o join t_media m on m.path = o.name where m.k = 'C'), null;
insert into t_results (name, ok, detail) select 'A: cannot open an unreferenced object', not exists (select 1 from storage.objects o join t_media m on m.path = o.name where m.k = 'orphan'), null;
insert into t_results (name, ok, detail) select 'A: whole bucket = exactly own 4 files', (select count(*) from storage.objects where bucket_id = 'whatsapp-media') = 4,
  (select count(*)::text from storage.objects where bucket_id = 'whatsapp-media');
insert into t_results (name, ok, detail) select 'A: no other PRIVATE bucket opened', (select count(*) from storage.objects where bucket_id in ('mockup-assets', 'prospect-previews', 'avatars', 'lead-images')) = 0,
  (select count(*)::text from storage.objects where bucket_id in ('mockup-assets', 'prospect-previews', 'avatars', 'lead-images'));
insert into t_results (name, ok, detail) select 'A: media-path set is not callable as anon', not has_function_privilege('anon', 'public.my_sales_media_paths()', 'execute'), null;

-- ─── as SALES B ───
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-0000000000b1', true);
insert into t_results (name, ok, detail) select 'B: opens own 3 files', (select count(*) from storage.objects o join t_media m on m.path = o.name where m.k = 'B') = 3, null;
insert into t_results (name, ok, detail) select 'B: cannot open Sales A media', not exists (select 1 from storage.objects o join t_media m on m.path = o.name where m.k in ('A', 'A_nolead')), null;

-- ─── signed in, no role (a disabled account: disable removes the role row) ───
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-0000000000c1', true);
insert into t_results (name, ok, detail) select 'no role: opens nothing', (select count(*) from storage.objects where bucket_id = 'whatsapp-media') = 0, null;

-- ─── anon ───
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.jwt.claim.sub', '', true);
insert into t_results (name, ok, detail) select 'anon: opens nothing', (select count(*) from storage.objects where bucket_id = 'whatsapp-media') = 0, null;

-- ─── ADMIN (the book owner): unchanged, sees every fixture ───
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', public.book_owner_id(), 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', (select public.book_owner_id()::text), true);
insert into t_results (name, ok, detail) select 'admin: role is admin', public.my_role() = 'admin', public.my_role();
insert into t_results (name, ok, detail) select 'admin: opens all 15 fixtures', (select count(*) from storage.objects o join t_media m on m.path = o.name) = 15, null;
insert into t_results (name, ok, detail) select 'admin: media-path set empty for admin', (select count(*) from public.my_sales_media_paths()) = 0, null;

-- ─── reassign A's lead to B (as postgres, the way assign_lead writes it), then A again ───
reset role;
update public.outreach_leads set assigned_to_user_id = 'bbbbbbbb-0000-4000-8000-0000000000b1' where id = (select lead_id from t_fx where k = 'A');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-0000000000a1', true);
insert into t_results (name, ok, detail) select 'A after reassign: opens nothing', (select count(*) from storage.objects where bucket_id = 'whatsapp-media') = 0,
  (select count(*)::text from storage.objects where bucket_id = 'whatsapp-media');
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-0000000000b1', true);
insert into t_results (name, ok, detail) select 'B after reassign: opens the moved lead''s 3 files', (select count(*) from storage.objects o join t_media m on m.path = o.name where m.k = 'A') = 3, null;

-- ─── disable B (remove the role row, as admin-users does), then B again ───
reset role;
delete from public.user_roles where user_id = 'bbbbbbbb-0000-4000-8000-0000000000b1';
set local role authenticated;
insert into t_results (name, ok, detail) select 'B disabled: opens nothing', (select count(*) from storage.objects where bucket_id = 'whatsapp-media') = 0,
  (select count(*)::text from storage.objects where bucket_id = 'whatsapp-media');

reset role;
do $$ begin
  raise exception 'RESULTS %', (select json_agg(json_build_object('n', n, 'ok', ok, 'name', name, 'detail', detail) order by n) from t_results);
end $$;
