-- Quick Close (migration 20260929160000). ONE query to the Management API; ALWAYS ROLLED BACK (ends by RAISING).
-- Expect: same_row=t rows_for_lead=1 first_claim=t second_claim=f rep_sees_event=1 other_rep_sees=0 anon_denied=t sales_cannot_call_row=t
do $$
declare sid uuid; tid uuid; lid uuid; r1 uuid; r2 uuid; n int; c1 boolean; c2 boolean; rs int; os int; an boolean := false; sc boolean := false;
begin
  select tm.user_id into sid from team_members tm join user_roles r using (user_id) where r.role = 'sales' order by tm.created_at limit 1;
  select tm.user_id into tid from team_members tm join user_roles r using (user_id) where r.role = 'sales' and tm.user_id <> sid order by tm.created_at limit 1;
  select l.id into lid from outreach_leads l where l.assigned_to_user_id = sid and not l.is_archived
    and not exists (select 1 from onboarding_responses o where o.lead_id = l.id) limit 1;
  r1 := public.quick_close_row(lid, 'QA');
  r2 := public.quick_close_row(lid, 'QA');
  select count(*) into n from onboarding_responses where lead_id = lid;
  c1 := public.quick_close_claim_link(r1);
  c2 := public.quick_close_claim_link(r1);
  insert into quick_close_events (lead_id, onboarding_id, actor_user_id, kind) values (lid, r1, sid, 'answers_saved');
  perform set_config('request.jwt.claims', json_build_object('sub', sid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into rs from quick_close_events where lead_id = lid;
  begin perform public.quick_close_row(lid, 'x'); exception when insufficient_privilege then sc := true; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', tid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into os from quick_close_events where lead_id = lid;
  reset role;
  set local role anon;
  begin select count(*) into n from quick_close_events; exception when insufficient_privilege then an := true; end;
  reset role;
  select count(*) into n from onboarding_responses where lead_id = lid;
  raise exception 'RESULT same_row=% rows_for_lead=% first_claim=% second_claim=% rep_sees_event=% other_rep_sees=% anon_denied=% sales_cannot_call_row=% (rolled back)', r1 = r2, n, c1, c2, rs, os, an, sc;
end $$;
