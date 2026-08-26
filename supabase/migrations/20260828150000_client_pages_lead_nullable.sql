-- Lead-less national clients (Solene: audit, no lead) must be able to persist a page plan.
-- The live client_pages table (2026-08-21 legacy shape) has lead_id NOT NULL, so Solene's
-- plan_build failed with "null value in column lead_id violates not-null constraint".
-- Also default client_page_questions.role, in case the legacy column is NOT NULL (the queue's
-- inserts don't send it). Both idempotent/harmless if already relaxed.
alter table public.client_pages alter column lead_id drop not null;
alter table public.client_page_questions alter column role set default 'targets';
