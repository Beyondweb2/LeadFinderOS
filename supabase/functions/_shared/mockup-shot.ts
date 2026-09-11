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
  | { ok: true; bytes: Uint8Array; ms: number; url: string }
  | { ok: false; refusal: ShotRefusal | "not_configured" | "cf_error"; detail?: string; ms: number };

/**
 * Screenshot a prospect's homepage.
 *
 * 🔴 THE AGGREGATOR CHECK RUNS FIRST AND BEFORE ANY SPEND. Photographing a Facebook page and
 * captioning it "your website" is a false claim made to the one person certain to catch it.
 * Measured over the real book: of the 500 engaged leads, 432 are shootable, 59 have no website
 * and 9 are aggregators.
 */
export async function shootSite(website: string | null | undefined): Promise<ShotResult> {
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
  const body = {
    url,
    viewport: { width: SHOT_WIDTH, height: SHOT_HEIGHT, deviceScaleFactor: 2 },
    /* ⛔ `load`, NOT `networkidle0`. Analytics polling and chat sockets mean a large share of
       real small-business sites NEVER reach network idle, and refusing those would refuse the
       prospects. The settle delay below is what buys consistency instead. */
    gotoOptions: { waitUntil: "load", timeout: NAV_TIMEOUT_MS },
    /* Hidden with CSS, never clicked: answering a consent prompt on someone else's site from an
       automated browser is not ours to do. */
    addStyleTag: [{ content: hideCss() }],
    /* The second layer — catches a banner the selector list does not know about. Wix's was missed
       first time round because it carries no "cookie" anywhere in its markup. */
    addScriptTag: [{ content: hideByBehaviourJs() }],
    screenshotOptions: { type: "png", fullPage: false, captureBeyondViewport: false },
    /* Fonts swap and hero carousels advance after load; without this the same URL returns a
       different image run to run, which is the whole byte-variance fault. */
    waitForTimeout: SETTLE_MS,
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
      const detail = (await res.text()).slice(0, 300);
      return { ok: false, refusal: "cf_error", detail: `HTTP ${res.status} ${detail}`, ms };
    }
    return { ok: true, bytes: new Uint8Array(await res.arrayBuffer()), ms, url };
  } catch (e) {
    return { ok: false, refusal: "cf_error", detail: String((e as Error).message).slice(0, 200), ms: Date.now() - t0 };
  }
}
