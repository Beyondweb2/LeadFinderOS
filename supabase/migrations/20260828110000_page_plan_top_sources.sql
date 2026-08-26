-- top_sources on client_pages: the top recurring cited domains per planned page — "where the
-- engines are looking" (client feedback: the source lists are the most valuable output).
-- The base migration (20260828090000) now includes this column in CREATE TABLE; this ALTER covers
-- a database where that migration was already run WITHOUT it. Idempotent — safe to run either way.
alter table if exists public.client_pages add column if not exists top_sources jsonb;
