-- Per-campaign "Web dev follow-up question" (Paul, 2026-11-25, feat/templates-from-research; src/lib/researchTemplates.ts). ADDITIVE ONLY.
-- 'initial_question' (the default: every existing campaign keeps the old "do you build websites…?") or 'webdev_which_town'
-- (the new "I built a tool… Which town do you want clients in?"). The Inbox one-lead picker offers only the chosen one for a lead
-- in a LeadFinderOS-style campaign, so the Campaign Performance table compares the two. Nothing is sent by this migration.
-- campaigns has ~40 rows: a constant default adds no table rewrite worth noting.
-- Roll back: alter table public.campaigns drop column webdev_question; drop function public.campaign_set_webdev_question(uuid, text);
-- Read back: select column_name, column_default from information_schema.columns where table_name = 'campaigns' and column_name = 'webdev_question';
--            select count(*) from pg_proc where proname = 'campaign_set_webdev_question';  -- 1

alter table public.campaigns
  add column if not exists webdev_question text not null default 'initial_question';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'campaigns_webdev_question_check') then
    alter table public.campaigns add constraint campaigns_webdev_question_check check (webdev_question in ('initial_question', 'webdev_which_town'));
  end if;
end $$;

-- Admin only (the role from user_roles via my_role(), never the request), the same as campaign_set_report_style.
create or replace function public.campaign_set_webdev_question(_campaign_id uuid, _question text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if public.my_role() is distinct from 'admin' then
    return jsonb_build_object('ok', false, 'error', 'admin_only');
  end if;
  if _question is null or _question not in ('initial_question', 'webdev_which_town') then
    return jsonb_build_object('ok', false, 'error', 'bad_question');
  end if;
  update public.campaigns set webdev_question = _question where id = _campaign_id returning name into v_name;
  if v_name is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'id', _campaign_id, 'name', v_name, 'webdev_question', _question);
end $$;

revoke all on function public.campaign_set_webdev_question(uuid, text) from public, anon;
grant execute on function public.campaign_set_webdev_question(uuid, text) to authenticated;
