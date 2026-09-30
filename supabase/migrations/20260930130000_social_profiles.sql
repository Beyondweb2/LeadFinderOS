-- ══ SOCIAL PROFILES (2026-09-30, Paul: "make Enrich a genuinely useful end-to-end sales tool") ═══════
-- One row per profile we know of for a lead — platform, the cleaned link, HOW SURE we are, where it came
-- from, who confirmed or rejected it. The lead's own columns (facebook_url / instagram_url / linkedin_url
-- + their *_status) hold ONLY the one canonical profile per platform, chosen HERE by
-- _social_profiles_sync, so every list, filter and the sales view keep reading plain columns.
--
-- ⛔ Confidence (graded by src/lib/socialProfiles.ts, the one rule, in the edge function — never by
--    the browser):
--      confirmed  — linked from the business's own website / its schema sameAs, its Google listing, its
--                   questionnaire, or a person pasted / confirmed it
--      likely     — found elsewhere with the name AND the town matching (or an own-site link whose
--                   handle does not resemble the name)
--      unverified — anything weaker. NEVER canonical: it waits for a person's Confirm / Not them.
-- ⛔ The canonical pick (below): a person's choice first (manual, or confirmed_by set) — it always
--    beats a later automated guess; then exactly ONE distinct confirmed; then exactly ONE distinct likely.
--    Two competing profiles at the top rank → no canonical, status 'review'. A rejected row stays
--    rejected: an automated find can never re-activate it (the edge function's upsert rule).
-- ⛔ Email is never touched here.
-- Writes: service role only (fn social-profiles, fn enrich-business). Sales and admin READ through RLS.
set local lock_timeout = '5s';

alter table public.outreach_leads add column if not exists linkedin_url text;
alter table public.outreach_leads add column if not exists linkedin_status text;

create table if not exists public.lead_social_profiles (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.outreach_leads(id) on delete cascade,
  user_id uuid not null,
  platform text not null check (platform in ('facebook', 'instagram', 'linkedin_company', 'linkedin_person', 'tiktok', 'youtube', 'x')),
  url text not null check (length(url) between 10 and 500),
  url_key text not null check (length(url_key) between 5 and 500),
  handle text,
  confidence text not null check (confidence in ('confirmed', 'likely', 'unverified')),
  source text not null check (source in ('website', 'website_schema', 'google_listing', 'web_search', 'questionnaire', 'same_business', 'manual', 'legacy')),
  state text not null default 'active' check (state in ('active', 'rejected')),
  evidence jsonb not null default '{}'::jsonb,
  is_canonical boolean not null default false,
  added_by uuid,
  confirmed_by uuid,
  confirmed_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, platform, url_key)
);
create index if not exists lead_social_profiles_lead_idx on public.lead_social_profiles (lead_id);
create index if not exists lead_social_profiles_url_key_idx on public.lead_social_profiles (url_key);

alter table public.lead_social_profiles enable row level security;
drop policy if exists lead_social_profiles_select on public.lead_social_profiles;
create policy lead_social_profiles_select on public.lead_social_profiles for select to authenticated
  using ((select public.my_role()) = 'admin' or lead_id in (select public.my_sales_lead_ids()));
revoke all on public.lead_social_profiles from public, anon;
revoke insert, update, delete, truncate, references, trigger on public.lead_social_profiles from authenticated;
grant select on public.lead_social_profiles to authenticated;

-- The canonical pick + the mirror onto the lead's columns. A platform with NO rows at all leaves the
-- lead's column exactly as it is (a writer that predates this table is never blanked by it).
create or replace function public._social_profiles_sync(_lead_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_platform text;
  v_best uuid;
  v_n int;
  v_active int;
  v_url text; v_status text; v_source text;
  v_li_url text; v_li_status text;
begin
  update public.lead_social_profiles set is_canonical = false where lead_id = _lead_id and is_canonical;

  for v_platform in select distinct platform from public.lead_social_profiles where lead_id = _lead_id loop
    v_best := null;
    -- 1. a person's choice: manual, or confirmed by a person — the newest one
    select id into v_best from public.lead_social_profiles
     where lead_id = _lead_id and platform = v_platform and state = 'active'
       and (source = 'manual' or confirmed_by is not null)
     order by coalesce(confirmed_at, updated_at) desc limit 1;
    -- 2. exactly one distinct confirmed; 3. else exactly one distinct likely (two = competing = review)
    if v_best is null then
      select count(*) into v_n from public.lead_social_profiles
       where lead_id = _lead_id and platform = v_platform and state = 'active' and confidence = 'confirmed';
      if v_n = 1 then
        select id into v_best from public.lead_social_profiles
         where lead_id = _lead_id and platform = v_platform and state = 'active' and confidence = 'confirmed';
      elsif v_n = 0 then
        select count(*) into v_n from public.lead_social_profiles
         where lead_id = _lead_id and platform = v_platform and state = 'active' and confidence = 'likely';
        if v_n = 1 then
          select id into v_best from public.lead_social_profiles
           where lead_id = _lead_id and platform = v_platform and state = 'active' and confidence = 'likely';
        end if;
      end if;
    end if;

    select count(*) into v_active from public.lead_social_profiles where lead_id = _lead_id and platform = v_platform and state = 'active';
    if v_best is not null then
      update public.lead_social_profiles set is_canonical = true where id = v_best;
      select url, confidence, source into v_url, v_status, v_source from public.lead_social_profiles where id = v_best;
    else
      v_url := null; v_source := null;
      v_status := case when v_active > 0 then 'review' else 'none' end;
    end if;

    if v_platform = 'facebook' then
      update public.outreach_leads
         set facebook_url = v_url, facebook_status = v_status, facebook_method = v_source, facebook_last_checked_at = now()
       where id = _lead_id and (facebook_url is distinct from v_url or facebook_status is distinct from v_status or facebook_method is distinct from v_source);
    elsif v_platform = 'instagram' then
      update public.outreach_leads
         set instagram_url = v_url, instagram_status = v_status, instagram_method = v_source, instagram_last_checked_at = now()
       where id = _lead_id and (instagram_url is distinct from v_url or instagram_status is distinct from v_status or instagram_method is distinct from v_source);
    end if;
  end loop;

  -- ONE LinkedIn column: the more certain of the canonical company page and person; a tie → the company
  if exists (select 1 from public.lead_social_profiles where lead_id = _lead_id and platform in ('linkedin_company', 'linkedin_person')) then
    select url, confidence into v_li_url, v_li_status from public.lead_social_profiles
     where lead_id = _lead_id and is_canonical and platform in ('linkedin_company', 'linkedin_person')
     order by (confidence = 'confirmed') desc, (platform = 'linkedin_company') desc limit 1;
    if v_li_url is null then
      v_li_status := case when exists (select 1 from public.lead_social_profiles where lead_id = _lead_id and state = 'active'
                                        and platform in ('linkedin_company', 'linkedin_person')) then 'review' else 'none' end;
    end if;
    update public.outreach_leads set linkedin_url = v_li_url, linkedin_status = v_li_status
     where id = _lead_id and (linkedin_url is distinct from v_li_url or linkedin_status is distinct from v_li_status);
  end if;
end $$;
revoke all on function public._social_profiles_sync(uuid) from public, anon, authenticated;

create or replace function public._social_profiles_after_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- the sync's own is_canonical update fires this again one level down: ignore it
  if pg_trigger_depth() > 1 then return null; end if;
  perform public._social_profiles_sync(coalesce(new.lead_id, old.lead_id));
  if tg_op = 'UPDATE' and old.lead_id is distinct from new.lead_id then perform public._social_profiles_sync(old.lead_id); end if;
  return null;
end $$;
revoke all on function public._social_profiles_after_change() from public, anon, authenticated;

drop trigger if exists trg_lead_social_profiles_sync on public.lead_social_profiles;
create trigger trg_lead_social_profiles_sync
  after insert or update or delete on public.lead_social_profiles
  for each row execute function public._social_profiles_after_change();

create or replace function public._social_profiles_touch()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_lead_social_profiles_touch on public.lead_social_profiles;
create trigger trg_lead_social_profiles_touch before update on public.lead_social_profiles
  for each row when (old.* is distinct from new.* and old.is_canonical is not distinct from new.is_canonical)
  execute function public._social_profiles_touch();

-- The sales view: the LinkedIn link and the three statuses, appended at the END (create or replace view
-- can only add columns there). Body otherwise byte-for-byte the 20260929000000 definition (read back
-- live with pg_get_viewdef on 2026-09-30 before this was written).
create or replace view public.sales_leads with (security_barrier = true) as
select
  l.id, l.business_name, l.phone, l.email, l.google_maps_url, l.address, l.category, l.status,
  l.next_action, l.next_action_date, l.next_action_note, l.call_booked_at, l.created_at, l.updated_at,
  l.country, l.list_type, l.is_archived, l.is_potential_work, l.image_url, l.facebook_url, l.instagram_url,
  l.contact_method, l.place_id, l.whatsapp_status, l.whatsapp_sent_at, l.whatsapp_delivery_status,
  l.whatsapp_template, l.queued_at, l.contact_name, l.website, l.campaign_id, l.search_keyword,
  l.search_location, l.derived_town, l.review_count, l.rating, l.lat, l.lng, l.line_type, l.product,
  l.hook_followup_queued_at, l.contact_followup_queued_at,
  l.assigned_to_user_id, l.assigned_at, l.added_by_user_id, l.website_control, l.website_control_note,
  null::numeric as amount_paid,
  l.lead_source,
  l.services_included, l.service_areas,
  l.domain_control,
  l.town_fetch_note,
  l.linkedin_url, l.facebook_status, l.instagram_status, l.linkedin_status
from public.outreach_leads l
where (select public.my_role()) in ('sales', 'admin')
  and ((select public.my_role()) = 'admin' or l.assigned_to_user_id = (select auth.uid()))
  and not public.lead_is_client(l.amount_paid, l.status);
revoke all on public.sales_leads from public, anon, authenticated;
grant select on public.sales_leads to authenticated;

-- lead_log_contact — the ONE contact-method set gains Facebook and Instagram (src/lib/contactMethods.ts),
-- and one outcome, connection_sent (a LinkedIn connection request). Body otherwise the 20260928210000
-- definition: activity only — no status, no next action (Next Action stays human-set).
create or replace function public.lead_log_contact(_lead_id uuid, _channel text, _outcome text, _note text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public._require_work(_lead_id);
  if _channel is null or _channel not in ('call', 'email', 'linkedin', 'facebook', 'instagram', 'linkedin_voice', 'social', 'sms', 'in_person', 'referral', 'video', 'other') then
    return jsonb_build_object('ok', false, 'error', 'bad_channel');
  end if;
  if _outcome is null or _outcome not in ('no_answer', 'left_voicemail', 'message_sent', 'connection_sent', 'spoke_to_owner', 'interested', 'call_back',
       'meeting_booked', 'not_interested', 'wrong_number', 'agency_controls_site') then
    return jsonb_build_object('ok', false, 'error', 'bad_outcome');
  end if;
  insert into public.lead_activity (lead_id, actor_user_id, kind, body, data)
  values (_lead_id, auth.uid(), case when _channel = 'call' then 'call_outcome' else 'contact_logged' end,
          nullif(btrim(coalesce(_note, '')), ''), jsonb_build_object('outcome', _outcome, 'channel', _channel));
  return jsonb_build_object('ok', true);
end $function$;

-- LEGACY: the Facebook / Instagram links already on leads become rows (source 'legacy'). A malformed one
-- — a display-truncated "/.../" or "..." link, or a bare profile.php with no id — is kept as a REJECTED
-- row holding the original text (the audit trail, Paul 2026-09-30: "record the cleanup rather than
-- silently deleting"), and a History line says it was cleared. The trigger then blanks the column.
insert into public.lead_social_profiles (lead_id, user_id, platform, url, url_key, handle, confidence, source, state, evidence, reject_reason, rejected_at)
select l.id, l.user_id, x.platform, x.url, lower(regexp_replace(x.url, '/+$', '')), null,
       case when x.method = 'manual' then 'confirmed' else 'likely' end,
       'legacy',
       case when x.bad then 'rejected' else 'active' end,
       jsonb_build_object('legacy_method', x.method, 'original', x.url),
       case when x.bad then 'malformed_legacy' end,
       case when x.bad then now() end
from public.outreach_leads l
cross join lateral (values
  ('facebook', l.facebook_url, l.facebook_method),
  ('instagram', l.instagram_url, l.instagram_method)
) as v(platform, url0, method0)
cross join lateral (select v.platform, btrim(v.url0) as url, v.method0 as method,
  (btrim(v.url0) ~ '(\.\.\.|…)' or btrim(v.url0) ~* 'facebook\.com/profile\.php/?$') as bad) x
where coalesce(btrim(x.url), '') <> '' and length(x.url) >= 10
on conflict (lead_id, platform, url_key) do nothing;

insert into public.lead_activity (lead_id, actor_user_id, kind, data)
select p.lead_id, null, 'details_set',
       jsonb_build_object(p.platform || '_url', null, 'cleanup', 'malformed_legacy', 'original', p.url)
from public.lead_social_profiles p
where p.source = 'legacy' and p.state = 'rejected' and p.reject_reason = 'malformed_legacy'
  and not exists (select 1 from public.lead_activity a where a.lead_id = p.lead_id and a.kind = 'details_set' and a.data ->> 'cleanup' = 'malformed_legacy' and a.data ->> 'original' = p.url);
