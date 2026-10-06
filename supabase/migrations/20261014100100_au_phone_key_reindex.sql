-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- REBUILD THE TWO phone_key INDEXES (2026-10-07) — RUN STRAIGHT AFTER 20261014100000_au_phone_key.sql.
--
-- 20261014100000 changed public.phone_key (an Australian '+61 …' number now keys as its 9 national digits).
-- Both indexes below are built ON public.phone_key(phone); PostgreSQL does not rebuild an expression index
-- when the function is replaced, so until this runs an Australian '+61' row sits in the index under its OLD
-- key and an index-backed lookup (phone_key(phone) = …: the inbound lead match, the identity lookup) can miss it.
--
-- ⚠️ REINDEX … CONCURRENTLY cannot run inside a transaction block: send EACH statement on its own (the
-- Management API query endpoint runs a single statement without wrapping it). CONCURRENTLY keeps reads and
-- writes flowing while it builds; each table is a few thousand rows (seconds).
-- Idempotent: rerunning just rebuilds again.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

reindex index concurrently public.idx_outreach_leads_phone_key;

reindex index concurrently public.idx_whatsapp_messages_phone_key;

-- Read back (both valid and ready):
--   select c.relname, i.indisvalid, i.indisready from pg_index i join pg_class c on c.oid = i.indexrelid
--    where c.relname in ('idx_outreach_leads_phone_key', 'idx_whatsapp_messages_phone_key');
