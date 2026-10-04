/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE AUDIT BUDGET POOLS — a paying client's measurement is never starved by prospecting (2026-10-04,
   fix/04-ai-measurement; master plan M-010, Session E E-05, Session C C-14).

   🔴 WHY. Every audit question — a rep's hook check, a bulk wave, a paying client's baseline, the
   day-28 re-measure the refund is judged on — drew from ONE rolling-24h budget keyed on the data
   account that owns every audit (process-ai-audit-queue DAILY_CAP_USD). The day reps run hook audits
   in earnest is the day a client's baseline ends `capped`: some questions answered, the rest refused,
   on the measurement the guarantee is settled against. Raising the one cap only moves the day.

   ⛔ THREE POOLS, CHOSEN BY THE AUDIT'S STORED PURPOSE (auditKind.ts's marker, never inferred):
     guarantee   — baseline, remeasure. The money-back measurement. Its own daily ceiling, and it may
                   use Apify right up to the account's monthly cap.
     client      — measurement, discovery, weekly_check. Paid-client work that is not the guarantee.
     prospecting — everything else: hook audits, free checks, market scans, and ANY unknown or missing
                   purpose (absent means the most restricted pool — CLAUDE.md §4).
   ⛔ THE APIFY RESERVE. Apify stops serving every actor at 100% of the monthly cap, together. So the
   pools that are not the guarantee stop EARLY — prospecting at APIFY_RESERVE_PCT.prospecting, client
   work at APIFY_RESERVE_PCT.client — leaving the last slice of the month for baselines and re-measures.
   The percentage is recomputed from used / cap, never read from a stored usage_pct (CLAUDE.md §4).

   ⛔ PRIMITIVES FOR SESSION 7 (sales "Check before calling"). budgetDecision takes an optional per-rep
   allowance ({ spentUsd, capUsd }); the caller works out a rep's spend from its own actor stamps. This
   module never decides who a rep is.

   ⚠️ THE NUMBERS ARE PAUL'S DECISION, NOT DERIVED. Named constants, never written as figures in prose.
   Pure. IMPORTED BY EDGE FUNCTIONS: relative .ts imports only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type BudgetPool = 'guarantee' | 'client' | 'prospecting';
export const BUDGET_POOLS: readonly BudgetPool[] = ['guarantee', 'client', 'prospecting'];

/** The guarantee: the frozen baseline and the day-28 replay. */
export const GUARANTEE_POOL_PURPOSES: readonly string[] = ['baseline', 'remeasure'];
/** Paid-client work that is not the guarantee. */
export const CLIENT_POOL_PURPOSES: readonly string[] = ['measurement', 'discovery', 'weekly_check'];

/** Which pool an audit's spend comes from. POSITIVE matches only: anything else is prospecting. */
export function budgetPoolForPurpose(purpose: unknown): BudgetPool {
  const p = typeof purpose === 'string' ? purpose.trim().toLowerCase() : '';
  if (GUARANTEE_POOL_PURPOSES.includes(p)) return 'guarantee';
  if (CLIENT_POOL_PURPOSES.includes(p)) return 'client';
  return 'prospecting';
}

/* Rolling-24h ceilings per pool, in USD of the ledger (enrichment_usage). PROSPECTING keeps the
   ceiling the single shared budget had (Paul, 2026-07-30). GUARANTEE is sized for several clients'
   baselines and re-measures on one day; CLIENT for a couple of Discovery runs. Runaway protection
   inside each run is unchanged (process-ai-audit-queue CAP_USD). */
export const POOL_DAILY_CAP_USD: Record<BudgetPool, number> = {
  guarantee: 10,
  client: 8,
  prospecting: 12,
};

/* Apify monthly usage (percent of the account's cap) at which a pool stops starting new work. The
   guarantee runs to the cap itself. */
export const APIFY_RESERVE_PCT: Record<BudgetPool, number> = {
  guarantee: 100,
  client: 95,
  prospecting: 85,
};

/** What a rep sees when prospecting is refused (master plan, WS-7 design). */
export const PROSPECTING_REFUSAL_MESSAGE = "Today's checking budget is used — your leads are still here, try tomorrow or ask Paul.";

export interface ApifyUsage { usedUsd: number | null; capUsd: number | null }

/** Percent of the monthly cap used, from the two figures. Null when either is unknown. */
export function apifyUsedPct(u: ApifyUsage | null | undefined): number | null {
  const used = Number(u?.usedUsd);
  const cap = Number(u?.capUsd);
  if (!u || u.usedUsd == null || u.capUsd == null || !Number.isFinite(used) || !Number.isFinite(cap) || cap <= 0) return null;
  return Math.round((used / cap) * 1000) / 10;
}

export type BudgetRefusal = 'pool_cap' | 'apify_reserve' | 'rep_allowance';

export interface BudgetDecision {
  allowed: boolean;
  pool: BudgetPool;
  reason: 'ok' | BudgetRefusal;
  /** Plain English for the operator / rep. */
  message: string;
  spentUsd: number;
  capUsd: number;
  apifyPct: number | null;
}

/**
 * May one more unit of work (estCostUsd) start in this pool now?
 * ⚠️ An UNKNOWN Apify reading never refuses — the ledger cap still applies, and refusing every
 * baseline because a snapshot is missing would be the exact starvation this module exists to stop.
 */
export function budgetDecision(i: {
  pool: BudgetPool;
  poolSpentUsd: number;
  estCostUsd: number;
  apify?: ApifyUsage | null;
  /** Session 7: a rep's own allowance, counted per lead from actor stamps. */
  repAllowance?: { spentUsd: number; capUsd: number } | null;
  capUsd?: number;
}): BudgetDecision {
  const capUsd = i.capUsd ?? POOL_DAILY_CAP_USD[i.pool];
  const spentUsd = Math.max(0, Number(i.poolSpentUsd) || 0);
  const est = Math.max(0, Number(i.estCostUsd) || 0);
  const pct = apifyUsedPct(i.apify);
  const base = { pool: i.pool, spentUsd, capUsd, apifyPct: pct };
  if (pct != null && pct >= APIFY_RESERVE_PCT[i.pool]) {
    return {
      ...base, allowed: false, reason: 'apify_reserve',
      message: i.pool === 'prospecting' ? PROSPECTING_REFUSAL_MESSAGE
        : `Apify is at ${pct}% of its monthly cap; the rest is kept for client baselines and re-measures.`,
    };
  }
  if (spentUsd + est > capUsd) {
    return {
      ...base, allowed: false, reason: 'pool_cap',
      message: i.pool === 'prospecting' ? PROSPECTING_REFUSAL_MESSAGE
        : `The ${i.pool} budget for the last 24 hours ($${capUsd.toFixed(2)}) is used. It frees up as the day rolls on.`,
    };
  }
  if (i.repAllowance && i.repAllowance.spentUsd + est > i.repAllowance.capUsd) {
    return { ...base, allowed: false, reason: 'rep_allowance', message: PROSPECTING_REFUSAL_MESSAGE };
  }
  return { ...base, allowed: true, reason: 'ok', message: 'ok' };
}

/** The queue row error a refusal writes ("daily_cap" kept for the pool cap, so every existing reader
 *  — the run's `capped` status, the report — still recognises it). */
export function refusalRowError(reason: BudgetRefusal): string {
  return reason === 'apify_reserve' ? 'apify_reserve' : 'daily_cap';
}

/** The PostgREST filter that selects one pool's ledger rows. Rows written before pools existed carry
 *  no pool and count as PROSPECTING — never against a client's measurement. */
export function poolLedgerFilter(pool: BudgetPool): { eq?: string; or?: string } {
  return pool === 'prospecting' ? { or: 'budget_pool.is.null,budget_pool.eq.prospecting' } : { eq: pool };
}
