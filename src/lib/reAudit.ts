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
 *  ESTIMATE: actual actor spend varies per run and is recorded afterwards (CLAUDE.md §8).
 *
 *  ⛔ PRICED AGAINST REAL BILLED ROWS, not a price list (§4's constants rule). Corrected
 *  0.0125 → 0.0104 on 2026-08-28: `ai_audit_runs.actor_cost_usd` for Solene's own 3-run baseline
 *  (audit 527752c7, 20 questions per run) billed $0.2200 / $0.2075 / $0.1950 = $0.01100 / $0.01037 /
 *  $0.00975 per question, mean **$0.01038** — the same client, question style and engines a
 *  re-audit of it will use. 0.0125 was the older figure derived from 3-5 question runs and ran ~20%
 *  high, so the screen overstated a 47-question × 3-run measurement as £1.41 against a real ~£1.17.
 *  CLAUDE.md §8's constants table already recorded 0.0104 as the re-measured truth; this is the
 *  copy that was left behind. */
export const RE_AUDIT_EST_USD_PER_QUESTION = 0.0104;

export type ReAuditOutcome =
  | { ok: true; auditId: string; runId: string | null }
  | { ok: false; error: string };

/* Non-literal string so supabase-js uses its generic overload and does NOT type-validate the column
   list. The measurement markers (is_measurement, baseline_target_runs) and the finalised-state
   columns (baseline, baseline_completed_at, …) are deliberately NOT copied: a re-audit is a QUICK
   diagnostic — one run, the source's questions — and must never look like a baseline or a measure.
   ⛔ THE "measurement" MODE IS GONE (2026-09-12). Re-measuring a baseline is the day-28 replay,
   fired by the queue against outreach_leads.baseline_audit_id and refused server-side if the set
   differs; re-measuring a full measure is meaningless, because a full measure is never compared.
   A dialog that could mint a 3-run copy of any audit was a second route to a comparable set that
   nothing recorded. */
const SRC_SELECT: string =
  'lead_id, business_name, business_type, location_text, country, has_website, website, business_scope, ' +
  'specialism, credentials, business_phone, business_address, business_email, client_links';

/**
 * Re-audit `sourceAuditId` into a fresh single-run audit owned by `userId`, asking `questions`.
 * Returns the new audit id + first run id, or an error. Never throws. The source audit is left
 * untouched. Excluded from every before/after by construction (one run cannot support a
 * per-question claim — judgeRemeasure's `quick_diagnostic`).
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

  const copyRow: Record<string, unknown> = { ...(src as unknown as Record<string, unknown>), user_id: opts.userId };

  const { data: created, error: insErr } = await supabase
    .from('ai_audits')
    .insert(copyRow as unknown as TablesInsert<'ai_audits'>)
    .select('id')
    .single();
  if (insErr || !created) return { ok: false, error: insErr?.message ?? 'could not create the new audit' };

  const { data, error } = await supabase.functions.invoke('create-ai-audit', {
    body: { audit_id: (created as { id: string }).id, questions: clean },
  });
  const d = data as { ok?: boolean; run_id?: string; error?: string } | null;
  if (error || !d?.ok) return { ok: false, error: error?.message ?? d?.error ?? 're-audit failed' };

  return { ok: true, auditId: (created as { id: string }).id, runId: d.run_id ?? null };
}
