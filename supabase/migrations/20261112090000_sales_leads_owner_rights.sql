-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- sales_leads RUNS AS ITS OWNER — DELIBERATELY (2026-10-20, fix/sales-leads-view-invoker)
--
-- Found live: public.sales_leads had reloptions {security_barrier=true, security_invoker=true}. No migration ever set
-- security_invoker on it (every definition is `with (security_barrier = true)`); it was changed outside the code,
-- most likely by the Supabase advisor's "Security Definer View" fix. With invoker on, the CALLER's RLS applies, and
-- outreach_leads is admin-only (RESTRICTIVE admin_only_outreach_leads) — so every salesperson's Outreach, WhatsApp
-- list, lead popup and search read 0 rows (Liz 21, Ethan 40, test1 32 hidden).
--
-- ⛔ THIS VIEW MUST RUN AS ITS OWNER. A salesperson has no read on outreach_leads by design (it holds Stripe / amount /
-- refund / delivery columns); the view's own WHERE clause IS the access rule:
--     my_role() in ('sales','admin')  AND  (admin OR assigned_to_user_id = auth.uid())  AND  NOT a client
-- money is a literal NULL, SELECT is granted to `authenticated` only (never anon), and a signed-out caller has no
-- role, so no rows. ⛔ DO NOT accept the Supabase advisor's "security definer view" fix for this view.
-- scripts/sales-leads-owner-rights.test.ts and supabase/tests/sales-leads-owner-rights.sql guard it.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '5s';

alter view public.sales_leads set (security_invoker = false);

comment on view public.sales_leads is
  'Salesperson lead list. RUNS AS OWNER ON PURPOSE (security_invoker = false): sales has no read on outreach_leads; '
  'the WHERE clause (assigned_to_user_id = auth.uid(), no clients, money NULL) is the access rule. '
  'Do NOT apply the Supabase advisor "security definer view" fix here — it hides every rep''s leads. '
  'Migration 20261112090000_sales_leads_owner_rights.sql.';

-- Read back:
--   select reloptions from pg_class where oid = 'public.sales_leads'::regclass;   -- {security_barrier=true,security_invoker=false}
