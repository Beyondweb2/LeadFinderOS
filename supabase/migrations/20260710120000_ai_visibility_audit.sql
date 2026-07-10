-- AI Visibility Audit — schema (Phase 1)
-- Three tables backing the "AI Visibility Audit" feature:
--   ai_audits       — one row per audited business (standalone OR attached to a lead)
--   ai_audit_runs   — one row per run of an audit (run_number gives before/after)
--   ai_audit_queue  — one row per (run × question); drained by process-ai-audit-queue
--
-- RLS model is copied VERBATIM from outreach_leads (20260109095434_...sql:65-83):
-- four owner-scoped policies (SELECT/INSERT/UPDATE/DELETE, each auth.uid() = user_id)
-- + GRANTs to authenticated and service_role. user_id is explicit on every insert
-- (no DB default) — the edge functions set it from the audit row (service key bypasses
-- RLS for writes; the SELECT policy lets the browser poll its own runs).
--
-- ⚠️ RUN THIS MANUALLY in the Supabase SQL editor (db push is broken here). The
-- verification SELECT at the bottom confirms the three tables + their policies exist.
-- ---------------------------------------------------------------------------

-- ========== ai_audits ==========
CREATE TABLE public.ai_audits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  lead_id UUID NULL REFERENCES public.outreach_leads(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  business_type TEXT,
  location_text TEXT,
  country TEXT,
  has_website BOOLEAN NOT NULL DEFAULT false,
  website TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ========== ai_audit_runs ==========
CREATE TABLE public.ai_audit_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_id UUID NOT NULL REFERENCES public.ai_audits(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  run_number INTEGER NOT NULL DEFAULT 1,
  results JSONB NOT NULL DEFAULT '{}'::jsonb,
  mention_rate NUMERIC NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | running | complete | capped | failed
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ========== ai_audit_queue ==========
CREATE TABLE public.ai_audit_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_id UUID NOT NULL REFERENCES public.ai_audits(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.ai_audit_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  question TEXT NOT NULL,
  engines TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending', -- pending | running | done | failed
  attempts INTEGER NOT NULL DEFAULT 0,
  result JSONB NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_audit_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_audit_queue ENABLE ROW LEVEL SECURITY;

-- RLS policies for ai_audits (verbatim shape from outreach_leads)
CREATE POLICY "Users can view their own ai_audits"
ON public.ai_audits FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own ai_audits"
ON public.ai_audits FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ai_audits"
ON public.ai_audits FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ai_audits"
ON public.ai_audits FOR DELETE
USING (auth.uid() = user_id);

-- RLS policies for ai_audit_runs
CREATE POLICY "Users can view their own ai_audit_runs"
ON public.ai_audit_runs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own ai_audit_runs"
ON public.ai_audit_runs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ai_audit_runs"
ON public.ai_audit_runs FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ai_audit_runs"
ON public.ai_audit_runs FOR DELETE
USING (auth.uid() = user_id);

-- RLS policies for ai_audit_queue
CREATE POLICY "Users can view their own ai_audit_queue"
ON public.ai_audit_queue FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own ai_audit_queue"
ON public.ai_audit_queue FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ai_audit_queue"
ON public.ai_audit_queue FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ai_audit_queue"
ON public.ai_audit_queue FOR DELETE
USING (auth.uid() = user_id);

-- Grants (same as generated_sites 20260609142526_...sql:20-21)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_audits TO authenticated;
GRANT ALL ON public.ai_audits TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_audit_runs TO authenticated;
GRANT ALL ON public.ai_audit_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_audit_queue TO authenticated;
GRANT ALL ON public.ai_audit_queue TO service_role;

-- updated_at maintenance (reuses the existing shared function)
CREATE TRIGGER update_ai_audits_updated_at
BEFORE UPDATE ON public.ai_audits
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_ai_audits_user_id ON public.ai_audits(user_id);
CREATE INDEX idx_ai_audits_lead_id ON public.ai_audits(lead_id);
CREATE INDEX idx_ai_audit_runs_user_id ON public.ai_audit_runs(user_id);
CREATE INDEX idx_ai_audit_runs_audit_id ON public.ai_audit_runs(audit_id);
CREATE INDEX idx_ai_audit_queue_user_id ON public.ai_audit_queue(user_id);
CREATE INDEX idx_ai_audit_queue_run_id ON public.ai_audit_queue(run_id);
CREATE INDEX idx_ai_audit_queue_audit_id ON public.ai_audit_queue(audit_id);
-- FIFO drain index for process-ai-audit-queue (mirrors the whatsapp queue ordering)
CREATE INDEX idx_ai_audit_queue_status_created ON public.ai_audit_queue(status, created_at);

-- ---------------------------------------------------------------------------
-- VERIFICATION — run this after the above; expect 3 tables and 12 policies (4 each).
-- ---------------------------------------------------------------------------
SELECT t.table_name,
       (SELECT count(*) FROM information_schema.columns c
          WHERE c.table_schema = 'public' AND c.table_name = t.table_name) AS columns,
       (SELECT count(*) FROM pg_policies p
          WHERE p.schemaname = 'public' AND p.tablename = t.table_name) AS policies,
       (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t.table_name)::regclass) AS rls_enabled
FROM information_schema.tables t
WHERE t.table_schema = 'public'
  AND t.table_name IN ('ai_audits', 'ai_audit_runs', 'ai_audit_queue')
ORDER BY t.table_name;

-- Per-policy detail (expect SELECT/INSERT/UPDATE/DELETE for each table):
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('ai_audits', 'ai_audit_runs', 'ai_audit_queue')
ORDER BY tablename, cmd, policyname;
