import type { SupabaseClient } from '@supabase/supabase-js';
import type { TablesInsert } from '@/integrations/supabase/types';

/* ════════════════════════════════════════════════════════════════════════════════════════════
   RE-AUDIT — mint a NEW audit (the "after" of a before/after) from an existing source audit,
   reusing ONE type-aware measurement path for every caller: the AI Audit page's Re-audit button
   and the Baseline page's "Re-run this measurement". The source audit is never touched.

   ⛔ THE FIXED CHECK LIVES HERE, ONCE — so it cannot drift back into the 5-question / 1-run bug.
   A "measurement" is is_measurement === true OR baseline_target_runs > 1. The second half is
   load-bearing: a PAID BASELINE sets baseline_target_runs (e.g. 3) but NOT is_measurement (that
   column postdates the paid path), so keying only on is_measurement re-ran RG Locksmiths' paid
   baseline as a 5-question single-run quick audit (2026-08-26). When it IS a measurement, the copy
   carries is_measurement=true + baseline_target_runs so advanceBaseline fires every run, and
   create-ai-audit gets purpose:'measurement' so the FULL question set is kept (no 5-question wizard
   clamp) and the SEO scan is skipped. A quick audit carries neither → single run, questions clamped
   as before. Marking the copy is_measurement=true also keeps startPaidBaseline's idempotency from
   ever mistaking the re-measure for a NEW paid baseline, even though it copies the lead_id.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

/** Per-question Apify estimate shared by every re-audit cost line (AI Audit + Baseline). An
 *  ESTIMATE: actual actor spend varies per run and is recorded afterwards (CLAUDE.md §8). */
export const RE_AUDIT_EST_USD_PER_QUESTION = 0.0125;

export type ReAuditOutcome =
  | { ok: true; auditId: string; runId: string | null; measurement: boolean; targetRuns: number }
  | { ok: false; error: string };

/* Non-literal string so supabase-js uses its generic overload and does NOT type-validate the column
   list — is_measurement is a hand-added column absent from the generated types. The finalised-state
   columns (baseline, baseline_completed_at, …) are deliberately NOT copied: the copy must start
   fresh so advanceBaseline fires its runs. */
const SRC_SELECT: string =
  'lead_id, business_name, business_type, location_text, country, has_website, website, business_scope, ' +
  'specialism, credentials, business_phone, business_address, business_email, client_links, ' +
  'is_measurement, baseline_target_runs';

/**
 * Re-audit `sourceAuditId` into a fresh audit owned by `userId`, running `questions`. Returns the new
 * audit id + first run id, or an error. Never throws. The source audit is left untouched.
 */
export async function reAuditFromSource(
  supabase: SupabaseClient,
  opts: { sourceAuditId: string; userId: string; questions: string[] },
): Promise<ReAuditOutcome> {
  const clean = opts.questions.map((q) => (q ?? '').trim()).filter(Boolean);
  if (clean.length === 0) return { ok: false, error: 'no questions to re-audit' };

  const { data: src, error: readErr } = await supabase
    .from('ai_audits').select(SRC_SELECT).eq('id', opts.sourceAuditId).maybeSingle();
  if (readErr || !src) return { ok: false, error: readErr?.message ?? 'could not read the audit to copy' };

  const markers = src as unknown as { is_measurement?: boolean | null; baseline_target_runs?: number | null };
  const targetRuns = Number(markers.baseline_target_runs ?? 0);
  const isMeasurement = markers.is_measurement === true || targetRuns > 1;

  // Copy business fields; carry the measurement markers ONLY when it is a measurement.
  const copyRow: Record<string, unknown> = { ...(src as unknown as Record<string, unknown>), user_id: opts.userId };
  delete copyRow.is_measurement;
  delete copyRow.baseline_target_runs;
  if (isMeasurement) {
    copyRow.is_measurement = true;
    if (targetRuns > 1) copyRow.baseline_target_runs = targetRuns;
  }

  const { data: created, error: insErr } = await supabase
    .from('ai_audits')
    // cast via unknown: copyRow carries is_measurement, a hand-added column absent from the generated
    // types — the DB column exists, so the extra key inserts fine at runtime.
    .insert(copyRow as unknown as TablesInsert<'ai_audits'>)
    .select('id')
    .single();
  if (insErr || !created) return { ok: false, error: insErr?.message ?? 'could not create the new audit' };

  const { data, error } = await supabase.functions.invoke('create-ai-audit', {
    body: { audit_id: (created as { id: string }).id, questions: clean, ...(isMeasurement ? { purpose: 'measurement', skip_seo: true } : {}) },
  });
  const d = data as { ok?: boolean; run_id?: string; error?: string } | null;
  if (error || !d?.ok) return { ok: false, error: error?.message ?? d?.error ?? 're-audit failed' };

  return { ok: true, auditId: (created as { id: string }).id, runId: d.run_id ?? null, measurement: isMeasurement, targetRuns };
}
