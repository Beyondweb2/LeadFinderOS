// Cloudflare Pages Function for /l/:code on the V1 Pages project — THE TRACKED LINK REDIRECT on app.leadfinderos.com
// (Paul, 2026-11-22; docs/campaign-performance.md). Sibling of findable-site's functions/l/[code].ts.
//
// A report link in a LeadFinderOS-style message goes out as app.leadfinderos.com/l/<code>. This asks track-engagement to
// log the click (the visitor's User-Agent is forwarded so link previews are marked as bots) and sends the visitor on (302)
// to the page the link was made for — always one of our own addresses (checked upstream and again here).
// Unknown code or any failure → the LeadFinderOS home page, never an error page and never another site.

import { isLfosReportHost } from "../../src/lib/reportBrand.ts";

const SUPABASE_URL = "https://ruusxpkkmwtljxxulhbq.supabase.co";
/* Public anon key — the same one functions/r/[slug].ts carries (it ships in the SPA bundle). */
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1dXN4cGtrbXd0bGp4eHVsaGJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExODgzMzUsImV4cCI6MjA5Njc2NDMzNX0.4PoMZXJS0RDEHyK6wa9k0Q8F0fo2u1e7PMVegJ6nNbw";
const FALLBACK = "https://leadfinderos.com";
const CODE_RE = /^[a-z0-9]{8}$/i;
const OUR_TARGET_RE = /^https:\/\/(findable\.live|app\.leadfinderos\.com)\//;

const go = (to: string) => new Response(null, {
  status: 302,
  headers: { location: to, "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer" },
});

export const onRequest = async (context: { request: Request; params: Record<string, string> }): Promise<Response> => {
  const reqUrl = new URL(context.request.url);
  if (!isLfosReportHost(reqUrl.hostname)) return new Response("Not found", { status: 404 });
  if (context.request.method !== "GET" && context.request.method !== "HEAD") return go(FALLBACK);
  const code = String(context.params.code || "").trim();
  if (!CODE_RE.test(code)) return go(FALLBACK);
  try {
    const visitorUa = context.request.headers.get("user-agent");
    const res = await fetch(`${SUPABASE_URL}/functions/v1/track-engagement?link=${encodeURIComponent(code.toLowerCase())}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, ...(visitorUa ? { "user-agent": visitorUa } : {}) },
    });
    const body = await res.json().catch(() => null) as { url?: unknown } | null;
    const to = typeof body?.url === "string" && OUR_TARGET_RE.test(body.url) ? body.url : FALLBACK;
    return go(to);
  } catch {
    return go(FALLBACK);
  }
};
