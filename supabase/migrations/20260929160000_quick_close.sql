-- QUICK CLOSE (Sales Experience, 2026-09-29). Additive only. docs/sales-experience.md §9.
--
-- ⛔ NOT A SECOND ONBOARDING SYSTEM. Quick Close writes the SAME onboarding_responses row the customer's
-- self-service link writes (one row per lead — found or created under a lock), the canonical columns the
-- checkout already reads (domain_status / domain_owned / website_manager / authority_confirmed / …),
-- plus its own answers in `quick_close`. Payment is the EXISTING findable-checkout; nothing here prices,
-- discounts or charges. Everything is written by fn quick-close on the service role.
-- ⛔ Its STATE is derived, never stored (src/lib/quickClose.ts): not started / in progress / ready /
-- needs review / link generated / paid (the row's own paid status).

alter table public.onboarding_responses add column if not exists quick_close jsonb;

-- (onboarding_responses.source has no CHECK constraint: 'quick_close' is simply a new value beside signup / free_check.)

-- The audit trail: who answered, what changed, who generated the link, who approved a review, the result.
create table if not exists public.quick_close_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid not null references public.outreach_leads(id) on delete cascade,
  onboarding_id uuid references public.onboarding_responses(id) on delete set null,
  actor_user_id uuid,
  kind text not null check (kind in ('answers_saved', 'review_requested', 'review_approved', 'link_generated', 'link_reused', 'link_refused', 'paid')),
  data jsonb not null default '{}'::jsonb
);
create index if not exists quick_close_events_lead on public.quick_close_events (lead_id, created_at desc);
alter table public.quick_close_events enable row level security;
revoke all on public.quick_close_events from anon;
revoke insert, update, delete on public.quick_close_events from authenticated;
grant select on public.quick_close_events to authenticated;
drop policy if exists quick_close_events_select on public.quick_close_events;
create policy quick_close_events_select on public.quick_close_events for select to authenticated
  using ((select public.my_role()) = 'admin' or lead_id in (select public.my_sales_lead_ids()));

-- ONE onboarding row per lead for Quick Close: the lead's newest row that is not a free check, else a new
-- one. Under a per-lead advisory lock, so two clicks (or two tabs) can never create two rows.
create or replace function public.quick_close_row(_lead_id uuid, _business_name text)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('quick_close:' || _lead_id::text));
  select o.id into v_id from public.onboarding_responses o
    where o.lead_id = _lead_id and coalesce(o.source, '') <> 'free_check'
    order by (o.status = 'paid') desc, o.created_at desc limit 1;
  if v_id is null then
    insert into public.onboarding_responses (lead_id, business_name, status, source, incomplete)
      values (_lead_id, _business_name, 'answers_saved', 'quick_close', true)
      returning id into v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.quick_close_row(uuid, text) from public, anon, authenticated;

-- The link claim: one generation at a time per row (a double click waits for, then reuses, the first).
create or replace function public.quick_close_claim_link(_onboarding_id uuid)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  update public.onboarding_responses
    set quick_close = coalesce(quick_close, '{}'::jsonb) || jsonb_build_object('link_claimed_at', now())
    where id = _onboarding_id
      and (quick_close->>'link_claimed_at' is null or (quick_close->>'link_claimed_at')::timestamptz < now() - interval '45 seconds');
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke all on function public.quick_close_claim_link(uuid) from public, anon, authenticated;

-- Notifications gain the Quick Close kinds (a review for Paul; a link waiting for the rep).
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'whatsapp_reply', 'whatsapp_failed', 'signup_opened', 'client_paid', 'commission_earned', 'commission_reversed',
  'audit_finished', 'template_decided', 'follow_up_due', 'lead_assigned', 'feedback_update', 'feature_update',
  'quick_close_review', 'quick_close_paid'));
