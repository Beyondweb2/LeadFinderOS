-- UGC Brand Finder (2026-10-29, feat/ugc-brand-finder, docs/ugc-brand-finder.md).
-- A separate workspace for Jess (UGC creator) to find brands, get their contacts and pitch them by hand.
--
-- ⛔ SEPARATE FROM FINDABLE. Own tables, own run log, own spend. Nothing here reads or writes outreach_leads,
--    campaigns, queues, audits, api_usage_log or any WhatsApp/SMS table.
-- ⛔ A UGC LOGIN HAS NO FINDABLE ROLE. Access is a row in ugc_members, never a user_roles row, so my_role()
--    stays NULL for Jess and every Findable policy and edge function keeps refusing her exactly as before.
-- ⛔ RLS IS THE BARRIER. Every ugc_* table is RLS-on; a row is reachable only by its owner while they are a
--    UGC member, or by the Findable admin. ugc_members and ugc_runs have no browser write path at all.
-- Additive and idempotent. Applied ONCE, by hand, after Paul approves (never `supabase db push`).

-- ── Who may use the UGC page ─────────────────────────────────────────────────────────────────────
create table if not exists public.ugc_members (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  -- The address Gmail compose opens from (authuser=). Display only; nothing sends from the server.
  sender_email text,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
alter table public.ugc_members enable row level security;

create or replace function public.is_ugc_member()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.ugc_members where user_id = auth.uid())
$$;

-- May the caller reach a UGC row owned by _owner? Its owner while a member, or the Findable admin.
create or replace function public.ugc_can_access(_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    (_owner = auth.uid() and exists (select 1 from public.ugc_members where user_id = auth.uid()))
    or public.my_role() = 'admin'
  )
$$;

-- What the SPA asks once: may I open /ugc, and am I the admin looking in?
create or replace function public.ugc_my_access()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'member', public.is_ugc_member(),
    'admin',  coalesce(public.my_role() = 'admin', false),
    'display_name', (select display_name from public.ugc_members where user_id = auth.uid()),
    'sender_email', (select sender_email from public.ugc_members where user_id = auth.uid())
  )
$$;

drop policy if exists ugc_members_self_read on public.ugc_members;
create policy ugc_members_self_read on public.ugc_members for select to authenticated
  using (user_id = (select auth.uid()) or (select public.my_role()) = 'admin');
-- No insert/update/delete policy: membership is written by the service role only (fn ugc-brands, admin action).

-- ── Per-member settings ──────────────────────────────────────────────────────────────────────────
create table if not exists public.ugc_settings (
  owner_user_id       uuid primary key references auth.users(id) on delete cascade,
  -- UGC's OWN monthly Apify budget, in USD, separate from Findable's spend caps.
  monthly_budget_usd  numeric(8,2) not null default 30 check (monthly_budget_usd >= 0 and monthly_budget_usd <= 200),
  -- The swappable pitch step: null = the built-in writer. A webhook is a SLOT for Jess's own system;
  -- it is only called once Paul has switched it on (webhook_enabled) — never set from code.
  pitch_webhook_url   text,
  pitch_webhook_enabled boolean not null default false,
  -- WhatsApp API sending (LATER, not built yet): OFF until a Jess-owned WhatsApp number is connected. Never the
  -- Findable number. Only the admin switches it (ugc_settings_guard). The daily cap is held to 25–100.
  whatsapp_api_enabled  boolean not null default false,
  whatsapp_daily_cap    integer not null default 25 check (whatsapp_daily_cap between 25 and 100),
  updated_at          timestamptz not null default now()
);
alter table public.ugc_settings enable row level security;
drop policy if exists ugc_settings_rw on public.ugc_settings;
create policy ugc_settings_rw on public.ugc_settings for select to authenticated
  using ((select public.ugc_can_access(owner_user_id)));
drop policy if exists ugc_settings_update on public.ugc_settings;
create policy ugc_settings_update on public.ugc_settings for update to authenticated
  using ((select public.ugc_can_access(owner_user_id)))
  with check ((select public.ugc_can_access(owner_user_id)));

-- ── Brands ───────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.ugc_brands (
  id                uuid primary key default gen_random_uuid(),
  owner_user_id     uuid not null references auth.users(id) on delete cascade,
  -- One brand per owner: the website's bare domain, else the Facebook page id, else the normalised name.
  brand_key         text not null,
  name              text not null,
  website           text,
  domain            text,
  facebook_url      text,
  facebook_page_id  text,
  instagram_url     text,
  emails            text[] not null default '{}',
  -- WhatsApp is a main channel: every number we found and WHERE ({number: digits, source}); source is one of
  -- website_button | maps_reception | named_person. Mobile vs landline is DERIVED on read (src/lib/lineType.ts), never stored.
  wa_numbers        jsonb not null default '[]'::jsonb,
  phones            text[] not null default '{}',
  -- Named marketing / partnerships people from the contact scraper's leads enrichment:
  -- [{name, title, email, email_status, linkedin, phone}] — email_status is the verifier's own result (ok / catch_all / …).
  named_contacts    jsonb not null default '[]'::jsonb,
  enriched_at       timestamptz,
  -- The brand's creator / contact form, the last route in Jess's contact order.
  contact_form_url  text,
  linktree_url      text,
  niche             text,
  country           text,
  -- Where it was found (fb_ads | creator_collabs | places | google_search | manual) — every source that found it.
  sources           text[] not null default '{}',
  live_ads_count    integer not null default 0,
  ad_samples        jsonb not null default '[]'::jsonb,
  creators_seen     text[] not null default '{}',
  -- Facts the exclusion rules read (src/lib/ugc/brandRules.ts). Facts, not verdicts: the verdict is derived on read.
  page_created_at   date,
  admin_countries   text[] not null default '{}',
  shop_links        text[] not null default '{}',
  has_about_page    boolean,
  has_address       boolean,
  research          jsonb not null default '{}'::jsonb,
  -- Start dates of the brand's ACTIVE video ads (Ads Library) — Tier B reads these (src/lib/ugc/tiers.ts).
  ad_start_dates    date[] not null default '{}',
  -- 'brand' = paid brand pitches; 'local' = the Chiang Mai local collab track (Maps), kept separate.
  track             text not null default 'brand' check (track in ('brand','local')),
  -- A tier Jess set by hand (A–D) when her rules need her judgement; the computed tier is derived on read.
  tier_override     text check (tier_override is null or tier_override in ('A','B','C','D')),
  -- Her tier-adjustment FACTS (src/lib/ugc/tiers.ts adjusts on read; null = not known, nothing adjusted):
  -- a Thai company is always Tier D; ships to one country only and not Thailand, or UK-and-Ireland only = one tier
  -- lower; a creator programme limited to residents of one country = skipped (hidden, never deleted).
  company_country   text,
  ships_to          text check (ships_to is null or ships_to in ('worldwide','one_country','uk_ie')),
  ships_thailand    boolean,
  creator_programme_country text,
  -- CRM
  status            text not null default 'new'
                    check (status in ('new','researching','pitch_ready','needs_jess','contacted','replied','negotiating','won','not_interested','not_a_fit')),
  -- ONE ACTIVE CHANNEL PER BRAND (Jess): never email and DM the same brand at once. Set by ugc_log_contact,
  -- released only by ugc_release_channel; a trigger refuses any other change.
  active_channel    text check (active_channel is null or active_channel in ('email','instagram','whatsapp')),
  first_contacted_at timestamptz,
  -- Her two MANUAL checks (the app cannot do them): no email to this domain in her sent mail in the last 180 days,
  -- and the LinkedIn named-person search. Ticked by Jess; a brand-track first contact is refused until both are set.
  checked_sent_mail_at timestamptz,
  checked_linkedin_at  timestamptz,
  -- Follow-ups sent so far (0, 1, 2); the due dates (+5 / +12 business days) are derived from first_contacted_at.
  follow_ups_sent   integer not null default 0 check (follow_ups_sent between 0 and 2),
  -- The pitch pipeline's working (research fields, concept, gate, hook test, review) for Jess to read.
  pitch_working     jsonb not null default '{}'::jsonb,
  pitch_attempts    integer not null default 0,
  notes             text,
  todo       text,
  todo_on    date,
  pitch_subject     text,
  pitch_body        text,
  pitch_writer      text,
  pitch_written_at  timestamptz,
  last_contacted_at timestamptz,
  last_contacted_via text check (last_contacted_via is null or last_contacted_via in ('email','instagram','whatsapp')),
  contacts_checked_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (owner_user_id, brand_key)
);
create index if not exists ugc_brands_owner_status on public.ugc_brands (owner_user_id, status);
alter table public.ugc_brands enable row level security;
drop policy if exists ugc_brands_select on public.ugc_brands;
create policy ugc_brands_select on public.ugc_brands for select to authenticated
  using ((select public.ugc_can_access(owner_user_id)));
drop policy if exists ugc_brands_insert on public.ugc_brands;
create policy ugc_brands_insert on public.ugc_brands for insert to authenticated
  with check ((select public.ugc_can_access(owner_user_id)));
drop policy if exists ugc_brands_update on public.ugc_brands;
create policy ugc_brands_update on public.ugc_brands for update to authenticated
  using ((select public.ugc_can_access(owner_user_id)))
  with check ((select public.ugc_can_access(owner_user_id)));
-- No delete policy: a brand is hidden or marked Not a fit, never deleted from the browser.

-- ── History (one row per thing that happened to a brand) ─────────────────────────────────────────
create table if not exists public.ugc_brand_events (
  id            bigint generated always as identity primary key,
  brand_id      uuid not null references public.ugc_brands(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('found','contacts','status','note','todo','pitch','contacted','check')),
  detail        jsonb not null default '{}'::jsonb,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);
create index if not exists ugc_brand_events_brand on public.ugc_brand_events (brand_id, created_at desc);
alter table public.ugc_brand_events enable row level security;
drop policy if exists ugc_brand_events_select on public.ugc_brand_events;
create policy ugc_brand_events_select on public.ugc_brand_events for select to authenticated
  using ((select public.ugc_can_access(owner_user_id)));
drop policy if exists ugc_brand_events_insert on public.ugc_brand_events;
create policy ugc_brand_events_insert on public.ugc_brand_events for insert to authenticated
  with check ((select public.ugc_can_access(owner_user_id)) and created_by = (select auth.uid())
              and exists (select 1 from public.ugc_brands b where b.id = brand_id and b.owner_user_id = ugc_brand_events.owner_user_id));

-- ── Apify runs (UGC's own spend log; written by fn ugc-brands with the service role only) ────────
create table if not exists public.ugc_runs (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null references auth.users(id) on delete cascade,
  source          text not null check (source in ('fb_ads','creator_collabs','places','google_search','contacts','named_contacts')),
  input           jsonb not null default '{}'::jsonb,
  item_cap        integer not null check (item_cap > 0 and item_cap <= 500),
  est_cost_usd    numeric(8,4) not null,
  actual_cost_usd numeric(8,4),
  status          text not null default 'running' check (status in ('running','succeeded','failed','aborted')),
  apify_run_id    text,
  items_found     integer,
  brands_added    integer,
  brands_updated  integer,
  error           text,
  created_at      timestamptz not null default now(),
  finished_at     timestamptz
);
create index if not exists ugc_runs_owner_created on public.ugc_runs (owner_user_id, created_at desc);
alter table public.ugc_runs enable row level security;
drop policy if exists ugc_runs_select on public.ugc_runs;
create policy ugc_runs_select on public.ugc_runs for select to authenticated
  using ((select public.ugc_can_access(owner_user_id)));
-- No browser write policy: runs and their costs are written by the edge function only.

-- updated_at
create or replace function public.ugc_touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists ugc_brands_touch on public.ugc_brands;
create trigger ugc_brands_touch before update on public.ugc_brands for each row execute function public.ugc_touch_updated_at();
drop trigger if exists ugc_settings_touch on public.ugc_settings;
create trigger ugc_settings_touch before update on public.ugc_settings for each row execute function public.ugc_touch_updated_at();

-- A member may not hand a brand to someone else, nor point the webhook slot at a URL and switch it on themselves:
-- the switch is the admin's (service role / admin only).
create or replace function public.ugc_settings_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  -- A signed-in browser caller (auth.uid() set) who is not the admin. The service role has no auth.uid().
  if auth.uid() is not null and coalesce(public.my_role(), '') <> 'admin' then
    if new.pitch_webhook_enabled is distinct from old.pitch_webhook_enabled
       or new.pitch_webhook_url is distinct from old.pitch_webhook_url
       or new.whatsapp_api_enabled is distinct from old.whatsapp_api_enabled
       or new.whatsapp_daily_cap is distinct from old.whatsapp_daily_cap
       or new.monthly_budget_usd is distinct from old.monthly_budget_usd then
      raise exception 'ugc_webhook_admin_only';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists ugc_settings_guard on public.ugc_settings;
create trigger ugc_settings_guard before update on public.ugc_settings for each row execute function public.ugc_settings_guard();

create or replace function public.ugc_brands_owner_fixed()
returns trigger language plpgsql as $$
begin
  if new.owner_user_id is distinct from old.owner_user_id then raise exception 'ugc_owner_fixed'; end if;
  return new;
end $$;
drop trigger if exists ugc_brands_owner_fixed on public.ugc_brands;
create trigger ugc_brands_owner_fixed before update on public.ugc_brands for each row execute function public.ugc_brands_owner_fixed();

-- ── Jess's pitch system: PRIVATE, Jess-only ──────────────────────────────────────────────────────
-- Her prompt, rules, templates, "About Jess", rates and blocked list. Personal data: never in git (docs/ugc/
-- jess-pitch-system/ is gitignored); it lives here. Readable and editable by its OWNER only, while a member —
-- not by the Findable admin. fn ugc-brands reads it with the service role only to write the owner's own pitches.
create table if not exists public.ugc_pitch_system (
  owner_user_id  uuid primary key references auth.users(id) on delete cascade,
  -- Her whole pitch system as written (markdown). The writer is given this text.
  content        text not null default '',
  -- The ONLY source for personal claims in a pitch.
  about_jess     text not null default '',
  -- Stored for her reference; NEVER sent to the writer and never put in a pitch (pitchProblems refuses a rate).
  rates          text not null default '',
  -- Her templates, verbatim, by key: email, ig_dm, agency, follow_up_1, follow_up_2, generic_inbox, cm_collab_dm_v4.
  templates      jsonb not null default '{}'::jsonb,
  -- Brands she never pitches (names or domains), on top of the hard no's in code.
  blocked_list   text[] not null default '{}',
  -- Her formatted email sign-off (HTML with live links), kept by "Copy email".
  signoff_html   text not null default '',
  -- WhatsApp: her system has no template; this draft waits for her approval before it is offered as a default.
  whatsapp_template text not null default '',
  whatsapp_template_approved boolean not null default false,
  updated_at     timestamptz not null default now()
);
alter table public.ugc_pitch_system enable row level security;
drop policy if exists ugc_pitch_system_owner on public.ugc_pitch_system;
create policy ugc_pitch_system_owner on public.ugc_pitch_system for all to authenticated
  using (owner_user_id = (select auth.uid()) and (select public.is_ugc_member()))
  with check (owner_user_id = (select auth.uid()) and (select public.is_ugc_member()));
drop trigger if exists ugc_pitch_system_touch on public.ugc_pitch_system;
create trigger ugc_pitch_system_touch before update on public.ugc_pitch_system for each row execute function public.ugc_touch_updated_at();

-- ── Jess's pitch log (imported from her sheet) — for dedupe; private like the system ─────────────
create table if not exists public.ugc_pitch_log (
  id             bigint generated always as identity primary key,
  owner_user_id  uuid not null references auth.users(id) on delete cascade,
  brand_name     text not null,
  -- The same key ugc_brands uses (d:domain / ig:handle / n:name), so a logged brand is matched exactly.
  brand_key      text not null,
  domain         text,
  instagram      text,
  pitched_on     date,
  channel        text,
  outcome        text,
  -- From her Creator Watchlist: the brand may be pitched again from this date (null = never auto-cleared).
  repitch_ok_from date,
  -- Which tab of her sheet the row came from, or 'manual'.
  source         text not null default 'manual',
  imported_at    timestamptz not null default now(),
  unique (owner_user_id, brand_key, pitched_on)
);
create index if not exists ugc_pitch_log_owner_key on public.ugc_pitch_log (owner_user_id, brand_key);
alter table public.ugc_pitch_log enable row level security;
drop policy if exists ugc_pitch_log_owner on public.ugc_pitch_log;
create policy ugc_pitch_log_owner on public.ugc_pitch_log for all to authenticated
  using (owner_user_id = (select auth.uid()) and (select public.is_ugc_member()))
  with check (owner_user_id = (select auth.uid()) and (select public.is_ugc_member()));

-- ── One active channel per brand, enforced ───────────────────────────────────────────────────────
-- The channel may go null → X (first contact) or X → null (released, with a reason). Never X → Y directly.
create or replace function public.ugc_brands_channel_guard()
returns trigger language plpgsql as $$
begin
  if old.active_channel is not null and new.active_channel is not null
     and new.active_channel is distinct from old.active_channel then
    raise exception 'ugc_other_channel_active';
  end if;
  return new;
end $$;
drop trigger if exists ugc_brands_channel_guard on public.ugc_brands;
create trigger ugc_brands_channel_guard before update on public.ugc_brands for each row execute function public.ugc_brands_channel_guard();

-- Log a contact Jess made by hand (Gmail / Instagram / WhatsApp opened on her own account or phone). ONE call,
-- one conditional write: refuses when another channel is already active for this brand.
create or replace function public.ugc_log_contact(_brand uuid, _via text, _kind text default 'pitch')
returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.ugc_brands;
begin
  if _via not in ('email','instagram','whatsapp') or _kind not in ('pitch','follow_up_1','follow_up_2','ask_who') then
    return jsonb_build_object('ok', false, 'error', 'bad_input');
  end if;
  select * into b from public.ugc_brands where id = _brand for update;
  if not found or not public.ugc_can_access(b.owner_user_id) then
    return jsonb_build_object('ok', false, 'error', 'brand_not_found');
  end if;
  if b.active_channel is not null and b.active_channel <> _via then
    return jsonb_build_object('ok', false, 'error', 'other_channel_active', 'active_channel', b.active_channel);
  end if;
  -- A paid brand's FIRST contact needs both of Jess's manual checks ticked (sent mail 180 days, LinkedIn search).
  if b.track = 'brand' and b.first_contacted_at is null
     and (b.checked_sent_mail_at is null or b.checked_linkedin_at is null) then
    return jsonb_build_object('ok', false, 'error', 'jess_checks_missing');
  end if;
  update public.ugc_brands set
    active_channel = _via,
    first_contacted_at = coalesce(first_contacted_at, now()),
    last_contacted_at = now(),
    last_contacted_via = _via,
    follow_ups_sent = case when _kind = 'follow_up_1' then greatest(follow_ups_sent, 1)
                           when _kind = 'follow_up_2' then 2 else follow_ups_sent end,
    status = case when status in ('new','researching','pitch_ready','needs_jess') then 'contacted' else status end
  where id = _brand;
  insert into public.ugc_brand_events (brand_id, owner_user_id, kind, detail, created_by)
  values (_brand, b.owner_user_id, 'contacted', jsonb_build_object('via', _via, 'what', _kind), auth.uid());
  return jsonb_build_object('ok', true);
end $$;

-- Free the brand's channel (e.g. no answer by email, so Jess may try Instagram). Always with a reason, logged.
create or replace function public.ugc_release_channel(_brand uuid, _reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.ugc_brands;
begin
  select * into b from public.ugc_brands where id = _brand for update;
  if not found or not public.ugc_can_access(b.owner_user_id) then
    return jsonb_build_object('ok', false, 'error', 'brand_not_found');
  end if;
  if coalesce(trim(_reason), '') = '' then return jsonb_build_object('ok', false, 'error', 'reason_needed'); end if;
  update public.ugc_brands set active_channel = null where id = _brand;
  insert into public.ugc_brand_events (brand_id, owner_user_id, kind, detail, created_by)
  values (_brand, b.owner_user_id, 'status', jsonb_build_object('channel_released', b.active_channel, 'reason', left(_reason, 300)), auth.uid());
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.ugc_log_contact(uuid, text, text) from public, anon;
revoke all on function public.ugc_release_channel(uuid, text) from public, anon;
grant execute on function public.ugc_log_contact(uuid, text, text) to authenticated;
grant execute on function public.ugc_release_channel(uuid, text) to authenticated;
grant execute on function public.ugc_my_access() to authenticated;
