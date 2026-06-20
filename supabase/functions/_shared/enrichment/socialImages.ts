/**
 * Facebook / Instagram PHOTO pooling for the image picker.
 *
 * FB pages usually have more/better photos than Maps. Given the lead's FB page URL
 * and/or IG profile URL (from contact enrich), pull candidate image URLs.
 *
 * GRACEFUL BY DESIGN: any error (wrong actor id, private profile, rate limit)
 * returns [] so it never breaks the enrich — the pool just gets fewer images.
 * NOTE: the exact actor ids + output shapes below are to be CONFIRMED on the 2A
 * live test against the user's Apify account; they're isolated here so fixing an
 * id is a one-line change. Returned FB/IG URLs are CDN links that EXPIRE — only
 * SELECTED images get re-hosted (sub-phase 2B/2C), not the whole pool.
 */
import { runApifyActor } from "./apify.ts";

const FB_PHOTOS_ACTOR = "apify~facebook-photos-scraper"; // confirm on live test
const IG_SCRAPER_ACTOR = "apify~instagram-scraper"; // confirm on live test

function collectUrls(items: unknown[], keys: string[]): string[] {
  const out: string[] = [];
  for (const it of items) {
    const o = (it ?? {}) as Record<string, unknown>;
    for (const k of keys) {
      const v = o[k];
      if (typeof v === "string" && v.startsWith("http")) out.push(v);
      else if (Array.isArray(v)) {
        for (const u of v) if (typeof u === "string" && u.startsWith("http")) out.push(u);
      }
    }
  }
  return Array.from(new Set(out));
}

export async function fetchFacebookPhotos(
  pageUrl: string,
  opts: { token: string; max?: number; timeoutMs?: number },
): Promise<string[]> {
  if (!pageUrl) return [];
  try {
    const { items } = await runApifyActor(
      FB_PHOTOS_ACTOR,
      { startUrls: [{ url: pageUrl }], maxPhotos: opts.max ?? 20 },
      { token: opts.token, timeoutMs: opts.timeoutMs ?? 90_000 },
    );
    return collectUrls(items, ["imageUrl", "image", "url", "photoUrl"]).slice(0, opts.max ?? 20);
  } catch (_e) {
    return [];
  }
}

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
    return collectUrls(items, ["displayUrl", "imageUrl", "images"]).slice(0, opts.max ?? 20);
  } catch (_e) {
    return [];
  }
}
