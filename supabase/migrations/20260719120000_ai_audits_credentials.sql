-- ai_audits.credentials — free-text professional credentials / regulation / qualifications for the
-- business, e.g. "ACCA regulated, Chartered Tax Adviser (CTA)". Nullable; captured per audit and fed
-- to generate-report as a prominent trust signal (a regulated/chartered status is often a business's
-- strongest differentiator). No dedicated field existed before, so credentials could never be surfaced.
-- RUN IN THE SUPABASE SQL EDITOR (applied by hand).

ALTER TABLE public.ai_audits
  ADD COLUMN IF NOT EXISTS credentials text;
