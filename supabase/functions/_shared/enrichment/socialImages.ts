/**
 * Facebook / Instagram enrichment — CONTACTS (email) + PHOTOS for the pool.
 *
 * Actor ids + INPUT shapes verified against Apify's public API (not guessed):
 *  - apify~facebook-pages-scraper   input: startUrls:[{url}]   → page details incl EMAIL/website
 *  - premiumscraper~facebook-photos-scraper  input: facebook_urls:[{url}], photos_count → photos
 *      (facebook_urls uses editor 'requestListSources' → ARRAY OF OBJECTS, verified
 *       against the actor's public build schema; bare strings are rejected HTTP 400)
 *  - apify~instagram-scraper        input: directUrls:[url], resultsType:'posts', resultsLimit → posts
 *
 * OUTPUT field names vary per actor, so we DEEP-SCAN each item for image URLs and
 * emails rather than hardcode keys (this is what bit us before). Everything is
 * GRACEFUL: any error → [] / null, so the enrich never breaks and falls back to
 * the Maps-only pool. FB/IG image URLs are expiring CDN links — only SELECTED
 * images get re-hosted later (2B/2C), not the whole pool.
 */
import { runApifyActor } from "./apify.ts";

const FB_PAGES_ACTOR = "apify~facebook-pages-scraper"; // email/website/details
const FB_PHOTOS_ACTOR = "premiumscraper~facebook-photos-scraper"; // page photo gallery
const IG_SCRAPER_ACTOR = "apify~instagram-scraper"; // posts → images

const IMG_RE = /^https?:\/\/[^\s"']+(\.(jpe?g|png|webp|gif)|fbcdn\.net|cdninstagram\.com|scontent)[^\s"']*/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Walk an arbitrary JSON value, collecting strings that look like image URLs. */
function deepImageUrls(node: unknown, out: Set<string>, depth = 0): void {
  if (depth > 6 || out.size > 200) return;
  if (typeof node === "string") {
    if (IMG_RE.test(node)) out.add(node);
  } else if (Array.isArray(node)) {
    for (const v of node) deepImageUrls(v, out, depth + 1);
  } else if (node && typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) deepImageUrls(v, out, depth + 1);
  }
}

/** Find the first plausible email anywhere in an item (prefers an `email` field). */
function deepEmail(node: unknown, depth = 0): string | null {
  if (depth > 6) return null;
  if (typeof node === "string") return EMAIL_RE.test(node.trim()) ? node.trim() : null;
  if (Array.isArray(node)) {
    for (const v of node) { const e = deepEmail(v, depth + 1); if (e) return e; }
  } else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    // Prefer explicit email-ish keys first.
    for (const k of Object.keys(o)) {
      if (/email/i.test(k) && typeof o[k] === "string" && EMAIL_RE.test((o[k] as string).trim())) return (o[k] as string).trim();
    }
    for (const v of Object.values(o)) { const e = deepEmail(v, depth + 1); if (e) return e; }
  }
  return null;
}

/** Facebook page contacts (email + website) via facebook-pages-scraper. */
export async function fetchFacebookContacts(
  pageUrl: string,
  opts: { token: string; timeoutMs?: number },
): Promise<{ email: string | null; website: string | null }> {
  if (!pageUrl) return { email: null, website: null };
  try {
    const { items } = await runApifyActor(
      FB_PAGES_ACTOR,
      { startUrls: [{ url: pageUrl }] },
      { token: opts.token, timeoutMs: opts.timeoutMs ?? 90_000 },
    );
    const item = (items[0] ?? {}) as Record<string, unknown>;
    const email = deepEmail(item);
    const website = typeof item.website === "string" ? item.website : null;
    return { email, website };
  } catch (e) {
    console.error(`[socialImages] FB pages error: ${(e as Error).message}`);
    return { email: null, website: null };
  }
}

/** Facebook page photos via facebook-photos-scraper (verified input keys). */
export async function fetchFacebookPhotos(
  pageUrl: string,
  opts: { token: string; max?: number; timeoutMs?: number },
): Promise<string[]> {
  if (!pageUrl) return [];
  try {
    const { items } = await runApifyActor(
      FB_PHOTOS_ACTOR,
      // facebook_urls uses editor 'requestListSources' → ARRAY OF OBJECTS [{url}],
      // not bare strings (verified against the actor's public build schema; bare
      // strings are rejected HTTP 400 "do not contain valid URLs").
      { facebook_urls: [{ url: pageUrl }], photos_count: opts.max ?? 20 },
      { token: opts.token, timeoutMs: opts.timeoutMs ?? 90_000 },
    );
    const out = new Set<string>();
    deepImageUrls(items, out);
    return Array.from(out).slice(0, opts.max ?? 20);
  } catch (e) {
    console.error(`[socialImages] FB photos error: ${(e as Error).message}`);
    return [];
  }
}

/** Instagram profile/post images via instagram-scraper (verified input keys). */
export async function fetchInstagramPhotos(
  profileUrl: string,
  opts: { token: string; max?: number; timeoutMs?: number },
): Promise<string[]> {
  if (!profileUrl) return [];
  try {
    const { items } = await runApifyActor(
      IG_SCRAPER_ACTOR,
      { directUrls: [profileUrl], resultsType: "posts", resultsLimit: opts.max ?? 20 },
      { token: opts.token, timeoutMs: opts.timeoutMs ?? 90_000 },
    );
    const out = new Set<string>();
    deepImageUrls(items, out);
    return Array.from(out).slice(0, opts.max ?? 20);
  } catch (e) {
    console.error(`[socialImages] IG error: ${(e as Error).message}`);
    return [];
  }
}
