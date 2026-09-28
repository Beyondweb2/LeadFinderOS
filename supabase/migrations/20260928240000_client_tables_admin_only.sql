-- Paid-client page records are written by the ADMIN only (2026-09-28). Additive: RESTRICTIVE policies,
-- the same shape as ai_audits / campaigns. Apply ONE statement at a time (numbered), read back.
--
-- ⛔ THE GAP: client_pages, client_page_questions and client_listings had only permissive "owner"
-- policies (user_id = auth.uid(), or the parent page's user_id). A salesperson could therefore INSERT a
-- client_pages row under their own user_id against ANY lead_id — a paying client's included — and
-- paid-client-hub reads pages by lead_id alone on the service role, so it would show in Paul's Paid
-- Clients view. Hidden UI was the only barrier.
-- ⛔ WHO LEGITIMATELY WRITES: page-generator, paid-client-hub and _shared/action-plan.ts on the SERVICE
-- ROLE (RLS does not apply — unchanged), and the admin's own delivery screens (useClientPages.setPageBuilt,
-- as Paul). No Sales workflow writes any of the three. Payment confirmation (stripe-webhook) touches none.
-- SELECT is unchanged (a salesperson owns no rows, so reads nothing).

-- 1.
create policy "admin_only_insert_client_pages" on public.client_pages as restrictive for insert to authenticated
  with check ((select public.my_role()) = 'admin');

-- 2.
create policy "admin_only_update_client_pages" on public.client_pages as restrictive for update to authenticated
  using ((select public.my_role()) = 'admin') with check ((select public.my_role()) = 'admin');

-- 3.
create policy "admin_only_delete_client_pages" on public.client_pages as restrictive for delete to authenticated
  using ((select public.my_role()) = 'admin');

-- 4.
create policy "admin_only_insert_client_page_questions" on public.client_page_questions as restrictive for insert to authenticated
  with check ((select public.my_role()) = 'admin');

-- 5.
create policy "admin_only_update_client_page_questions" on public.client_page_questions as restrictive for update to authenticated
  using ((select public.my_role()) = 'admin') with check ((select public.my_role()) = 'admin');

-- 6.
create policy "admin_only_delete_client_page_questions" on public.client_page_questions as restrictive for delete to authenticated
  using ((select public.my_role()) = 'admin');

-- 7.
create policy "admin_only_insert_client_listings" on public.client_listings as restrictive for insert to authenticated
  with check ((select public.my_role()) = 'admin');

-- 8.
create policy "admin_only_update_client_listings" on public.client_listings as restrictive for update to authenticated
  using ((select public.my_role()) = 'admin') with check ((select public.my_role()) = 'admin');

-- 9.
create policy "admin_only_delete_client_listings" on public.client_listings as restrictive for delete to authenticated
  using ((select public.my_role()) = 'admin');
