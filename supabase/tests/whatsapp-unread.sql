-- WhatsApp unread, per person (migration 20260929120000). Send as ONE query to the Management API.
-- ALWAYS ROLLED BACK: the block ends by RAISING its result, so nothing it inserts is ever committed.
-- Expect: admin=1 rep=1 rep_after_own_mark=0 other_rep=0 admin_after_rep_mark=1 anon=0
do $$
declare a int; a2 int; s int; s2 int; o int; n int; sid uuid; tid uuid; lid uuid; ph text; book uuid;
begin
  select user_id into book from team_members where is_book_owner limit 1;
  select tm.user_id into sid from team_members tm join user_roles r on r.user_id = tm.user_id and r.role = 'sales' order by tm.created_at limit 1;
  select tm.user_id into tid from team_members tm join user_roles r on r.user_id = tm.user_id and r.role = 'sales' where tm.user_id <> sid order by tm.created_at limit 1;
  /* ⛔ ITS OWN FIXTURE (2026-10-02): it borrowed "a live lead assigned to the first salesperson, with a phone" and
     failed (phone NULL) the day there was none. Rolled back; the number is in the Ofcom drama range. */
  lid := gen_random_uuid(); ph := '447700900621';
  insert into outreach_leads (id, user_id, business_name, status, phone, assigned_to_user_id, assigned_at)
    values (lid, book, 'QA unread (rolled back)', 'initial_contact', '+' || ph, sid, now());
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
