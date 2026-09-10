/* ────────────────────────────────────────────────────────────────────────────────────────────
   SOFT-DELETE FOR AUDITS — `ai_audits.archived_at`
   2026-09-10

   ⛔ WHY THIS EXISTS. Deleting an ai_audits row CASCADES: `ai_audit_runs` and `ai_audit_queue`
   are both ON DELETE CASCADE, so one click destroyed the run, every question and every stored
   answer — the measurement itself. `page_plan_queue.baseline_audit_id` cascades too, and
   `client_pages.baseline_audit_id` is set to null. None of it is recoverable and none of it is
   backed up. Until now the only thing standing in front of that was a 24px trash icon and a
   browser confirm, with NO exemption for a paying customer's baseline — the before-measurement
   the guarantee rests on.

   Archiving replaces deleting in the app. The hard DELETE policy is deliberately left in place:
   removing it would break nothing today but it is a destructive schema change of its own, and
   the app no longer calls it. If you want it gone, that is a separate, deliberate decision.

   ⚠️ IDEMPOTENT. Safe to run twice. Uses IF NOT EXISTS on both the column and the index.
   ⚠️ NO POLICY NEEDED: "Users can update their own ai_audits" already exists
   (20260710120000_ai_visibility_audit.sql), and archiving is an UPDATE.
   ──────────────────────────────────────────────────────────────────────────────────────────── */

ALTER TABLE public.ai_audits
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.ai_audits.archived_at IS
  'Soft delete. Non-null = hidden from the AI Audit list. The row, its runs and its queue rows are all still here. Cleared by Restore.';

/* The list asks for "not archived" on every load, so the partial index covers the common read
   and stays small — it indexes only the archived rows' absence, not the whole table. */
CREATE INDEX IF NOT EXISTS ai_audits_archived_at_idx
  ON public.ai_audits (archived_at)
  WHERE archived_at IS NULL;
