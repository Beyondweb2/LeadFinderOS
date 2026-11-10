-- A SALESPERSON CAN ADD A MOBILE TO A LANDLINE LEAD (Paul, 2026-11-10, docs/salesperson-journey-audit.md).
-- 3,681 active leads hold a landline. On the call the owner gives a mobile, and until now a salesperson had no way to
-- put it on the lead, so the sign-up link could only go by email or be copied by hand (WhatsApp and Text only ever go to
-- the lead's own number, by design: the sender refuses any other).
--
-- lead_add_mobile(lead, mobile): the lead's number becomes the mobile, the number it had is KEPT in phone_original (the
-- first one, for good), and History records who changed it, to what, from what.
-- ⛔ A salesperson may only ADD a mobile where the lead has none (a landline, or no number). A lead that already has a
--    mobile is the admin's to change. So this cannot be used to point an already-messaged lead at someone else.
-- ⛔ Refused: a number that is not a mobile for this lead's market (mobile_market, the same rule every sender asks), a
--    number on the do-not-contact list, a number another lead already holds.
-- Additive and idempotent. phone_original is a plain nullable column with no default: no table rewrite.

alter table public.outreach_leads add column if not exists phone_original text;
comment on column public.outreach_leads.phone_original is
  'The number the lead had before a mobile was added with lead_add_mobile (the first one, never overwritten). Null = never changed that way.';

create or replace function public.lead_add_mobile(_lead_id uuid, _mobile text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_role text := public.my_role();
  v_pk text := public.phone_key(_mobile);
  v_new text := public.phone_e164_key(_mobile);
  v_phone text; v_country text; v_archived boolean; v_original text;
  v_other uuid; v_other_name text;
begin
  perform public._require_work(_lead_id);
  select phone, country, is_archived, phone_original into v_phone, v_country, v_archived, v_original
    from public.outreach_leads where id = _lead_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_archived is true then return jsonb_build_object('ok', false, 'error', 'archived'); end if;
  if v_pk is null or v_new is null or public.mobile_market(v_country, v_pk) is null then
    return jsonb_build_object('ok', false, 'error', 'not_a_mobile');
  end if;
  if public.phone_key(v_phone) is not distinct from v_pk then
    return jsonb_build_object('ok', false, 'error', 'same_number');
  end if;
  -- Positive match: only the admin may replace a number that is already a mobile.
  if public.mobile_market(v_country, public.phone_key(v_phone)) is not null and v_role is distinct from 'admin' then
    return jsonb_build_object('ok', false, 'error', 'already_mobile');
  end if;
  if exists (select 1 from public.contact_suppressions s where s.phone_e164 = v_new) then
    return jsonb_build_object('ok', false, 'error', 'suppressed');
  end if;
  -- One writer per number at a time, then the duplicate read (the index on phone_key(phone) answers it).
  perform pg_advisory_xact_lock(hashtext('lead_add_mobile:' || v_pk));
  select o.id, t.display_name into v_other, v_other_name
    from public.outreach_leads o
    left join public.team_members t on t.user_id = coalesce(o.assigned_to_user_id, o.added_by_user_id)
   where o.id <> _lead_id and public.phone_key(o.phone) = v_pk
   limit 1;
  if v_other is not null then
    return jsonb_build_object('ok', false, 'error', 'duplicate', 'owner_name', coalesce(v_other_name, 'someone else'));
  end if;

  update public.outreach_leads
     set phone_original = coalesce(phone_original, nullif(btrim(coalesce(phone, '')), '')),
         phone = v_new,
         -- What we knew was about the OLD number: it is a mobile now, and nothing has been sent to it.
         line_type = 'mobile', line_type_checked_at = now(),
         whatsapp_delivery_status = null, whatsapp_ever_delivered = false, sms_delivery_status = null
   where id = _lead_id;
  insert into public.lead_activity (lead_id, actor_user_id, kind, data)
  values (_lead_id, auth.uid(), 'details_set',
          jsonb_build_object('mobile_added', v_new, 'original_number', coalesce(nullif(btrim(coalesce(v_phone, '')), ''), 'none')));
  return jsonb_build_object('ok', true, 'phone', v_new, 'original', coalesce(v_original, nullif(btrim(coalesce(v_phone, '')), '')));
end $$;
revoke all on function public.lead_add_mobile(uuid, text) from public, anon;
grant execute on function public.lead_add_mobile(uuid, text) to authenticated;
