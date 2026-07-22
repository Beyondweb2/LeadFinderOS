// Cloudflare Pages Function for /a/:slug — the PUBLIC pretty URL for an AI-visibility audit
// report (yoursites.uk/a/<slug>). It is a thin PROXY to the render-audit-report Supabase edge
// function, which does the real work: it reuses the SHARED report logic (buildReportData +
// renderReportHtml) and reads ai_audit_runs with the service role.
//
// Why proxy instead of rendering here: the repo's Pages Functions deliberately do NOT import
// src/ (they'd have to duplicate buildReportData/renderReportHtml). Proxying keeps ONE source of
// truth (the edge fn) while giving the clean yoursites.uk/a/<slug> URL used in the WhatsApp
// audit_reply link + the report's "View online" footer. We pass the upstream HTML, status
// (200 / 404-noindex), and content-type (charset=utf-8) straight through.

const SUPABASE_URL = "https://ruusxpkkmwtljxxulhbq.supabase.co";
// Public anon key (safe to embed — identical to functions/r/[slug].ts). The upstream function is
// verify_jwt=false, but sending the anon apikey satisfies the gateway in all routing modes.
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1dXN4cGtrbXd0bGp4eHVsaGJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExODgzMzUsImV4cCI6MjA5Njc2NDMzNX0.4PoMZXJS0RDEHyK6wa9k0Q8F0fo2u1e7PMVegJ6nNbw";

/** Minimal crawlable 404 (mirrors render-audit-report's own fallback) for a missing slug or an
 *  upstream failure — never leak a broken shell. */
function notFound(): Response {
  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>Report unavailable</title>` +
    `<meta name="robots" content="noindex"></head>` +
    `<body style="font-family:system-ui,sans-serif;max-width:640px;margin:80px auto;padding:0 20px;color:#0f172a">` +
    `<h1>Report unavailable</h1><p>This report doesn’t exist or isn’t published.</p></body></html>`;
  return new Response(html, {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, must-revalidate" },
  });
}

export const onRequestGet = async (context: { request: Request; params: Record<string, string> }) => {
  const slug = String(context.params.slug || "").trim();
  if (!slug) return notFound();

  try {
    const upstream = `${SUPABASE_URL}/functions/v1/render-audit-report?slug=${encodeURIComponent(slug)}`;
    const res = await fetch(upstream, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    // Read the rendered HTML and pass it through verbatim (same bytes → same page as hitting the
    // edge fn directly). Preserve the upstream status (200 report / 404 unavailable) + content-type.
    const body = await res.text();
    if (!body) return notFound();
    return new Response(body, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "text/html; charset=utf-8",
        "cache-control": res.headers.get("cache-control") ?? "public, max-age=120",
      },
    });
  } catch {
    // Network/upstream failure → a clean 404 rather than a broken response.
    return notFound();
  }
};
