-- Add updated_at to ai_audit_queue so process-ai-audit-queue can reclaim rows stranded
-- in 'running' by a killed invocation (reset stale 'running' → 'pending'). The reclaim
-- compares updated_at against a staleness threshold, so every status change must bump it —
-- done here by the shared update_updated_at_column() BEFORE-UPDATE trigger (same one used
-- by ai_audits), which fires on EVERY update.
--
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (db push is desynced). Idempotent.
-- Until this is applied, the queue processor's reclaim step is a guarded no-op (it
-- logs and continues); draining still works, just without stuck-row self-healing.
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_audit_queue
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS update_ai_audit_queue_updated_at ON public.ai_audit_queue;
CREATE TRIGGER update_ai_audit_queue_updated_at
BEFORE UPDATE ON public.ai_audit_queue
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Verification — expect one row: column 'updated_at', type 'timestamp with time zone'.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ai_audit_queue' AND column_name = 'updated_at';
