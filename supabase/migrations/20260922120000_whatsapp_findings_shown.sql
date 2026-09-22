-- WHICH SITE FINDINGS A MESSAGE ACTUALLY CARRIED (deep sales crawl, Phase 1 — 2026-09-22).
--
-- The ORDERED EvidenceKind / FindingKind values that went into ai_site_findings_v2's {{6}}, e.g.
--   {sitemap_wrong_domain,noindex_important_page}
-- Written by all three send paths (send-whatsapp-message, the queue's auto-reply lane, the queue's
-- campaign lane) and ONLY for a template that genuinely carries site findings, so the column can be
-- read later as "what this message said" rather than "what we could have said".
--
-- WHY THE KINDS AND NOT THE SENTENCE. template_snapshot already stores the rendered body, and that
-- is the right record of what the prospect read. It is the wrong record for analysis: a sentence
-- cannot be grouped or counted, so "which findings actually sell" would be unanswerable from it.
-- This is the smallest durable field that makes that question answerable later, and nothing else of
-- the lead-events system is being built yet.
--
-- NULL on every message sent before this, and on every message that carries no findings. A reader
-- must treat null and {} identically — neither means "we found nothing", it means "this message was
-- not one that names findings".
--
-- RLS: none added, deliberately. whatsapp_messages already has its policies and its owner column
-- (user_id); a new column inherits them. Adding a policy here would be a second rule for one table.
alter table public.whatsapp_messages
  add column if not exists findings_shown text[] null;

comment on column public.whatsapp_messages.findings_shown is
  'Ordered site-finding kinds carried in this message''s findings variable (src/lib/siteFindings.ts FindingKind). Null unless the template names findings.';
