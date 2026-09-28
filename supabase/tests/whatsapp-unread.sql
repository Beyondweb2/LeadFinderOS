-- WhatsApp unread, per person (migration 20260929120000). Send as ONE query to the Management API.
-- ALWAYS ROLLED BACK: the block ends by RAISING its result, so nothing it inserts is ever committed.
-- Expect: admin=1 rep=1 rep_after_own_mark=0 other_rep=0 admin_after_rep_mark=1 anon=0
do $$
declare a int; a2 int; s int; s2 int; o int; n int; sid uuid; tid uuid; lid uuid; ph text; book uuid;
begin
  select user_id into book from team_members where is_book_owner limit 1;
  select tm.user_id into sid from team_members tm join user_roles r on r.user_id = tm.user_id and r.role = 'sales' order by tm.created_at limit 1;
  select tm.user_id into tid from team_members tm join user_roles r on r.user_id = tm.user_id and r.role = 'sales' where tm.user_id <> sid order by tm.created_at limit 1;
  select l.id, regexp_replace(l.phone, '[^0-9]', '', 'g') into lid, ph from outreach_leads l
    where l.assigned_to_user_id = sid and l.phone is not null and not l.is_archived and not public.lead_is_client(l.amount_paid, l.status) limit 1;
  ph := case when ph like '0%' then '44' || substr(ph, 2) else ph end;
  insert into whatsapp_messages (user_id, lead_id, phone, direction, body, message_type, status, test_mode)
    values (book, lid, ph, 'inbound', 'QA unread (rolled back)', 'text', 'received', false);
  perform set_config('request.jwt.claims', json_build_object('sub', book, 'role', 'authenticated')::text, true);
  select count(*) into a from public.my_whatsapp_unread() u where u.phone = ph;
  perform set_config('request.jwt.claims', json_build_object('sub', sid, 'role', 'authenticated')::text, true);
  select count(*) into s from public.my_whatsapp_unread() u where u.phone = ph;
  perform public.mark_whatsapp_read(ph);
  select count(*) into s2 from public.my_whatsapp_unread() u where u.phone = ph;
  perform set_config('request.jwt.claims', json_build_object('sub', tid, 'role', 'authenticated')::text, true);
  select count(*) into o from public.my_whatsapp_unread() u where u.phone = ph;
  perform set_config('request.jwt.claims', json_build_object('sub', book, 'role', 'authenticated')::text, true);
  select count(*) into a2 from public.my_whatsapp_unread() u where u.phone = ph;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select count(*) into n from public.my_whatsapp_unread();
  raise exception 'RESULT admin=% rep=% rep_after_own_mark=% other_rep=% admin_after_rep_mark=% anon=% (rolled back)', a, s, s2, o, a2, n;
end $$;
