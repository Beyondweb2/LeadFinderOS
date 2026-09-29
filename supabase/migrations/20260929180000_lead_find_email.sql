-- FIND EMAIL (UI cleanup pass, 2026-09-29 — Paul: "next to any email option a button that when pressed
-- will find their email, either from crawling or from anywhere else on our system already").
--
-- Two functions, both roles, own leads only (_require_work), additive — nothing existing changes.
--
-- lead_find_email(lead)   Looks in what LeadFinderOS ALREADY holds, in this order, and saves the first
--                         valid address onto the lead:
--                           1. the lead's own website crawl (lead_crawl_checks.result.siteInfo.email) —
--                              157 of 291 crawls carried one on 2026-09-29, none copied to the lead;
--                           2. the lead's own questionnaire answer (onboarding_responses.contact_email);
--                           3. the SAME business entered twice (another lead row with the same Google
--                              place id or the same phone digits) that has an email.
--                         Free: no network call. ⛔ It only FILLS a blank email — never overwrites one.
-- lead_set_email(lead, email)  Saves an address the browser found by scraping the lead's website
--                         (the existing free extract-email function). Same blank-only rule.
-- Both record a details_set activity row (email + where it came from), so History shows it.

create or replace function public.lead_find_email(_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_lead record;
  v_email text;
  v_source text;
  v_digits text;
begin
  perform public._require_work(_lead_id);
  select id, email, place_id, phone into v_lead from public.outreach_leads where id = _lead_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if coalesce(btrim(v_lead.email), '') <> '' then
    return jsonb_build_object('ok', true, 'email', v_lead.email, 'source', 'already', 'saved', false);
  end if;

  -- 1. this lead's own website crawl, newest first
  select lower(btrim(c.result -> 'siteInfo' ->> 'email')) into v_email
    from public.lead_crawl_checks c
   where c.lead_id = _lead_id
     and lower(btrim(c.result -> 'siteInfo' ->> 'email')) ~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'
   order by c.created_at desc
   limit 1;
  if v_email is not null then v_source := 'website_crawl'; end if;

  -- 2. this lead's own questionnaire
  if v_email is null then
    select lower(btrim(o.contact_email)) into v_email
      from public.onboarding_responses o
     where o.lead_id = _lead_id
       and lower(btrim(o.contact_email)) ~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'
     order by o.created_at desc
     limit 1;
    if v_email is not null then v_source := 'onboarding'; end if;
  end if;

  -- 3. the same business on another lead row (same place id, or the same phone digits)
  if v_email is null then
    v_digits := nullif(regexp_replace(coalesce(v_lead.phone, ''), '\D', '', 'g'), '');
    select lower(btrim(l.email)) into v_email
      from public.outreach_leads l
     where l.id <> _lead_id
       and lower(btrim(l.email)) ~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'
       and ((v_lead.place_id is not null and l.place_id = v_lead.place_id)
            or (v_digits is not null and length(v_digits) >= 9 and regexp_replace(coalesce(l.phone, ''), '\D', '', 'g') = v_digits))
     order by l.updated_at desc nulls last
     limit 1;
    if v_email is not null then v_source := 'same_business'; end if;
  end if;

  if v_email is null then
    return jsonb_build_object('ok', true, 'email', null);
  end if;

  update public.outreach_leads
     set email = v_email, email_method = v_source, email_status = 'found', email_last_checked_at = now()
   where id = _lead_id and coalesce(btrim(email), '') = '';
  insert into public.lead_activity (lead_id, actor_user_id, kind, data)
  values (_lead_id, auth.uid(), 'details_set', jsonb_build_object('email', v_email, 'email_source', v_source));
  return jsonb_build_object('ok', true, 'email', v_email, 'source', v_source, 'saved', true);
end $$;

create or replace function public.lead_set_email(_lead_id uuid, _email text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_email text := lower(btrim(coalesce(_email, '')));
begin
  perform public._require_work(_lead_id);
  if v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' or length(v_email) > 254 then
    return jsonb_build_object('ok', false, 'error', 'bad_email');
  end if;
  update public.outreach_leads
     set email = v_email, email_method = 'website_scrape', email_status = 'found', email_last_checked_at = now()
   where id = _lead_id and coalesce(btrim(email), '') = '';
  if not found then return jsonb_build_object('ok', true, 'saved', false, 'reason', 'already_has_email'); end if;
  insert into public.lead_activity (lead_id, actor_user_id, kind, data)
  values (_lead_id, auth.uid(), 'details_set', jsonb_build_object('email', v_email, 'email_source', 'website_scrape'));
  return jsonb_build_object('ok', true, 'saved', true, 'email', v_email);
end $$;

revoke all on function public.lead_find_email(uuid) from public, anon;
grant execute on function public.lead_find_email(uuid) to authenticated;
revoke all on function public.lead_set_email(uuid, text) from public, anon;
grant execute on function public.lead_set_email(uuid, text) to authenticated;
