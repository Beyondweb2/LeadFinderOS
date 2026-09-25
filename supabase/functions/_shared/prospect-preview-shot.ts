/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PROSPECT PREVIEW — the EDGE screenshot driver: Cloudflare Browser Rendering, given the HTML.

   The same shot policy as the local driver (src/lib/prospectPreview/shots.ts). The document is
   passed as `html` — nothing is hosted publicly to take the picture. Same secrets as the mockup's
   shootSite (CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_BROWSER_TOKEN); a missing secret is its own
   outcome ("not_configured"), distinguishable from a Cloudflare failure.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { SHOT_NAV_TIMEOUT_MS, SHOT_SETTLE_MS, withShotCap, shotWithinCap, type ShotSpec } from "../../../src/lib/prospectPreview/shots.ts";

const CF_API = "https://api.cloudflare.com/client/v4/accounts";

export type HtmlShot =
  | { ok: true; bytes: Uint8Array; ms: number }
  | { ok: false; refusal: "not_configured" | "cf_error" | "over_cap"; detail?: string; ms: number };

export function shotConfigured(): boolean {
  return !!Deno.env.get("CLOUDFLARE_ACCOUNT_ID") && !!Deno.env.get("CLOUDFLARE_BROWSER_TOKEN");
}

export async function shootHtml(html: string, s: ShotSpec): Promise<HtmlShot> {
  const t0 = Date.now();
  const account = Deno.env.get("CLOUDFLARE_ACCOUNT_ID") ?? "";
  const token = Deno.env.get("CLOUDFLARE_BROWSER_TOKEN") ?? "";
  if (!account || !token) return { ok: false, refusal: "not_configured", ms: 0 };
  const body = {
    // The height cap is IN the document (withShotCap), so Cloudflare can only ever capture a bounded page.
    html: withShotCap(html, s),
    viewport: { width: s.width, height: s.height, deviceScaleFactor: s.deviceScaleFactor, isMobile: s.mobile, hasTouch: s.mobile },
    gotoOptions: { waitUntil: "load", timeout: SHOT_NAV_TIMEOUT_MS },
    screenshotOptions: { type: "png", fullPage: s.fullPage, captureBeyondViewport: s.fullPage },
    waitForTimeout: SHOT_SETTLE_MS,
  };
  try {
    const res = await fetch(`${CF_API}/${account}/browser-rendering/screenshot`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const ms = Date.now() - t0;
    const ct = res.headers.get("content-type") ?? "";
    if (!res.ok || !ct.includes("image")) {
      return { ok: false, refusal: "cf_error", detail: `HTTP ${res.status} ${(await res.text()).slice(0, 300)}`, ms };
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const cap = shotWithinCap(bytes, s);
    if (cap.ok === false) return { ok: false, refusal: "over_cap", detail: cap.reason, ms };
    return { ok: true, bytes, ms };
  } catch (e) {
    return { ok: false, refusal: "cf_error", detail: String((e as Error)?.message ?? e).slice(0, 200), ms: Date.now() - t0 };
  }
}
