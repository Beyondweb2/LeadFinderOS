/**
 * Re-host a chosen image into Supabase Storage (sub-phase 2B).
 *
 * Facebook/Instagram CDN URLs are signed and EXPIRE, so we must never hotlink a
 * chosen social image — we download it and serve our own copy from the public
 * `barber-site-images` bucket (already exists: public read, service-role writes).
 * Maps URLs are re-hosted too for the same robustness.
 *
 * Honesty/robustness: if a download or upload fails, return null so the caller
 * DROPS that pick (better an unset slot → stock than a link that 404s later).
 */

import type { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ServiceClient = ReturnType<typeof createClient>;

const BUCKET = "barber-site-images";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Download `url` and upload it to barber-site-images/generated/<leadId>/<slot>.<ext>.
 * Returns the public URL, or null on any failure (caller drops the pick).
 */
export async function rehostImage(
  url: string,
  opts: { service: ServiceClient; leadId: string; slot: string; timeoutMs?: number },
): Promise<string | null> {
  if (!url) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      console.error(`[rehost] download ${opts.slot} HTTP ${res.status}`);
      return null;
    }
    const contentType = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim().toLowerCase();
    const ext = EXT_BY_TYPE[contentType] ?? "jpg";
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.length) return null;

    const path = `generated/${opts.leadId}/${opts.slot}.${ext}`;
    const { error: upErr } = await opts.service.storage.from(BUCKET).upload(path, bytes, {
      contentType,
      upsert: true, // overwrite on regenerate
    });
    if (upErr) {
      console.error(`[rehost] upload ${opts.slot} error: ${upErr.message}`);
      return null;
    }
    const { data } = opts.service.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl ?? null;
  } catch (e) {
    console.error(`[rehost] ${opts.slot} error: ${(e as Error).message}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
