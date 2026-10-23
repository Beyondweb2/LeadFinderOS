-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WEBSITE ADD-ON + HOSTING SUBSCRIPTIONS — run this BEFORE the code is deployed.
--
-- ⛔ SQL FIRST, THEN DEPLOY. Proven 2026-08-04: findable-onboarding v18 shipped before its five
-- new columns existed and EVERY submission died save_failed for ~20 minutes, including ones
-- carrying none of the new fields. The code written for this change is defensive both ways (the
-- new key is dropped from the insert when null, and the fallback sheds unknown columns), but the
-- rule stands: run this, confirm it, then deploy.
--
-- Every statement is IF NOT EXISTS and re-running changes nothing.
-- ⚠️ Do NOT use CREATE TABLE IF NOT EXISTS thinking here: CLAUDE.md 6i records that it is a silent
-- no-op against a table that exists in a different shape. These are additive ALTERs on purpose.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1. THE TICK, on the questionnaire row ──────────────────────────────────────────────────────
-- Nullable with NO default, deliberately. NULL means "this row predates the question", which is a
-- different fact from false ("they were asked and said no"), and findable-checkout treats both as
-- not-ticked. A DEFAULT false would erase that distinction on 20 historical rows.
alter table public.onboarding_responses
  add column if not exists website_addon boolean;

-- ── 2. THE SUBSCRIPTION, on the lead ───────────────────────────────────────────────────────────
-- These live on outreach_leads rather than a new table because every reader in the app already
-- joins through the lead, and at one or two customers a table would be ceremony. Revisit if
-- hosting ever outgrows one subscription per lead.
alter table public.outreach_leads
  add column if not exists stripe_customer_id      text,
  add column if not exists stripe_subscription_id  text,
  -- Stripe's own vocabulary, passed through unmapped: active / trialing / past_due / unpaid /
  -- canceled / incomplete / incomplete_expired / paused. Inventing a parallel set guarantees drift.
  add column if not exists subscription_status     text,
  add column if not exists subscription_renews_at  timestamptz;

-- ── 3. THE LOOKUP THE WEBHOOK DOES ON EVERY RENEWAL ────────────────────────────────────────────
-- An invoice carries no subscription metadata, so stripe-webhook resolves the lead by this column
-- on every invoice.paid / invoice.payment_failed. Without an index that is a full scan of ~2,700
-- leads per event, growing.
create index if not exists outreach_leads_stripe_subscription_id_idx
  on public.outreach_leads (stripe_subscription_id)
  where stripe_subscription_id is not null;

-- ── 4. CONFIRM (expect 5 rows: 1 + 4) ─────────────────────────────────────────────────────────
select table_name, column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and (   (table_name = 'onboarding_responses' and column_name = 'website_addon')
        or (table_name = 'outreach_leads' and column_name in
              ('stripe_customer_id','stripe_subscription_id','subscription_status','subscription_renews_at')))
 order by table_name, column_name;
