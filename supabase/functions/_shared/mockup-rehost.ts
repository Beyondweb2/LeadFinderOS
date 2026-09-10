/* ════════════════════════════════════════════════════════════════════════════════════════════════
   RE-HOST A PLACED IMAGE INTO THE PRIVATE mockup-assets BUCKET.

   Recovered from the barber product (commit 961be211's rehostToBucket) with two changes, both of
   which Paul decided:
     1. THE PRIVATE BUCKET, not the public barber one. Step 1 proved barber-site-images serves a
        DRAFT row's images to anyone with the URL — there are already 2 such objects live. Mockups
        must never be publicly readable, so they go to mockup-assets (public = false, admin-only
        RLS) and are read back with SIGNED urls.
     2. THE CLIENT IS A PARAMETER, keeping the 961be211 shape rather than the earlier
        service-role-only one, so the upload can run under the caller's own RLS.

   🔴 WHY RE-HOSTING IS NOT OPTIONAL, AND IT IS NOT MAINLY ABOUT DECAY.
     a) Measured: 12 of 12 sampled URLs from the cached Maps/Facebook/Instagram pool return HTTP
        403. Those CDN URLs are signed and expire; own-site URLs mostly do not (93 of 96 alive).
     b) ⛔ AND THIS IS THE DECISIVE ONE: the before/after PNG is composited in the BROWSER on a
        canvas, and a canvas is TAINTED by a cross-origin image with no CORS headers — after which
        toBlob() throws and there is no download. Measured: Supabase storage returns
        `access-control-allow-origin: *`; the Maps CDN returns 403 with no CORS at all. So every
        image on that canvas must come from our own storage. Without re-hosting there is no PNG,
        and the PNG is the product.

   ⛔ THE STORED VALUE IS A PATH, NEVER A SIGNED URL. A signed URL expires (~7 days), so persisting
   one would give a mockup that silently loses its images a week after it was built. The path is
   permanent; the signature is minted per read.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export const MOCKUP_BUCKET = "mockup-assets";

/** How long a display URL lives. Long enough for a picker session and a screenshot run. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

/** Bucket config allows these; anything else is refused rather than uploaded as octet-stream. */
const ALLOWED = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

/** 10MB — the bucket's own file_size_limit. Checked here so the failure names the reason. */
const MAX_BYTES = 10 * 1024 * 1024;

export interface RehostResult {
  ok: boolean;
  /** Storage path (permanent). Empty when !ok. */
  path: string;
  contentType?: string;
  bytes?: number;
  detail?: string;
}

/**
 * Download `url` and upload it to `mockup-assets/<siteId>/<slot>.<ext>`.
 *
 * ⚠️ Returns a reason rather than throwing: a failed re-host must leave the slot UNSET so the
 * template's `{{#if img slot}}` collapses it, rather than storing a path that will 404 later.
 * An unset slot is honest; a broken image is not.
 */
export async function rehostToMockupBucket(
  url: string,
  // deno-lint-ignore no-explicit-any
  opts: { client: any; siteId: string; slot: string; timeoutMs?: number },
): Promise<RehostResult> {
  if (!url) return { ok: false, path: "", detail: "no url" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 25_000);
  try {
    /* referrerPolicy is not available on Deno fetch, but a browser UA is what the Facebook and
       Instagram CDNs check first; Maps is indifferent. */
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadFinder/1.0)" },
    });
    if (!res.ok) return { ok: false, path: "", detail: `download HTTP ${res.status}` };

    const contentType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED.has(contentType)) {
      /* ⛔ REFUSED, NOT GUESSED. The old version defaulted an unknown type to jpg, which uploads a
         mislabelled file — and the bucket's allowed_mime_types would then reject it with a message
         about MIME rather than about the real problem (the URL was not an image at all). */
      return { ok: false, path: "", detail: `not an allowed image type: ${contentType || "unknown"}` };
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.length) return { ok: false, path: "", detail: "empty body" };
    if (bytes.length > MAX_BYTES) {
      return { ok: false, path: "", detail: `${Math.round(bytes.length / 1024)}KB exceeds the bucket's 10MB limit` };
    }

    /* Slot names are free-form (the operator invents them in the template), so the path segment is
       sanitised — a slot called "hero/../.." must not escape the site's own folder. */
    const safeSlot = String(opts.slot).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "slot";
    const ext = EXT_BY_TYPE[contentType] ?? "jpg";
    const path = `${opts.siteId}/${safeSlot}.${ext}`;

    const { error: upErr } = await opts.client.storage
      .from(MOCKUP_BUCKET)
      .upload(path, bytes, { contentType, upsert: true });   // upsert: re-placing a slot overwrites
    if (upErr) return { ok: false, path: "", detail: `upload: ${String(upErr.message ?? "").slice(0, 140)}` };

    return { ok: true, path, contentType, bytes: bytes.length };
  } catch (e) {
    const m = String((e as Error).message ?? "");
    return { ok: false, path: "", detail: (e as Error).name === "AbortError" ? "download timed out" : `error: ${m.slice(0, 140)}` };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * A signed, time-limited display URL for a stored path.
 *
 * ⚠️ Minted per read and never persisted — see the header. A null return means "cannot display",
 * and the caller must render that as a missing image rather than an empty src.
 */
export async function signMockupPath(
  // deno-lint-ignore no-explicit-any
  client: any,
  path: string,
  ttl = SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  if (!path) return null;
  try {
    const { data, error } = await client.storage.from(MOCKUP_BUCKET).createSignedUrl(path, ttl);
    if (error) return null;
    return (data?.signedUrl as string) ?? null;
  } catch {
    return null;
  }
}
