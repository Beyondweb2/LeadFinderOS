// Cloudflare Pages Function for /r/:slug — public, FULLY server-rendered business report pages,
// wrapped in a polished editorial/magazine template (self-contained inline CSS + Google Fonts).
//
// Unlike functions/p/[slug].ts (which serves the SPA shell and only rewrites <head> preview tags,
// leaving the body client-rendered), report pages are emitted as COMPLETE server-side HTML here —
// <title>, meta description, canonical, OG/twitter, JSON-LD, and the AI-written html_content are all
// in the response — so AI crawlers read the entire report with NO JavaScript. The template only
// STYLES the crawlable content; the content itself stays as the raw semantic HTML the generator wrote.
//
// Data access MIRRORS functions/p/[slug].ts: the PUBLIC anon key + Supabase REST, reading ONLY
// PUBLISHED rows. A missing/unpublished slug returns a real 404.

const SUPABASE_URL = "https://ruusxpkkmwtljxxulhbq.supabase.co";
// Public anon key (safe to embed — already public in the client bundle; identical to functions/p/[slug].ts).
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1dXN4cGtrbXd0bGp4eHVsaGJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExODgzMzUsImV4cCI6MjA5Njc2NDMzNX0.4PoMZXJS0RDEHyK6wa9k0Q8F0fo2u1e7PMVegJ6nNbw";
const SITE_ORIGIN = "https://yoursites.uk";

// License-free Unsplash CDN images (commercial-free, no key). Hardcoded for now; can vary per
// report later. hero = modern office; mid = desk/documents visual break.
const HERO_IMG = "https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=1600&q=80";
const MID_IMG = "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=1200&q=80";

/** Escape for use in HTML text/attribute contexts (title, meta, canonical). */
function escHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Split the report HTML at a section boundary near the middle (the <h2> nearest the midpoint,
 *  but never the first), so a mid-page image can sit BETWEEN two sections without breaking a tag.
 *  Returns [before, after]; with fewer than 2 <h2>s it returns [html, ""] (image goes after). */
function splitForMidImage(html: string): [string, string] {
  const positions: number[] = [];
  const re = /<h2[\s>]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) positions.push(m.index);
  if (positions.length < 2) return [html, ""];
  const mid = html.length / 2;
  const candidates = positions.slice(1); // never split before the first section
  let best = candidates[0];
  for (const p of candidates) if (Math.abs(p - mid) < Math.abs(best - mid)) best = p;
  return [html.slice(0, best), html.slice(best)];
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
  // sanitised at GENERATION time, not here. The template below only wraps + styles it.
  const [firstPart, secondPart] = splitForMidImage(row.html_content);

  const head =
`<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(title)}</title>
${desc ? `<meta name="description" content="${escHtml(desc)}">\n` : ""}<link rel="canonical" href="${escHtml(url)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escHtml(title)}">
${desc ? `<meta property="og:description" content="${escHtml(desc)}">\n` : ""}<meta property="og:url" content="${escHtml(url)}">
<meta property="og:image" content="${escHtml(HERO_IMG)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escHtml(title)}">
${desc ? `<meta name="twitter:description" content="${escHtml(desc)}">\n` : ""}<meta name="twitter:image" content="${escHtml(HERO_IMG)}">
${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>\n` : ""}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600;700;800&display=swap" rel="stylesheet">`;

  const style =
`:root{--ink:#1c1a17;--muted:#6b6559;--line:#e8e4dc;--paper:#fffdf9;--band:#f4f0e8;--accent:#8a5a2b}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font-family:'Inter',system-ui,-apple-system,sans-serif;font-size:18px;line-height:1.72;-webkit-font-smoothing:antialiased}
img{max-width:100%;display:block}
.hero{position:relative;min-height:44vh;display:flex;align-items:flex-end;background:#1c1a17 url('${HERO_IMG}') center/cover no-repeat}
.hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,18,15,.22),rgba(20,18,15,.68))}
.hero-inner{position:relative;z-index:1;width:100%;max-width:820px;margin:0 auto;padding:64px 24px 44px;color:#fff}
.eyebrow{font-size:13px;letter-spacing:.16em;text-transform:uppercase;font-weight:600;color:rgba(255,255,255,.85);margin:0 0 14px}
.hero h1{font-family:'Playfair Display',Georgia,serif;font-weight:800;font-size:clamp(30px,5.2vw,54px);line-height:1.08;letter-spacing:-.01em;margin:0;max-width:16ch;text-wrap:balance}
main{max-width:720px;margin:0 auto;padding:52px 24px 8px}
main :first-child{margin-top:0}
main h2{font-family:'Playfair Display',Georgia,serif;font-weight:700;font-size:clamp(24px,3.4vw,33px);line-height:1.18;letter-spacing:-.005em;margin:46px 0 14px;padding-top:6px;border-top:1px solid var(--line)}
main h3{font-family:'Playfair Display',Georgia,serif;font-weight:700;font-size:21px;line-height:1.25;margin:30px 0 8px}
main p{margin:0 0 18px}
main ul,main ol{margin:0 0 20px;padding-left:1.2em}
main li{margin:0 0 9px}
main li::marker{color:var(--accent)}
main a{color:var(--accent);text-decoration:underline;text-underline-offset:2px}
main strong{color:var(--ink);font-weight:600}
.mid-img{margin:44px 0}
.mid-img img{width:100%;height:clamp(200px,34vw,360px);object-fit:cover;border-radius:8px}
footer{max-width:720px;margin:60px auto 0;padding:26px 24px 56px;border-top:1px solid var(--line);color:var(--muted);font-size:14px;line-height:1.6}
@media(max-width:640px){body{font-size:17px}.hero{min-height:40vh}.hero-inner{padding:44px 18px 30px}main{padding:34px 18px 8px}main h2{margin-top:38px}footer{padding:22px 18px 44px}}`;

  const html =
`<!doctype html>
<html lang="en">
<head>
${head}
<style>${style}</style>
</head>
<body>
<header class="hero">
<div class="hero-inner">
${biz ? `<p class="eyebrow">${escHtml(biz)}</p>\n` : ""}<h1>${escHtml(title)}</h1>
</div>
</header>
<main>
${firstPart}
<figure class="mid-img"><img src="${escHtml(MID_IMG)}" alt="" loading="lazy"></figure>
${secondPart}
</main>
<footer>
<p>${biz ? `${escHtml(biz)} — ` : ""}profile compiled from public business data.</p>
</footer>
</body>
</html>`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300, s-maxage=300" },
  });
};
