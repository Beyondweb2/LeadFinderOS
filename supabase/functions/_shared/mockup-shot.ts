/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THEIR WEBSITE, PHOTOGRAPHED — Cloudflare Browser Rendering.

   ⛔ THE POLICY IS SHARED WITH THE LOCAL PLAYWRIGHT DRIVER (_shared/screenshot-policy.ts). Same
   viewport, same settle rule, same banner list, same refusals. Only the DRIVER differs, which is
   the whole reason the policy is a separate module: the picture Paul approves locally has to be
   the picture a prospect receives.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { SHOT_WIDTH, SHOT_HEIGHT, NAV_TIMEOUT_MS, SETTLE_MS, hideCss, hideByBehaviourJs,
         shotRefusal, shotUrl, type ShotRefusal } from "./screenshot-policy.ts";

const CF_API = "https://api.cloudflare.com/client/v4/accounts";

export type ShotResult =
  | { ok: true; bytes: Uint8Array; ms: number; url: string; contentType: string }
  | { ok: false; refusal: ShotRefusal | "not_configured" | "cf_error"; detail?: string; ms: number };

/** The picture's format. DEFAULT = what the mockup has always taken (PNG at 2x), so no existing caller changes.
 *  fn site-shot asks for a 1x JPEG (src/lib/siteShot.ts): the same viewport and settle policy, a fraction of the bytes. */
export interface ShotFormat {
  type: "png" | "jpeg"; quality?: number; scale?: number;
  /** Skip the banner-hiding SCRIPT (the CSS layer still runs). A site whose Content-Security-Policy refuses an injected script
   *  fails the whole shot (Cloudflare error 6004, measured 2026-10-23), so fn site-shot retries once with this set. */
  noScript?: boolean;
  /** Skip the banner-hiding CSS too (a bare shot). Some CSPs refuse an injected style as well (measured: the script-less retry failed
   *  on the same site), so the second retry is bare: a cookie banner may show, which is what a visitor sees. */
  noStyle?: boolean;
}

/** The ONE request body for a Cloudflare screenshot or snapshot: the same viewport, settle rule, banner hiding and format for both,
 *  so the picture a snapshot returns is the picture the screenshot would have been. */
function shotBody(url: string, format: ShotFormat) {
  return {
    url,
    viewport: { width: SHOT_WIDTH, height: SHOT_HEIGHT, deviceScaleFactor: format.scale ?? 2 },
    /* ⛔ `load`, NOT `networkidle0`. Analytics polling and chat sockets mean a large share of
       real small-business sites NEVER reach network idle, and refusing those would refuse the
       prospects. The settle delay below is what buys consistency instead. */
    gotoOptions: { waitUntil: "load", timeout: NAV_TIMEOUT_MS },
    /* Hidden with CSS, never clicked: answering a consent prompt on someone else's site from an
       automated browser is not ours to do. */
    addStyleTag: format.noStyle ? undefined : [{ content: hideCss() }],
    /* The second layer — catches a banner the selector list does not know about. Wix's was missed
       first time round because it carries no "cookie" anywhere in its markup. */
    addScriptTag: format.noScript ? undefined : [{ content: hideByBehaviourJs() }],
    screenshotOptions: format.type === "jpeg"
      ? { type: "jpeg", quality: format.quality ?? 80, fullPage: false, captureBeyondViewport: false }
      : { type: "png", fullPage: false, captureBeyondViewport: false },
    /* Fonts swap and hero carousels advance after load; without this the same URL returns a
       different image run to run, which is the whole byte-variance fault. */
    waitForTimeout: SETTLE_MS,
  };
}

/**
 * Screenshot a prospect's homepage.
 *
 * 🔴 THE AGGREGATOR CHECK RUNS FIRST AND BEFORE ANY SPEND. Photographing a Facebook page and
 * captioning it "your website" is a false claim made to the one person certain to catch it.
 * Measured over the real book: of the 500 engaged leads, 432 are shootable, 59 have no website
 * and 9 are aggregators.
 */
export async function shootSite(website: string | null | undefined, format: ShotFormat = { type: "png" }): Promise<ShotResult> {
  const t0 = Date.now();
  const refusal = shotRefusal(website);
  if (refusal) return { ok: false, refusal, ms: 0 };

  const account = Deno.env.get("CLOUDFLARE_ACCOUNT_ID") ?? "";
  const token = Deno.env.get("CLOUDFLARE_BROWSER_TOKEN") ?? "";
  /* ⚠️ A MISSING SECRET IS ITS OWN OUTCOME, NOT AN ERROR. The mockup is still usable without
     their screenshot — the operator just composites by hand — so this must be distinguishable
     from a Cloudflare failure when it is read back out of client_error_reports. */
  if (!account || !token) return { ok: false, refusal: "not_configured", ms: 0 };

  const url = shotUrl(website!);
  const body = shotBody(url, format);

  try {
    const res = await fetch(`${CF_API}/${account}/browser-rendering/screenshot`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const ms = Date.now() - t0;
    const ct = res.headers.get("content-type") ?? "";
    if (!res.ok || !ct.includes("image")) {
      const detail = (await res.text()).slice(0, 300);
      /* A 429 is Cloudflare's own rate limit ("Rate limit exceeded", measured 2026-10-23: a burst of requests is refused in ~0.2s,
         nothing is billed). Its Retry-After, when sent, rides in the detail so a caller can wait exactly that long. */
      const wait = res.status === 429 ? ` retry-after=${res.headers.get("retry-after") ?? "none"}` : "";
      return { ok: false, refusal: "cf_error", detail: `HTTP ${res.status}${wait} ${detail}`, ms };
    }
    return { ok: true, bytes: new Uint8Array(await res.arrayBuffer()), ms, url, contentType: ct.split(";")[0].trim().toLowerCase() };
  } catch (e) {
    return { ok: false, refusal: "cf_error", detail: String((e as Error).message).slice(0, 200), ms: Date.now() - t0 };
  }
}

/** A homepage's screenshot AND its rendered HTML from ONE visit (Cloudflare's /snapshot endpoint). fn site-shot judges the picture by
 *  the text of the very page it shows. (Measured 2026-10-23: a separate read of the page text passed a bot-challenge picture, because
 *  a second visit can land on a different page than the first.) */
export type SnapshotResult =
  | { ok: true; bytes: Uint8Array; html: string; ms: number; url: string; contentType: string }
  | { ok: false; refusal: ShotRefusal | "not_configured" | "cf_error"; detail?: string; ms: number };

export async function snapshotSite(website: string | null | undefined, format: ShotFormat = { type: "png" }): Promise<SnapshotResult> {
  const t0 = Date.now();
  const refusal = shotRefusal(website);
  if (refusal) return { ok: false, refusal, ms: 0 };
  const account = Deno.env.get("CLOUDFLARE_ACCOUNT_ID") ?? "";
  const token = Deno.env.get("CLOUDFLARE_BROWSER_TOKEN") ?? "";
  if (!account || !token) return { ok: false, refusal: "not_configured", ms: 0 };
  const url = shotUrl(website!);
  try {
    const res = await fetch(`${CF_API}/${account}/browser-rendering/snapshot`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(shotBody(url, format)),
    });
    const ms = Date.now() - t0;
    if (!res.ok) {
      const wait = res.status === 429 ? ` retry-after=${res.headers.get("retry-after") ?? "none"}` : "";
      return { ok: false, refusal: "cf_error", detail: `HTTP ${res.status}${wait} ${(await res.text()).slice(0, 300)}`, ms };
    }
    const j = await res.json() as { success?: boolean; result?: { screenshot?: unknown; content?: unknown } };
    const b64 = j.result?.screenshot, html = j.result?.content;
    if (j.success !== true || typeof b64 !== "string" || typeof html !== "string") return { ok: false, refusal: "cf_error", detail: "snapshot: unexpected response shape", ms };
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
    return { ok: true, bytes, html: html.slice(0, 400_000), ms, url, contentType: format.type === "jpeg" ? "image/jpeg" : "image/png" };
  } catch (e) {
    return { ok: false, refusal: "cf_error", detail: String((e as Error).message).slice(0, 200), ms: Date.now() - t0 };
  }
}
