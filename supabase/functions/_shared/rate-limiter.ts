/**
 * In-memory rate limiter for edge functions.
 * Uses a simple sliding window approach.
 * 
 * Note: This is per-isolate and resets on cold starts.
 * For production at scale, consider Redis-backed rate limiting.
 */

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

// In-memory store (per isolate)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up old entries periodically (every 5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupOldEntries(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  
  lastCleanup = now;
  const cutoff = now - windowMs * 2;
  
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.windowStart < cutoff) {
      rateLimitStore.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number; // milliseconds until window reset
}

/**
 * Check and update rate limit for a given key.
 * 
 * @param key - Unique identifier (e.g., userId or IP)
 * @param limit - Maximum requests allowed in the window
 * @param windowMs - Time window in milliseconds (default: 60000 = 1 minute)
 * @returns RateLimitResult with allowed status and remaining requests
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number = 60000
): RateLimitResult {
  const now = Date.now();
  
  // Cleanup old entries occasionally
  cleanupOldEntries(windowMs);
  
  const entry = rateLimitStore.get(key);
  
  // No existing entry or window expired - create new window
  if (!entry || now - entry.windowStart >= windowMs) {
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: limit - 1,
      resetIn: windowMs,
    };
  }
  
  // Within current window
  const resetIn = windowMs - (now - entry.windowStart);
  
  if (entry.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetIn,
    };
  }
  
  // Increment count
  entry.count++;
  
  return {
    allowed: true,
    remaining: limit - entry.count,
    resetIn,
  };
}

/**
 * Create rate limit response headers
 */
export function rateLimitHeaders(result: RateLimitResult, limit: number): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetIn / 1000)),
  };
}
