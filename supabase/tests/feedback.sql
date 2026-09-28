-- Feedback (migration 20260929150000). ONE query to the Management API; ALWAYS ROLLED BACK (ends by RAISING).
-- Expect: own_sees=1 other_sees=0 admin_sees=1 sales_status_denied=t direct_insert_denied=t fixed_notice=1 notice_title_ok=t reviewing_notice=0
do $$
declare sid uuid; tid uuid; book uuid; fid uuid; os int; ts int; ad int; sd boolean := false; di boolean := false; fx int; tok boolean; rv int;
begin
  select user_id into book from team_members where is_book_owner limit 1;
  select tm.user_id into sid from team_members tm join user_roles r using (user_id) where r.role = 'sales' order by tm.created_at limit 1;
  select tm.user_id into tid from team_members tm join user_roles r using (user_id) where r.role = 'sales' and tm.user_id <> sid order by tm.created_at limit 1;
  insert into feedback_items (user_id, author_role, kind, message) values (sid, 'sales', 'feature', 'QA feature idea (rolled back)') returning id into fid;
  perform set_config('request.jwt.claims', json_build_object('sub', sid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into os from feedback_items where id = fid;
  begin insert into feedback_items (user_id, kind, message) values (sid, 'bug', 'forged'); exception when insufficient_privilege then di := true; end;
  reset role;
  begin perform public.set_feedback_status(fid, 'fixed', null); exception when others then sd := sqlerrm = 'admin_only'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', tid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into ts from feedback_items where id = fid;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', book, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into ad from feedback_items where id = fid;
  reset role;
  perform public.set_feedback_status(fid, 'reviewing', null);
  select count(*) into rv from notifications where user_id = sid and kind = 'feedback_update' and dedupe_key like 'feedback:' || fid || '%';
  perform public.set_feedback_status(fid, 'fixed', 'Shipped today');
  select count(*), bool_and(title = 'Your suggestion was added') into fx, tok from notifications where user_id = sid and kind = 'feedback_update' and dedupe_key = 'feedback:' || fid || ':fixed';
  raise exception 'RESULT own_sees=% other_sees=% admin_sees=% sales_status_denied=% direct_insert_denied=% fixed_notice=% notice_title_ok=% reviewing_notice=% (rolled back)', os, ts, ad, sd, di, fx, tok, rv;
end $$;
