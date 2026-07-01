-- ============================================================================
-- Backfill: schema-drift capture (make the repo a true source of truth)
--
-- Every object below was created by running SQL MANUALLY in the Supabase editor
-- and had NO migration file. This file exists ONLY to make the repo match the
-- live database. It is NOT intended for `supabase db push` — this project's
-- migration history is desynced, so pushing is broken. It is fully idempotent
-- (if not exists / create or replace / drop-if-exists), so it is safe on a fresh
-- rebuild and a no-op against the current live DB.
--
-- Objects captured (and roughly when they were applied manually):
--   * outreach_leads.previous_status (text)                       ~2026-07-01
--       NOTE: it was first created live as the lead_status ENUM; converted to
--       text manually via:
--         alter table public.outreach_leads
--           alter column previous_status type text using previous_status::text;
--       (run separately, since it changes live). This file declares it as text.
--   * outreach_leads.instantly_pushed_at / instantly_campaign_id  ~2026-06-29
--   * instantly_poll_state (+ RLS on, no policies)                ~2026-06-29
--   * is_operator(uuid)                                           ~2026-06-30
--   * team_feedback (+ RLS, 3 policies, index)                    ~2026-06-30
--   * mirror_whatsapp_send_to_inbox() + trg_mirror_whatsapp_send  ~2026-07-01
--   * generated_sites.template (text) + anon SELECT grant         ~2026-06-13
--   * generated_sites "Lead owner can read/update ..." policies   ~2026-06-12
--
-- Function / trigger / policy definitions are VERBATIM from the live catalog
-- (pg_get_functiondef / pg_get_triggerdef / pg_policies) on 2026-07-01.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- outreach_leads: previous_status (restore-on-cancel) + Instantly columns
-- ---------------------------------------------------------------------------
alter table public.outreach_leads
  add column if not exists previous_status      text,        -- pre-queue status, to restore on cancel
  add column if not exists instantly_pushed_at  timestamptz, -- set by instantly-push (dedup + poll active set)
  add column if not exists instantly_campaign_id text;       -- Instantly campaign the lead was pushed to


-- ---------------------------------------------------------------------------
-- instantly_poll_state: single-row poll cursor (poll-instantly-replies).
-- Live: RLS enabled, NO policies -> service-role only.
-- ---------------------------------------------------------------------------
create table if not exists public.instantly_poll_state (
  id             integer     not null default 1,
  last_polled_at timestamptz not null default now(),
  constraint instantly_poll_state_pkey     primary key (id),
  constraint instantly_poll_state_id_check check (id = 1)
);
alter table public.instantly_poll_state enable row level security;


-- ---------------------------------------------------------------------------
-- is_operator(uuid): authenticated AND not a barber (owns no generated_site).
-- Verbatim from pg_get_functiondef.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_operator(uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select uid is not null
     and not exists (select 1 from public.generated_sites gs where gs.owner_id = uid);
$function$;
revoke execute on function public.is_operator(uuid) from anon, public;
grant  execute on function public.is_operator(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- team_feedback: internal team suggestion board (operators post/read; admin del).
-- ---------------------------------------------------------------------------
create table if not exists public.team_feedback (
  id           uuid        not null default gen_random_uuid(),
  user_id      uuid        not null,
  author_name  text,
  author_email text,
  message      text        not null,
  created_at   timestamptz not null default now(),
  constraint team_feedback_pkey          primary key (id),
  constraint team_feedback_user_id_fkey  foreign key (user_id) references auth.users(id) on delete cascade,
  constraint team_feedback_message_check check ((char_length(message) >= 1) and (char_length(message) <= 4000))
);
alter table public.team_feedback enable row level security;

drop policy if exists "Operators insert own feedback" on public.team_feedback;
create policy "Operators insert own feedback" on public.team_feedback
  for insert to authenticated
  with check ((user_id = auth.uid()) AND is_operator(auth.uid()));

drop policy if exists "Operators read all feedback" on public.team_feedback;
create policy "Operators read all feedback" on public.team_feedback
  for select to authenticated
  using (is_operator(auth.uid()));

drop policy if exists "Admin deletes feedback" on public.team_feedback;
create policy "Admin deletes feedback" on public.team_feedback
  for delete to authenticated
  using (has_role(auth.uid(), 'admin'::app_role));

create index if not exists idx_team_feedback_created on public.team_feedback (created_at desc);


-- ---------------------------------------------------------------------------
-- mirror_whatsapp_send_to_inbox(): mirror each queue send (whatsapp_sends) into
-- the Inbox (whatsapp_messages). Exception-safe so it can never roll back the
-- audit insert. Verbatim from pg_get_functiondef (uses the live no_website_barbers
-- template name).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mirror_whatsapp_send_to_inbox()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner uuid; v_body text;
begin
  begin
    select ol.user_id into v_owner from public.outreach_leads ol where ol.id = NEW.lead_id;
    v_body := case NEW.template
      when 'booking_page_intro' then
        'Hi, I came across ' || coalesce(NEW.business_name,'your business') ||
        ' and built you an online booking page so customers can book appointments directly' || E'\n\n' ||
        'Here it is: ' || coalesce(NEW.claim_url,'') || E'\n\n' ||
        'You can edit it yourself - services, prices, hours' || E'\n\n' ||
        'Have a look and let me know what you think'
      when 'no_website_barbers' then
        'Hi, I noticed ' || coalesce(NEW.business_name,'your business') ||
        ' doesn''t have a website, so I built you one - it''s live and free. You can edit it yourself: photos, text, services, colours.' || E'\n\n' ||
        'Here it is: ' || coalesce(NEW.claim_url,'') || E'\n\n' ||
        'It''s yours to keep, free - let me know what you think.'
      else '[' || coalesce(NEW.template,'template') || ']'
    end;
    insert into public.whatsapp_messages
      (direction, user_id, lead_id, phone, body, message_type, template_name, wa_message_id, status, test_mode)
    values ('outbound', v_owner, NEW.lead_id, NEW.phone, v_body, 'template', NEW.template,
            NEW.message_id, coalesce(NEW.delivery_status,'sent'), coalesce(NEW.test_mode,true));
  exception when others then null;  -- never break the send's audit insert
  end;
  return NEW;
end $function$;

drop trigger if exists trg_mirror_whatsapp_send on public.whatsapp_sends;
CREATE TRIGGER trg_mirror_whatsapp_send AFTER INSERT ON public.whatsapp_sends FOR EACH ROW EXECUTE FUNCTION mirror_whatsapp_send_to_inbox();


-- ---------------------------------------------------------------------------
-- generated_sites.template (barber | salon | plumber) + anon read grant so the
-- public site can pick the template. RLS still gates row access.
-- ---------------------------------------------------------------------------
alter table public.generated_sites
  add column if not exists template text;
grant select (template) on public.generated_sites to anon;


-- ---------------------------------------------------------------------------
-- generated_sites: "Lead owner" additive RLS (rep-generated sites) — a rep can
-- read/update a site whose LEAD they own. Verbatim USING/WITH CHECK from pg_policies.
-- ---------------------------------------------------------------------------
drop policy if exists "Lead owner can read their generated sites" on public.generated_sites;
create policy "Lead owner can read their generated sites" on public.generated_sites
  for select to authenticated
  using (EXISTS ( SELECT 1
     FROM outreach_leads l
    WHERE ((l.id = generated_sites.lead_id) AND (l.user_id = auth.uid()))));

drop policy if exists "Lead owner can update their generated sites" on public.generated_sites;
create policy "Lead owner can update their generated sites" on public.generated_sites
  for update to authenticated
  using (EXISTS ( SELECT 1
     FROM outreach_leads l
    WHERE ((l.id = generated_sites.lead_id) AND (l.user_id = auth.uid()))))
  with check (EXISTS ( SELECT 1
     FROM outreach_leads l
    WHERE ((l.id = generated_sites.lead_id) AND (l.user_id = auth.uid()))));
