// READ A JAVASCRIPT SITE IN A REAL BROWSER (2026-11-03, docs/website-check.md).
//
// A site built by JavaScript sends a crawler an empty shell. Judging the shell said "no way to contact the business" of full
// websites, so a deep crawl of such a site reads its pages through Cloudflare Browser Rendering (the same account as
// fn site-shot) under our own honest name.
//
// ⛔ THE SPEND IS ONE CONDITIONAL WRITE: claim_crawl_render() holds the switch, the monthly cap and the protection mode. Refused,
// failed or a bot wall = no page: the page stays unjudged. Nothing is ever said from what we could not read.
import { SITE_CHECK_UA } from "../../../src/lib/siteReadIdentity.ts";
import { siteShotPageProblem } from "../../../src/lib/siteShot.ts";

const CF_API = "https://api.cloudflare.com/client/v4/accounts";
/** How long one page may take, and the wait after Cloudflare's own rate limit (docs/site-shot.md: a burst is refused). */
const RENDER_TIMEOUT_MS = 25_000;
const RATE_LIMIT_WAIT_MS = 10_000;

// deno-lint-ignore no-explicit-any
type Client = any;

export type RenderResult = { ok: true; html: string } | { ok: false; reason: "held" | "not_configured" | "cf_error" | "not_a_page"; detail?: string };

async function callRender(account: string, token: string, url: string): Promise<{ status: number; html: string | null; detail: string }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), RENDER_TIMEOUT_MS);
  try {
    const res = await fetch(`${CF_API}/${account}/browser-rendering/content`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url, userAgent: SITE_CHECK_UA,
        gotoOptions: { waitUntil: "networkidle2", timeout: 20_000 },
        rejectResourceTypes: ["image", "media", "font"],
      }),
      signal: controller.signal,
    });
    const body = await res.text();
    if (!res.ok) return { status: res.status, html: null, detail: body.slice(0, 200) };
    const j = JSON.parse(body) as { success?: boolean; result?: unknown };
    return j.success === true && typeof j.result === "string"
      ? { status: 200, html: j.result, detail: "" }
      : { status: 200, html: null, detail: "unexpected response shape" };
  } catch (e) {
    return { status: 0, html: null, detail: String((e as Error).message).slice(0, 200) };
  } finally { clearTimeout(t); }
}

/** One page's HTML as a browser sees it, or why not. Never throws. */
export async function renderForCrawl(service: Client, url: string): Promise<RenderResult> {
  const account = Deno.env.get("CLOUDFLARE_ACCOUNT_ID") ?? "";
  const token = Deno.env.get("CLOUDFLARE_BROWSER_TOKEN") ?? "";
  if (!account || !token) return { ok: false, reason: "not_configured" };
  const { data: allowed, error } = await service.rpc("claim_crawl_render");
  if (error || allowed !== true) return { ok: false, reason: "held", detail: error?.message };
  let r = await callRender(account, token, url);
  if (r.status === 429) {
    await new Promise((done) => setTimeout(done, RATE_LIMIT_WAIT_MS));
    r = await callRender(account, token, url);
  }
  if (!r.html) return { ok: false, reason: "cf_error", detail: `HTTP ${r.status} ${r.detail}` };
  const problem = siteShotPageProblem(r.html);
  if (problem) return { ok: false, reason: "not_a_page", detail: String(problem) };
  return { ok: true, html: r.html };
}
