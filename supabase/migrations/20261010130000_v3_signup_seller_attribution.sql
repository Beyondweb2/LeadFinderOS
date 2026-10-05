-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- v3 SIGN-UP → SELLER (integration of F + H, 2026-10-05; docs/pre-sales-certification/
-- v3-commercial-sales-production-release.md). Applied AFTER 20261010120000_salesperson_onboarding_compliance.sql.
--
-- WHY: H keyed the seller on the Stripe Checkout Session a Quick Close link created. Under v3 (F) Quick Close
-- no longer creates a session at all — it creates the client's SIGN-UP (the onboarding_responses row, with
-- its agreement link). The session only appears AFTER the client signs, created by findable-checkout. So
-- H's session lookup would never match a v3 sale and every salesperson's sale would fall into review.
--
-- THE FINAL CHAIN (Paul's rule: the seller is the authorised salesperson who CREATED the sign-up while
-- Ready to Sell — never the owner at payment, never whoever made the Stripe session, never Paul as a
-- fallback for a questionable sale):
--   Quick Close generate_link (refused unless Ready to Sell) → quick_close_events 'link_generated'
--   (actor, onboarding_id = THE SIGN-UP; server-written, immutable) → sale_creations snapshot (creator,
--   role, Ready to Sell at that moment; append-only — H, unchanged) → client signs v3 → findable-checkout
--   creates the session carrying onboarding_id + agreement_acceptance_id (+ the creator, for tracing) →
--   client pays → stripe-webhook writes paid_signup_id = that onboarding_id IN THE SAME UPDATE that marks
--   the lead paid → trg_outreach_leads_sold_by → sale_attribution_decision (THIS FILE) → sold_by_user_id,
--   once, frozen.
--
-- THE DECISION:
--   paid sign-up known (v3)   → the creators of THAT sign-up: exactly one, authorised (admin, or Ready to
--                               Sell at a creation of that sign-up) → seller. Two or more different
--                               creators → REVIEW (conflicting_creators). One, never authorised → REVIEW.
--   paid session only (legacy)→ H's rule, unchanged: the creation that recorded that session.
--   no session (manual paid)  → exactly ONE sign-up with creation evidence on the lead → as above.
--                               More than one → REVIEW (ambiguous_manual_payment). Never "the most recent".
--   no creator at all         → Paul's own sale ONLY when Paul (or nobody) owns the lead AND no salesperson
--                               ever created a sign-up for it; otherwise REVIEW (no_authorised_creator).
--
-- Additive and idempotent: one column, one index, one widened CHECK, three replaced function bodies
-- (sale_attribution_decision, trg_outreach_leads_sold_by — both first created by H's file, not yet live
-- anywhere else), and H's two triggers re-created with the new column in their column list.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

alter table public.outreach_leads add column if not exists paid_signup_id uuid;
comment on column public.outreach_leads.paid_signup_id is
  'The client sign-up (onboarding_responses.id) the first payment came through (stripe-webhook, from the v3 session metadata, in the same update as the payment). The seller is the authorised creator of THIS sign-up (sale_creations). Write-once.';

create index if not exists sale_creations_onboarding on public.sale_creations (onboarding_id, created_at);

-- Two more reasons a sale is held for Paul (never guessed).
alter table public.sale_attribution_reviews drop constraint if exists sale_attribution_reviews_reason_check;
alter table public.sale_attribution_reviews add constraint sale_attribution_reviews_reason_check
  check (reason in ('no_authorised_creator', 'creator_not_authorised', 'claimed_seller_mismatch', 'conflicting_creators', 'ambiguous_manual_payment'));

-- ── the decision (ONE function; the stamp and the review both ask it) ───────────────────────────────
create or replace function public.sale_attribution_decision(_lead public.outreach_leads)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_owner uuid := coalesce(_lead.assigned_to_user_id, _lead.user_id);
  v_owner_is_paul boolean;
  v_mode text;
  v_key text;                -- the sign-up the decision rests on: its onboarding id (or 'event:<id>' for a link with none)
  v_signups integer := 0;
  v_creators uuid[];
  v_authorised boolean;
  v_latest_sales uuid;
  c public.sale_creations%rowtype;
  v_seller uuid;
  v_source text;
  v_reason text;
  v_claimed uuid;
  v_evidence jsonb;
begin
  v_owner_is_paul := v_owner is not null and (v_owner = _lead.user_id
    or exists (select 1 from public.user_roles where user_id = v_owner and role = 'admin')
    or not exists (select 1 from public.team_members where user_id = v_owner));
  -- The most recent sign-up a SALESPERSON created for this lead (evidence, and the claim when nothing else fits).
  select s.creator_user_id into v_latest_sales from public.sale_creations s
   where s.lead_id = _lead.id and s.creator_role is distinct from 'admin'
   order by s.created_at desc limit 1;

  if _lead.paid_signup_id is not null then
    v_mode := 'paid_signup';
    v_key := _lead.paid_signup_id::text;
  elsif _lead.paid_checkout_session_id is not null then
    -- A payment through a session made before v3 (H's rule): the creation that recorded THAT session.
    v_mode := 'paid_session';
    select * into c from public.sale_creations where checkout_session_id = _lead.paid_checkout_session_id;
    if found then v_key := coalesce(c.onboarding_id::text, 'event:' || c.event_id::text); end if;
  else
    -- No session on the payment (a manual Mark Paid): only an UNAMBIGUOUS sign-up may decide it.
    v_mode := 'manual';
    select count(distinct coalesce(s.onboarding_id::text, 'event:' || s.event_id::text)) into v_signups
      from public.sale_creations s where s.lead_id = _lead.id;
    if v_signups = 1 then
      select coalesce(s.onboarding_id::text, 'event:' || s.event_id::text) into v_key
        from public.sale_creations s where s.lead_id = _lead.id limit 1;
    elsif v_signups > 1 then
      v_reason := 'ambiguous_manual_payment';
      v_claimed := coalesce(v_latest_sales,
        (select s.creator_user_id from public.sale_creations s where s.lead_id = _lead.id order by s.created_at desc limit 1));
    end if;
  end if;

  if v_reason is null and v_key is not null then
    select array_agg(x.creator_user_id order by x.first_at) into v_creators
      from (select s.creator_user_id, min(s.created_at) as first_at from public.sale_creations s
             where s.lead_id = _lead.id and coalesce(s.onboarding_id::text, 'event:' || s.event_id::text) = v_key
             group by s.creator_user_id) x;
    if coalesce(cardinality(v_creators), 0) > 1 then
      v_reason := 'conflicting_creators'; v_claimed := v_creators[1];
    elsif coalesce(cardinality(v_creators), 0) = 1 then
      select exists (select 1 from public.sale_creations s
                      where s.lead_id = _lead.id and coalesce(s.onboarding_id::text, 'event:' || s.event_id::text) = v_key
                        and s.creator_user_id = v_creators[1] and (s.creator_role = 'admin' or s.creator_ready is true))
        into v_authorised;
      if v_authorised then
        v_seller := v_creators[1]; v_source := 'signup_creator';
      else
        v_reason := 'creator_not_authorised'; v_claimed := v_creators[1];
      end if;
    end if;
  end if;

  if v_reason is null and v_seller is null then
    -- Nobody created this sign-up through Quick Close (e.g. the client's own questionnaire).
    if v_owner_is_paul and v_latest_sales is null then
      v_seller := v_owner; v_source := 'owner_admin';           -- Paul's own sale, exactly as before
    else
      v_reason := 'no_authorised_creator';
      v_claimed := coalesce(v_latest_sales, case when v_owner_is_paul then null else v_owner end);
    end if;
  end if;

  v_evidence := jsonb_build_object(
    'mode', v_mode,
    'paid_signup', _lead.paid_signup_id,
    'paid_checkout_session', _lead.paid_checkout_session_id,
    'signup', v_key,
    'signups_on_lead', v_signups,
    'signup_creators', coalesce(to_jsonb(v_creators), '[]'::jsonb),
    'owner_at_payment', v_owner,
    'all_links', (select coalesce(jsonb_agg(jsonb_build_object('creator', s.creator_user_id, 'role', s.creator_role, 'signup', s.onboarding_id, 'session', s.checkout_session_id, 'ready', s.creator_ready, 'missing', to_jsonb(s.creator_missing), 'at', s.created_at) order by s.created_at), '[]'::jsonb)
                    from public.sale_creations s where s.lead_id = _lead.id),
    'owner_history', (select coalesce(jsonb_agg(jsonb_build_object('kind', a.kind, 'by', a.actor_user_id, 'data', a.data, 'at', a.created_at) order by a.created_at), '[]'::jsonb)
                        from public.lead_activity a where a.lead_id = _lead.id and a.kind in ('lead_added', 'lead_claimed', 'lead_assigned', 'lead_unassigned')));
  return jsonb_build_object('seller', v_seller, 'source', v_source, 'review_reason', v_reason, 'claimed_seller', coalesce(v_claimed, v_seller), 'evidence', v_evidence);
end $$;
revoke all on function public.sale_attribution_decision(public.outreach_leads) from public, anon, authenticated;

-- ── the stamp (H's body, plus: the paid sign-up is write-once like the paid session) ─────────────────
create or replace function public.trg_outreach_leads_sold_by()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  d jsonb;
  v_claimed uuid;
begin
  if tg_op = 'UPDATE' then
    -- The payment session and the paid sign-up are write-once, like the seller.
    if old.paid_checkout_session_id is not null then new.paid_checkout_session_id := old.paid_checkout_session_id; end if;
    if old.paid_signup_id is not null then new.paid_signup_id := old.paid_signup_id; end if;
    -- ⛔ IMMUTABLE: a seller, once stamped, never changes.
    if old.sold_by_user_id is not null then
      new.sold_by_user_id := old.sold_by_user_id;
      new.sold_at := old.sold_at;
      return new;
    end if;
    -- Attribution was decided with NO seller (held for review): only Paul's explicit resolution sets one.
    if old.sold_at is not null then
      if new.sold_by_user_id is not null and current_setting('app.attribution_resolve', true) is distinct from new.id::text then
        new.sold_by_user_id := null;
      end if;
      new.sold_at := old.sold_at;
      return new;
    end if;
  end if;
  if not public.lead_is_client(new.amount_paid, new.status) then return new; end if;
  d := public.sale_attribution_decision(new);
  v_claimed := new.sold_by_user_id;   -- a seller written explicitly with the payment (not the normal path)
  if v_claimed is not null and v_claimed is distinct from nullif(d ->> 'seller', '')::uuid then
    new.sold_by_user_id := null;      -- held: the review trigger records the mismatch
    perform set_config('app.attribution_claimed', v_claimed::text, true);
  else
    new.sold_by_user_id := nullif(d ->> 'seller', '')::uuid;
  end if;
  new.sold_at := now();
  return new;
end $$;
revoke all on function public.trg_outreach_leads_sold_by() from public, anon, authenticated;
drop trigger if exists trg_outreach_leads_sold_by on public.outreach_leads;
create trigger trg_outreach_leads_sold_by before insert or update of amount_paid, status, sold_by_user_id, sold_at, paid_checkout_session_id, paid_signup_id
  on public.outreach_leads for each row execute function public.trg_outreach_leads_sold_by();

-- The review trigger's body is H's, unchanged; only its column list gains paid_signup_id.
drop trigger if exists trg_outreach_leads_attribution_review on public.outreach_leads;
create trigger trg_outreach_leads_attribution_review after insert or update of amount_paid, status, sold_by_user_id, sold_at, paid_checkout_session_id, paid_signup_id
  on public.outreach_leads for each row execute function public.trg_outreach_leads_attribution_review();

-- ── read-back (run after applying) ───────────────────────────────────────────────────────────────────
-- select column_name from information_schema.columns where table_schema='public' and table_name='outreach_leads' and column_name in ('paid_signup_id','paid_checkout_session_id');
-- select pg_get_constraintdef(oid) from pg_constraint where conname='sale_attribution_reviews_reason_check';
-- select tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid='public.outreach_leads'::regclass and tgname in ('trg_outreach_leads_sold_by','trg_outreach_leads_attribution_review');
-- select position('paid_signup' in prosrc) > 0 from pg_proc where proname='sale_attribution_decision';
