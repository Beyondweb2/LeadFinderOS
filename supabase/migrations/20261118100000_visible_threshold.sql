-- THE VISIBLE THRESHOLD (Paul, 2026-10-21; record docs/lead-status-and-visible.md). Per engine (Gemini, Google AI separately), a
-- lead is Visible only when that engine named the business in MORE THAN HALF of its own answers (1/1, 2/2 yes; 1/2 no). The share
-- is a setting: 'half' (default) / 'two_thirds' / 'all' — rules in src/lib/visibleFlag.ts (engineNamesThem). The tick re-judges
-- every lead when either setting changes (ai_visible_checked_rule holds 'rule:share').
-- Additive: one column on the one-row state table, two small functions. To undo: drop the two functions; the column is harmless.

alter table public.whatsapp_outreach_state add column if not exists visible_min_share text not null default 'half';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'whatsapp_outreach_state_visible_min_share_chk') then
    alter table public.whatsapp_outreach_state add constraint whatsapp_outreach_state_visible_min_share_chk
      check (visible_min_share in ('half', 'two_thirds', 'all'));
  end if;
end $$;

create or replace function public.set_inbox_visible_threshold(p_share text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'not_authorised' using errcode = '42501'; end if;
  if p_share not in ('half', 'two_thirds', 'all') then raise exception 'bad_share' using errcode = '22023'; end if;
  update public.whatsapp_outreach_state set visible_min_share = p_share where id = 1;
  return p_share;
end
$$;

create or replace function public.inbox_visible_settings()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'rule', coalesce((select visible_rule from public.whatsapp_outreach_state where id = 1), 'either'),
    'min_share', coalesce((select visible_min_share from public.whatsapp_outreach_state where id = 1), 'half'));
$$;

revoke all on function public.set_inbox_visible_threshold(text) from public, anon;
grant execute on function public.set_inbox_visible_threshold(text) to authenticated;
revoke all on function public.inbox_visible_settings() from public, anon;
grant execute on function public.inbox_visible_settings() to authenticated;
