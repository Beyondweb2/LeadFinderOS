/**
 * Re-host a remote image into the public `barber-site-images` bucket.
 *
 * Facebook/Instagram CDN URLs are signed and EXPIRE, so a chosen image must be
 * downloaded and served from our own bucket — never hotlinked. Used by the manual
 * image board's re-host endpoint (rehost-image): when the operator places a pooled
 * photo into a slot and saves, we copy it into the bucket and store that URL.
 *
 * The upload runs through whatever supabase client is passed in — pass a USER-scoped
 * client so the bucket's RLS (admins anywhere / owners under their own "<siteId>/"
 * folder) authorises it. `pathPrefix` MUST start with the site id so owner RLS
 * matches (e.g. "<siteId>/hero-<ts>"); the file extension is appended from the
 * downloaded content-type. Returns the public URL, or null on any failure.
 */

import type { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type AnyClient = ReturnType<typeof createClient>;

const BUCKET = "barber-site-images";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function rehostToBucket(
  url: string,
  opts: { client: AnyClient; pathPrefix: string; timeoutMs?: number },
): Promise<string | null> {
  if (!url || !opts.pathPrefix) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!res.ok) {
      console.error(`[rehost] download HTTP ${res.status} for ${url.slice(0, 120)}`);
      return null;
    }
    const contentType = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim().toLowerCase();
    const ext = EXT_BY_TYPE[contentType] ?? "jpg";
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.length) return null;

    const path = `${opts.pathPrefix}.${ext}`;
    const { error: upErr } = await opts.client.storage.from(BUCKET).upload(path, bytes, {
      contentType,
      upsert: true,
    });
    if (upErr) {
      console.error(`[rehost] upload error (${path}): ${upErr.message}`);
      return null;
    }
    const { data } = opts.client.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl ?? null;
  } catch (e) {
    console.error(`[rehost] error: ${(e as Error).message}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
