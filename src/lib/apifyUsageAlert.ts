/* ════════════════════════════════════════════════════════════════════════════════════════════════
   APIFY USAGE PAST 80% — ONE ALERT TO PAUL (Paul, 2026-11-16, leftovers item 3).

   When the newest Apify usage reading (apify_account_usage, written by the audit queue every 15 minutes) passes
   APIFY_ALERT_PCT of the monthly limit, Paul gets ONE bell row + ONE email per Apify billing cycle (the bell row's
   dedupe key carries the cycle start). Written by the audit-watch job (supabase/functions/audit-watch).
   Why 80: prospecting checks stop at APIFY_RESERVE_PCT.prospecting, so this is the warning before they do.

   Pure. Reached by an edge function: relative imports with .ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { APIFY_RESERVE_PCT } from './auditBudget.ts';

export const APIFY_ALERT_PCT = 80;

export interface ApifyUsageRow {
  monthly_usage_usd: number | null;
  max_monthly_usage_usd: number | null;
  cycle_start: string | null;
  cycle_end: string | null;
  captured_at: string;
}

/** Percent used, recomputed from used / cap (docs/rules/engineering.md: never trust a stored %). null = unknown. */
export function apifyPctOf(r: Pick<ApifyUsageRow, 'monthly_usage_usd' | 'max_monthly_usage_usd'> | null | undefined): number | null {
  const used = Number(r?.monthly_usage_usd), cap = Number(r?.max_monthly_usage_usd);
  if (!r || r.monthly_usage_usd == null || r.max_monthly_usage_usd == null || !Number.isFinite(used) || !Number.isFinite(cap) || cap <= 0) return null;
  return Math.round((used / cap) * 1000) / 10;
}

/** The alert for this reading, or null when it is under the line (or unknown). */
export function apifyUsageAlert(r: ApifyUsageRow | null | undefined) {
  const pct = apifyPctOf(r);
  if (!r || pct === null || pct < APIFY_ALERT_PCT) return null;
  const used = Number(r.monthly_usage_usd), cap = Number(r.max_monthly_usage_usd);
  const cycle = String(r.cycle_start ?? '').slice(0, 10) || String(r.captured_at).slice(0, 7);
  const resets = r.cycle_end ? ` It resets on ${String(r.cycle_end).slice(0, 10)}.` : '';
  const title = `Apify usage passed ${APIFY_ALERT_PCT}% of its monthly limit`;
  const body = `$${used.toFixed(2)} of $${cap.toFixed(2)} used (${pct}%).${resets} Prospecting checks stop at ${APIFY_RESERVE_PCT.prospecting}%, client work at ${APIFY_RESERVE_PCT.client}%.`;
  const lines = [
    `Apify has used $${used.toFixed(2)} of its $${cap.toFixed(2)} monthly limit (${pct}%).${resets}`,
    '',
    `At ${APIFY_RESERVE_PCT.prospecting}% new prospecting checks stop (reps see "Monthly search limit reached, ask Paul to raise it").`,
    `At ${APIFY_RESERVE_PCT.client}% client Discovery work stops; at ${APIFY_RESERVE_PCT.guarantee}% everything stops, baselines and re-measures included.`,
    '',
    'To keep checks running, raise the monthly limit in the Apify console (Billing → Limits). Nothing was changed automatically.',
    'You get this alert once per Apify billing cycle.',
  ];
  return { title, body, link: '/ai-audit', subject: title, lines, dedupeKey: `apify_usage_${APIFY_ALERT_PCT}:${cycle}` };
}
