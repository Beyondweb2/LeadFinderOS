// Cloudflare Pages Function for /r/:slug on the V1 Pages project (leadfinderos-next). TWO JOBS, decided by the host:
//
// 1) app.leadfinderos.com/r/<short code> — THE LEADFINDEROS REPORT LINK (Paul, 2026-11-15). Audits sent to web developers and
//    agencies to sell LeadFinderOS must not look like Findable, so they get their own address on a domain V1 controls. A thin
//    proxy to render-audit-report, a sibling of findable-site's functions/r/[code].ts, adding `brand=leadfinderos`: upstream then
//    serves ONLY a report whose lead's campaign has Report style = LeadFinderOS (src/lib/reportBrand.ts) and refuses anything
//    else with its own LeadFinderOS "Report unavailable" page — a Findable client's report is never shown here.
//    Only a 6-character short code is accepted (no UUID, no name slug), so this address never widens what is reachable.
//    Opens are still counted: the visitor's User-Agent is forwarded (bot previews are not opens) and ?preview=1 passes through.
//
// 2) EVERY OTHER HOST (yoursites.uk and the rest) — RETIRED 2026-10-01 (Paul). The public "business profile" listings this route
//    used to serve (gpt-4o pages published under a business's own name) answer 410 Gone, with no database read, exactly as
//    before. Record: docs/r-profile-pages-audit.md. ⛔ THE business_reports ROWS ARE KEPT.
//
// ⛔ WHY THE UPSTREAM URL IS NEVER GIVEN TO A HUMAN: the Supabase gateway serves render-audit-report as text/plain with nosniff,
//    so this function throws the upstream headers away and sets text/html itself.

import { isLfosReportHost } from "../../src/lib/reportBrand.ts";
import { LFOS_FAVICON } from "../../src/lib/leadfinderReport.ts";

const SUPABASE_URL = "https://ruusxpkkmwtljxxulhbq.supabase.co";
/* Public anon key — safe to embed (it ships in the SPA bundle and in findable-site's report proxies). render-audit-report is
   verify_jwt=false; the apikey satisfies the gateway in all routing modes. */
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1dXN4cGtrbXd0bGp4eHVsaGJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExODgzMzUsImV4cCI6MjA5Njc2NDMzNX0.4PoMZXJS0RDEHyK6wa9k0Q8F0fo2u1e7PMVegJ6nNbw";

const NOINDEX = "noindex, nofollow, noarchive, nosnippet";
const SHORT_CODE_RE = /^[23456789abcdefghjkmnpqrstuvwxyz]{6}$/i;

const GONE_HTML =
  `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width, initial-scale=1"><title>Page removed</title>` +
  `<meta name="robots" content="noindex, nofollow"></head>` +
  `<body style="font-family:system-ui,sans-serif;max-width:640px;margin:80px auto;padding:0 20px;color:#0f172a">` +
  `<h1>This page has been removed</h1><p>This business profile is no longer published.</p></body></html>`;

function gone(): Response {
  return new Response(GONE_HTML, {
    status: 410,
    headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, nofollow", "cache-control": "public, max-age=3600" },
  });
}

/** LeadFinderOS-branded dead end (never names another brand). */
function notFound(): Response {
  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>Report unavailable | LeadFinderOS</title>` +
    `<meta name="robots" content="${NOINDEX}"><link rel="icon" type="image/svg+xml" href="${LFOS_FAVICON}"></head>` +
    `<body style="font-family:system-ui,sans-serif;max-width:640px;margin:80px auto;padding:0 20px;color:#e9e6df;background:#101114">` +
    `<h1>Report unavailable</h1><p>This report doesn&rsquo;t exist or isn&rsquo;t published.</p>` +
    `<p><a href="https://leadfinderos.com" style="color:#a5a7ff">leadfinderos.com</a></p></body></html>`;
  return new Response(html, {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": NOINDEX, "cache-control": "public, max-age=0, must-revalidate" },
  });
}

export const onRequest = async (context: { request: Request; params: Record<string, string> }): Promise<Response> => {
  const reqUrl = new URL(context.request.url);
  if (!isLfosReportHost(reqUrl.hostname)) return gone();
  if (context.request.method !== "GET" && context.request.method !== "HEAD") return notFound();
  const code = String(context.params.slug || "").trim();
  if (!SHORT_CODE_RE.test(code)) return notFound();
  try {
    const qs = new URLSearchParams({ slug: code.toLowerCase(), brand: "leadfinderos" });
    for (const k of ["preview", "print"]) { if (reqUrl.searchParams.get(k) === "1") qs.set(k, "1"); }
    const visitorUa = context.request.headers.get("user-agent");
    const res = await fetch(`${SUPABASE_URL}/functions/v1/render-audit-report?${qs.toString()}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, ...(visitorUa ? { "user-agent": visitorUa } : {}) },
    });
    const body = await res.text();
    if (!body) return notFound();
    return new Response(body, {
      status: res.status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "x-robots-tag": NOINDEX,
        "cache-control": res.headers.get("cache-control") ?? "public, max-age=120",
      },
    });
  } catch {
    return notFound();
  }
};
