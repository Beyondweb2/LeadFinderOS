// Cloudflare Pages Function for /r/:slug — public, FULLY server-rendered business report pages.
//
// Unlike functions/p/[slug].ts (which serves the SPA shell and only rewrites <head> preview tags,
// leaving the body client-rendered), report pages are emitted as COMPLETE server-side HTML here —
// <title>, meta description, JSON-LD, and the AI-written html_content are all in the response — so
// AI crawlers read the entire report with NO JavaScript.
//
// Data access MIRRORS functions/p/[slug].ts: the PUBLIC anon key + Supabase REST, reading ONLY
// PUBLISHED rows (the business_reports RLS + column grants restrict anon to published rows). A
// missing/unpublished slug returns a real 404 (p/[slug].ts instead falls back to the SPA shell,
// because there the SPA can still render for humans — a report page has nothing to fall back to).

const SUPABASE_URL = "https://ruusxpkkmwtljxxulhbq.supabase.co";
// Public anon key (safe to embed — already public in the client bundle; identical to functions/p/[slug].ts).
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1dXN4cGtrbXd0bGp4eHVsaGJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExODgzMzUsImV4cCI6MjA5Njc2NDMzNX0.4PoMZXJS0RDEHyK6wa9k0Q8F0fo2u1e7PMVegJ6nNbw";
const SITE_ORIGIN = "https://yoursites.uk";

/** Escape for use in HTML text/attribute contexts (title, meta, canonical). */
function escHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

interface ReportRow {
  slug?: string;
  business_name?: string;
  title?: string;
  meta_description?: string;
  html_content?: string;
  json_ld?: string;
}

/** Minimal, crawlable 404 page for an unknown / unpublished slug. */
function notFound(): Response {
  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>Report not found</title>` +
    `<meta name="robots" content="noindex"></head>` +
    `<body style="font-family:system-ui,sans-serif;max-width:640px;margin:80px auto;padding:0 20px;color:#0f172a">` +
    `<h1>Report not found</h1><p>This report doesn’t exist or isn’t published.</p></body></html>`;
  return new Response(html, {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, must-revalidate" },
  });
}

export const onRequestGet = async (context: { request: Request; params: Record<string, string> }) => {
  const slug = String(context.params.slug || "").trim();
  if (!slug) return notFound();

  let row: ReportRow | null = null;
  try {
    const apiUrl = `${SUPABASE_URL}/rest/v1/business_reports` +
      `?slug=eq.${encodeURIComponent(slug)}&status=eq.published` +
      `&select=slug,business_name,title,meta_description,html_content,json_ld&limit=1`;
    const r = await fetch(apiUrl, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (r.ok) {
      const rows = await r.json() as ReportRow[];
      row = Array.isArray(rows) ? (rows[0] ?? null) : null;
    }
  } catch {
    // network/parse failure → treat as not found (never leak a broken shell)
  }

  if (!row || !row.html_content) return notFound();

  const biz = (row.business_name || "").trim();
  const title = (row.title || biz || "Business report").trim();
  const desc = (row.meta_description || "").trim();
  const url = `${SITE_ORIGIN}/r/${slug}`;
  // json_ld is our own generated JSON string; guard only against an accidental </script> breakout.
  const jsonLd = (row.json_ld || "").trim().replace(/<\/script/gi, "<\\/script");

  // html_content is TRUSTED HTML (admin/edge-generated, RLS-gated to admins/service-role) so it is
  // emitted RAW as the report body — that is the whole point (crawlable prose). It must be
  // sanitised at GENERATION time (piece 2), not here.
  const html =
`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(title)}</title>
${desc ? `<meta name="description" content="${escHtml(desc)}">\n` : ""}<link rel="canonical" href="${escHtml(url)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escHtml(title)}">
${desc ? `<meta property="og:description" content="${escHtml(desc)}">\n` : ""}<meta property="og:url" content="${escHtml(url)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escHtml(title)}">
${desc ? `<meta name="twitter:description" content="${escHtml(desc)}">\n` : ""}${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>\n` : ""}</head>
<body>
${row.html_content}
</body>
</html>`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300, s-maxage=300" },
  });
};
