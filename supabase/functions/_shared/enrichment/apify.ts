/**
 * Low-level Apify client + Google-Maps (compass) actor mapping.
 *
 * Part of the pluggable enrichment pipeline (see ./sources.ts). This file knows
 * ONLY how to call an Apify actor and normalise the compass Google-Maps output —
 * it has no Supabase/cache/cap concerns (those live in ./runner.ts).
 *
 * Token is read by callers from the APIFY_TOKEN secret and passed in; it is sent
 * as an Authorization: Bearer header and NEVER placed in the URL or hardcoded.
 */

/** compass/crawler-google-places — actor id uses `~` in the API path. */
export const MAPS_ACTOR_ID = "compass~crawler-google-places";

export interface ReviewItem {
  text: string;
  author: string;
  rating?: number;
  date?: string;
}

/** A normalised place — the common shape every caller maps onto our schemas. */
export interface NormalizedPlace {
  placeId: string;
  title: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  countryCode?: string;
  rating?: number;
  reviewCount?: number;
  category?: string;
  categories?: string[];
  googleMapsUrl?: string;
  openingHours?: { day: string; open: string }[];
  reviews?: ReviewItem[];
  imageUrls?: string[];
  emails?: string[];
  facebook?: string;
  instagram?: string;
  /** The Google "Web results" section (only when includeWebResults is on). Each
   *  entry: the result's link + a lowercased text blob (title/snippet/url) used
   *  for the location-match guard before any web-found URL is trusted. */
  webResults?: { url: string; text: string }[];
}

/**
 * Run an Apify actor synchronously and return its dataset items.
 * Uses run-sync-get-dataset-items (no polling) — fine for our small batches
 * (≤~50 places discovery; 1 place deep-enrich). Aborts after timeoutMs so a slow
 * run can't hang the edge function. Throws on non-2xx (caller decides fallback).
 */
export async function runApifyActor(
  actorId: string,
  input: Record<string, unknown>,
  opts: {
    token: string;
    timeoutMs?: number;
    /** Opt-in bounded retry (AT MOST one extra attempt). Default: no retry.
     *  on429: retry on HTTP 429 or 5xx (fast failures — safe on any path).
     *  onAbort: retry on timeout — only safe OFF the synchronous critical path
     *  (a second full-timeout attempt would stack toward the original 504). */
    retry?: { on429?: boolean; onAbort?: boolean };
  },
): Promise<{ items: unknown[]; ms: number }> {
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items`;
  const BUDGET_MS = opts.timeoutMs ?? 90_000;
  const callStart = Date.now(); // whole-call clock — a retry must fit INSIDE BUDGET_MS, never extend it

  // A single attempt, bounded by the REMAINING budget passed in. Throws { retryable } markers so the outer loop can decide.
  const attempt = async (attemptTimeoutMs: number): Promise<{ items: unknown[]; ms: number }> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), attemptTimeoutMs);
    const startedAt = Date.now();
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.token}`,
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      const ms = Date.now() - startedAt;
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        const err = new Error(`Apify ${actorId} HTTP ${res.status}: ${txt.slice(0, 300)}`);
        // Mark 429 / 5xx as retryable-on-429 for the outer loop.
        (err as { retryableHttp?: boolean }).retryableHttp = res.status === 429 || res.status >= 500;
        throw err;
      }
      const data = await res.json();
      return { items: Array.isArray(data) ? data : [], ms };
    } finally {
      clearTimeout(timeout);
    }
  };

  const RETRY_DELAY_MS = 1500;
  try {
    return await attempt(BUDGET_MS);
  } catch (e) {
    const isAbort = (e as Error)?.name === "AbortError";
    const isRetryableHttp = !!(e as { retryableHttp?: boolean })?.retryableHttp;
    const shouldRetry =
      (isAbort && opts.retry?.onAbort) || (isRetryableHttp && opts.retry?.on429);
    if (!shouldRetry) throw e;
    // Bounded to the SAME budget: only retry if the pause PLUS a real second attempt still fit
    // inside BUDGET_MS — the retry must not extend the total time. (A timed-out first attempt has
    // consumed ~all the budget, so onAbort effectively won't re-stack a second full attempt.)
    const remaining = BUDGET_MS - (Date.now() - callStart) - RETRY_DELAY_MS;
    if (remaining <= 0) {
      console.warn(`[apify] ${actorId} ${isAbort ? "timed out" : "failed (retryable HTTP)"} — no budget left to retry within ${BUDGET_MS}ms; returning error`);
      throw e;
    }
    console.warn(
      `[apify] ${actorId} ${isAbort ? "timed out" : "failed (retryable HTTP)"} — retrying once in ${RETRY_DELAY_MS}ms within the remaining ${remaining}ms`,
    );
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    return await attempt(remaining);
  }
}

/* ── Async actor API (start / poll / fetch) ───────────────────────────────────
 * Alternative to runApifyActor's blocking run-sync: START a run (returns in ~1s), then
 * POLL its status on later ticks, then FETCH its dataset once SUCCEEDED. This decouples the
 * actor's multi-minute runtime from the edge function's ~150s wall-clock, so a slow scrape
 * can't abort mid-run. Every call here is a SHORT control-plane HTTP request — it NEVER
 * blocks on the scrape. runApifyActor (run-sync, above) is deliberately left untouched so
 * the SEO / maps / social callers are byte-for-byte unaffected. */
export type ApifyRunStatus =
  | "READY" | "RUNNING" | "SUCCEEDED" | "FAILED" | "ABORTED" | "TIMED-OUT" | string;

/** Short-timeout JSON fetch for the async control-plane calls. Aborts after timeoutMs. */
async function apifyFetch(url: string, init: RequestInit, timeoutMs: number): Promise<{ res: Response; body: unknown }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const body = await res.json().catch(() => null);
    return { res, body };
  } finally {
    clearTimeout(t);
  }
}

/** START an actor run (async). Returns quickly (~1s) with the runId to poll later.
 *  Throws on non-2xx / missing id so the caller can bump attempts and retry. */
export async function startApifyRun(
  actorId: string,
  input: Record<string, unknown>,
  token: string,
  timeoutMs = 20_000,
): Promise<{ runId: string; datasetId: string | null; status: ApifyRunStatus }> {
  const { res, body } = await apifyFetch(
    `https://api.apify.com/v2/acts/${actorId}/runs`,
    { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(input) },
    timeoutMs,
  );
  if (!res.ok) throw new Error(`Apify start ${actorId} HTTP ${res.status}`);
  const data = ((body as { data?: Record<string, unknown> } | null)?.data ?? {}) as Record<string, unknown>;
  const runId = typeof data.id === "string" ? data.id : "";
  if (!runId) throw new Error(`Apify start ${actorId}: no run id in response`);
  return {
    runId,
    datasetId: typeof data.defaultDatasetId === "string" ? data.defaultDatasetId : null,
    status: (typeof data.status === "string" ? data.status : "READY") as ApifyRunStatus,
  };
}

/** POLL an actor run's status (async). Short call. Throws on non-2xx. */
export async function getApifyRun(
  runId: string,
  token: string,
  timeoutMs = 15_000,
): Promise<{ status: ApifyRunStatus; datasetId: string | null; runTimeSecs: number | null }> {
  const { res, body } = await apifyFetch(
    `https://api.apify.com/v2/actor-runs/${runId}`,
    { headers: { Authorization: `Bearer ${token}` } },
    timeoutMs,
  );
  if (!res.ok) throw new Error(`Apify get-run ${runId} HTTP ${res.status}`);
  const data = ((body as { data?: Record<string, unknown> } | null)?.data ?? {}) as Record<string, unknown>;
  const stats = (data.stats as Record<string, unknown> | undefined) ?? {};
  return {
    status: (typeof data.status === "string" ? data.status : "") as ApifyRunStatus,
    datasetId: typeof data.defaultDatasetId === "string" ? data.defaultDatasetId : null,
    runTimeSecs: typeof stats.runTimeSecs === "number" ? stats.runTimeSecs : null,
  };
}

/** FETCH a finished run's dataset items (async). SAME array shape run-sync returns today. */
export async function getApifyRunItems(runId: string, token: string, timeoutMs = 20_000): Promise<unknown[]> {
  const { res, body } = await apifyFetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items`,
    { headers: { Authorization: `Bearer ${token}` } },
    timeoutMs,
  );
  if (!res.ok) throw new Error(`Apify get-items ${runId} HTTP ${res.status}`);
  return Array.isArray(body) ? body : [];
}

/** Best-effort ABORT of a run (stop billing on a stuck run). Never throws. */
export async function abortApifyRun(runId: string, token: string, timeoutMs = 15_000): Promise<void> {
  try {
    await apifyFetch(
      `https://api.apify.com/v2/actor-runs/${runId}/abort`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      timeoutMs,
    );
  } catch { /* best-effort — the poll guard already marked the row failed */ }
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" && !Number.isNaN(v) ? v : undefined;
}

/** Map one compass dataset item to NormalizedPlace (defensive — fields vary). */
export function mapCompassPlace(raw: unknown): NormalizedPlace {
  const p = (raw ?? {}) as Record<string, unknown>;

  const categories = Array.isArray(p.categories)
    ? (p.categories.filter((c) => typeof c === "string") as string[])
    : undefined;

  // reviews[] = { text, name, stars, publishedAtDate, ... }
  const reviews: ReviewItem[] = Array.isArray(p.reviews)
    ? (p.reviews as Record<string, unknown>[])
        .map((r) => ({
          text: str(r.text) ?? "",
          author: str(r.name) ?? "",
          rating: num(r.stars),
          date: str(r.publishedAtDate) ?? str(r.publishAt),
        }))
        .filter((r) => r.text && r.author)
    : [];

  const imageUrls = Array.isArray(p.imageUrls)
    ? (p.imageUrls.filter((u) => typeof u === "string") as string[])
    : [];

  const emails = Array.isArray(p.emails)
    ? (p.emails.filter((e) => typeof e === "string") as string[])
    : [];

  // Opening hours: compass openingHours = [{ day, hours }]
  const openingHours = Array.isArray(p.openingHours)
    ? (p.openingHours as Record<string, unknown>[])
        .map((h) => ({ day: str(h.day) ?? "", open: str(h.hours) ?? "" }))
        .filter((h) => h.day)
    : undefined;

  // Social profiles can appear as arrays under these keys when scraped.
  const firstOf = (k: string): string | undefined => {
    const v = p[k];
    if (Array.isArray(v)) return v.find((x) => typeof x === "string") as string | undefined;
    return str(v);
  };

  // "Web results" (includeWebResults). Field names within each entry vary, so we
  // defensively pull the first http(s) URL as the link and join all strings into a
  // lowercased text blob (title/snippet/url) for the location-match guard.
  //
  // Google returns these as DISPLAY/breadcrumb URLs, e.g.
  //   "https://www.instagram.com › waas_barber"
  // i.e. " › " (U+203A, also "»") separators + spaces instead of "/". normalizeWebUrl
  // rebuilds a real URL ("https://www.instagram.com/waas_barber") so facebook.com/ /
  // instagram.com/ detection works. The raw strings still feed `text` for the guard.
  const normalizeWebUrl = (raw: string): string =>
    raw
      .trim()
      .replace(/\s*[›»]\s*/g, "/") // breadcrumb separators → path slashes (handles nested)
      .replace(/\s+/g, ""); // strip any remaining stray spaces (URLs have none)
  const webResults = Array.isArray(p.webResults)
    ? (p.webResults as unknown[])
        .map((w) => {
          const strs: string[] = [];
          let url = "";
          const walk = (n: unknown) => {
            if (typeof n === "string") {
              strs.push(n);
              if (!url && /^https?:\/\//i.test(n)) url = n;
            } else if (Array.isArray(n)) n.forEach(walk);
            else if (n && typeof n === "object") Object.values(n as Record<string, unknown>).forEach(walk);
          };
          walk(w);
          return { url: normalizeWebUrl(url), text: strs.join(" ").toLowerCase() };
        })
        .filter((w) => w.url)
    : undefined;

  return {
    placeId: str(p.placeId) ?? str(p.id) ?? "",
    title: str(p.title) ?? str(p.name) ?? "",
    phone: str(p.phone) ?? str(p.phoneUnformatted),
    website: str(p.website),
    address: str(p.address),
    city: str(p.city),
    postalCode: str(p.postalCode),
    countryCode: str(p.countryCode),
    rating: num(p.totalScore),
    reviewCount: num(p.reviewsCount),
    category: str(p.categoryName),
    categories,
    googleMapsUrl: str(p.url),
    openingHours,
    reviews: reviews.length ? reviews : undefined,
    imageUrls: imageUrls.length ? imageUrls : undefined,
    emails: emails.length ? emails : undefined,
    facebook: firstOf("facebooks") ?? str(p.facebook),
    instagram: firstOf("instagrams") ?? str(p.instagram),
    webResults: webResults && webResults.length ? webResults : undefined,
  };
}
