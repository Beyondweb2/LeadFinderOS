-- Campaign admin-only, the claim rule, one contact-method set (2026-09-28). Applied one statement at a
-- time and read back (CLAUDE.md §2). No data rewritten; no existing policy dropped.

-- 1. ⛔ CAMPAIGNS: CREATE / EDIT / DELETE ARE THE ADMIN'S, ENFORCED BY THE DATABASE.
--    The old permissive policies let ANY signed-in user insert a campaign (only created_by = self was
--    checked) and edit or delete their own; the app merely hid the buttons. RESTRICTIVE policies are
--    ANDed with every permissive one, so from now on a write needs my_role() = 'admin' whatever else
--    allows it. SELECT is untouched (every signed-in role still reads every campaign — Sales picks one
--    for its own lead through lead_set_campaign, which writes outreach_leads, not campaigns).
create policy "campaigns insert admin only" on public.campaigns as restrictive for insert to authenticated
  with check ((select public.my_role()) = 'admin');

-- 2.
create policy "campaigns update admin only" on public.campaigns as restrictive for update to authenticated
  using ((select public.my_role()) = 'admin') with check ((select public.my_role()) = 'admin');

-- 3.
create policy "campaigns delete admin only" on public.campaigns as restrictive for delete to authenticated
  using ((select public.my_role()) = 'admin');

-- 4. The admin manages EVERY campaign, not only the ones they created (one was created by the Test
--    salesperson before this; without this nobody could edit or remove it).
create policy "admin updates any campaign" on public.campaigns as permissive for update to authenticated
  using ((select public.my_role()) = 'admin') with check ((select public.my_role()) = 'admin');

-- 5.
create policy "admin deletes any campaign" on public.campaigns as permissive for delete to authenticated
  using ((select public.my_role()) = 'admin');

-- 6. ⛔ THE CLAIM RULE: "nobody has contacted it yet" means NO GENUINE OUTBOUND ATTEMPT, ON ANY CHANNEL.
--    lead_first_contact_at counts WhatsApp (a real send by lead or phone, any inbound, a successful
--    whatsapp_sends row), a questionnaire, and the legacy send stamps — but not a logged call, email,
--    LinkedIn message or any other hand-logged contact, so an admin unassigning a lead a rep had phoned
--    put it back in the pool. This adds, positively: every logged contact (lead_activity call_outcome /
--    contact_logged — all of them are attempts, a "no answer" included), and a sign-up or report link
--    recorded as SENT on any channel. NOT counted: added, viewed, audited, crawled, a report or link
--    generated / copied, an internal note, a message that never sent.
--    ⚠️ A separate function ON PURPOSE: lead_first_contact_at also decides sales_queue_opener's "never
--    contacted" (the cold WhatsApp opener), and a phone call must not start refusing that opener. Only
--    the three CLAIM decisions below read this one.
--    ⚡ TWO FUNCTIONS, MEASURED. One SECURITY DEFINER function calling another (lead_first_contact_at)
--    cost 2.5 s over the 2,486 unassigned leads (the pool went 0.65 s → 3.2–4 s), the parts alone
--    0.36 s + 0.07 s. So the new sources live in lead_logged_contact_at (definer — it reads tables a
--    salesperson cannot), and lead_contact_attempt_at is a plain SQL expression the planner inlines.
create or replace function public.lead_logged_contact_at(_lead_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path to 'public'
as $function$
  select least(
    (select min(a.created_at) from public.lead_activity a where a.lead_id = _lead_id and a.kind in ('call_outcome', 'contact_logged')),
    (select min(e.created_at) from public.onboarding_link_events e where e.lead_id = _lead_id and e.kind = 'sent'),
    (select min(e.created_at) from public.report_link_events e where e.lead_id = _lead_id and e.kind = 'sent')
  )
$function$;

-- 7.
revoke all on function public.lead_logged_contact_at(uuid) from public, anon;

-- 8.
grant execute on function public.lead_logged_contact_at(uuid) to authenticated;

-- 8a. The claim rule itself: a genuine outbound attempt on ANY channel, ever.
create or replace function public.lead_contact_attempt_at(_lead_id uuid)
returns timestamptz
language sql
stable
as $function$
  select least(public.lead_first_contact_at(_lead_id), public.lead_logged_contact_at(_lead_id))
$function$;

-- 8b.
revoke all on function public.lead_contact_attempt_at(uuid) from public, anon;

-- 8c.
grant execute on function public.lead_contact_attempt_at(uuid) to authenticated;

-- 9. claim_lead — unchanged except the contact test.
create or replace function public.claim_lead(_lead_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_role text := public.my_role();
  v_uid uuid := auth.uid();
  v_lead record;
  v_owner text;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  select id, assigned_to_user_id, is_archived, amount_paid, status into v_lead
    from public.outreach_leads where id = _lead_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_lead.assigned_to_user_id = v_uid then return jsonb_build_object('ok', true, 'already_yours', true); end if;
  if v_lead.assigned_to_user_id is not null then
    select display_name into v_owner from public.team_members where user_id = v_lead.assigned_to_user_id;
    return jsonb_build_object('ok', false, 'error', 'already_owned', 'owner_name', v_owner);
  end if;
  if v_lead.is_archived is true then return jsonb_build_object('ok', false, 'error', 'archived'); end if;
  if public.lead_is_client(v_lead.amount_paid, v_lead.status) then return jsonb_build_object('ok', false, 'error', 'client'); end if;
  if public.lead_contact_attempt_at(_lead_id) is not null then return jsonb_build_object('ok', false, 'error', 'already_contacted'); end if;
  update public.outreach_leads set assigned_to_user_id = v_uid, assigned_at = now() where id = _lead_id;
  insert into public.lead_activity (lead_id, actor_user_id, kind) values (_lead_id, v_uid, 'lead_claimed');
  return jsonb_build_object('ok', true);
end
$function$;

-- 10. sales_pool — unchanged except the contact test.
create or replace function public.sales_pool(_q text, _limit integer, _offset integer)
 returns table(id uuid, business_name text, trade text, town text, website text, rating numeric, review_count integer, has_phone boolean, created_at timestamp with time zone)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select l.id, l.business_name, coalesce(l.search_keyword, l.category), coalesce(l.derived_town, l.search_location),
         l.website, l.rating, l.review_count, public.phone_key(l.phone) is not null, l.created_at
  from public.outreach_leads l
  where public.my_role() in ('sales', 'admin')
    and l.assigned_to_user_id is null
    and l.is_archived is not true
    and not public.lead_is_client(l.amount_paid, l.status)
    and coalesce(l.status, '') not in ('not_interested', 'opted_out', 'closed', 'bounced')
    and (coalesce(btrim(_q), '') = ''
         or l.business_name ilike '%' || btrim(_q) || '%'
         or coalesce(l.search_keyword, l.category, '') ilike '%' || btrim(_q) || '%'
         or coalesce(l.derived_town, l.search_location, '') ilike '%' || btrim(_q) || '%')
    and public.lead_contact_attempt_at(l.id) is null
  order by l.created_at desc
  limit least(greatest(coalesce(_limit, 50), 1), 200)
  offset greatest(coalesce(_offset, 0), 0)
$function$;

-- 11. lead_identity_lookup — unchanged except the contact test ('protected' vs 'claimable' in Find Leads).
create or replace function public.lead_identity_lookup(_items jsonb)
 returns table(k text, lead_id uuid, state text, owner_id uuid, owner_name text, added_at timestamp with time zone)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_role text := public.my_role();
  v_uid uuid := auth.uid();
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if jsonb_typeof(_items) is distinct from 'array' or jsonb_array_length(_items) > 500 then
    raise exception 'bad_items' using errcode = '22023';
  end if;
  return query
  with it as (
    select x->>'k' as ik,
           nullif(btrim(x->>'place_id'), '') as pid,
           public.phone_key(x->>'phone') as pk,
           nullif(btrim(x->>'maps_url'), '') as mu
    from jsonb_array_elements(_items) x
  ), m as (
    select it.ik, coalesce(
      (select l.id from public.outreach_leads l where it.pid is not null and l.place_id = it.pid order by l.created_at limit 1),
      (select l.id from public.outreach_leads l where it.pk is not null and public.phone_key(l.phone) = it.pk order by l.created_at limit 1),
      (select l.id from public.outreach_leads l where it.mu is not null and l.google_maps_url = it.mu order by l.created_at limit 1)
    ) as lid
    from it
  )
  select m.ik, l.id,
         case
           when l.id is null then 'new'
           when l.assigned_to_user_id = v_uid then 'yours'
           when l.assigned_to_user_id is not null then 'owned'
           when l.is_archived is true or public.lead_is_client(l.amount_paid, l.status)
                or public.lead_contact_attempt_at(l.id) is not null then 'protected'
           else 'claimable'
         end,
         l.assigned_to_user_id, t.display_name, l.created_at
  from m
  left join public.outreach_leads l on l.id = m.lid
  left join public.team_members t on t.user_id = l.assigned_to_user_id;
end
$function$;

-- 12. lead_log_contact — the ONE contact-method set (src/lib/contactMethods.ts: every method logged by
--     hand; WhatsApp is recorded by the send itself and is still refused here, so a send cannot count
--     twice) and one more outcome, message_sent ("Sent, no reply yet"), so an email or LinkedIn message
--     can be logged without pretending it was a call. Activity only, as before: no status, no next action.
create or replace function public.lead_log_contact(_lead_id uuid, _channel text, _outcome text, _note text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public._require_work(_lead_id);
  if _channel is null or _channel not in ('call', 'email', 'linkedin', 'linkedin_voice', 'social', 'sms', 'in_person', 'referral', 'video', 'other') then
    return jsonb_build_object('ok', false, 'error', 'bad_channel');
  end if;
  if _outcome is null or _outcome not in ('no_answer', 'left_voicemail', 'message_sent', 'spoke_to_owner', 'interested', 'call_back',
       'meeting_booked', 'not_interested', 'wrong_number', 'agency_controls_site') then
    return jsonb_build_object('ok', false, 'error', 'bad_outcome');
  end if;
  insert into public.lead_activity (lead_id, actor_user_id, kind, body, data)
  values (_lead_id, auth.uid(), case when _channel = 'call' then 'call_outcome' else 'contact_logged' end,
          nullif(btrim(coalesce(_note, '')), ''), jsonb_build_object('outcome', _outcome, 'channel', _channel));
  return jsonb_build_object('ok', true);
end $function$;
