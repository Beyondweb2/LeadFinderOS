-- ai_audits — add optional NAP + specialism columns for the schema generator.
-- RUN IN THE SUPABASE SQL EDITOR (db push is desynced for this project). Idempotent.
--
-- Purely ADDITIVE: four nullable columns, no defaults, no data touched, no table / RLS /
-- policy changes. These back the per-business JSON-LD schema generator (Organization /
-- AccountingService style) — business_phone / business_address / business_email populate
-- telephone + PostalAddress; specialism refines the schema type / description. All optional
-- (client-supplied, may be null) so nothing else in the audit flow is affected.

alter table public.ai_audits
  add column if not exists business_phone   text,
  add column if not exists business_address text,
  add column if not exists business_email   text,
  add column if not exists specialism       text;
