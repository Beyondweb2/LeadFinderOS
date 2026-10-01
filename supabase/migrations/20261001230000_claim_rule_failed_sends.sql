-- CLAIMABLE ≠ WHATSAPP-REACHABLE (2026-10-01, docs/outreach-workspace.md §E). Paul: "'No WhatsApp' only means
-- WhatsApp is unavailable. It should NOT make the business unavailable for sales … audit the claimable
-- predicate rather than adding a special one-off exception, so channel availability and sales eligibility
-- remain separate concepts."
--
-- 1. lead_opener_really_sent — the SQL twin of src/lib/leadState.ts openerReallySent: a whatsapp_sent_at stamp
--    is a contact only while the status is not a failed-send status, or Meta confirmed a delivery once.
-- 2. lead_first_contact_at — its "legacy stamp" term reads the stamp through that rule (the stamp is set when
--    Meta ACCEPTS; a 131026 rejection leaves it — 209 no_whatsapp leads, zero real sends).
-- 3. lead_claim_block — THE one claim rule (claim_lead, sales_pool and Find Leads' "Claim" state all read it):
--    owned by someone else, archived, a client, opted out, not interested / closed, a wrong number, any
--    suppression row, or a genuine contact attempt already on record. Channel facts (No WhatsApp, a landline,
--    a bounced email) never block — they are how to reach the business, not whether to sell to it.
-- 4. assign_lead_on_contact — an automatic (queue) send assigns the lead only once Meta DELIVERS it; a person's
--    own send still assigns at once. A send that later fails no longer hands the lead to the book owner.
-- Additive: CREATE OR REPLACE only, same signatures. Rollback: re-run the previous definitions (migrations
-- 20260927100100, 20260928*, 20260929* — read them live before replacing).

create or replace function public.lead_opener_really_sent(_status text, _sent_at timestamptz, _ever_delivered boolean)
returns boolean language sql immutable set search_path = public as $$
  select _sent_at is not null
     and (coalesce(_ever_delivered, false)
          or coalesce(btrim(_status), '') not in ('no_whatsapp', 'whatsapp_failed', 'no_whatsapp_needs_sms'))
$$;
revoke all on function public.lead_opener_really_sent(text, timestamptz, boolean) from public, anon;
grant execute on function public.lead_opener_really_sent(text, timestamptz, boolean) to authenticated;

create or replace function public.lead_first_contact_at(_lead_id uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  with l as (
    select id, public.phone_key(phone) as pk, status, whatsapp_sent_at, whatsapp_ever_delivered,
           sms_sent_at, instantly_pushed_at, last_outreach_attempt_at
    from public.outreach_leads where id = _lead_id
  )
  select least(
    (select min(m.created_at) from public.whatsapp_messages m, l
      where m.lead_id = l.id and (m.direction = 'inbound' or m.status in ('sent', 'delivered', 'read'))),
    (select min(m.created_at) from public.whatsapp_messages m, l
      where l.pk is not null and public.phone_key(m.phone) = l.pk
        and (m.direction = 'inbound' or m.status in ('sent', 'delivered', 'read'))),
    (select min(s.created_at) from public.whatsapp_sends s, l
      where s.lead_id = l.id and s.delivery_status in ('sent', 'delivered', 'read')),
    (select min(o.created_at) from public.onboarding_responses o, l where o.lead_id = l.id),
    (select least(case when public.lead_opener_really_sent(l.status, l.whatsapp_sent_at, l.whatsapp_ever_delivered) then l.whatsapp_sent_at end,
                  sms_sent_at, instantly_pushed_at, last_outreach_attempt_at) from l)
  )
$$;

/* ⛔ Note the first two terms: a whatsapp_messages row with status 'sent' counts. A FAILED message is updated
   to 'failed' by the status webhook, so it drops out here; the stamp on the lead row is what never cleared. */

create or replace function public.lead_claim_block(_lead_id uuid, _uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when l.id is null then 'not_found'
    when l.assigned_to_user_id is not null and l.assigned_to_user_id is distinct from _uid then 'already_owned'
    when l.is_archived is true then 'archived'
    when public.lead_is_client(l.amount_paid, l.status) then 'client'
    when coalesce(l.status, '') = 'opted_out' then 'opted_out'
    when coalesce(l.status, '') in ('not_interested', 'closed') then 'not_interested'
    when exists (select 1 from public.contact_suppressions s
                  where s.wrong_number_at is not null
                    and (s.lead_id = l.id or (public.phone_e164_key(l.phone) is not null and s.phone_e164 = public.phone_e164_key(l.phone)))) then 'wrong_number'
    when exists (select 1 from public.contact_suppressions s
                  where s.lead_id = l.id or (public.phone_e164_key(l.phone) is not null and s.phone_e164 = public.phone_e164_key(l.phone))) then 'suppressed'
    when public.lead_contact_attempt_at(l.id) is not null then 'already_contacted'
    else null
  end
  from (select 1) one
  left join public.outreach_leads l on l.id = _lead_id
$$;
revoke all on function public.lead_claim_block(uuid, uuid) from public, anon, authenticated;

create or replace function public.claim_lead(_lead_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_role text := public.my_role();
  v_uid uuid := auth.uid();
  v_lead record;
  v_owner text;
  v_block text;
  v_g jsonb;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  select id, assigned_to_user_id into v_lead from public.outreach_leads where id = _lead_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_lead.assigned_to_user_id = v_uid then return jsonb_build_object('ok', true, 'already_yours', true); end if;
  v_block := public.lead_claim_block(_lead_id, v_uid);
  if v_block = 'already_owned' then
    select display_name into v_owner from public.team_members where user_id = v_lead.assigned_to_user_id;
    return jsonb_build_object('ok', false, 'error', 'already_owned', 'owner_name', v_owner);
  end if;
  if v_block is not null then return jsonb_build_object('ok', false, 'error', v_block); end if;
  /* ⛔ ABUSE LIMIT (2026-09-29): claims per hour / per day (protection_settings.actions.claim), a
     suspended account, a warning at warn_day. Counted only for a claim that would succeed. */
  v_g := public.guard_action(v_uid, 'claim', _lead_id, 0, 1, 'claim_lead');
  if not coalesce((v_g ->> 'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'usage_paused', 'detail', 'Usage temporarily paused — contact Paul');
  end if;
  update public.outreach_leads set assigned_to_user_id = v_uid, assigned_at = now() where id = _lead_id;
  insert into public.lead_activity (lead_id, actor_user_id, kind) values (_lead_id, v_uid, 'lead_claimed');
  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.sales_pool(_q text, _limit integer, _offset integer)
returns table(id uuid, business_name text, trade text, town text, website text, rating numeric, review_count integer, has_phone boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id, l.business_name, coalesce(l.search_keyword, l.category), coalesce(l.derived_town, l.search_location),
         l.website, l.rating, l.review_count, public.phone_key(l.phone) is not null, l.created_at
  from public.outreach_leads l
  where public.my_role() in ('sales', 'admin')
    and l.assigned_to_user_id is null
    and l.is_archived is not true
    and (coalesce(btrim(_q), '') = ''
         or l.business_name ilike '%' || btrim(_q) || '%'
         or coalesce(l.search_keyword, l.category, '') ilike '%' || btrim(_q) || '%'
         or coalesce(l.derived_town, l.search_location, '') ilike '%' || btrim(_q) || '%')
    and public.lead_claim_block(l.id, auth.uid()) is null
  order by l.created_at desc
  limit least(greatest(coalesce(_limit, 50), 1), 200)
  offset greatest(coalesce(_offset, 0), 0)
$$;

create or replace function public._lead_identity_rows(_items jsonb)
returns table(k text, lead_id uuid, state text, owner_id uuid, owner_name text, added_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
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
           when public.lead_claim_block(l.id, v_uid) is not null then 'protected'
           else 'claimable'
         end,
         l.assigned_to_user_id, t.display_name, l.created_at
  from m
  left join public.outreach_leads l on l.id = m.lid
  left join public.team_members t on t.user_id = l.assigned_to_user_id;
end
$$;

create or replace function public.assign_lead_on_contact()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_sender uuid := coalesce(new.sent_by_user_id, new.user_id);
  v_person boolean := new.sent_by_user_id is not null;
begin
  if new.lead_id is null then return new; end if;
  /* An inbound reply, a delivered/read message, or a PERSON's own send assigns. An automatic queue send that is
     only 'sent' (accepted by Meta, not yet delivered) waits — it may still fail as "not on WhatsApp". */
  if not (new.direction = 'inbound' or new.status in ('delivered', 'read') or (new.status = 'sent' and v_person)) then return new; end if;
  begin
    select case when exists (select 1 from public.team_members t where t.user_id = v_sender and t.status = 'active')
                then v_sender else public.book_owner_id() end
      into v_owner;
    if v_owner is not null then
      update public.outreach_leads
         set assigned_to_user_id = v_owner, assigned_at = now()
       where id = new.lead_id and assigned_to_user_id is null;
    end if;
  exception when others then
    raise warning 'assign_lead_on_contact: %', sqlerrm;
  end;
  return new;
end
$$;
