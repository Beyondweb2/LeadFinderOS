-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- ATTRIBUTION REVIEW — PAUL'S RESOLUTION, WITH EVIDENCE AND AN AUDIT TRAIL (2026-10-05,
-- docs/pre-sales-certification/attribution-review-admin.md). Applied AFTER 20261010130000.
--
-- WHY: "Confirm seller" could only accept the CLAIMED seller (for a conflict: the first creator; for an ambiguous
-- manual payment: the latest salesperson). When the right person was someone else, Not credited was the only way
-- out. Now Paul chooses the seller:
--   · someone the review's FROZEN evidence names (public.sale_attribution_candidates: a creator of the sign-up the
--     client paid through, the claimed seller, anyone who made a sign-up link for this client, the salesperson who
--     owned the lead at payment) → an EVIDENCE confirmation;
--   · anyone else on the team → an explicit ADMIN OVERRIDE, refused without a written reason (≥ 10 characters).
--
-- ⛔ UNCHANGED: who the database stamps (sale_attribution_decision, trg_outreach_leads_sold_by), when a review opens,
--    the hold (sale_attribution_held / view sale_attribution_holds — open or not_credited = held), and the commission
--    engine, which reads the hold and the stamped seller exactly as before.
-- ⛔ IMMUTABLE: the original evidence, the claimed seller, the reason and the open date never change; a resolved
--    review is final; a review is never deleted directly (only with its lead). Every opening and every decision is
--    also written to an append-only history (sale_attribution_review_events).
-- ⛔ ADMIN ONLY: the resolver checks the actor holds the admin role itself (fn admin-users checks first); both new
--    functions are service-role only. A salesperson cannot resolve anything.
--
-- Additive and idempotent: three columns, one table, two guard triggers, two new functions, one replaced function
-- body (resolve_sale_attribution_review becomes a wrapper with the SAME signature and the same answers, so the
-- deployed admin-users keeps working until it is redeployed).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- ── the resolution, recorded beside (never over) the original claim ──────────────────────────────────
alter table public.sale_attribution_reviews add column if not exists resolved_seller_user_id uuid;
alter table public.sale_attribution_reviews add column if not exists resolution_basis text;
alter table public.sale_attribution_reviews add column if not exists override_reason text;
comment on column public.sale_attribution_reviews.resolved_seller_user_id is
  'CONFIRMED only: the seller Paul chose (stamped on the lead and its ledger rows). claimed_seller_user_id is the original claim and never changes.';
comment on column public.sale_attribution_reviews.resolution_basis is
  'CONFIRMED only: evidence (the chosen seller is named by the frozen evidence — sale_attribution_candidates) or admin_override (anyone else, with override_reason).';

alter table public.sale_attribution_reviews drop constraint if exists sale_attribution_reviews_basis_check;
alter table public.sale_attribution_reviews add constraint sale_attribution_reviews_basis_check
  check (resolution_basis is null or resolution_basis in ('evidence', 'admin_override'));
alter table public.sale_attribution_reviews drop constraint if exists sale_attribution_reviews_override_len;
alter table public.sale_attribution_reviews add constraint sale_attribution_reviews_override_len
  check (char_length(override_reason) <= 500);
-- Confirming needs a seller: the chosen one (from now on), or the claimed one (a confirmation made before this file).
alter table public.sale_attribution_reviews drop constraint if exists sale_attribution_reviews_confirm_needs_seller;
alter table public.sale_attribution_reviews add constraint sale_attribution_reviews_confirm_needs_seller
  check (status <> 'confirmed' or resolved_seller_user_id is not null or claimed_seller_user_id is not null);
alter table public.sale_attribution_reviews drop constraint if exists sale_attribution_reviews_resolution_shape;
alter table public.sale_attribution_reviews add constraint sale_attribution_reviews_resolution_shape check (
  (status in ('open', 'not_credited') and resolved_seller_user_id is null and resolution_basis is null and override_reason is null)
  or (status = 'confirmed' and resolution_basis is null and resolved_seller_user_id is null and override_reason is null)   -- before this file
  or (status = 'confirmed' and resolution_basis = 'evidence' and resolved_seller_user_id is not null and override_reason is null)
  or (status = 'confirmed' and resolution_basis = 'admin_override' and resolved_seller_user_id is not null and char_length(btrim(override_reason)) >= 10));

-- ── the history (append-only) ───────────────────────────────────────────────────────────────────────
create table if not exists public.sale_attribution_review_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null,                 -- no FK: the history outlives anything
  kind text not null check (kind in ('opened', 'confirmed', 'not_credited')),
  reason text,
  claimed_seller_user_id uuid,
  seller_user_id uuid,
  basis text check (basis is null or basis in ('evidence', 'admin_override')),
  note text,
  override_reason text,
  candidates jsonb,
  actor_user_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists sale_attribution_review_events_lead on public.sale_attribution_review_events (lead_id, created_at);
alter table public.sale_attribution_review_events enable row level security;
revoke all on public.sale_attribution_review_events from public, anon, authenticated;

create or replace function public.sale_attribution_review_events_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'sale_attribution_review_events is append-only';
end $$;
drop trigger if exists sale_attribution_review_events_no_change on public.sale_attribution_review_events;
create trigger sale_attribution_review_events_no_change before update or delete on public.sale_attribution_review_events
  for each row execute function public.sale_attribution_review_events_append_only();
drop trigger if exists sale_attribution_review_events_no_truncate on public.sale_attribution_review_events;
create trigger sale_attribution_review_events_no_truncate before truncate on public.sale_attribution_review_events
  for each statement execute function public.sale_attribution_review_events_append_only();

-- ── the candidates: ONLY people the frozen evidence names (never manufactured) ───────────────────────
/* From the review row as it was opened (evidence is immutable), in order of strength:
     signup_creator   — a creator of the sign-up the client paid through (signup_creators, creation.creator, and
                        for a claimed_seller_mismatch the creator the decision found: creator_evidence_seller);
     claimed_seller   — the review's claimed seller;
     link_creator     — anyone who made a sign-up link for this client (all_links);
     owner_at_payment — who owned the lead when it was paid, ONLY when that is a salesperson (never the admin or
                        the book owner — Paul's ownership is never evidence that Paul sold it).
   One row per person: {user_id, sources[], name}. */
create or replace function public.sale_attribution_candidates(_lead_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with r as (select * from public.sale_attribution_reviews where lead_id = _lead_id),
  raw as (
    select (x #>> '{}')::uuid as uid, 'signup_creator'::text as src, 1 as pri
      from r, jsonb_array_elements(case when jsonb_typeof(r.evidence -> 'signup_creators') = 'array' then r.evidence -> 'signup_creators' else '[]'::jsonb end) x
     where jsonb_typeof(x) = 'string'
    union all select nullif(r.evidence #>> '{creation,creator}', '')::uuid, 'signup_creator', 1 from r
    union all select nullif(r.evidence ->> 'creator_evidence_seller', '')::uuid, 'signup_creator', 1 from r
    union all select r.claimed_seller_user_id, 'claimed_seller', 2 from r
    union all select nullif(x ->> 'creator', '')::uuid, 'link_creator', 3
      from r, jsonb_array_elements(case when jsonb_typeof(r.evidence -> 'all_links') = 'array' then r.evidence -> 'all_links' else '[]'::jsonb end) x
    union all select o.uid, 'owner_at_payment', 4
      from (select nullif(r.evidence ->> 'owner_at_payment', '')::uuid as uid from r) o
     where exists (select 1 from public.team_members t where t.user_id = o.uid and t.is_book_owner is not true)
       and not exists (select 1 from public.user_roles u where u.user_id = o.uid and u.role = 'admin')
  ),
  agg as (select uid, min(pri) as pri, array_agg(distinct src) as srcs from raw where uid is not null group by uid)
  select coalesce(jsonb_agg(jsonb_build_object('user_id', a.uid, 'sources', to_jsonb(a.srcs), 'name', t.display_name)
                            order by a.pri, t.display_name nulls last, a.uid), '[]'::jsonb)
    from agg a left join public.team_members t on t.user_id = a.uid
$$;
revoke all on function public.sale_attribution_candidates(uuid) from public, anon, authenticated;
grant execute on function public.sale_attribution_candidates(uuid) to service_role;

-- ── the guard: evidence immutable, one final decision, never deleted directly ────────────────────────
create or replace function public.trg_sale_attribution_reviews_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    -- The lead's own deletion cascading through the foreign key runs one trigger level deeper; allowed.
    if pg_trigger_depth() > 1 then return old; end if;
    raise exception 'sale_attribution_reviews: a review is never deleted (lead %)', old.lead_id;
  end if;
  if new.lead_id is distinct from old.lead_id or new.claimed_seller_user_id is distinct from old.claimed_seller_user_id
     or new.reason is distinct from old.reason or new.evidence is distinct from old.evidence or new.created_at is distinct from old.created_at then
    raise exception 'sale_attribution_reviews: the original evidence and claim are immutable (lead %)', old.lead_id;
  end if;
  if old.status <> 'open' then
    raise exception 'sale_attribution_reviews: a resolved review is final (lead %)', old.lead_id;
  end if;
  if new.status <> 'open' and current_setting('app.attribution_review_resolve', true) is distinct from old.lead_id::text then
    raise exception 'sale_attribution_reviews: resolve only through resolve_sale_attribution_with_seller (lead %)', old.lead_id;
  end if;
  return new;
end $$;
revoke all on function public.trg_sale_attribution_reviews_guard() from public, anon, authenticated;
drop trigger if exists trg_sale_attribution_reviews_guard on public.sale_attribution_reviews;
create trigger trg_sale_attribution_reviews_guard before update or delete on public.sale_attribution_reviews
  for each row execute function public.trg_sale_attribution_reviews_guard();

create or replace function public.sale_attribution_reviews_no_truncate()
returns trigger language plpgsql as $$
begin
  raise exception 'sale_attribution_reviews cannot be truncated';
end $$;
drop trigger if exists sale_attribution_reviews_no_truncate on public.sale_attribution_reviews;
create trigger sale_attribution_reviews_no_truncate before truncate on public.sale_attribution_reviews
  for each statement execute function public.sale_attribution_reviews_no_truncate();

-- Every review that opens is in the history with the candidates as they were then.
create or replace function public.trg_sale_attribution_reviews_opened()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.sale_attribution_review_events (lead_id, kind, reason, claimed_seller_user_id, candidates, created_at)
  values (new.lead_id, 'opened', new.reason, new.claimed_seller_user_id, public.sale_attribution_candidates(new.lead_id), new.created_at);
  return new;
end $$;
revoke all on function public.trg_sale_attribution_reviews_opened() from public, anon, authenticated;
drop trigger if exists trg_sale_attribution_reviews_opened on public.sale_attribution_reviews;
create trigger trg_sale_attribution_reviews_opened after insert on public.sale_attribution_reviews
  for each row execute function public.trg_sale_attribution_reviews_opened();

-- Reviews already open when this file runs get their 'opened' line too (none live on 2026-10-05).
insert into public.sale_attribution_review_events (lead_id, kind, reason, claimed_seller_user_id, candidates, created_at)
select r.lead_id, 'opened', r.reason, r.claimed_seller_user_id, public.sale_attribution_candidates(r.lead_id), r.created_at
  from public.sale_attribution_reviews r
 where not exists (select 1 from public.sale_attribution_review_events e where e.lead_id = r.lead_id and e.kind = 'opened');

-- ── THE RESOLVER (fn admin-users, after its admin check) ─────────────────────────────────────────────
/* One final decision per review.
   CONFIRMED: _seller is required and must be on the team. Named by the evidence → basis 'evidence' (an override
     reason is not kept); anyone else → basis 'admin_override', refused without _override_reason of ≥ 10 characters.
     The seller is stamped on the lead (frozen like any stamp) and filled into this lead's ledger rows that have no
     seller — the existing commission rules then apply, exactly as for the claimed seller before.
   NOT_CREDITED: no seller, ever (a seller passed with it is refused, never silently dropped).
   Errors (ok false): not_admin, bad_decision, too_long, no_open_review, no_seller, not_a_team_member,
   override_reason_required, seller_not_allowed, seller_already_stamped. */
create or replace function public.resolve_sale_attribution_with_seller(_lead_id uuid, _decision text, _seller uuid, _note text, _override_reason text, _actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.sale_attribution_reviews%rowtype;
  v_note text := nullif(btrim(coalesce(_note, '')), '');
  v_override text := nullif(btrim(coalesce(_override_reason, '')), '');
  v_candidates jsonb;
  v_basis text;
  v_stamped uuid;
begin
  if _actor is null or not exists (select 1 from public.user_roles where user_id = _actor and role = 'admin') then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;
  if _decision is null or _decision not in ('confirmed', 'not_credited') then return jsonb_build_object('ok', false, 'error', 'bad_decision'); end if;
  if char_length(coalesce(v_note, '')) > 500 or char_length(coalesce(v_override, '')) > 500 then return jsonb_build_object('ok', false, 'error', 'too_long'); end if;
  select * into r from public.sale_attribution_reviews where lead_id = _lead_id for update;
  if not found or r.status <> 'open' then return jsonb_build_object('ok', false, 'error', 'no_open_review'); end if;
  v_candidates := public.sale_attribution_candidates(_lead_id);

  if _decision = 'confirmed' then
    if _seller is null then return jsonb_build_object('ok', false, 'error', 'no_seller'); end if;
    if not exists (select 1 from public.team_members where user_id = _seller) then return jsonb_build_object('ok', false, 'error', 'not_a_team_member'); end if;
    if exists (select 1 from jsonb_array_elements(v_candidates) c where (c ->> 'user_id')::uuid = _seller) then
      v_basis := 'evidence'; v_override := null;
    else
      if char_length(coalesce(v_override, '')) < 10 then return jsonb_build_object('ok', false, 'error', 'override_reason_required'); end if;
      v_basis := 'admin_override';
    end if;
    perform set_config('app.attribution_resolve', _lead_id::text, true);
    update public.outreach_leads set sold_by_user_id = _seller where id = _lead_id and sold_by_user_id is null;
    perform set_config('app.attribution_resolve', '', true);
    select sold_by_user_id into v_stamped from public.outreach_leads where id = _lead_id;
    if v_stamped is distinct from _seller then return jsonb_build_object('ok', false, 'error', 'seller_already_stamped'); end if;
    update public.payment_ledger set sold_by_user_id = _seller where lead_id = _lead_id and sold_by_user_id is null;
  else
    if _seller is not null then return jsonb_build_object('ok', false, 'error', 'seller_not_allowed'); end if;
    v_override := null;
  end if;

  perform set_config('app.attribution_review_resolve', _lead_id::text, true);
  update public.sale_attribution_reviews
     set status = _decision,
         resolved_seller_user_id = case when _decision = 'confirmed' then _seller end,
         resolution_basis = v_basis, override_reason = v_override, resolution_note = v_note,
         resolved_by = _actor, resolved_at = now()
   where lead_id = _lead_id;
  perform set_config('app.attribution_review_resolve', '', true);
  insert into public.sale_attribution_review_events (lead_id, kind, reason, claimed_seller_user_id, seller_user_id, basis, note, override_reason, candidates, actor_user_id)
  values (_lead_id, _decision, r.reason, r.claimed_seller_user_id, case when _decision = 'confirmed' then _seller end, v_basis, v_note, v_override, v_candidates, _actor);
  return jsonb_build_object('ok', true, 'status', _decision, 'seller', case when _decision = 'confirmed' then _seller end, 'basis', v_basis);
end $$;
revoke all on function public.resolve_sale_attribution_with_seller(uuid, text, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.resolve_sale_attribution_with_seller(uuid, text, uuid, text, text, uuid) to service_role;

/* The old entry point keeps its signature and answers (the deployed admin-users calls it until redeployed):
   Confirm = the claimed seller (always an evidence candidate), through the one resolver. */
create or replace function public.resolve_sale_attribution_review(_lead_id uuid, _decision text, _note text, _actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_claimed uuid;
begin
  if _decision = 'confirmed' then
    select claimed_seller_user_id into v_claimed from public.sale_attribution_reviews where lead_id = _lead_id and status = 'open';
    if found and v_claimed is null then return jsonb_build_object('ok', false, 'error', 'no_claimed_seller'); end if;
  end if;
  return public.resolve_sale_attribution_with_seller(_lead_id, _decision, case when _decision = 'confirmed' then v_claimed end, _note, null, _actor);
end $$;
revoke all on function public.resolve_sale_attribution_review(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.resolve_sale_attribution_review(uuid, text, text, uuid) to service_role;

-- ── read-back (run after applying) ───────────────────────────────────────────────────────────────────
-- select column_name from information_schema.columns where table_schema='public' and table_name='sale_attribution_reviews' and column_name in ('resolved_seller_user_id','resolution_basis','override_reason');
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.sale_attribution_reviews'::regclass order by 1;
-- select tgname from pg_trigger where tgrelid in ('public.sale_attribution_reviews'::regclass,'public.sale_attribution_review_events'::regclass) and not tgisinternal order by 1;
-- select proname, has_function_privilege('authenticated', oid, 'execute') from pg_proc where proname in ('sale_attribution_candidates','resolve_sale_attribution_with_seller','resolve_sale_attribution_review');
-- select count(*) from pg_policies where tablename in ('sale_attribution_reviews','sale_attribution_review_events');   -- 0
