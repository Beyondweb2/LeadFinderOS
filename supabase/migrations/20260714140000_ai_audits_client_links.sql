-- ai_audits — add client_links for the per-client link hub.
-- RUN IN THE SUPABASE SQL EDITOR (db push is desynced for this project). Idempotent.
--
-- Purely ADDITIVE: one jsonb column, no data touched, no table / RLS / policy changes.
-- Backs the link-hub feature — a per-audit list of the client's own URLs stored as an array
-- of {label, url} objects (e.g. [{"label":"Wix login","url":"https://…"}]). NOT NULL DEFAULT
-- '[]'::jsonb (matches the DB's jsonb convention: content/context/results) so the frontend
-- always reads an array, never null.

alter table public.ai_audits
  add column if not exists client_links jsonb not null default '[]'::jsonb;
