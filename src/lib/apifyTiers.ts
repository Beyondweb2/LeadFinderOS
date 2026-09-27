/* The Apify warning tiers — pure, so they are tested without the Supabase client
   (scripts/apify-cap-and-forecast.test.ts). Re-exported by src/hooks/useApifyUsage.ts. */

/* ⛔ THE OPERATOR'S WARNING TIERS (Paul, 2026-09-28): 80%, 90%, 95%. WARNINGS ONLY — nothing here
   blocks a spend. The only thing that stops spending is Apify's own account cap (maxMonthlyUsageUsd,
   read from Apify's API every 15 minutes by the audit queue — the same number shown here).
   ⚠️ The queue's LOG thresholds (apify-usage.ts, 75% / 90%) are separate and unchanged. */
export const APIFY_WARN_PCT = 0.80;
export const APIFY_HIGH_PCT = 0.90;
export const APIFY_CRITICAL_PCT = 0.95;

export type ApifyTone = 'ok' | 'warn' | 'high' | 'critical';

export function apifyTone(pct: number | null | undefined): ApifyTone {
  if (pct == null || !Number.isFinite(pct)) return 'ok';
  if (pct >= APIFY_CRITICAL_PCT) return 'critical';
  if (pct >= APIFY_HIGH_PCT) return 'high';
  if (pct >= APIFY_WARN_PCT) return 'warn';
  return 'ok';
}

/** The sentence for a tier, or null below 80%. Says what happens at the cap; never claims a block. */
export function apifyWarningText(pct: number | null | undefined): string | null {
  const tone = apifyTone(pct);
  if (tone === 'ok' || pct == null) return null;
  if (pct >= 1) return 'At the Apify cap: audit questions and SEO scans fail until the cap is raised or the cycle resets.';
  const at = tone === 'critical' ? '95%' : tone === 'high' ? '90%' : '80%';
  return `Over ${at} of the Apify monthly cap. Nothing is blocked yet — at 100% audit questions and SEO scans stop.`;
}
