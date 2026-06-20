/**
 * Enrichment runner — the shared plumbing every paid ENRICH source goes through:
 * cache → daily cost cap → run → cache write + usage + api_usage_log.
 *
 * Reuses the existing tables: enrichment_cache (result JSONB + expires_at),
 * enrichment_usage (24h rolling cap), api_usage_log (cost audit). Discovery
 * (search) does NOT go through here — it stays on the cheap search_cache path so
 * search stays cheap and uncapped by the per-lead enrichment budget.
 */
// deno-lint-ignore no-explicit-any
type ServiceClient = any;

/** Rolling-24h per-user cap, shared by every paid enrichment source. */
export const DAILY_CAP_USD = 2.0;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface RunEnrichArgs<T> {
  service: ServiceClient;
  userId: string | null;
  /** enrichment_cache.enrichment_type, e.g. 'maps_enrich'. */
  type: string;
  /** enrichment_cache.cache_key, e.g. `${placeId}:maps_enrich`. */
  cacheKey: string;
  /** Estimated cost for the pre-call cap check + logging. */
  estCostUsd: number;
  /** The actual source call; returns the result payload + its real cost. */
  run: () => Promise<{ result: T; costUsd: number }>;
  capUsd?: number;
}

export interface RunEnrichOutcome<T> {
  result: T | null;
  cached: boolean;
  costUsd: number;
  capReached?: boolean;
  spentUsd?: number;
}

export async function runEnrichSource<T>(args: RunEnrichArgs<T>): Promise<RunEnrichOutcome<T>> {
  const { service, userId, type, cacheKey, estCostUsd, run } = args;
  const capUsd = args.capUsd ?? DAILY_CAP_USD;

  // 1) Cache (fresh?) → free hit.
  try {
    const { data: cached } = await service
      .from("enrichment_cache")
      .select("result, expires_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (cached && (!cached.expires_at || new Date(cached.expires_at) > new Date())) {
      return { result: cached.result as T, cached: true, costUsd: 0 };
    }
  } catch (_e) { /* cache is best-effort */ }

  // 2) Daily cap (rolling 24h sum of enrichment_usage). Block BEFORE spending.
  if (userId) {
    try {
      const since = new Date(Date.now() - 86_400_000).toISOString();
      const { data: rows } = await service
        .from("enrichment_usage")
        .select("cost_usd")
        .eq("user_id", userId)
        .gte("created_at", since);
      const spent = (rows ?? []).reduce(
        (s: number, r: { cost_usd: number | null }) => s + Number(r.cost_usd ?? 0),
        0,
      );
      if (spent + estCostUsd > capUsd) {
        return { result: null, cached: false, costUsd: 0, capReached: true, spentUsd: spent };
      }
    } catch (_e) { /* if the cap check fails, fail safe by proceeding once */ }
  }

  // 3) Run the source.
  const { result, costUsd } = await run();

  // 4) Persist cache + usage + audit (best-effort; never block the result).
  const expires = new Date(Date.now() + CACHE_TTL_MS).toISOString();
  try {
    await service.from("enrichment_cache").upsert(
      { cache_key: cacheKey, enrichment_type: type, result, expires_at: expires },
      { onConflict: "cache_key" },
    );
  } catch (_e) { /* ignore */ }
  if (userId) {
    try {
      await service.from("enrichment_usage").insert({
        user_id: userId,
        enrichment_type: type,
        cost_usd: costUsd,
      });
    } catch (_e) { /* ignore */ }
  }
  try {
    await service.from("api_usage_log").insert({
      user_id: userId,
      function_name: "enrichment",
      api_type: `apify_${type}`,
      calls_made: 1,
      cache_hit: false,
      estimated_cost_usd: costUsd,
      trigger_source: "enrichment",
    });
  } catch (_e) { /* ignore */ }

  return { result, cached: false, costUsd };
}
