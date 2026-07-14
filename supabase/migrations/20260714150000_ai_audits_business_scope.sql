-- ai_audits — add business_scope for the explicit client-engagement scope.
-- RUN IN THE SUPABASE SQL EDITOR (db push is desynced for this project). Idempotent.
--
-- Purely ADDITIVE: one nullable text column, no default, no data touched, no table / RLS /
-- policy changes. Stores the explicit client-engagement scope ('national' | 'local' | 'hybrid')
-- captured at audit creation — it OVERRIDES the heuristic guess downstream (isNationalBusiness
-- in generate-playbook, fallbackScope in schemaType.ts) when set. Backs the new scope question
-- in the audit-creation wizard. Nullable so older audits and any flow that skips it stay valid.

alter table public.ai_audits
  add column if not exists business_scope text;
