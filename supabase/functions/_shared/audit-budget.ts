// audit-budget — the I/O half of the audit budget pools (src/lib/auditBudget.ts holds the rules).
//
// Two reads, both cheap and both safe to call on every queue tick:
//   latestApifyUsage — the newest apify_account_usage snapshot (written every 15 min by the queue);
//   budgetState      — each pool's rolling-24h spend against its ceiling, plus the Apify reading, so
//                      Paid Clients / the baseline screen can SHOW whether client measurement has room.
//
// ⛔ PRIMITIVES, NOT A PRODUCT. Session 7's sales "Check before calling" reuses budgetDecision +
// budgetState to refuse a rep's batch with a plain sentence; nothing here knows about reps.
import { APIFY_RESERVE_PCT, BUDGET_POOLS, POOL_DAILY_CAP_USD, apifyUsedPct, budgetDecision, type ApifyUsage, type BudgetDecision, type BudgetPool } from "../../../src/lib/auditBudget.ts";
import { rollingSpendUsd } from "./enrichment/runner.ts";

// deno-lint-ignore no-explicit-any
type Client = any;

/** The newest Apify snapshot, or null when none can be read (a missing reading never refuses). */
export async function latestApifyUsage(service: Client): Promise<(ApifyUsage & { capturedAt: string | null; cycleEnd: string | null }) | null> {
  try {
    const { data, error } = await service.from("apify_account_usage")
      .select("monthly_usage_usd, max_monthly_usage_usd, captured_at, cycle_end")
      .order("captured_at", { ascending: false }).limit(1).maybeSingle();
    if (error || !data) return null;
    const r = data as { monthly_usage_usd: number | string | null; max_monthly_usage_usd: number | string | null; captured_at: string | null; cycle_end: string | null };
    return {
      usedUsd: r.monthly_usage_usd == null ? null : Number(r.monthly_usage_usd),
      capUsd: r.max_monthly_usage_usd == null ? null : Number(r.max_monthly_usage_usd),
      capturedAt: r.captured_at, cycleEnd: r.cycle_end,
    };
  } catch {
    return null;
  }
}

export interface PoolState { pool: BudgetPool; spentUsd: number | null; capUsd: number; pooledLedger: boolean; decision: BudgetDecision | null; apifyReservePct: number }
export interface BudgetState { pools: PoolState[]; apify: { usedUsd: number | null; capUsd: number | null; pct: number | null; capturedAt: string | null; cycleEnd: string | null } | null }

/** Every pool's state for the data account (the owner of every audit). Read only. */
export async function budgetState(service: Client, ownerUserId: string, estCostUsd: number): Promise<BudgetState> {
  const apify = await latestApifyUsage(service);
  const pools: PoolState[] = [];
  for (const pool of BUDGET_POOLS) {
    const read = ownerUserId ? await rollingSpendUsd(service, ownerUserId, pool).catch(() => null) : null;
    pools.push({
      pool, spentUsd: read ? Math.round(read.spent * 100) / 100 : null, capUsd: POOL_DAILY_CAP_USD[pool],
      pooledLedger: !!read?.pooled, apifyReservePct: APIFY_RESERVE_PCT[pool],
      decision: read ? budgetDecision({ pool, poolSpentUsd: read.spent, estCostUsd, apify }) : null,
    });
  }
  return { pools, apify: apify ? { usedUsd: apify.usedUsd, capUsd: apify.capUsd, pct: apifyUsedPct(apify), capturedAt: apify.capturedAt, cycleEnd: apify.cycleEnd } : null };
}
