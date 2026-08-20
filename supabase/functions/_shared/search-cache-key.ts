/* SEARCH CACHE KEY — the ONE definition, shared by search-leads (which writes the cache) and
 * market-view (which reads it).
 *
 * WHY IT LIVES HERE. Both functions have to agree on the hash byte for byte or the market view
 * silently reports "no lead pool" for a town that was searched five minutes ago — a false negative
 * with no error anywhere. Extracted VERBATIM out of search-leads rather than copied, because a
 * second copy is a drift bug waiting for the next time normalizeKeyword changes.
 *
 * search-leads is the only writer. market-view never writes the cache and never calls Google.
 */

/** Keyword normalisation used in the cache identity: lowercase, collapse whitespace, and drop a
 *  simple trailing plural so "plumbers" and "plumber" share one cache entry.
 *  ⚠️ This is NOT the same function as buildPlaybook's norm(). norm() maps a trade to a canonical
 *  bucket for the evidence fold ("plumbers" → "plumber", "locksmiths" → "locksmiths" unchanged);
 *  this one singularises anything. A caller that has a norm()'d trade CANNOT assume it equals the
 *  keyword that was searched — market-view resolves the real keyword from search_history instead
 *  of guessing. */
export function normalizeKeyword(kw: string): string {
  let w = kw.toLowerCase().trim();
  // Strip common English plural/gerund suffixes for cache grouping
  if (w.endsWith('ies')) w = w.slice(0, -3) + 'y';       // e.g. bakeries → bakery
  else if (w.endsWith('ses') || w.endsWith('xes') || w.endsWith('zes') || w.endsWith('ches') || w.endsWith('shes')) w = w.slice(0, -2); // e.g. churches → church
  else if (w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1); // e.g. plumbers → plumber
  return w;
}

/* townOnly is PART OF THE CACHE IDENTITY. Without it a "this town only" search and a radius
   search with the same keyword + location + radius hash to the same key and serve each other's
   results out of search_cache — the town-filtered run would silently hand back out-of-town leads,
   which is the exact failure the mode exists to prevent. Appended ONLY when true, so every
   existing radius search keeps its current key and its warm cache. */
export async function generateCacheKey(
  keyword: string,
  location: string,
  radius: number,
  townOnly = false,
): Promise<string> {
  const normKeyword = normalizeKeyword(keyword);
  const input = `v4-norm|${normKeyword}|${location.toLowerCase().trim()}|${radius}${townOnly ? '|townonly' : ''}`;
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The radius every market-scoped search uses. MarketPanel's MARKET_SEARCH_RADIUS_M and the
 *  Coverage row's literal are both 50_000; this is the same number, named once on the read side. */
export const MARKET_POOL_RADIUS_M = 50_000;

/**
 * The cache keys a market pool WOULD have, derived straight from the trade and town.
 *
 * ⛔ WHY THIS EXISTS. A pool is normally located through a `search_history` row, and until
 * 2026-08-20 `search-leads` never wrote one — only the browser did. So every caller that invoked the
 * function directly (the Coverage row's Find-leads, and anything future) filled `search_cache` and
 * left nothing pointing at it: 7 pools, 15-23 businesses each, all paid for and all invisible.
 * search-leads writes the history row itself now, but that does not retrieve the pools already
 * orphaned — this does, for free, with no new search.
 *
 * ⚠️ IT IS A FALLBACK, NEVER THE PRIMARY. History stays first because the keyword actually SEARCHED
 * can differ from the trade (normalizeKeyword singularises anything; the trade norm() does not), and
 * the history row is the only record of what was really asked. This reconstructs the key for the
 * common case where they agree, which is every market-scoped search the app issues today.
 * townOnly first, then the radius key — the same order market-view already tried.
 */
export async function directPoolCacheKeys(
  trade: string,
  town: string,
  radius: number = MARKET_POOL_RADIUS_M,
): Promise<string[]> {
  if (!trade.trim() || !town.trim()) return [];
  return [
    await generateCacheKey(trade, town, radius, true),
    await generateCacheKey(trade, town, radius, false),
  ];
}
