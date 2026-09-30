-- Sales Team Board security + workflow tests (2026-10-01). RUN AGAINST THE LIVE DATABASE; ALWAYS ROLLED BACK.
-- One DO block that ends by RAISING its results, so nothing it writes can ever commit (fake users on
-- example.invalid, a fake lead with no phone, posts, assignments, notifications). How to run: send the
-- file as one query to the Management API (CLAUDE.md §2); the results are in the error message.
do $$
declare
  a uuid := 'cccccccc-0000-4000-8000-00000000000a';
  b uuid := 'cccccccc-0000-4000-8000-00000000000b';
  t uuid := 'cccccccc-0000-4000-8000-00000000000c';  -- a test account (metric_exclusions)
  adm uuid := (select user_id from public.team_members where is_book_owner limit 1);
  lead uuid := gen_random_uuid();
  res jsonb := '[]'::jsonb;
  r jsonb; p1 uuid; p2 uuid; p3 uuid; n int; x jsonb; na_before date;
  procedure_ok boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'board-a@example.invalid', '{}', '{}', now(), now()),
    (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'board-b@example.invalid', '{}', '{}', now(), now()),
    (t, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'board-t@example.invalid', '{}', '{}', now(), now());
  insert into public.user_roles (user_id, role) values (a, 'sales'), (b, 'sales'), (t, 'sales');
  insert into public.team_members (user_id, display_name) values (a, 'Board A'), (b, 'Board B'), (t, 'Board Test');
  insert into public.metric_exclusions (kind, value, reason) values ('user', t::text, 'rolled-back test');
  insert into public.outreach_leads (id, user_id, business_name, status, next_action, next_action_date, next_action_note)
    values (lead, adm, 'Board Test Locksmiths', 'price_given', 'call', current_date + 2, 'keep me');

  res := res || jsonb_build_object('everyone (internal, service side) excludes the test account', not (t = any(public.team_everyone())) and a = any(public.team_everyone()) and b = any(public.team_everyone()));
  -- ── as the admin ──
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', adm::text, true);
  execute 'set local role authenticated';


  -- Scenario A: one announcement to two people
  r := public.team_save_post(null, 'announcement', 'New LinkedIn scripts', 'Use them from tomorrow', '{}', null, null, null, null, 'selected', array[a, b], true, 'k-ann-1');
  p1 := (r->>'id')::uuid;
  res := res || jsonb_build_object('A: announcement published to 2, both notified', (r->>'ok')::boolean and (r->>'recipients')::int = 2 and (r->>'notified')::int = 2);
  r := public.team_save_post(null, 'announcement', 'New LinkedIn scripts', 'Use them from tomorrow', '{}', null, null, null, null, 'selected', array[a, b], true, 'k-ann-1');
  execute 'reset role';
  res := res || jsonb_build_object('A: a retry with the same key duplicates nothing', (r->>'duplicate')::boolean and (select count(*) from public.team_posts where client_key = 'k-ann-1') = 1
    and (select count(*) from public.notifications where dedupe_key = 'team:' || p1) = 2);
  execute 'set local role authenticated';
  r := public.team_save_post(null, 'announcement', 'x', null, '{}', null, null, null, null, 'selected', array[adm], true, 'k-bad-1');
  res := res || jsonb_build_object('the admin is not a board recipient', r->>'error' = 'not_an_active_salesperson');
  r := public.team_save_post(null, 'announcement', 'x', null, '{}', '//evil.example', null, null, null, 'selected', array[a], true, 'k-bad-2');
  res := res || jsonb_build_object('an outside link is refused', r->>'error' = 'bad_link');
  r := public.team_save_post(null, 'template_update', 'Opener v3', null, '{}', null, null, null, null, 'selected', array[a], true, 'k-bad-3');
  res := res || jsonb_build_object('a template update must say approved or draft', r->>'error' = 'template_approval_required');

  -- Scenario C: a manual task with a due date, as a draft first
  r := public.team_save_post(null, 'task', 'Research roofing businesses in Manchester', 'Add 20', '{}', '/find-leads', null, current_date + 3, 'high', 'selected', array[a], false, 'k-task-1');
  p2 := (r->>'id')::uuid;
  res := res || jsonb_build_object('C: saved as a draft, nobody notified', r->>'status' = 'draft' and not exists (select 1 from public.notifications where dedupe_key = 'team:' || p2));
  r := public.team_save_post(p2, 'task', 'Research roofing businesses in Manchester', 'Add 25', '{}', '/find-leads', null, current_date + 3, 'high', 'selected', array[a], true, null);
  res := res || jsonb_build_object('C: the draft is edited and published', (r->>'ok')::boolean and (select body from public.team_posts where id = p2) = 'Add 25'
    and (select task_status from public.team_post_recipients where post_id = p2 and user_id = a) = 'todo');
  r := public.team_save_post(null, 'task', 'Call them', null, '{}', null, lead, null, null, 'selected', array[a], true, 'k-bad-4');
  res := res || jsonb_build_object('a lead-linked task only goes to the holder', r->>'error' = 'lead_not_theirs');

  -- Scenario D: assign the lead to A with instructions
  r := public.assign_lead_with_brief(lead, a, 'Already quoted. Check they are still interested.', null, 'Quoted and quiet', 'k-as-1');
  p3 := (r->>'task_id')::uuid;
  res := res || jsonb_build_object('D: assigned, one board task, the notice sent', (r->>'ok')::boolean and (r->>'task')::boolean and (r->>'notified')::boolean
    and (select assigned_to_user_id from public.outreach_leads where id = lead) = a);
  execute 'reset role';
  res := res || jsonb_build_object('D: the notice carries the instructions', (select body from public.notifications where user_id = a and kind = 'lead_assigned' and lead_id = lead) like 'Instructions: Already quoted%');
  res := res || jsonb_build_object('D: the Next Action is untouched (no date given)', (select next_action::text || next_action_date::text || next_action_note from public.outreach_leads where id = lead) = 'call' || (current_date + 2)::text || 'keep me');
  res := res || jsonb_build_object('D: History has the note and the task', (select data->>'note' from public.lead_activity where lead_id = lead and kind = 'lead_assigned' order by created_at desc limit 1) like 'Already quoted%'
    and (select data->>'team_post_id' from public.lead_activity where lead_id = lead and kind = 'lead_assigned' order by created_at desc limit 1) = p3::text);
  res := res || jsonb_build_object('D: no separate team notice (one notice, not two)', not exists (select 1 from public.notifications where dedupe_key = 'team:' || p3));
  res := res || jsonb_build_object('D: status unchanged, no message queued', (select status from public.outreach_leads where id = lead) = 'price_given'
    and not exists (select 1 from public.whatsapp_messages where lead_id = lead));
  execute 'set local role authenticated';
  r := public.assign_lead_with_brief(lead, a, 'again', null, null, 'k-as-2');
  res := res || jsonb_build_object('same owner again: nothing new', (r->>'unchanged')::boolean and (select count(*) from public.team_posts where lead_id = lead) = 1
    and (select count(*) from public.lead_activity where lead_id = lead and kind = 'lead_assigned') = 1);
  r := public.assign_lead_with_brief(lead, a, 'x', null, null, 'k-as-1');
  res := res || jsonb_build_object('a retried assignment call is a no-op', (r->>'duplicate')::boolean);

  -- ── as A ──
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  x := public.team_board_mine();
  res := res || jsonb_build_object('A sees 3 items', jsonb_array_length(x) = 3);
  res := res || jsonb_build_object('A sees the lead with its live Next Action', exists (select 1 from jsonb_array_elements(x) e where e->>'id' = p3::text
    and e->'lead'->>'name' = 'Board Test Locksmiths' and e->'lead'->>'next_action' = 'call'));
  n := public.team_board_mark_read(array[p1]);
  res := res || jsonb_build_object('A marks the announcement read (and its notice)', n = 1 and (select read_at is not null from public.notifications where user_id = a and dedupe_key = 'team:' || p1));
  r := public.team_task_set_status(p1, 'completed');
  res := res || jsonb_build_object('an announcement is not a task', r->>'error' = 'not_your_task');
  r := public.team_task_set_status(p2, 'in_progress');
  res := res || jsonb_build_object('C: A moves the task to in progress', (r->>'ok')::boolean);
  r := public.team_task_set_status(p2, 'completed');
  res := res || jsonb_build_object('C: …then completed, with who and when', (r->>'ok')::boolean and (select completed_by = a and completed_at is not null from public.team_post_recipients where post_id = p2 and user_id = a));
  r := public.team_task_set_status(p3, 'completed');
  res := res || jsonb_build_object('D: completing the assignment task leaves the lead alone', (r->>'ok')::boolean
    and (select status = 'price_given' and next_action::text = 'call' and assigned_to_user_id = a from public.sales_leads where id = lead));
  r := public.team_task_set_status(p3, 'in_progress');
  begin
    r := public.team_save_post(null, 'announcement', 'hack', null, '{}', null, null, null, null, 'everyone', null, true, 'k-hack');
    procedure_ok := false;
  exception when others then procedure_ok := sqlerrm = 'admin_only'; end;
  res := res || jsonb_build_object('G: a salesperson cannot publish', procedure_ok);
  begin r := public.assign_lead_with_brief(lead, a, null, null, null, null); procedure_ok := false;
  exception when others then procedure_ok := sqlerrm = 'admin_only'; end;
  res := res || jsonb_build_object('G: a salesperson cannot assign', procedure_ok);
  begin perform public.team_board_admin(60); procedure_ok := false;
  exception when others then procedure_ok := sqlerrm = 'admin_only'; end;
  res := res || jsonb_build_object('G: a salesperson cannot read the oversight', procedure_ok);
  begin insert into public.team_post_recipients (post_id, user_id) values (p1, a); procedure_ok := false;
  exception when others then procedure_ok := true; end;
  res := res || jsonb_build_object('G: no direct writes', procedure_ok);

  -- ── as B ──
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  x := public.team_board_mine();
  res := res || jsonb_build_object('A: B still has the announcement unread (independent read state)', exists (select 1 from jsonb_array_elements(x) e where e->>'id' = p1::text and e->>'read_at' is null));
  res := res || jsonb_build_object('G: B cannot see A''s task or lead', jsonb_array_length(x) = 1
    and (select count(*) from public.team_posts) = 1 and (select count(*) from public.team_post_recipients) = 1);
  r := public.team_task_set_status(p2, 'todo');
  res := res || jsonb_build_object('G: B cannot move A''s task', r->>'error' = 'not_your_task');
  n := public.team_board_mark_read(array[p2]);
  execute 'reset role';
  res := res || jsonb_build_object('G: B cannot mark A''s item read', n = 0 and (select read_at from public.team_post_recipients where post_id = p2 and user_id = a) is not null);
  execute 'set local role authenticated';

  -- ── admin: Scenario E, reassign to B ──
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', adm::text, true);
  r := public.assign_lead_with_brief(lead, b, 'Take this over', current_date + 1, null, 'k-as-3');
  res := res || jsonb_build_object('E: moved to B with a new task', (r->>'ok')::boolean and (r->>'task')::boolean and (select assigned_to_user_id from public.outreach_leads where id = lead) = b);
  res := res || jsonb_build_object('E: A''s task is cancelled as reassigned, kept in the trail', (select task_status = 'cancelled' and cancelled_reason = 'reassigned' from public.team_post_recipients where post_id = p3 and user_id = a)
    and exists (select 1 from public.team_post_events where post_id = p3 and kind = 'reassigned'));
  res := res || jsonb_build_object('E: the given date became the lead''s Next Action (type kept)', (select next_action::text = 'call' and next_action_date = current_date + 1 and next_action_note = 'keep me' from public.outreach_leads where id = lead));
  res := res || jsonb_build_object('E: both assignments in History', (select count(*) from public.lead_activity where lead_id = lead and kind = 'lead_assigned') = 2);
  r := public.assign_lead_with_brief(lead, adm, null, null, null, 'k-as-4');
  res := res || jsonb_build_object('back to Paul: moved, no task, B''s task cancelled', (r->>'ok')::boolean and not coalesce((r->>'task')::boolean, false)
    and (select task_status from public.team_post_recipients where post_id = (r->>'task_id')::uuid) is null
    and not exists (select 1 from public.team_post_recipients rr join public.team_posts pp on pp.id = rr.post_id where pp.lead_id = lead and rr.task_status in ('todo', 'in_progress')));
  execute 'reset role'; update public.team_members set status = 'disabled' where user_id = b; execute 'set local role authenticated';
  r := public.assign_lead_with_brief(lead, b, null, null, null, 'k-as-5');
  res := res || jsonb_build_object('an inactive salesperson is refused', r->>'error' = 'not_an_active_member');
  r := public.team_edit_published(p1, 'New LinkedIn scripts (v2)', 'Use them from Monday', null, null);
  res := res || jsonb_build_object('a published edit is labelled and keeps the old words', (r->>'ok')::boolean and (select edit_count = 1 and edited_at is not null from public.team_posts where id = p1)
    and (select data->'before'->>'body' from public.team_post_events where post_id = p1 and kind = 'edited') = 'Use them from tomorrow');
  x := public.team_board_admin(60);
  res := res || jsonb_build_object('oversight lists each person''s state', exists (select 1 from jsonb_array_elements(x) e, jsonb_array_elements(e->'recipients') rc where e->>'id' = p2::text and rc->>'task_status' = 'completed'));
  r := public.team_cancel_task(p2, null);
  res := res || jsonb_build_object('a completed task stays completed when cancelled', (r->>'cancelled')::int = 0);

  raise exception 'QA_RESULT %', res::text;
end $$;
